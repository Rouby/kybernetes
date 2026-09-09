import { describe, expect, it } from 'vitest';
import {
  type AirAuthorityState,
  addPuncture,
  bindAirFrame,
  createAirAuthority,
  dragForceNewtons,
  NOMINAL_PRESSURE_KPA,
  portalWind,
  readAirFlows,
  readAirRooms,
  readAllAir,
  refreshAtmos,
  roomAirDensity,
  sampleRoomWind,
  stepAirAuthority,
  syncAirAreas,
  ventedRooms,
} from './airAuthority.js';
import { assembleWorld } from './assemble.js';
import { HesperiaV2Spec } from './content/HesperiaV2.hull.js';
import { StationHubSpec } from './content/StationHub.hull.js';
import { compileHull } from './hullCompiler.js';
import { tickWorld } from './tickWorld.js';
import { createEmptyWorld, type PortalEdge, type RoomNode, type World } from './types.js';

function stationSetup(): { auth: AirAuthorityState; world: World } {
  const compiled = compileHull(StationHubSpec);
  const auth = createAirAuthority();
  bindAirFrame(auth, 'station', compiled.rooms, compiled.portals);
  const rooms: Record<string, RoomNode> = {};
  for (const room of compiled.rooms) rooms[room.id] = room;
  const portals: Record<string, PortalEdge> = {};
  for (const portal of compiled.portals) portals[portal.id] = portal;
  return { auth, world: { ...createEmptyWorld(0), rooms, portals } };
}

function stepBoth(auth: AirAuthorityState, world: World, seconds: number): World {
  let current = world;
  const ticks = Math.round(seconds / 0.05);
  for (let i = 0; i < ticks; i += 1) current = tickWorld(current, 0.05, [], auth);
  return current;
}

function setEdge(world: World, id: string, patch: Partial<PortalEdge>): World {
  const edge = world.portals[id];
  if (edge === undefined) throw new Error(`missing portal ${id}`);
  return { ...world, portals: { ...world.portals, [id]: { ...edge, ...patch } } };
}

describe('air authority binding', () => {
  it('starts rooms at nominal breathable air', () => {
    const { auth } = stationSetup();
    const views = readAirRooms(auth, 'station');
    expect(views).toHaveLength(7);
    for (const view of views) {
      expect(view.pressureKpa).toBeCloseTo(NOMINAL_PRESSURE_KPA, 1);
      expect(view.o2Percent).toBeCloseTo(20.9, 1);
      expect(view.tempCelsius).toBeCloseTo(21, 1);
      expect(view.repressurizing).toBe(false);
    }
  });

  it('ignores zero dt without touching readings', () => {
    const { auth, world } = stationSetup();
    stepAirAuthority(auth, world, 0);
    stepAirAuthority(auth, world, Number.NaN);
    expect(readAirRooms(auth, 'station')[0]?.pressureKpa).toBeCloseTo(NOMINAL_PRESSURE_KPA, 1);
  });
});

describe('air authority venting', () => {
  it('maps vented rooms after a hull puncture', () => {
    const { auth, world } = stationSetup();
    expect(addPuncture(auth, 'station', 'bay', 1.5)).toBeDefined();
    const vented = stepBoth(auth, world, 3);
    const views = readAllAir(auth);
    expect(ventedRooms(views)).toContain('bay');
    expect(views.lobby?.pressureKpa ?? 0).toBeGreaterThan(100);
    expect(vented.atmos.bay?.pressureKpa ?? 0).toBeLessThan(90);
  });

  it('follows combat breach widening instead of venting at birth size', () => {
    const { auth, world } = stationSetup();
    const hole: PortalEdge = {
      id: 'breach.bay.1.0',
      roomA: 'bay',
      roomB: 'space',
      kind: 'hole',
      state: 'destroyed',
      cooldownUntilTick: 1,
      areaM2: 0.05,
      segment: { x1: 700, y1: 100, x2: 708, y2: 100 },
      clearance: 0,
      integrity: 0,
    };
    const holed: World = { ...world, portals: { ...world.portals, [hole.id]: hole } };
    stepBoth(auth, holed, 1);
    const linked = auth.sims.get('station')?.portals.get(hole.id);
    expect(linked?.effectiveArea).toBeCloseTo(0.05, 6);
    // Sustained fire widens the same hole in place; the linked throat must
    // follow or every widened breach keeps venting like a fresh puncture.
    const widened = setEdge(holed, hole.id, { areaM2: 1.0 });
    syncAirAreas(auth, widened);
    expect(auth.sims.get('station')?.portals.get(hole.id)?.effectiveArea).toBeCloseTo(1.0, 6);
  });

  it('keeps sealed ships and stations isolated', () => {
    const shipCompiled = compileHull(HesperiaV2Spec);
    const stationCompiled = compileHull(StationHubSpec);
    const auth = createAirAuthority();
    bindAirFrame(auth, 'ship', shipCompiled.rooms, shipCompiled.portals);
    bindAirFrame(auth, 'station', stationCompiled.rooms, stationCompiled.portals);
    const rooms: Record<string, RoomNode> = {};
    const portals: Record<string, PortalEdge> = {};
    for (const room of [...shipCompiled.rooms, ...stationCompiled.rooms]) rooms[room.id] = room;
    for (const portal of [...shipCompiled.portals, ...stationCompiled.portals]) {
      portals[portal.id] = portal;
    }
    const world: World = { ...createEmptyWorld(0), rooms, portals };
    addPuncture(auth, 'ship', 'cargo', 2);
    stepBoth(auth, world, 3);
    const views = readAllAir(auth);
    expect(ventedRooms(views)).toContain('cargo');
    expect(views.lobby?.pressureKpa ?? 0).toBeGreaterThan(100);
  });
});

