import type {
  DockStatusBroadcast,
  DoorState,
  ServerStatsBroadcast,
  SnapshotBroadcast,
} from '@kybernetes/protocol';
import { buildHarborWorld } from '@kybernetes/sim-core';
import { describe, expect, it } from 'vitest';
import {
  accumulatePit,
  addArc,
  addEllipse,
  craterRadii,
  emptyPitLayers,
  frostAlphaOf,
  glowAlphaOf,
  pitHalfSize,
  scorchPalette,
} from '../webgl/passes/ImpactDecalPass';
import {
  applyDockGates,
  DECAL_COOL_TICKS,
  dockChipText,
  dockVesselSchedule,
  FRAME_VEL_MAX,
  formatPawnLink,
  formatServerStats,
  mapDecal,
  mapDecals,
  mapFreshImpacts,
  snapshotImpactKey,
  stepFrameMotion,
  weaponScorchTint,
  withDockWalkable,
} from './renderState';

function dockedStatus(): DockStatusBroadcast {
  return {
    type: 'DOCK_STATUS',
    v: 2,
    tick: 1,
    serverTimeMs: 1,
    vesselId: 'ship',
    dockId: 'harbor',
    phase: 'docked',
    walkable: true,
    secondsToSeal: 0,
    stationGate: 'station.korridor_ost_andock',
    tubeGate: 'station.andock_tube_mund',
    vesselGate: 'ship.schiff_mund',
    tubeRoom: 'station.andock_tube',
    mouthWorld: { x1: 1210, y1: 240, x2: 1210, y2: 280 },
  };
}

function snap(over: Partial<SnapshotBroadcast> = {}): SnapshotBroadcast {
  return {
    type: 'SNAPSHOT',
    v: 2,
    tick: 200,
    serverTimeMs: 10000,
    pawns: [],
    impacts: [],
    portals: [],
    projectiles: [],
    frames: [{ id: 'ship', originX: 1400, originY: 0, angle: 0 }],
    decals: [],
    ...over,
  };
}

describe('premium impact view-models', () => {
  it('cools craters over DECAL_COOL_TICKS', () => {
    expect(DECAL_COOL_TICKS).toBe(200);
  });

  it('maps a single decal with its birth tick', () => {
    const decal = mapDecal(
      {
        id: 'd1',
        frameId: 'ship',
        x: 5,
        y: 6,
        angle: 0,
        radius: 4,
        weapon: 'pulse_laser',
        bornTick: 10,
      },
      new Map([['ship', { x: 1, y: 2 }]]),
      20
    );
    expect(decal.x).toBe(6);
    expect(decal.ageTicks).toBe(10);
  });

  it('keys impacts for seen-dedupe', () => {
    expect(snapshotImpactKey({ frameId: 'ship', x: 10.4, y: 20.6, kind: 'breach' })).toBe(
      'ship:10:21:breach:'
    );
  });

  it('maps persistent decals into world space with cooling', () => {
    const snapshot = snap({
      tick: 300,
      decals: [
        {
          id: 'decal.1',
          frameId: 'ship',
          x: 100,
          y: 200,
          angle: 0.5,
          radius: 6,
          weapon: 'kinetic_carbine',
          bornTick: 100,
        },
      ],
    });
    const origins = new Map([['ship', { x: 1400, y: 0 }]]);
    const mapped = mapDecals(snapshot, origins);
    expect(mapped).toHaveLength(1);
    expect(mapped[0].x).toBe(1500);
    expect(mapped[0].ageTicks).toBe(200);
    expect(mapped[0].cool).toBe(1);
  });

  it('keeps fresh craters emissive and old ones frosty', () => {
    expect(glowAlphaOf(0)).toBeCloseTo(1, 5);
    expect(glowAlphaOf(1)).toBe(0);
    expect(frostAlphaOf(0)).toBe(0);
    expect(frostAlphaOf(1)).toBeGreaterThan(0.5);
  });

  it('stretches craters along the wall tangent', () => {
    const { rx, ry } = craterRadii(6);
    expect(rx).toBeGreaterThan(ry);
    expect(rx).toBeCloseTo(6.9, 5);
  });

  it('chips pits small with hot pixels only while fresh', () => {
    expect(pitHalfSize(10)).toBe(2.8);
    expect(pitHalfSize(1)).toBe(1.5);
    const fresh = emptyPitLayers();
    accumulatePit(fresh, 0, 0, 3, 'kinetic_carbine', 0);
    expect(fresh.core.length).toBeGreaterThan(0);
    expect(fresh.edge.length).toBeGreaterThan(0);
    expect(fresh.glowByWeapon.get('kinetic_carbine')?.length ?? 0).toBeGreaterThan(0);
    expect(fresh.frost.length).toBe(0);
    const cold = emptyPitLayers();
    accumulatePit(cold, 0, 0, 3, 'kinetic_carbine', 1);
    expect(cold.core.length).toBeGreaterThan(0);
    expect(cold.glowByWeapon.size).toBe(0);
    expect(cold.frost.length).toBeGreaterThan(0);
  });

  it('builds ellipse rings and partial arcs as triangle batches', () => {
    const ring: number[] = [];
    addEllipse(ring, 0, 0, 4, 2, 0, 4, 1);
    expect(ring.length).toBe(48);
    const arc: number[] = [];
    addArc(arc, 10, 10, 4, 2, 0, Math.PI, Math.PI * 2, 2, 1);
    expect(arc.length).toBe(24);
    // Upper-half arc stays above its center.
    for (let i = 1; i < arc.length; i += 2) expect(arc[i]).toBeLessThanOrEqual(10.5);
  });

  it('tints scorch per weapon family', () => {
    expect(scorchPalette('pulse_laser').rim[1]).toBeGreaterThan(0.8);
    expect(weaponScorchTint('arc_welder').rim).toContain('#ffd166');
    expect(weaponScorchTint('kinetic_carbine').glow).toBe('#ffb000');
  });

  it('maps enriched impacts, skipping misses', () => {
    const snapshot = snap({
      impacts: [
        {
          frameId: 'ship',
          x: 10,
          y: 20,
          kind: 'breach',
          angle: 1.2,
          weapon: 'kinetic_carbine',
          energy: 0.9,
          surface: 'wall',
        },
        { frameId: 'ship', x: 30, y: 40, kind: 'miss' },
      ],
    });
    const mapped = mapFreshImpacts(snapshot, new Map([['ship', { x: 0, y: 0 }]]));
    expect(mapped).toHaveLength(1);
    expect(mapped[0].angle).toBeCloseTo(1.2, 5);
    expect(mapped[0].energy).toBeCloseTo(0.9, 5);
    // No breach portal on the wire: puncture-sized throw in nominal air.
    expect(mapped[0].breachAreaM2).toBeCloseTo(0.05, 5);
    expect(mapped[0].pressureKpa).toBeCloseTo(101.3, 5);
  });
});

