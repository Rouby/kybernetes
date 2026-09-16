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
  type DockStatusBroadcast,
  makeHelloMismatch,
  makeShipStatus,
  SESSION_RESUMED_ELSEWHERE_CODE,
  type ServerStatsBroadcast,
  type SnapshotFrame,
  type SnapshotPortal,
} from '@kybernetes/protocol';
import {
  type AirAuthorityState,
  type AtmosRoom,
  bindWorldAir,
  buildCargoState,
  buildChartState,
  buildHireOffer,
  buildManifest,
  buildMarketState,
  buildNavState,
  buildNotice,
  buildShipSystems,
  buildSnapshot,
  buildSnapshotDelta,
  buildSoloShipWorld,
  buildTelemetry,
  buildVitals,
  buildWatch,
  createAirAuthority,
  diffAtmos,
  dockStatusOf,
  HUB_PORTS,
  MARKET_HUBS,
  mergeAtmos,
  mergeFrames,
  mergePortals,
  readAirFlows,
  type World,
} from '@kybernetes/sim-core';
import { WebSocket, WebSocketServer } from 'ws';
import { type HostClient, type ShipNotice, SimHost } from './SimHost.js';
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
  /** Last ping answered; a second consecutive miss reaps the half-open socket. */
  isAlive: boolean;
  /** Overfull buffer: snapshot deltas withheld until the next full SNAPSHOT. */
  staleSnapshot: boolean;
  /** Overfull buffer: telemetry deltas withheld until the next full TELEMETRY. */
  staleTelemetry: boolean;
}

/** Slow-consumer ceiling: deltas are lossy, baselines are not. */
const BACKPRESSURE_BYTES = 256 * 1024;

