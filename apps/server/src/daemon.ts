/**
 * Harbor daemon: the live v2 transport. One harbor world stepped by SimHost at
 * 20Hz, protocol v2 on the wire: input-only intents in, ticked snapshots out.
 * SNAPSHOT ships full 1Hz + SNAPSHOT_DELTA 10Hz; TELEMETRY 2Hz ships full
 * every 5th with changed atmos rooms otherwise; VITALS 5Hz is suppressed
 * while quantized content is unchanged (1s heartbeat); MANIFEST is
 * event-driven (crew rev change + 5s heartbeat, unicast on join) and WATCH
 * likewise (content rev + 1s heartbeat for the countdown, unicast on join).
 * Malformed and stale packets are dropped with counters; the loop never
 * throws on client input. getStats exposes per-channel bytes for tuning.
 * Lifecycle: start() rejects (EADDRINUSE) instead of hanging when the port
 * is held by an orphan; stop() is idempotent, terminates every socket, and
 * always settles (bounded close) so the port is released and Ctrl-C exits.
 */

import {
  type ClientIntent,
  makeHelloMismatch,
  type SnapshotFrame,
  type SnapshotPortal,
} from '@kybernetes/protocol';
import {
  type AirAuthorityState,
  type AtmosRoom,
  bindWorldAir,
  buildHarborWorld,
  buildHireOffer,
  buildManifest,
  buildNotice,
  buildSnapshot,
  buildSnapshotDelta,
  buildTelemetry,
  buildVitals,
  buildWatch,
  createAirAuthority,
  diffAtmos,
  mergeAtmos,
  mergeFrames,
  mergePortals,
  readAirFlows,
  type World,
} from '@kybernetes/sim-core';
import { WebSocket, WebSocketServer } from 'ws';
import { SimHost } from './SimHost.js';
import {
  createRateState,
  createSeqCursor,
  parsePipeInput,
  type RateState,
  type SeqCursorState,
} from './validatePipe.js';

interface SocketMeta {
  clientId: string;
  rates: RateState;
  seq: SeqCursorState;
}

export interface ChannelStats {
  readonly snapshotFull: number;
  readonly snapshotDelta: number;
  readonly telemetryFull: number;
  readonly telemetryDelta: number;
  readonly manifest: number;
  readonly watch: number;
  readonly vitals: number;
  readonly suppressedManifest: number;
  readonly suppressedWatch: number;
  readonly suppressedVitals: number;
  readonly snapshotBytes: number;
  readonly telemetryBytes: number;
  readonly manifestBytes: number;
  readonly watchBytes: number;
  readonly vitalsBytes: number;
}

function emptyStats(): ChannelStats {
  return {
    snapshotFull: 0,
    snapshotDelta: 0,
    telemetryFull: 0,
    telemetryDelta: 0,
    manifest: 0,
    watch: 0,
    vitals: 0,
    suppressedManifest: 0,
    suppressedWatch: 0,
    suppressedVitals: 0,
    snapshotBytes: 0,
    telemetryBytes: 0,
    manifestBytes: 0,
    watchBytes: 0,
    vitalsBytes: 0,
  };
}

const SNAPSHOT_FULL_EVERY = 10;
const TELEMETRY_FULL_EVERY = 5;
const MANIFEST_HEARTBEAT_MS = 5000;
const WATCH_HEARTBEAT_MS = 1000;
const VITALS_HEARTBEAT_MS = 1000;
/** Upper bound for the underlying socket close; stop() always settles. */
const CLOSE_TIMEOUT_MS = 2000;

interface PendingStart {
  promise: Promise<void>;
  resolve: () => void;
  reject: (err: Error) => void;
}

