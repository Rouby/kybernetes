import type {
  ManifestBroadcast,
  SnapshotBroadcast,
  SnapshotPawn,
  TelemetryBroadcast,
  VitalsBroadcast,
} from '@kybernetes/protocol';
import { describe, expect, it } from 'vitest';
import {
  bareId,
  callsignFor,
  frameOrigins,
  mapAtmos,
  mapPawn,
  mapTelemetry,
  mapVitals,
  pawnWorld,
  roomO2,
  syncDoors,
  ventedBareIds,
} from './renderState';

function pawn(over: Partial<SnapshotPawn> = {}): SnapshotPawn {
  return {
    id: 'pawn:u1',
    x: 300,
    y: 200,
    vx: 0,
    vy: 0,
    facing: 0,
    frameId: 'station',
    roomHint: 'station.lobby',
    color: '#ffd166',
    ...over,
  };
}

function snapshot(over: Partial<SnapshotBroadcast> = {}): SnapshotBroadcast {
  return {
    type: 'SNAPSHOT',
    v: 2,
    tick: 100,
    serverTimeMs: 5000,
    pawns: [pawn()],
    impacts: [],
    portals: [{ id: 'station.lobby_bay', open: false, state: 'closed' }],
    projectiles: [],
    frames: [{ id: 'ship', originX: 1400, originY: 0, angle: 0 }],
    ...over,
  };
}

function telemetry(over: Partial<TelemetryBroadcast> = {}): TelemetryBroadcast {
  return {
    type: 'TELEMETRY',
    v: 2,
    tick: 100,
    serverTimeMs: 5000,
    subsystems: { hull: 100, atmos: 100, watch: 100, crew: 4 },
    atmos: [
      {
        roomId: 'station.lobby',
        pressureKpa: 101.3,
        tempCelsius: 21,
        o2Percent: 20.9,
        co2Ppm: 400,
        repressurizing: false,
      },
    ],
    ...over,
  };
}

function vitals(over: Partial<VitalsBroadcast['vitals']> = {}): VitalsBroadcast {
  return {
    type: 'VITALS',
    v: 2,
    tick: 100,
    serverTimeMs: 5000,
    vitals: {
      hunger: 100,
      thirst: 100,
      fatigue: 0,
      health: 100,
      hypoxia: 0,
      suitSealed: false,
      heat: 0,
      ammo: 30,
      reserve: 120,
      mags: [30, 30, 30, 30],
      reloading: false,
      ...over,
    },
    credits: 200,
    clearance: 2,
  };
}

function manifest(): ManifestBroadcast {
  return {
    type: 'MANIFEST',
    v: 2,
    tick: 100,
    serverTimeMs: 5000,
    beacon: 'HESP01',
    shipName: 'CSS Hesperia',
    crew: [{ id: 'pawn:u1', callsign: 'Rook', role: 'engineer', frameId: 'station' }],
  };
}

