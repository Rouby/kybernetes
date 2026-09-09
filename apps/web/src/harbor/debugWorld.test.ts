import type { SnapshotBroadcast, TelemetryBroadcast } from '@kybernetes/protocol';
import { buildHarborWorld } from '@kybernetes/sim-core';
import { describe, expect, it } from 'vitest';
import {
  bareDebugId,
  buildDebugPawns,
  buildDebugPortals,
  buildDebugRooms,
  debugBounds,
  debugOrigins,
  flowFor,
  formatKpa,
  o2Color,
  overviewFraming,
  portalAxis,
  portalColor,
  pressureColor,
  roomOverlayColor,
  SHIP_OVERVIEW_LEASH_PX,
  tempColor,
} from './debugWorld';

function snapshot(): SnapshotBroadcast {
  return {
    type: 'SNAPSHOT',
    v: 2,
    tick: 42,
    serverTimeMs: 1000,
    pawns: [
      {
        id: 'pawn:u1',
        x: 300,
        y: 200,
        vx: 0,
        vy: 0,
        facing: 0,
        frameId: 'station',
        roomHint: 'station.habitat',
        color: '#ffd166',
      },
    ],
    impacts: [],
    portals: [{ id: 'station.habitat_korridor', open: true, state: 'open' }],
    projectiles: [],
    frames: [{ id: 'ship', originX: 1700, originY: 0, angle: 0 }],
  };
}

function telemetry(): TelemetryBroadcast {
  return {
    type: 'TELEMETRY',
    v: 2,
    tick: 42,
    serverTimeMs: 1000,
    subsystems: { hull: 100, atmos: 100, watch: 100, crew: 1 },
    full: true,
    atmos: [
      {
        roomId: 'station.habitat',
        pressureKpa: 101.3,
        tempCelsius: 21,
        o2Percent: 20.9,
        co2Ppm: 600,
        repressurizing: false,
      },
      {
        roomId: 'station.frachthalle',
        pressureKpa: 5,
        tempCelsius: -20,
        o2Percent: 2,
        co2Ppm: 100,
        repressurizing: false,
      },
    ],
    flows: [{ portalId: 'station.habitat_korridor', velocityMps: 12.4 }],
  };
}

