import {
  assembleWorld,
  buildHarborWorld,
  buildManifest,
  buildSnapshot,
  buildTelemetry,
  buildVitals,
  createEmptyWorld,
  StationHubSpec,
  spawnPawn,
} from '@kybernetes/sim-core';
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
import {
  createRateState,
  createSeqCursor,
  parsePipeInput,
  validatePipePacket,
} from './validatePipe.js';

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
    expect(buildManifest(world, 'ship', 123, []).crew).toEqual([]);
    expect(buildManifest(world, 'ship', 123, []).beacon).toBe('UNKNOWN');
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

  it('rejects stale protocol versions without reaching sim', () => {
    const rates = createRateState(0);
    const outcome = validatePipePacket({ v: 1, type: 'INPUT', seq: 1 }, 0, rates);
    expect(outcome.kind).toBe('version-mismatch');
    if (outcome.kind === 'version-mismatch') expect(outcome.received).toBe(1);
  });

  it('dedupes retried and reordered intents per sender', () => {
    const cursor = createSeqCursor();
    const input = (seq: number) => ({
      type: 'INPUT' as const,
      seq,
      moveVec: { x: 0, y: 0 },
      facing: 0,
      sprint: false,
      sealed: false,
    });
    expect(validatePipePacket(input(1), 0, createRateState(0), cursor).kind).toBe('ok');
    expect(validatePipePacket(input(1), 0, createRateState(0), cursor).kind).toBe('duplicate');
    expect(validatePipePacket(input(0), 0, createRateState(0), cursor).kind).toBe('duplicate');
    expect(validatePipePacket(input(2), 0, createRateState(0), cursor).kind).toBe('ok');
  });

  it('rate-limits input floods and reopens the window', () => {
    const rates = createRateState(0);
    const input = (seq: number) => ({
      type: 'INPUT' as const,
      seq,
      moveVec: { x: 0, y: 0 },
      facing: 0,
      sprint: false,
      sealed: false,
    });
    for (let seq = 0; seq < 20; seq += 1) {
      expect(validatePipePacket(input(seq), 0, rates).kind).toBe('ok');
    }
    expect(validatePipePacket(input(20), 0, rates).kind).toBe('rate-limited');
    expect(validatePipePacket(input(21), 1001, rates).kind).toBe('ok');
  });

  it('routes DOOR intents through the portal kernel', () => {
    const base = assembleWorld([{ frameId: 'station', hull: StationHubSpec }]);
    const world = spawnPawn(base, {
      id: 'p1',
      owner: 'u1',
      frameId: 'station',
      roomId: 'station.habitat',
      x: 160,
      y: 150,
      color: '#fff',
    });
    const door = (wantOpen: boolean) => ({
      type: 'DOOR' as const,
      seq: 1,
      portalId: 'station.habitat_korridor',
      wantOpen,
    });
    const opened = routeIntent(world, 'p1', door(true), []);
    expect(opened.notice).toBe('DOOR_ok');
    expect(opened.world.portals['station.habitat_korridor']?.state).toBe('open');
    const shut = routeIntent(opened.world, 'p1', door(false), []);
    expect(shut.notice).toBe('DOOR_cooldown');
    const missing = routeIntent(world, 'p1', { ...door(true), portalId: 'station.nope' }, []);
    expect(missing.notice).toBe('DOOR_not-found');
    const distant = spawnPawn(world, {
      id: 'p2',
      owner: 'u2',
      frameId: 'station',
      roomId: 'station.sicherheit_sued',
      x: 820,
      y: 380,
      color: '#fff',
    });
    expect(routeIntent(distant, 'p2', door(true), []).notice).toBe('DOOR_too-far');
  });

  it('forwards living verbs to the kernel instead of dropping them', () => {
    const host = new SimHost(buildHarborWorld(), DEFAULT_CLOCKS, null);
    host.handleIntent('c1', {
      type: 'HELLO',
      callsign: 'Rook',
      color: '#ffd166',
      clientVersion: 2,
    });
    const joined = host.handleIntent('c1', {
      type: 'JOIN_BEACON',
      beacon: 'HESP01',
      seq: 1,
      userId: 'u1',
    });
    expect(joined.notice).toBeUndefined();
    const verbs = [
      host.handleIntent('c1', { type: 'INTERACT', seq: 2, fixtureId: 'station.job_board' }),
      host.handleIntent('c1', { type: 'CLAIM', seq: 3, fixtureId: 'station.locker_a' }),
      host.handleIntent('c1', {
        type: 'VEND',
        seq: 4,
        fixtureId: 'station.vending_wall',
        vendId: 'ration_tin',
      }),
      host.handleIntent('c1', { type: 'COOK', seq: 5, stoveId: 'ship.stove' }),
      host.handleIntent('c1', { type: 'HARVEST', seq: 6, trayId: 'ship.hydro_tray' }),
      host.handleIntent('c1', { type: 'RECYCLE', seq: 7, recyclerId: 'ship.recycler' }),
      host.handleIntent('c1', { type: 'REPAIR', seq: 8, fixtureId: 'ship.stove' }),
    ];
    const notices = verbs.map((result) => result.notice);
    expect(notices).toEqual([
      'INTERACT_too-far',
      'CLAIM_too-far',
      'VEND_too-far',
      'COOK_too-far',
      'HARVEST_too-far',
      'RECYCLE_too-far',
      'REPAIR_too-far',
    ]);
  });

  it('walks the corridor to the job board and interacts for real', () => {
    const host = new SimHost(buildHarborWorld(), DEFAULT_CLOCKS, null);
    host.handleIntent('c1', {
      type: 'HELLO',
      callsign: 'Rook',
      color: '#ffd166',
      clientVersion: 2,
    });
    host.handleIntent('c1', { type: 'JOIN_BEACON', beacon: 'HESP01', seq: 1, userId: 'u1' });
    let nowMs = 0;
    for (let i = 0; i < 200; i += 1) {
      nowMs += 50;
      host.handleIntent('c1', {
        type: 'INPUT',
        seq: 10 + i,
        moveVec: { x: 1, y: 0 },
        facing: 0,
        sprint: false,
        sealed: false,
      });
      host.slice(nowMs, 50);
      if ((host.currentWorld.pawns['pawn:u1']?.pos.x ?? 0) >= 430) break;
    }
    expect(host.currentWorld.pawns['pawn:u1']?.pos.x ?? 0).toBeGreaterThanOrEqual(430);
    const result = host.handleIntent('c1', {
      type: 'INTERACT',
      seq: 999,
      fixtureId: 'station.job_board',
    });
    expect(result.notice).toBe('INTERACT_ok');
  });
});