/** High-frequency ticked channels may be dropped under backpressure. */
function isSkippableTick(payload: unknown): boolean {
  if (typeof payload !== 'object' || payload === null) return false;
  const record = payload as Record<string, unknown>;
  if (record.type === 'SNAPSHOT_DELTA') return true;
  return record.type === 'TELEMETRY' && record.full === false;
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

function isJoinIntent(intent: ClientIntent): boolean {
  return intent.type === 'JOIN_BEACON' || intent.type === 'SPAWN_ABOARD';
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
/** Application ping sweep: half-open sockets linger for hours on OS keepalive alone. */
const HEARTBEAT_INTERVAL_MS = 30_000;
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
  private lastDecalIds: string[] = [];
  private lastSnapshotTick = 0;
  private snapshotsSinceFull = SNAPSHOT_FULL_EVERY;
  private lastStatsMs = 0;
  private lastDockMs = 0;
  private lastDockKey = '';
  private lastAtmos: AtmosRoom[] = [];
  private telemetrySinceFull = TELEMETRY_FULL_EVERY;
  private lastManifestRev: number | undefined;
  private lastManifestMs = 0;
  private lastWatchRev: number | undefined;
  private lastWatchMs = 0;
  private readonly vitalsSent = new Map<string, { body: string; ms: number }>();
  private heartbeat: NodeJS.Timeout | null = null;

  constructor(
    private readonly port: number = 3001,
    worldFactory: () => World = buildSoloShipWorld
  ) {
    const world = worldFactory();
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
    if (this.heartbeat !== null) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
    this.lastDecalIds = [];
    this.lastStatsMs = 0;
    this.lastDockMs = 0;
    this.lastDockKey = '';
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
    // Client intents never exceed 4 KB; cap ingress so a flooded socket dies
    // loudly instead of stalling JSON.parse or exhausting process memory.
    const server = new WebSocketServer({ port: this.port, maxPayload: 64 * 1024 });
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
    this.heartbeat = setInterval(() => this.heartbeatSweep(), HEARTBEAT_INTERVAL_MS);
    if (typeof this.heartbeat.unref === 'function') this.heartbeat.unref();
    this.host.start(Date.now());
  }

  /** One ping sweep; public so tests can drive it without waiting 30 seconds. */
  public heartbeatSweep(): void {
    for (const [ws, meta] of this.meta) {
      if (!meta.isAlive) {
        this.reapSilentSocket(ws, meta.clientId);
        continue;
      }
      meta.isAlive = false;
      try {
        ws.ping();
      } catch {
        this.reapSilentSocket(ws, meta.clientId);
      }
    }
  }

  private reapSilentSocket(ws: WebSocket, clientId: string): void {
    try {
      ws.terminate();
    } catch {
      // Already gone; registry cleanup below is what matters.
    }
    this.meta.delete(ws);
    this.host.leaveClient(clientId);
    this.vitalsSent.delete(clientId);
  }

  private admit(ws: WebSocket): void {
    this.nextClient += 1;
    const clientId = `c${this.nextClient}`;
    this.meta.set(ws, {
      clientId,
      rates: createRateState(Date.now()),
      seq: createSeqCursor(),
      isAlive: true,
      staleSnapshot: false,
      staleTelemetry: false,
    });
    ws.on('pong', () => {
      const meta = this.meta.get(ws);
      if (meta !== undefined) meta.isAlive = true;
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
      this.rejectMismatch(ws, outcome.received);
      return;
    }
    if (outcome.kind === 'rate-limited' || outcome.kind === 'duplicate') {
      this.droppedLimited += 1;
      return;
    }
    this.routeIntent(ws, clientId, outcome.intent);
  }

  /** Outdated or legacy wire: one mismatch notice, then a clean close for reload. */
  private rejectMismatch(ws: WebSocket, received: number | undefined): void {
    this.send(ws, makeHelloMismatch(this.host.currentWorld.tick, Date.now(), received));
    try {
      if (ws.readyState === WebSocket.OPEN) ws.close(1000, 'protocol-mismatch');
    } catch {
      // Already gone; the notice above was best-effort.
    }
  }

  private routeIntent(ws: WebSocket, clientId: string, intent: ClientIntent): void {
    const result = this.host.handleIntent(clientId, intent);
    if (isJoinIntent(intent)) this.evictStolenSessions();
    if (intent.type === 'OBSERVE' && result.notice === undefined) {
      this.welcomeObserver(ws, intent.beacon);
    }
    this.welcomeJoiner(ws, clientId, intent, result.notice === undefined);
    if (result.notice === 'observer-readonly') {
      this.droppedLimited += 1;
      return;
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

  /**
   * Terminate sockets the host just evicted via a same-userId resume. The
   * application close code tells the losing tab not to auto-reconnect,
   * which would otherwise steal the pawn straight back every 2 seconds.
   */
  private evictStolenSessions(): void {
    for (const evictedId of this.host.drainEvictedClients()) {
      for (const [sock, meta] of this.meta) {
        if (meta.clientId !== evictedId) continue;
        this.meta.delete(sock);
        this.vitalsSent.delete(evictedId);
        try {
          if (sock.readyState === WebSocket.OPEN) {
            sock.close(SESSION_RESUMED_ELSEWHERE_CODE, 'session-resumed-elsewhere');
          }
        } catch {
          // Already gone; registry cleanup above is what matters.
        }
      }
    }
  }

  /** JOINED plus baselines for both join paths: beacon crews and solo spawns. */
  private welcomeJoiner(
    ws: WebSocket,
    clientId: string,
    intent: ClientIntent,
    welcomed: boolean
  ): void {
    if (!welcomed) return;
    if (intent.type === 'JOIN_BEACON') this.welcomeAboard(ws, intent.beacon);
    if (intent.type === 'SPAWN_ABOARD') {
      this.welcomeAboard(ws, this.host.clientOf(clientId)?.beacon ?? '');
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
    this.sendDockTo(ws, world, nowMs);
  }

  /** Observers get read-only baselines: no pawn, no seat, no eviction. */
  private welcomeObserver(ws: WebSocket, beacon: string): void {
    const meta = this.meta.get(ws);
    if (meta === undefined) return;
    if (!this.host.isObserver(meta.clientId)) return;
    const world = this.host.currentWorld;
    const nowMs = Date.now();
    this.send(ws, {
      type: 'JOINED',
      v: 2,
      tick: world.tick,
      serverTimeMs: nowMs,
      pawnId: '',
      beacon,
    });
    this.send(ws, buildSnapshot(world, nowMs));
    this.sendFullTelemetryTo(ws, world, nowMs);
    this.sendStatsTo(ws, world, nowMs);
    this.sendDockTo(ws, world, nowMs);
  }

  private sendToObservers(payload: unknown): void {
    const text = JSON.stringify(payload);
    for (const [ws, meta] of this.meta) {
      if (!this.host.isObserver(meta.clientId)) continue;
      if (ws.readyState === WebSocket.OPEN) ws.send(text);
    }
  }

  private buildStats(world: World, nowMs: number): ServerStatsBroadcast {
    const health = this.host.tickHealth(nowMs);
    return {
      type: 'SERVER_STATS',
      v: 2,
      tick: world.tick,
      serverTimeMs: nowMs,
      tpsActual: health.tpsActual,
      tpsTarget: 20,
      tickMsLast: health.tickMsLast,
      tickMsAvg: health.tickMsAvg,
      droppedSteps: health.droppedSteps,
      accumulatorMs: health.accumulatorMs,
      observers: this.host.observerCount,
      pawns: this.host.pawnLinks(nowMs),
    };
  }

  private sendStatsTo(ws: WebSocket, world: World, nowMs: number): void {
    this.send(ws, this.buildStats(world, nowMs));
  }

  private maybeSendStats(world: World, nowMs: number): void {
    if (nowMs - this.lastStatsMs < 1000) return;
    this.lastStatsMs = nowMs;
    if (this.host.observerCount === 0) return;
    this.sendToObservers(this.buildStats(world, nowMs));
  }

  private sendDockTo(ws: WebSocket, world: World, nowMs: number): void {
    const dock = dockStatusOf(world, 'harbor', nowMs);
    if (dock !== undefined) this.send(ws, dock);
  }

  private maybeSendDock(world: World, nowMs: number): void {
    const dock = dockStatusOf(world, 'harbor', nowMs);
    if (dock === undefined) return;
    const key = `${dock.phase}:${dock.walkable}:${dock.secondsToSeal}`;
    if (key === this.lastDockKey && nowMs - this.lastDockMs < 1000) return;
    this.lastDockKey = key;
    this.lastDockMs = nowMs;
    this.sendAll(dock as DockStatusBroadcast);
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

  /**
   * Lossy delta fan-out: pressured sockets are marked stale and skipped until
   * the next full baseline for that stream re-seeds them, bounding memory.
   */
  private sendStreamed(payload: unknown, flag: 'staleSnapshot' | 'staleTelemetry'): number {
    const text = JSON.stringify(payload);
    for (const [ws, meta] of this.meta) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      if (meta[flag]) continue;
      if (ws.bufferedAmount >= BACKPRESSURE_BYTES) {
        meta[flag] = true;
        continue;
      }
      ws.send(text);
    }
    return text.length;
  }

  private clearStreamFlag(flag: 'staleSnapshot' | 'staleTelemetry'): void {
    for (const meta of this.meta.values()) meta[flag] = false;
  }

  private send(ws: WebSocket, payload: unknown): void {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (isSkippableTick(payload) && ws.bufferedAmount >= BACKPRESSURE_BYTES) return;
    ws.send(JSON.stringify(payload));
  }

  private broadcastWorld(world: World): void {
    const nowMs = Date.now();
    this.sendSnapshot(world, nowMs);
    this.maybeSendManifest(world, nowMs);
    this.maybeSendWatch(world, nowMs);
    this.maybeSendStats(world, nowMs);
    this.maybeSendDock(world, nowMs);
  }

  private sendSnapshot(world: World, nowMs: number): void {
    if (this.snapshotsSinceFull >= SNAPSHOT_FULL_EVERY) {
      const full = buildSnapshot(world, nowMs);
      const bytes = this.sendAll(full);
      this.clearStreamFlag('staleSnapshot');
      this.lastPortals = [...full.portals];
      this.lastFrames = [...full.frames];
      this.lastDecalIds = (full.decals ?? []).map((decal) => decal.id);
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
      nowMs,
      this.lastDecalIds
    );
    const bytes = this.sendStreamed(delta, 'staleSnapshot');
    this.lastPortals = mergePortals(this.lastPortals, delta.portals, delta.removedPortalIds);
    this.lastFrames = mergeFrames(this.lastFrames, delta.frames);
    if (delta.decals !== undefined) this.lastDecalIds = delta.decals.map((decal) => decal.id);
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
      this.clearStreamFlag('staleTelemetry');
      this.lastAtmos = [...full.atmos];
      this.telemetrySinceFull = 0;
      this.bump('telemetryFull', 'telemetryBytes', bytes);
      this.sendShipSystems(world, nowMs);
      return;
    }
    const changed = diffAtmos(this.lastAtmos, rooms);
    const delta = buildTelemetry(world, nowMs, changed, false, flows);
    const bytes = this.sendStreamed(delta, 'staleTelemetry');
    this.lastAtmos = mergeAtmos(this.lastAtmos, delta.atmos);
    this.bump('telemetryDelta', 'telemetryBytes', bytes);
    this.sendShipSystems(world, nowMs);
  }

  /**
   * Scoped fan-out: ship internals reach only crew aboard that vessel and each
   * market reaches only pawns on its station frame, cutting O(V x M) chatter.
   */
  private sendShipSystems(world: World, nowMs: number): void {
    for (const vesselId of Object.keys(world.vessels)) {
      const aboard = this.host.aboardUserIds(vesselId);
      if (aboard.length === 0) continue;
      const systems = buildShipSystems(world, vesselId, nowMs);
      if (systems !== undefined) this.sendToUsers(aboard, systems);
      const nav = buildNavState(world, vesselId, nowMs);
      if (nav !== undefined) this.sendToUsers(aboard, nav);
      const chart = buildChartState(world, vesselId, nowMs);
      if (chart !== undefined) this.sendToUsers(aboard, chart);
      this.sendToUsers(aboard, buildCargoState(world, vesselId, nowMs));
    }
    for (const hubId of MARKET_HUBS) this.sendHubMarket(world, hubId, nowMs);
  }

  private sendHubMarket(world: World, hubId: string, nowMs: number): void {
    const frame = HUB_PORTS[hubId]?.stationFrame;
    if (frame === undefined) return;
    const locals = this.host.userIdsOnFrame(frame);
    if (locals.length === 0) return;
    this.sendToUsers(locals, buildMarketState(world, hubId, nowMs));
  }

  private sendToUsers(userIds: readonly string[], payload: unknown): void {
    const targets = new Set(userIds);
    const text = JSON.stringify(payload);
    for (const [ws, meta] of this.meta) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      const client = this.host.clientOf(meta.clientId);
      if (client === undefined || !targets.has(client.userId)) continue;
      ws.send(text);
    }
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
    for (const death of this.host.drainDeaths(nowMs)) this.sendAll(death);
    const shipNotices = this.host.drainShipNotices();
    for (const [ws, meta] of this.meta) {
      const client = this.host.clientOf(meta.clientId);
      if (client === undefined) continue;
      const vitals = this.host.vitalsFor(client.pawnId);
      const payload = buildVitals(world, nowMs, client.pawnId, vitals.credits, vitals.clearance);
      this.sendVitalsTo(ws, meta.clientId, payload, nowMs);
      this.sendSoloStatus(world, ws, client, nowMs);
    }
    for (const notice of shipNotices) this.sendNoticeToUser(notice);
  }

  private sendSoloStatus(world: World, ws: WebSocket, client: HostClient, nowMs: number): void {
    const record = this.host.shipRecordFor(client.userId);
    if (record === undefined) return;
    this.send(ws, makeShipStatus(record, world.tick, nowMs));
  }

  private sendNoticeToUser(notice: ShipNotice): void {
    const nowMs = Date.now();
    const tick = this.host.currentWorld.tick;
    for (const [ws, meta] of this.meta) {
      const client = this.host.clientOf(meta.clientId);
      if (client === undefined || client.userId !== notice.userId) continue;
      this.send(ws, buildNotice(tick, nowMs, notice.severity, notice.title, notice.message));
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
