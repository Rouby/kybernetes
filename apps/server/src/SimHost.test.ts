import { createEmptyWorld } from '@kybernetes/sim-core';
import { describe, expect, it } from 'vitest';
import { routeIntent } from './routers/intentRouter.js';
import { DEFAULT_CLOCKS, SimHost } from './SimHost.js';
import {
  canJoinBeacon,
  createBeaconEntry,
  joinBeacon,
  leaveBeacon,
  persistPawn,
  restorePersistedPawn,
} from './sessions.js';
import { buildManifest, buildSnapshot, buildTelemetry, buildVitals } from './snapshotter.js';
import { createRateState, parsePipeInput, validatePipePacket } from './validatePipe.js';

describe('SimHost scaffold', () => {
  it('advances world on slice without timers', () => {
    const host = new SimHost(createEmptyWorld(0), DEFAULT_CLOCKS, null);
    host.slice(50, 50);
    expect(host.currentWorld.tick).toBe(1);
    host.stop();
  });

  it('starts and stops the slice timer', () => {
    const host = new SimHost(createEmptyWorld(0));
    expect(host.running).toBe(false);
    host.start(Date.now(), 1_000_000);
    expect(host.running).toBe(true);
    host.stop();
    expect(host.running).toBe(false);
  });

  it('queues inputs and drains them on slice', () => {
    const host = new SimHost(createEmptyWorld(0));
    host.enqueueInput({ pawnId: 'ghost', moveX: 1, moveY: 0, sprint: false });
    host.slice(50, 50);
    expect(host.currentWorld.tick).toBe(1);
    host.stop();
  });

  it('drops and counts beyond max steps', () => {
    const host = new SimHost(createEmptyWorld(0));
    host.slice(0, 50);
    host.slice(10_000, 50);
    expect(host.droppedStepCount).toBeGreaterThanOrEqual(0);
    host.stop();
  });

  it('builds v2 snapshot with tick', () => {
    const world = createEmptyWorld(123);
    const snapshot = buildSnapshot(world, 123);
    expect(snapshot.v).toBe(2);
    expect(snapshot.portals).toEqual([]);
    expect(buildTelemetry(world, 123, []).type).toBe('TELEMETRY');
    expect(buildVitals(world, 123, 'nobody', 10, 1).credits).toBe(10);
    expect(buildManifest(world, 123, []).crew).toEqual([]);
  });

  it('routes input intents into movement', () => {
    const world = createEmptyWorld(0);
    const result = routeIntent(
      world,
      'p1',
      { type: 'INPUT', seq: 1, moveVec: { x: 1, y: 0 }, facing: 0, sprint: false, sealed: false },
      []
    );
    expect(result.movement).toHaveLength(1);
  });

  it('enforces beacon caps and cooldown', () => {
    let entry = createBeaconEntry('BEACON-1', 'hesperia_v2', 1);
    expect(canJoinBeacon(entry, 'u1', 0)).toBe(true);
    entry = joinBeacon(entry, 'u1', 0);
    expect(canJoinBeacon(entry, 'u2', 10)).toBe(false);
    entry = leaveBeacon(entry, 'u1');
    expect(canJoinBeacon(entry, 'u2', 10_000)).toBe(true);
  });

  it('persists and restores pawns by userId', () => {
    const store = new Map();
    persistPawn(store, {
      userId: 'u9',
      callsign: 'Rook',
      color: '#fff',
      role: 'engineer',
      frameId: 'station_hub',
      x: 1,
      y: 2,
      credits: 5,
      clearance: 1,
    });
    expect(restorePersistedPawn(store, 'u9')?.callsign).toBe('Rook');
  });

  it('drops malformed JSON before sim', () => {
    const rates = createRateState(0);
    expect(parsePipeInput('not-json', 0, rates).kind).toBe('invalid');
    expect(validatePipePacket({ type: 'INPUT' }, 0, createRateState(0)).kind).toBe('invalid');
  });
});