describe('walkable dock overlays and frame motion', () => {
  it('paints dock leaves open only while walkable', () => {
    const door = (id: string): DoorState => ({
      id,
      name: id,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      isOpen: false,
      isAirlock: true,
      roomA: 'station.korridor_ost',
      roomB: 'vacuum',
    });
    const doors = [door('station.korridor_ost_andock'), door('station.habitat_korridor')];
    expect(applyDockGates(doors, false)).toBe(doors);
    const open = applyDockGates(doors, true);
    expect(open.find((door) => door.id === 'station.korridor_ost_andock')?.isOpen).toBe(true);
    expect(open.find((door) => door.id === 'station.habitat_korridor')?.isOpen).toBe(false);
  });

  it('maps dock phases onto prediction vessel schedules', () => {
    expect(dockVesselSchedule(null)).toBe('docked');
    expect(dockVesselSchedule({ ...dockedStatus(), phase: 'boarding_closing' })).toBe('docked');
    expect(dockVesselSchedule({ ...dockedStatus(), phase: 'in_transit' })).toBe('in_transit');
  });

  it('smooths frame velocity without teleporting the camera', () => {
    const still = stepFrameMotion(null, 1210, -80, 1000);
    expect(still.velX).toBe(0);
    const cruise = stepFrameMotion(still, 1210 + 34, -80, 1100);
    expect(cruise.velX).toBeGreaterThan(0);
    expect(cruise.velX).toBeLessThanOrEqual(FRAME_VEL_MAX);
    const warp = stepFrameMotion(still, 1210 + 5000, -80, 1100);
    expect(warp.velX).toBeLessThanOrEqual(FRAME_VEL_MAX);
    const stalled = stepFrameMotion(cruise, 1210 + 34, -80, 1105);
    expect(stalled.velX).toBe(cruise.velX);
  });

  it('overlays walkable gates and phase onto prediction worlds', () => {
    const world = buildHarborWorld();
    const open = withDockWalkable(world, dockedStatus());
    expect(open.portals['station.korridor_ost_andock']?.state).toBe('open');
    expect(open.vessels.ship?.schedule).toBe('docked');
    const away = withDockWalkable(world, {
      ...dockedStatus(),
      walkable: false,
      phase: 'in_transit',
    });
    expect(away.portals['station.korridor_ost_andock']?.state).not.toBe('open');
    expect(away.vessels.ship?.schedule).toBe('in_transit');
  });
});

describe('observer + docking view-models', () => {
  it('formats server TPS and pawn links for the debug panel', () => {
    const stats: ServerStatsBroadcast = {
      type: 'SERVER_STATS',
      v: 2,
      tick: 400,
      serverTimeMs: 20000,
      tpsActual: 19.8,
      tpsTarget: 20,
      tickMsLast: 2.1,
      tickMsAvg: 1.8,
      droppedSteps: 1,
      accumulatorMs: 12,
      observers: 1,
      pawns: [
        {
          pawnId: 'pawn:u1',
          callsign: 'Rook',
          frameId: 'station',
          roomHint: 'station.lobby',
          lastInputAgeMs: 120,
          latched: true,
          msgsPerS: 12,
        },
      ],
    };
    expect(formatServerStats(stats)).toContain('tps:19.8/20');
    expect(formatServerStats(null)).toBe('server: offline');
    expect(formatPawnLink(stats.pawns[0])).toContain('Rook');
    expect(formatPawnLink(stats.pawns[0])).toContain('latch');
  });

  it('labels dock walkability for the HUD chip and debug panel', () => {
    const docked: DockStatusBroadcast = {
      type: 'DOCK_STATUS',
      v: 2,
      tick: 1,
      serverTimeMs: 1,
      vesselId: 'ship',
      dockId: 'harbor',
      phase: 'docked',
      walkable: true,
      secondsToSeal: 0,
      stationGate: 'station.korridor_ost_andock',
      tubeGate: 'station.andock_tube_mund',
      vesselGate: 'ship.schiff_mund',
      tubeRoom: 'station.andock_tube',
      mouthWorld: { x1: 1210, y1: 240, x2: 1210, y2: 280 },
    };
    expect(dockChipText(docked)).toBe('DOCKED · walk aboard');
    expect(
      dockChipText({ ...docked, phase: 'boarding_closing', walkable: false, secondsToSeal: 3 })
    ).toContain('seals in 3s');
    expect(dockChipText({ ...docked, phase: 'departing', walkable: false })).toBe(
      'SEALED · departing'
    );
    expect(dockChipText(null)).toBe('dock:?');
  });
});
