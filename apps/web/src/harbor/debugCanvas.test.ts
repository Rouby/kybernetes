/** @vitest-environment node */
import { buildSoloShipWorld } from '@kybernetes/sim-core';
import { describe, expect, it } from 'vitest';
import {
  buildDebugModels,
  DEBUG_OVERLAY_ORDER,
  debugAirLine,
  debugDockLine,
  debugLinksLine,
  debugServerLine,
  debugTickLine,
  nextOverlay,
} from './debugCanvas';

describe('nextOverlay', () => {
  it('exposes the pressure, o2, temp order', () => {
    expect([...DEBUG_OVERLAY_ORDER]).toEqual(['pressure', 'o2', 'temp']);
  });

  it('cycles pressure, o2, temp and wraps', () => {
    expect(nextOverlay('pressure')).toBe('o2');
    expect(nextOverlay('o2')).toBe('temp');
    expect(nextOverlay('temp')).toBe('pressure');
  });
});

describe('debug status lines', () => {
  it('reports tick state and offline', () => {
    expect(debugTickLine(null)).toBe('offline');
    const snapshot = {
      tick: 42,
      pawns: [{}, {}],
    } as unknown as import('@kybernetes/protocol').SnapshotBroadcast;
    expect(debugTickLine(snapshot)).toBe('tick:42 pawns:2 decals:0');
  });

  it('reports dock state and absence', () => {
    expect(debugDockLine(null)).toBe('dock:?');
    const dock = {
      walkable: true,
      phase: 'sealed',
      secondsToSeal: 7,
    } as unknown as import('@kybernetes/protocol').DockStatusBroadcast;
    expect(debugDockLine(dock)).toContain('phase:sealed seals:7s');
  });

  it('counts vents, winds, and follow state', () => {
    const rooms = [
      { venting: true },
      { venting: false },
    ] as unknown as import('./debugWorld').DebugRoom[];
    const portals = [
      { velocityMps: 3 },
      { velocityMps: 0.1 },
    ] as unknown as import('./debugWorld').DebugPortal[];
    expect(debugAirLine(rooms, portals, 'o2', null)).toBe(
      'rooms:2 vents:1 winds:1 overlay:o2 overview'
    );
    expect(debugAirLine(rooms, portals, 'temp', 'p1')).toContain('follow:p1');
  });

  it('collects every dock mouth line for the overlay', () => {
    const models = buildDebugModels(buildSoloShipWorld(), null, null);
    expect(models.docks).toHaveLength(4);
    expect(models.docks[0]).toMatchObject({ x1: 1210, y1: 240, x2: 1210, y2: 280 });
    expect(models.docks[1]).toMatchObject({ x1: 2810, y1: 240, x2: 2810, y2: 280 });
    expect(models.docks[3]).toMatchObject({ x1: 6010, y1: 240, x2: 6010, y2: 280 });
  });

  it('lists pawn links and server stats', () => {
    expect(debugLinksLine([])).toBe('links:-');
    expect(debugServerLine(null)).toBe('server: offline');
    const link = {
      callsign: 'Rook',
      frameId: 'deck',
      roomHint: 'bridge',
      lastInputAgeMs: -1,
      latched: false,
      msgsPerS: 10,
    } as unknown as import('@kybernetes/protocol').ServerStatsBroadcast['pawns'][number];
    expect(debugLinksLine([link])).toContain('Rook');
  });
});