function deferredStart(): PendingStart {
  let resolve!: () => void;
  let reject!: (err: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function logServerError(err: unknown): void {
  console.error('[Harbor Daemon] Socket server error:', err);
}

export class HarborDaemon {
  private wss: WebSocketServer | null = null;
  private listening = false;
  private pendingStart: PendingStart | null = null;
  private readonly host: SimHost;
  private readonly air: AirAuthorityState = createAirAuthority();
  private readonly meta = new Map<WebSocket, SocketMeta>();
  private nextClient = 0;
  private droppedInvalid = 0;
  private droppedLimited = 0;
  private stats: ChannelStats = emptyStats();
  private lastPortals: SnapshotPortal[] = [];
  private lastFrames: SnapshotFrame[] = [];
  private lastSnapshotTick = 0;
  private snapshotsSinceFull = SNAPSHOT_FULL_EVERY;
  private lastAtmos: AtmosRoom[] = [];
  private telemetrySinceFull = TELEMETRY_FULL_EVERY;
  private lastManifestRev: number | undefined;
  private lastManifestMs = 0;
  private lastWatchRev: number | undefined;
  private lastWatchMs = 0;
  private readonly vitalsSent = new Map<string, { body: string; ms: number }>();

  constructor(private readonly port: number = 3001) {
    const world = buildHarborWorld();
    bindWorldAir(this.air, world);
    this.host = new SimHost(
      world,
      undefined,
      {
        onSnapshot: (snapshot) => this.broadcastWorld(snapshot),
        onTelemetry: (telemetry) => this.broadcastTelemetry(telemetry),
        onVitals: (vitals) => this.sendVitals(vitals),
      },
      { air: this.air, stationFrameId: 'station' }
    );
  }

  get world(): World {
    return this.host.currentWorld;
  }

  get dropCounts(): { invalid: number; limited: number } {
    return { invalid: this.droppedInvalid, limited: this.droppedLimited };
  }

  getStats(): ChannelStats {
    return { ...this.stats };
  }

  get running(): boolean {
    return this.listening && this.host.running;
  }

  public start(): Promise<void> {
    if (this.listening) return Promise.resolve();
    if (this.pendingStart !== null) return this.pendingStart.promise;
    const pending = deferredStart();
    this.pendingStart = pending;
    this.bindPort(pending);
    return pending.promise;
  }

  public async stop(): Promise<void> {
    this.host.stop();
    this.listening = false;
    this.dropClients();
    const server = this.wss;
    this.wss = null;
    if (server === null) return;
    for (const client of server.clients) {
      try {
        client.terminate();
      } catch {
        // Already gone; port release matters, not farewell handshakes.
      }
    }
    await this.closeServer(server);
  }

  private bindPort(pending: PendingStart): void {
    const server = new WebSocketServer({ port: this.port });
    this.wss = server;
    let finished = false;
    const settle = (err?: Error): void => {
      if (finished) return;
      finished = true;
      server.off('listening', onListening);
      server.off('error', onEarlyError);
      this.pendingStart = null;
      if (this.wss !== server) {
        try {
          server.close();
        } catch {
          // stop() won the race; the late handle is already dead.
        }
        pending.resolve();
        return;
      }
      if (err !== undefined) {
        this.wss = null;
        try {
          server.close();
        } catch {
          // Already dead; the rejection below carries the signal.
        }
        pending.reject(err);
        return;
      }
      this.serve(server);
      pending.resolve();
    };
    const onListening = (): void => settle();
    const onEarlyError = (err: Error): void => settle(err);
    server.on('listening', onListening);
    server.on('error', onEarlyError);
  }

  private serve(server: WebSocketServer): void {
    this.listening = true;
    console.log(`[Harbor Daemon] Authority running on ws://localhost:${this.port}`);
    server.on('error', logServerError);
    server.on('connection', (ws: WebSocket) => this.admit(ws));
    this.host.start(Date.now());
  }

  private admit(ws: WebSocket): void {
    this.nextClient += 1;
    const clientId = `c${this.nextClient}`;
    this.meta.set(ws, {
      clientId,
      rates: createRateState(Date.now()),
      seq: createSeqCursor(),
    });
    ws.on('message', (data: WebSocket.RawData) => {
      this.handleMessage(ws, clientId, data.toString());
    });
    ws.on('error', () => {
      // A socket 'error' without a listener throws; 'close' always follows and reaps.
    });
    ws.on('close', () => {
      this.meta.delete(ws);
      this.host.leaveClient(clientId);
      this.vitalsSent.delete(clientId);
    });
  }

  private dropClients(): void {
    for (const ws of this.meta.keys()) {
      try {
        ws.terminate();
      } catch {
        // Already gone; port release matters, not farewell handshakes.
      }
    }
    this.meta.clear();
  }

  private closeServer(server: WebSocketServer): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        console.error(
          `[Harbor Daemon] Close timed out on port ${this.port}; handle may still be bound.`
        );
        resolve();
      }, CLOSE_TIMEOUT_MS);
      if (typeof timer.unref === 'function') timer.unref();
      server.close((err) => {
        clearTimeout(timer);
        if (err) console.error('[Harbor Daemon] Error closing server:', err);
        else console.log('[Harbor Daemon] Stopped cleanly. Port released.');
        resolve();
      });
    });
  }

  private handleMessage(ws: WebSocket, clientId: string, text: string): void {
    const meta = this.meta.get(ws);
    if (meta === undefined) return;
    const outcome = parsePipeInput(text, Date.now(), meta.rates, meta.seq);
    if (outcome.kind === 'invalid') {
      this.droppedInvalid += 1;
      return;
    }
    if (outcome.kind === 'version-mismatch') {
      this.send(ws, makeHelloMismatch(this.host.currentWorld.tick, Date.now(), outcome.received));
      return;
    }
    if (outcome.kind === 'rate-limited' || outcome.kind === 'duplicate') {
      this.droppedLimited += 1;
      return;
    }
    this.routeIntent(ws, clientId, outcome.intent);
  }

  private routeIntent(ws: WebSocket, clientId: string, intent: ClientIntent): void {
    const result = this.host.handleIntent(clientId, intent);
    if (intent.type === 'JOIN_BEACON' && result.notice === undefined) {
      this.welcomeAboard(ws, intent.beacon);
    }
    if (result.offer !== undefined) {
      this.send(ws, buildHireOffer(this.host.currentWorld.tick, Date.now(), result.offer));
    }
    if (result.notice !== undefined) {
      this.send(
        ws,
        buildNotice(this.host.currentWorld.tick, Date.now(), 'info', 'Bridge', result.notice)
      );
    }
  }

  /** JOINED plus full baselines so later deltas merge onto complete tables. */
  private welcomeAboard(ws: WebSocket, beacon: string): void {
    const meta = this.meta.get(ws);
    if (meta === undefined) return;
    const client = this.host.clientOf(meta.clientId);
    if (client === undefined) return;
    const world = this.host.currentWorld;
    const nowMs = Date.now();
    this.send(ws, {
      type: 'JOINED',
      v: 2,
      tick: world.tick,
      serverTimeMs: nowMs,
      pawnId: client.pawnId,
      beacon,
    });
    this.send(ws, buildSnapshot(world, nowMs));
    this.sendFullTelemetryTo(ws, world, nowMs);
    this.sendManifestTo(ws, world, nowMs);
    this.sendWatchTo(ws, world, nowMs);
  }

  private firstVesselId(world: World): string | undefined {
    return Object.keys(world.vessels)[0];
  }

  private sendAll(payload: unknown): number {
    const text = JSON.stringify(payload);
    for (const ws of this.meta.keys()) {
      if (ws.readyState === WebSocket.OPEN) ws.send(text);
    }
    return text.length;
  }

  private send(ws: WebSocket, payload: unknown): void {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(payload));
  }

  private broadcastWorld(world: World): void {
    const nowMs = Date.now();
    this.sendSnapshot(world, nowMs);
    this.maybeSendManifest(world, nowMs);
    this.maybeSendWatch(world, nowMs);
  }

  private sendSnapshot(world: World, nowMs: number): void {
    if (this.snapshotsSinceFull >= SNAPSHOT_FULL_EVERY) {
      const full = buildSnapshot(world, nowMs);
      const bytes = this.sendAll(full);
      this.lastPortals = [...full.portals];
      this.lastFrames = [...full.frames];
      this.lastSnapshotTick = full.tick;
      this.snapshotsSinceFull = 0;
      this.bump('snapshotFull', 'snapshotBytes', bytes);
      return;
    }
    const delta = buildSnapshotDelta(
      this.lastPortals,
      this.lastFrames,
      this.lastSnapshotTick,
      world,
      nowMs
    );
    const bytes = this.sendAll(delta);
    this.lastPortals = mergePortals(this.lastPortals, delta.portals, delta.removedPortalIds);
    this.lastFrames = mergeFrames(this.lastFrames, delta.frames);
    this.lastSnapshotTick = delta.tick;
    this.snapshotsSinceFull += 1;
    this.bump('snapshotDelta', 'snapshotBytes', bytes);
  }

  private broadcastTelemetry(world: World): void {
    const nowMs = Date.now();
    const rooms = Object.values(world.atmos);
    const flows = readAirFlows(this.air);
    this.telemetrySinceFull += 1;
    if (this.telemetrySinceFull >= TELEMETRY_FULL_EVERY || this.lastAtmos.length === 0) {
      const full = buildTelemetry(world, nowMs, rooms, true, flows);
      const bytes = this.sendAll(full);
      this.lastAtmos = [...full.atmos];
      this.telemetrySinceFull = 0;
      this.bump('telemetryFull', 'telemetryBytes', bytes);
      return;
    }
    const changed = diffAtmos(this.lastAtmos, rooms);
    const delta = buildTelemetry(world, nowMs, changed, false, flows);
    const bytes = this.sendAll(delta);
    this.lastAtmos = mergeAtmos(this.lastAtmos, delta.atmos);
    this.bump('telemetryDelta', 'telemetryBytes', bytes);
  }

  private sendFullTelemetryTo(ws: WebSocket, world: World, nowMs: number): void {
    this.send(
      ws,
      buildTelemetry(world, nowMs, Object.values(world.atmos), true, readAirFlows(this.air))
    );
  }

  private maybeSendManifest(world: World, nowMs: number): void {
    const vesselId = this.firstVesselId(world);
    if (vesselId === undefined) return;
    const payload = buildManifest(world, vesselId, nowMs, this.host.manifestFor());
    if (
      payload.rev === this.lastManifestRev &&
      nowMs - this.lastManifestMs < MANIFEST_HEARTBEAT_MS
    ) {
      this.stats = { ...this.stats, suppressedManifest: this.stats.suppressedManifest + 1 };
      return;
    }
    const bytes = this.sendAll(payload);
    this.lastManifestRev = payload.rev;
    this.lastManifestMs = nowMs;
    this.bump('manifest', 'manifestBytes', bytes);
  }

  private sendManifestTo(ws: WebSocket, world: World, nowMs: number): void {
    const vesselId = this.firstVesselId(world);
    if (vesselId === undefined) return;
    const payload = buildManifest(world, vesselId, nowMs, this.host.manifestFor());
    this.lastManifestRev = payload.rev;
    this.lastManifestMs = nowMs;
    this.send(ws, payload);
  }

  private maybeSendWatch(world: World, nowMs: number): void {
    const vesselId = this.firstVesselId(world);
    if (vesselId === undefined) return;
    const payload = buildWatch(world, vesselId, nowMs);
    if (payload === undefined) return;
    if (payload.rev === this.lastWatchRev && nowMs - this.lastWatchMs < WATCH_HEARTBEAT_MS) {
      this.stats = { ...this.stats, suppressedWatch: this.stats.suppressedWatch + 1 };
      return;
    }
    const bytes = this.sendAll(payload);
    this.lastWatchRev = payload.rev;
    this.lastWatchMs = nowMs;
    this.bump('watch', 'watchBytes', bytes);
  }

  private sendWatchTo(ws: WebSocket, world: World, nowMs: number): void {
    const vesselId = this.firstVesselId(world);
    if (vesselId === undefined) return;
    const payload = buildWatch(world, vesselId, nowMs);
    if (payload === undefined) return;
    this.lastWatchRev = payload.rev;
    this.lastWatchMs = nowMs;
    this.send(ws, payload);
  }

  private sendVitals(world: World): void {
    const nowMs = Date.now();
    for (const [ws, meta] of this.meta) {
      const client = this.host.clientOf(meta.clientId);
      if (client === undefined) continue;
      const vitals = this.host.vitalsFor(client.pawnId);
      const payload = buildVitals(world, nowMs, client.pawnId, vitals.credits, vitals.clearance);
      this.sendVitalsTo(ws, meta.clientId, payload, nowMs);
    }
  }

  /** Unchanged quantized bodies are suppressed; the 1s heartbeat keeps Resyncs live. */
  private sendVitalsTo(
    ws: WebSocket,
    clientId: string,
    payload: ReturnType<typeof buildVitals>,
    nowMs: number
  ): void {
    const body = `${JSON.stringify(payload.vitals)}|${payload.credits}|${payload.clearance}`;
    const prior = this.vitalsSent.get(clientId);
    if (prior !== undefined && prior.body === body && nowMs - prior.ms < VITALS_HEARTBEAT_MS) {
      this.stats = { ...this.stats, suppressedVitals: this.stats.suppressedVitals + 1 };
      return;
    }
    this.vitalsSent.set(clientId, { body, ms: nowMs });
    if (ws.readyState !== WebSocket.OPEN) return;
    const text = JSON.stringify(payload);
    ws.send(text);
    this.bump('vitals', 'vitalsBytes', text.length);
  }

  private bump(
    count:
      | 'snapshotFull'
      | 'snapshotDelta'
      | 'telemetryFull'
      | 'telemetryDelta'
      | 'manifest'
      | 'watch'
      | 'vitals',
    bytes: 'snapshotBytes' | 'telemetryBytes' | 'manifestBytes' | 'watchBytes' | 'vitalsBytes',
    size: number
  ): void {
    this.stats = {
      ...this.stats,
      [count]: this.stats[count] + 1,
      [bytes]: this.stats[bytes] + size,
    };
  }
}