describe('air authority wind and drag', () => {
  it('probes still air as zero wind and zero drag', () => {
    const { auth } = stationSetup();
    expect(sampleRoomWind(auth, 'station', 'lobby')).toEqual({ x: 0, y: 0 });
    expect(dragForceNewtons({ x: 0, y: 0 }, 1.2)).toEqual({ x: 0, y: 0 });
    expect(portalWind(auth, 'station', 'nope')).toBeUndefined();
  });

  it('flows from breach to wind to drag force', () => {
    const { auth, world } = stationSetup();
    addPuncture(auth, 'station', 'bay', 1.5);
    let current = stepBoth(auth, world, 3);
    current = setEdge(current, 'lobby_bay', { state: 'open' });
    current = stepBoth(auth, current, 0.5);
    expect(current.atmos.lobby?.pressureKpa ?? 999).toBeLessThan(NOMINAL_PRESSURE_KPA);
    const wind = portalWind(auth, 'station', 'lobby_bay');
    expect(wind).toBeDefined();
    const speed = Math.hypot(wind?.x ?? 0, wind?.y ?? 0);
    expect(speed).toBeGreaterThan(1);
    const density = roomAirDensity(auth, 'station', 'lobby') ?? 0;
    expect(density).toBeGreaterThan(0);
    const drag = dragForceNewtons(wind ?? { x: 0, y: 0 }, density);
    expect(Math.hypot(drag.x, drag.y)).toBeGreaterThan(0);
  });
});

describe('air authority repressurizing', () => {
  it('flags sealed depleted rooms and clears venting ones', () => {
    const { auth, world } = stationSetup();
    addPuncture(auth, 'station', 'bay', 1.5);
    const venting = stepBoth(auth, world, 3);
    expect(venting.atmos.bay?.repressurizing).toBe(false);
    const sealed = stepBoth(auth, setEdge(venting, 'lobby_bay', { state: 'sealed' }), 0.5);
    expect(sealed.atmos.bay?.repressurizing).toBe(false);
  });

  it('recovers the flag through a breach-seal cycle on an exterior door', () => {
    const tiny = createAirAuthority();
    bindAirFrame(
      tiny,
      'box',
      [{ id: 'cabin', frameId: 'box', rect: { x: 0, y: 0, w: 2, h: 2 }, volumeM3: 10 }],
      [
        {
          id: 'hatch',
          roomA: 'cabin',
          roomB: 'space',
          kind: 'airlock',
          state: 'closed',
          cooldownUntilTick: 0,
          areaM2: 2,
          segment: { x1: 0, y1: 0, x2: 0, y2: 2 },
          clearance: 0,
        },
      ]
    );
    const boxRooms: Record<string, RoomNode> = {
      cabin: { id: 'cabin', frameId: 'box', rect: { x: 0, y: 0, w: 2, h: 2 }, volumeM3: 10 },
    };
    const hatchEdge: PortalEdge = {
      id: 'hatch',
      roomA: 'cabin',
      roomB: 'space',
      kind: 'airlock',
      state: 'closed',
      cooldownUntilTick: 0,
      areaM2: 2,
      segment: { x1: 0, y1: 0, x2: 0, y2: 2 },
      clearance: 0,
      integrity: 100,
    };
    let box: World = { ...createEmptyWorld(0), rooms: boxRooms, portals: { hatch: hatchEdge } };
    box = setEdge(box, 'hatch', { state: 'destroyed', kind: 'hole' });
    for (let i = 0; i < 40; i += 1) box = tickWorld(box, 0.05, [], tiny);
    expect(box.atmos.cabin?.pressureKpa ?? 999).toBeLessThan(90);
    expect(box.atmos.cabin?.repressurizing).toBe(false);
    box = setEdge(box, 'hatch', { state: 'sealed' });
    box = tickWorld(box, 0.05, [], tiny);
    expect(box.atmos.cabin?.repressurizing).toBe(true);
  });

  it('attaches tick readings to the world for snapshots', () => {
    const assembled = assembleWorld([{ frameId: 'station', hull: StationHubSpec }]);
    const auth = createAirAuthority();
    bindAirFrame(auth, 'station', Object.values(assembled.rooms), Object.values(assembled.portals));
    const next = tickWorld(assembled, 0.05, [], auth);
    expect(next.atmos['station.lobby']?.pressureKpa).toBeCloseTo(NOMINAL_PRESSURE_KPA, 1);
    expect(refreshAtmos(auth, next, 0)).toBeDefined();
  });
});

describe('air authority debug flows', () => {
  it('lists every portal with a finite velocity in id order', () => {
    const { auth } = stationSetup();
    const flows = readAirFlows(auth);
    expect(flows.length).toBeGreaterThan(0);
    const ids = flows.map((flow) => flow.portalId);
    expect([...ids].sort()).toEqual(ids);
    for (const flow of flows) expect(Number.isFinite(flow.velocityMps)).toBe(true);
  });

  it('reports wind on the breach path after venting', () => {
    const { auth, world } = stationSetup();
    addPuncture(auth, 'station', 'bay', 1.5);
    let current = stepBoth(auth, world, 3);
    current = setEdge(current, 'lobby_bay', { state: 'open' });
    stepBoth(auth, current, 0.5);
    const flows = readAirFlows(auth);
    const door = flows.find((flow) => flow.portalId === 'lobby_bay');
    expect(door).toBeDefined();
    expect(Math.abs(door?.velocityMps ?? 0)).toBeGreaterThan(0);
  });
});