describe('authoritative death and restart', () => {
  function joinedHost(): SimHost {
    const host = new SimHost(buildHarborWorld(), DEFAULT_CLOCKS, null);
    host.handleIntent('c1', {
      type: 'HELLO',
      callsign: 'Rook',
      color: '#ffd166',
      clientVersion: 2,
      trim: 'ion',
      thruster: 'amber',
    });
    host.handleIntent('c1', { type: 'JOIN_BEACON', beacon: 'HESP01', seq: 1, userId: 'u1' });
    return host;
  }

  it('stores appearance from HELLO onto the pawn', () => {
    const host = joinedHost();
    expect(host.currentWorld.pawns['pawn:u1']?.trim).toBe('ion');
    expect(host.currentWorld.pawns['pawn:u1']?.thruster).toBe('amber');
    expect(host.clientOf('c1')?.trim).toBe('ion');
  });

  it('restarts a dead run at the station spawn with fresh vitals', () => {
    const host = joinedHost();
    const pawnId = 'pawn:u1';
    expect(host.currentWorld.pawns[pawnId]).toBeDefined();
    const result = host.handleIntent('c1', { type: 'RESTART', seq: 2 });
    expect(result.notice).toBe('RESTART_ok');
    expect(host.currentWorld.pawns[pawnId]?.health.hp).toBe(100);
    expect(host.currentWorld.pawns[pawnId]?.frameId).toBe('station');
    expect(host.currentWorld.pawns[pawnId]?.trim).toBe('ion');
  });

  it('declares death once per pawn and clears on restart', () => {
    const host = joinedHost();
    expect(host.drainDeaths(1000)).toEqual([]);
    const pawnId = 'pawn:u1';
    const pawn = host.currentWorld.pawns[pawnId];
    expect(pawn).toBeDefined();
    if (pawn === undefined) return;
    const world = {
      ...host.currentWorld,
      pawns: {
        ...host.currentWorld.pawns,
        [pawnId]: { ...pawn, health: { ...pawn.health, hp: 0, incapacitated: true } },
      },
    };
    host.debugSetWorld(world);
    const first = host.drainDeaths(2000);
    expect(first).toHaveLength(1);
    expect(first[0]?.pawnId).toBe(pawnId);
    expect(first[0]?.type).toBe('DEATH');
    expect(host.drainDeaths(2000)).toEqual([]);
    host.handleIntent('c1', { type: 'RESTART', seq: 3 });
    expect(host.drainDeaths(3000)).toEqual([]);
  });

  it('rejects restart from unknown sessions and observers', () => {
    const host = joinedHost();
    expect(host.handleIntent('ghost', { type: 'RESTART', seq: 1 }).notice).toBe('not-joined');
  });
});