describe('debug world mapping', () => {
  it('resolves frame origins with snapshot overrides and defaults', () => {
    const origins = debugOrigins(snapshot());
    expect(origins.get('station')).toEqual({ x: 0, y: 0 });
    expect(origins.get('ship')).toEqual({ x: 1700, y: 0 });
    expect(debugOrigins(null).get('ship')).toBeDefined();
  });

  it('places rooms in world space with atmos readings', () => {
    const world = buildHarborWorld();
    const rooms = buildDebugRooms(world, snapshot(), telemetry());
    expect(rooms.length).toBeGreaterThan(0);
    const habitat = rooms.find((room) => room.id === 'station.habitat');
    expect(habitat?.pressureKpa).toBe(101.3);
    expect(habitat?.venting).toBe(false);
    const fracht = rooms.find((room) => room.id === 'station.frachthalle');
    expect(fracht?.venting).toBe(true);
    expect(fracht?.x).toBe(300);
  });

  it('offsets ship rooms by the snapshot frame origin', () => {
    const world = buildHarborWorld();
    const rooms = buildDebugRooms(world, snapshot(), telemetry());
    const shipRoom = rooms.find((room) => room.frameId === 'ship');
    expect(shipRoom).toBeDefined();
    expect(shipRoom?.x ?? 0).toBeGreaterThanOrEqual(1400);
  });

  it('maps portals with live state and wind velocity', () => {
    const world = buildHarborWorld();
    const portals = buildDebugPortals(world, snapshot(), telemetry());
    const door = portals.find((portal) => portal.id === 'station.habitat_korridor');
    expect(door?.open).toBe(true);
    expect(door?.state).toBe('open');
    expect(door?.velocityMps).toBe(12.4);
    expect(Number.isFinite(door?.axisX ?? Number.NaN)).toBe(true);
  });

  it('defaults missing portals to closed still air', () => {
    const world = buildHarborWorld();
    const portals = buildDebugPortals(world, null, null);
    expect(portals.length).toBeGreaterThan(0);
    for (const portal of portals) expect(portal.velocityMps).toBe(0);
    expect(flowFor(null, 'station.habitat_korridor')).toBe(0);
    expect(flowFor(telemetry(), 'station.missing')).toBe(0);
  });

  it('computes a unit axis even for unknown portals', () => {
    const world = buildHarborWorld();
    const axis = portalAxis(world, 'station.nope', debugOrigins(null));
    expect(Math.hypot(axis.x, axis.y)).toBeCloseTo(1, 5);
  });

  it('maps pawns into world space flagging the owner', () => {
    const pawns = buildDebugPawns(snapshot(), 'pawn:u1');
    expect(pawns).toHaveLength(1);
    expect(pawns[0]?.isOwn).toBe(true);
    expect(pawns[0]).toMatchObject({ x: 300, y: 200 });
    expect(buildDebugPawns(null, 'pawn:u1')).toEqual([]);
    expect(buildDebugPawns(snapshot(), 'pawn:other')[0]?.isOwn).toBe(false);
  });

  it('pins the overview on the harbor while the ship is off-station', () => {
    const world = buildHarborWorld();
    const rooms = buildDebugRooms(world, snapshot(), telemetry());
    // Fixture parks the ship at the legacy far origin: pinned with east bearing.
    const pinned = overviewFraming(rooms);
    expect(pinned?.shipOffscreen).not.toBeNull();
    expect(pinned?.shipOffscreen?.x ?? 0).toBeGreaterThan(0.9);
    // Moored against the airlock (10px edge gap): one shared frame.
    const docked = rooms.map((room) =>
      room.frameId === 'ship' ? { ...room, x: room.x - 490, y: room.y - 80 } : room
    );
    expect(overviewFraming(docked)?.shipOffscreen).toBeNull();
    // A generous leash reunites even a departed vessel with the harbor.
    expect(overviewFraming(rooms, SHIP_OVERVIEW_LEASH_PX + 5000)?.shipOffscreen).toBeNull();
    const stationOnly = overviewFraming(rooms.filter((room) => room.frameId !== 'ship'));
    expect(stationOnly?.shipOffscreen).toBeNull();
    expect(overviewFraming([])).toBeUndefined();
  });

  it('bounds rooms for fit-view cameras', () => {
    const world = buildHarborWorld();
    const bounds = debugBounds(buildDebugRooms(world, snapshot(), telemetry()));
    expect(bounds).toBeDefined();
    expect(bounds?.maxX ?? 0).toBeGreaterThan(bounds?.minX ?? 0);
    expect(debugBounds([])).toBeUndefined();
  });

  it('colors rooms and portals by thresholds', () => {
    expect(pressureColor(101.3)).toBe('#3fb950');
    expect(pressureColor(5)).toBe('#f85149');
    expect(pressureColor(50)).toBe('#d29922');
    expect(pressureColor(120)).toBe('#58a6ff');
    expect(pressureColor(Number.NaN)).toBe('#f85149');
    expect(o2Color(20.9)).toBe('#3fb950');
    expect(o2Color(2)).toBe('#f85149');
    expect(tempColor(21)).toBe('#3fb950');
    expect(tempColor(-20)).toBe('#58a6ff');
    expect(tempColor(99)).toBe('#f85149');
    expect(portalColor('open')).toBe('#3fb950');
    expect(portalColor('destroyed')).toBe('#f85149');
    expect(portalColor('sealed')).toBe('#58a6ff');
    expect(portalColor('closed')).toBe('#8b949e');
  });

  it('selects overlay colors and formats labels', () => {
    const world = buildHarborWorld();
    const rooms = buildDebugRooms(world, snapshot(), telemetry());
    const habitat = rooms.find((room) => room.id === 'station.habitat');
    if (habitat === undefined) throw new Error('expected habitat');
    expect(roomOverlayColor(habitat, 'pressure')).toBe('#3fb950');
    expect(roomOverlayColor(habitat, 'o2')).toBe('#3fb950');
    expect(roomOverlayColor(habitat, 'temp')).toBe('#3fb950');
    expect(bareDebugId('station.habitat')).toBe('habitat');
    expect(bareDebugId('habitat')).toBe('habitat');
    expect(formatKpa(101.27)).toBe('101.3kPa');
    expect(formatKpa(Number.NaN)).toBe('--');
  });
});
