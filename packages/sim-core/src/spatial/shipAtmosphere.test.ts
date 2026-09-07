import { describe, expect, it } from 'vitest';
import { createInitialVesselState, tickVesselState } from '../state';
import { createInitialDoors, toggleDoor } from './doors';
import {
  applySuctionToPosition,
  breachesForHull,
  computeVentedRooms,
  createHullAir,
  createInitialHulls,
  createStationAir,
  createVesselAir,
  doorsForHull,
  firesForHull,
  getAirflowDragVector,
  hullIdForRoomId,
  removeBreachPortal,
  resolveAtmosphereAt,
  roomO2HealthMap,
  sampleAirflowVelocityAt,
  sampleShipAirAt,
  suctionsFrom,
  summarizeShipAir,
  syncBreachPortals,
  tickShipAir,
  upsertBreachPortal,
} from './shipAtmosphere';

function totalMoles(air: ReturnType<typeof createVesselAir>): number {
  let sum = 0;
  for (const room of air.sim.rooms.values()) sum += room.totalMoles;
  return sum;
}

describe('shipAtmosphere: air-sim cutover', () => {
  it('starts every compartment at standard atmosphere', () => {
    const air = createVesselAir();
    const summaries = summarizeShipAir(air, createInitialDoors(), []);
    expect(summaries.engineering.pressureKpa).toBe(101.3);
    expect(summaries.engineering.o2Percent).toBeCloseTo(20.9, 1);
    expect(summaries.bridge.co2Ppm).toBe(400);
    expect(Object.keys(summaries)).toContain('corridor_fwd');
    expect(summaries.corridor.pressureKpa).toBe(101.3);
  });

  it('conserves total moles in a sealed hull', () => {
    const air = createVesselAir();
    const doors = createInitialDoors();
    const before = totalMoles(air);
    for (let i = 0; i < 20; i++) tickShipAir(air, doors, [], [], 0.1);
    expect(totalMoles(air)).toBeCloseTo(before, 6);
  });

  it('ignores invalid or non-positive timesteps', () => {
    const air = createVesselAir();
    const doors = createInitialDoors();
    const before = totalMoles(air);
    for (const dt of [0, -1, Number.NaN]) tickShipAir(air, doors, [], [], dt);
    expect(totalMoles(air)).toBeCloseTo(before, 9);
  });

  it('is deterministic for identical inputs', () => {
    const doors = toggleDoor(createInitialDoors(), 'airlock_eng', true);
    const a = createVesselAir();
    const b = createVesselAir();
    let ra = tickShipAir(a, doors, ['cargo'], [], 0.1);
    let rb = tickShipAir(b, doors, ['cargo'], [], 0.1);
    for (let i = 0; i < 10; i++) {
      ra = tickShipAir(a, doors, ['cargo'], [], 0.1);
      rb = tickShipAir(b, doors, ['cargo'], [], 0.1);
    }
    expect(ra.summaries).toEqual(rb.summaries);
    expect(ra.ventedRooms.slice().sort()).toEqual(rb.ventedRooms.slice().sort());
  });

  it('keeps one sim per hull independent', () => {
    const shipA = createVesselAir();
    const shipB = createVesselAir();
    const doors = createInitialDoors();
    for (let i = 0; i < 10; i++) tickShipAir(shipA, doors, ['cargo'], [], 0.1);
    tickShipAir(shipB, doors, [], [], 0.1);
    const aCargo = shipA.sim.rooms.get('cargo')?.pressure ?? 0;
    const bCargo = shipB.sim.rooms.get('cargo')?.pressure ?? 0;
    expect(aCargo).toBeLessThan(bCargo);
    expect(bCargo).toBeCloseTo(101325, -2);
  });

  it('vents a full breach faster than a puncture', () => {
    const doors = createInitialDoors();
    const full = createVesselAir();
    const puncture = createVesselAir();
    for (let i = 0; i < 20; i++) {
      tickShipAir(full, doors, ['mess'], [], 0.1);
      tickShipAir(puncture, doors, ['puncture_mess'], [], 0.1);
    }
    const pFull = full.sim.rooms.get('mess')?.pressure ?? 0;
    const pPuncture = puncture.sim.rooms.get('mess')?.pressure ?? 0;
    expect(pFull).toBeLessThan(pPuncture);
  });

  it('cascades venting through open interior doors and isolates behind closed doors', () => {
    const air = createVesselAir();
    let doors = toggleDoor(createInitialDoors(), 'airlock_stbd_outer', true);
    let res = tickShipAir(air, doors, [], [], 0.1);
    for (let i = 0; i < 20; i++) res = tickShipAir(air, doors, [], [], 0.1);
    expect(res.ventedRooms).toContain('airlock_stbd');
    expect(res.ventedRooms).toContain('corridor');

    const sealed = createVesselAir();
    doors = toggleDoor(createInitialDoors(), 'door_bridge', false);
    res = tickShipAir(sealed, doors, ['bridge'], [], 0.1);
    for (let i = 0; i < 20; i++) res = tickShipAir(sealed, doors, ['bridge'], [], 0.1);
    expect(res.ventedRooms).toContain('bridge');
    expect(res.ventedRooms).not.toContain('corridor_mid');
    expect(res.summaries.corridor_mid.pressureKpa).toBeGreaterThan(95);
  });

  it('adds and removes breach portals dynamically without rebuilding the sim', () => {
    const air = createVesselAir();
    const roomCount = air.sim.rooms.size;
    upsertBreachPortal(air, 'cargo');
    upsertBreachPortal(air, 'cargo');
    expect(air.sim.rooms.size).toBe(roomCount);
    expect(air.sim.portals.some((p) => p.id === 'cargo')).toBe(true);
    removeBreachPortal(air, 'cargo');
    expect(air.sim.portals.some((p) => p.id === 'cargo')).toBe(false);

    syncBreachPortals(air, ['mess', 'puncture_quarters']);
    expect(air.sim.portals.some((p) => p.id === 'mess')).toBe(true);
    syncBreachPortals(air, []);
    expect(air.sim.portals.some((p) => p.id === 'mess')).toBe(false);
  });

  it('never produces negative pressure or NaN during prolonged venting', () => {
    const air = createVesselAir();
    const doors = createInitialDoors();
    let res = tickShipAir(air, doors, ['cargo', 'engineering'], [], 0.1);
    for (let i = 0; i < 200; i++) res = tickShipAir(air, doors, ['cargo', 'engineering'], [], 0.1);
    for (const summary of Object.values(res.summaries)) {
      expect(summary.pressureKpa).toBeGreaterThanOrEqual(0);
      expect(Number.isNaN(summary.pressureKpa)).toBe(false);
      expect(Number.isNaN(summary.o2Percent)).toBe(false);
    }
  });

  it('burns room O2 and starves fires in vacuum', () => {
    const air = createVesselAir();
    const doors = createInitialDoors();
    const before = air.sim.rooms.get('mess')?.gas.temperatureK ?? 0;
    const res = tickShipAir(air, doors, [], ['mess'], 0.1);
    expect(res.survivingFires).toContain('mess');
    expect(res.summaries.mess.toxicSmokePercent).toBeGreaterThan(0);
    expect(air.sim.rooms.get('mess')?.gas.temperatureK ?? 0).toBeGreaterThan(before);

    const vacuum = createVesselAir();
    let vacuumDoors = toggleDoor(createInitialDoors(), 'airlock_stbd_inner', false);
    vacuumDoors = toggleDoor(vacuumDoors, 'airlock_stbd_outer', true);
    for (let i = 0; i < 40; i++) tickShipAir(vacuum, vacuumDoors, [], [], 0.1);
    expect(vacuum.sim.rooms.get('airlock_stbd')?.pressure ?? 0).toBeLessThan(15000);
    const starved = tickShipAir(vacuum, vacuumDoors, [], ['airlock_stbd'], 0.1);
    expect(starved.survivingFires).not.toContain('airlock_stbd');
  });

  it('drains ECS reserve while repressurizing and stays flat at equilibrium', () => {
    const air = createVesselAir();
    const doors = createInitialDoors();
    const flat = tickShipAir(air, doors, [], [], 0.1);
    expect(flat.ecsDrainPercent).toBe(0);

    const damaged = createVesselAir();
    for (let i = 0; i < 10; i++) tickShipAir(damaged, doors, ['cargo'], [], 0.1);
    syncBreachPortals(damaged, []);
    const repress = tickShipAir(damaged, doors, [], [], 0.1);
    expect(repress.ecsDrainPercent).toBeGreaterThanOrEqual(0);
    expect(repress.summaries.cargo.pressureKpa).toBeGreaterThan(0);
  });

  it('derives vented rooms, suctions and O2 health for boarding AI', () => {
    const air = createVesselAir();
    const doors = toggleDoor(createInitialDoors(), 'airlock_eng', true);
    for (let i = 0; i < 5; i++) tickShipAir(air, doors, [], [], 0.1);
    expect(computeVentedRooms(air, doors)).toContain('engineering');
    const suctions = suctionsFrom(air, doors);
    expect(suctions.some((s) => s.roomId === 'engineering')).toBe(true);
    const health = roomO2HealthMap(air);
    expect(health.bridge).toBeCloseTo(100, 0);

    const sucked = applySuctionToPosition(890, 500, suctions, 'engineering', 1.0);
    expect(sucked.x).toBeGreaterThan(890);
  });

  it('samples ship, station and vacuum atmospheres by world position', () => {
    const hulls = createInitialHulls();
    const ship = sampleShipAirAt(hulls.hesperia, 600, 500);
    expect(ship.roomId).toBe('cargo');
    expect(ship.pressureKpa).toBe(101.3);

    const resolvedShip = resolveAtmosphereAt(hulls, 600, 500, { x: 0, y: 0 });
    expect(resolvedShip.roomId).toBe('cargo');
    const resolvedStation = resolveAtmosphereAt(hulls, 500, 700, { x: 0, y: 0 });
    expect(resolvedStation.roomId).toBe('station_lobby');
    expect(resolvedStation.pressureKpa).toBe(101.3);
    const resolvedVoid = resolveAtmosphereAt(hulls, 600, 500, { x: -1400, y: 0 });
    expect(resolvedVoid.pressureKpa).toBe(0);
    expect(resolvedVoid.roomId).toBeNull();
  });

  it('pushes pawns with vent wind only while atmosphere remains', () => {
    const air = createVesselAir();
    const sealed = sampleAirflowVelocityAt(air, 890, 500, createInitialDoors());
    expect(sealed.vx).toBe(0);
    expect(sealed.vy).toBe(0);

    const doors = toggleDoor(createInitialDoors(), 'airlock_eng', true);
    for (let i = 0; i < 5; i++) tickShipAir(air, doors, [], [], 0.1);
    const wind = sampleAirflowVelocityAt(air, 890, 500, doors);
    expect(Math.hypot(wind.vx, wind.vy)).toBeGreaterThan(20);
  });

  it('scales pull with opening size: punctures tug weakly, breaches yank', () => {
    const doors = createInitialDoors();
    const breached = createVesselAir();
    const punctured = createVesselAir();
    for (let i = 0; i < 10; i++) {
      tickShipAir(breached, doors, ['mess'], [], 0.1);
      tickShipAir(punctured, doors, ['puncture_mess'], [], 0.1);
    }
    const breachSuction = suctionsFrom(breached, doors).find((s) => s.roomId === 'mess');
    const punctureSuction = suctionsFrom(punctured, doors).find((s) => s.roomId === 'mess');
    expect(breachSuction?.strength ?? 0).toBeGreaterThan(punctureSuction?.strength ?? 0);
    const breachWind = sampleAirflowVelocityAt(breached, 840, 298, doors);
    const punctureWind = sampleAirflowVelocityAt(punctured, 840, 298, doors);
    expect(Math.hypot(breachWind.vx, breachWind.vy)).toBeGreaterThan(
      Math.hypot(punctureWind.vx, punctureWind.vy)
    );
  });

  it('publishes solver wind on summaries for client prediction', () => {
    const air = createVesselAir();
    const doors = toggleDoor(createInitialDoors(), 'airlock_eng', true);
    for (let i = 0; i < 5; i++) tickShipAir(air, doors, [], [], 0.1);
    const res = tickShipAir(air, doors, [], [], 0.1);
    const engWind = Math.hypot(
      res.summaries.engineering.windX ?? 0,
      res.summaries.engineering.windY ?? 0
    );
    expect(engWind).toBeGreaterThan(20);
    expect(
      Math.hypot(res.summaries.bridge.windX ?? 0, res.summaries.bridge.windY ?? 0)
    ).toBeLessThan(engWind);
    const drag = getAirflowDragVector(890, 500, doors, [], res.summaries);
    expect(Math.hypot(drag.u, drag.v)).toBeCloseTo(engWind, 0);
  });

  it('routes doors, breaches, and fires to the owning hull only', () => {
    const doors = createInitialDoors();
    const shipDoors = doorsForHull(doors, 'hesperia');
    const stationDoors = doorsForHull(doors, 'station');
    expect(shipDoors.some((d) => d.id === 'door_bridge')).toBe(true);
    expect(shipDoors.some((d) => d.id === 'airlock_eng')).toBe(true);
    expect(shipDoors.some((d) => d.id === 'gauntlet_station_door')).toBe(false);
    expect(stationDoors.some((d) => d.id === 'gauntlet_station_door')).toBe(true);
    expect(stationDoors.some((d) => d.id === 'door_bridge')).toBe(false);
    expect(breachesForHull(['cargo', 'station_lobby', 'corridor'], 'hesperia')).toEqual([
      'cargo',
      'corridor',
    ]);
    expect(breachesForHull(['cargo', 'station_lobby'], 'station')).toEqual(['station_lobby']);
    expect(firesForHull(['mess', 'station_bay'], 'station')).toEqual(['station_bay']);
    expect(hullIdForRoomId('cargo')).toBe('hesperia');
    expect(hullIdForRoomId('station_bay')).toBe('station');
    expect(hullIdForRoomId('corridor')).toBe('hesperia');
    expect(hullIdForRoomId('unknown_room')).toBeNull();
  });

  it('keeps cross-hull gauntlet doors out of the vessel sim', () => {
    const hulls = createInitialHulls();
    const shipPortals = hulls.hesperia.sim.portals.map((p) => p.id);
    expect(shipPortals.some((id) => id.includes('gauntlet'))).toBe(false);
    expect(hulls.station.sim.portals.some((p) => p.id === 'gauntlet_station_door')).toBe(true);
  });

  it('ticks hulls independently inside one vessel state', () => {
    const vessel = createInitialVesselState();
    expect(vessel.hulls.hesperia).toBeDefined();
    expect(vessel.hulls.station).toBeDefined();

    // A station breach must not leak into the ship: no cross-hull wiring.
    const stationBreached = {
      ...vessel,
      hull: { ...vessel.hull, breaches: ['station_lobby'] },
    };
    let next = stationBreached;
    for (let i = 0; i < 10; i++) next = tickVesselState(next, 0.1);
    expect(next.roomAtmospheres?.station_lobby.pressureKpa ?? 101.3).toBeLessThan(101.3);
    expect(next.roomAtmospheres?.bridge.pressureKpa).toBe(101.3);
    expect(next.roomAtmospheres?.cargo.pressureKpa).toBe(101.3);
    expect(next.roomAtmospheres?.corridor.pressureKpa).toBe(101.3);

    // A sealed ship room holds pressure while its breached neighbor vents.
    const sealed = createInitialVesselState();
    sealed.boarding.doors = toggleDoor(sealed.boarding.doors, 'door_bridge', false);
    const shipBreached = {
      ...sealed,
      hull: { ...sealed.hull, breaches: ['cargo'] },
    };
    let shipNext = shipBreached;
    for (let i = 0; i < 10; i++) shipNext = tickVesselState(shipNext, 0.1);
    expect(shipNext.roomAtmospheres?.cargo.pressureKpa ?? 101.3).toBeLessThan(101.3);
    expect(shipNext.roomAtmospheres?.bridge.pressureKpa).toBe(101.3);
  });

  it('shares no mutable sim objects between hulls', () => {
    const hulls = createInitialHulls();
    const shipRooms = new Set(hulls.hesperia.sim.rooms.values());
    for (const room of hulls.station.sim.rooms.values()) {
      expect(shipRooms.has(room)).toBe(false);
    }
    const shipPortals = new Set(hulls.hesperia.sim.portals);
    for (const portal of hulls.station.sim.portals) {
      expect(shipPortals.has(portal)).toBe(false);
    }
    for (const air of Object.values(hulls)) {
      for (const portal of air.sim.portals) {
        expect(air.sim.rooms.get(portal.roomA.id)).toBe(portal.roomA);
        if (portal.roomB) expect(air.sim.rooms.get(portal.roomB.id)).toBe(portal.roomB);
      }
    }
  });

  it('leaves other hulls bit-identical while one hull vents', () => {
    const hulls = createInitialHulls();
    const doors = createInitialDoors();
    const before = hulls.station.sim.rooms.get('station_lobby')?.pressure;
    for (let i = 0; i < 50; i++) tickShipAir(hulls.hesperia, doors, ['cargo'], [], 0.1);
    expect(hulls.station.sim.rooms.get('station_lobby')?.pressure).toBe(before);
    const res = tickShipAir(hulls.hesperia, doors, ['cargo'], [], 0.1);
    expect(
      res.ventedRooms.some((r) => r === 'station_lobby' || r === 'station_bay' || r === 'gauntlet')
    ).toBe(false);
  });

  it('rejects unknown hull topologies', () => {
    expect(() => createHullAir('ghost_ship')).toThrow();
  });

  it('builds an independent station sim', () => {
    const station = createStationAir();
    expect(station.sim.rooms.has('station_lobby')).toBe(true);
    const summaries = summarizeShipAir(station, [], []);
    expect(summaries.station_lobby.pressureKpa).toBe(101.3);
  });
});