describe('render-state mapping', () => {
  it('strips namespaced ids and passes bare ones through', () => {
    expect(bareId('ship.corridor')).toBe('corridor');
    expect(bareId('lobby')).toBe('lobby');
  });

  it('resolves frame origins with snapshot overrides', () => {
    const origins = frameOrigins(snapshot());
    expect(origins.get('station')).toEqual({ x: 0, y: 0 });
    expect(origins.get('ship')).toEqual({ x: 1400, y: 0 });
    expect(origins.get('void')).toBeUndefined();
  });

  it('places pawns in world space preferring predictions', () => {
    const origins = frameOrigins(snapshot());
    expect(pawnWorld(pawn(), origins, null)).toEqual({ x: 300, y: 200 });
    expect(pawnWorld(pawn(), origins, { x: 310, y: 205, facing: 0 })).toEqual({ x: 310, y: 205 });
    expect(pawnWorld(pawn({ frameId: 'ship', x: 100, y: 100 }), origins, null)).toEqual({
      x: 1500,
      y: 100,
    });
  });

  it('maps pawns with identity, bots, and voice lines', () => {
    const mapped = mapPawn(pawn(), 'Rook', { x: 300, y: 200 }, 1.5, 9000);
    expect(mapped.callsign).toBe('Rook');
    expect(mapped.facingAngle).toBe(1.5);
    expect(mapped.isBot).toBe(false);
    expect(mapped.speechBubble).toBeUndefined();
    expect(mapPawn(pawn({ id: 'npc:ship:cook' }), 'Cookie', { x: 0, y: 0 }, 0, 9000).isBot).toBe(
      true
    );
    const said = mapPawn(pawn({ say: 'Aye' }), 'Rook', { x: 0, y: 0 }, 0, 9000);
    expect(said.speechBubble?.text).toBe('Aye');
    expect(said.speechBubble?.expiresAt).toBe(12000);
  });

  it('resolves callsigns from the manifest with id fallbacks', () => {
    expect(callsignFor(manifest(), 'pawn:u1')).toBe('Rook');
    expect(callsignFor(manifest(), 'pawn:u9')).toBe('u9');
    expect(callsignFor(null, 'captain:ship')).toBe('ship');
  });

  it('syncs door states and treats destroyed doors as open', () => {
    const base = [
      {
        id: 'station.lobby_bay',
        name: 'Lobby Bay Hatch',
        x1: 600,
        y1: 160,
        x2: 600,
        y2: 240,
        isOpen: false,
        isAirlock: false,
        roomA: 'station.lobby',
        roomB: 'station.bay',
      },
    ];
    expect(syncDoors(base, snapshot())).toBe(base);
    const opened = syncDoors(
      base,
      snapshot({ portals: [{ id: 'station.lobby_bay', open: true, state: 'open' }] })
    );
    expect(opened[0]?.isOpen).toBe(true);
    const destroyed = syncDoors(
      base,
      snapshot({ portals: [{ id: 'station.lobby_bay', open: false, state: 'destroyed' }] })
    );
    expect(destroyed[0]?.isOpen).toBe(true);
  });

  it('maps atmos rooms with vent flags and o2 index', () => {
    const rooms = mapAtmos(telemetry());
    expect(rooms.lobby?.pressureKpa).toBe(101.3);
    expect(rooms.lobby?.isVenting).toBe(false);
    expect(mapAtmos(null)).toEqual({});
    expect(ventedBareIds(telemetry())).toEqual([]);
    const vacuum = telemetry({
      atmos: [
        {
          roomId: 'ship.bridge',
          pressureKpa: 5,
          tempCelsius: -40,
          o2Percent: 2,
          co2Ppm: 100,
          repressurizing: false,
        },
      ],
    });
    expect(ventedBareIds(vacuum)).toEqual(['bridge']);
    expect(roomO2(mapAtmos(vacuum))).toEqual({ bridge: 2 });
  });

  it('maps vitals with derived stamina and incapacitation', () => {
    expect(mapVitals(null)).toBeUndefined();
    const mapped = mapVitals(vitals({ fatigue: 20, health: 0 }));
    expect(mapped?.stamina).toBe(80);
    expect(mapped?.incapacitated.isIncapacitated).toBe(true);
    expect(mapped?.suit.integrityPercent).toBe(100);
    expect(mapped?.hypoxiaPercent).toBe(0);
  });

  it('maps telemetry gauges with hull-driven alerts and breach rooms', () => {
    const nominal = mapTelemetry(snapshot(), telemetry(), manifest(), {});
    expect(nominal.shipName).toBe('CSS Hesperia');
    expect(nominal.alertLevel).toBe('nominal');
    expect(nominal.hull.breaches).toEqual([]);
    const battered = mapTelemetry(
      snapshot({ portals: [{ id: 'ship.door_bridge', open: false, state: 'destroyed' }] }),
      telemetry({ subsystems: { hull: 60, atmos: 40, watch: 100, crew: 4 } }),
      manifest(),
      {}
    );
    expect(battered.alertLevel).toBe('yellow');
    expect(battered.hull.status).toBe('degraded');
    expect(battered.hull.breaches).toEqual(['ship.door_bridge']);
    expect(battered.oxygenLevelPercent).toBe(40);
  });
});
