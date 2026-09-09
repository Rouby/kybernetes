/**
 * SimHost: owns one World plus its air authority, one accumulator (20Hz fixed
 * step, 50ms slice, max 4 steps, drop-and-count beyond), three broadcast clocks
 * (SNAPSHOT 10Hz, TELEMETRY 2Hz, VITALS 5Hz), and the client session registry
 * (beacon join, resume by userId, hire flow). Transport-agnostic: validated
 * intents go in, snapshot payloads come out through callbacks and getters.
 * Movement inputs latch per pawn (1s expiry on the slice clock) so held keys
 * survive the 500ms client heartbeat and packet jitter; a zero moveVec
 * releases the latch and the pawn coasts to a stop through damping.
 */

import type {
  ClientIntent,
  DeathBroadcast,
  ManifestBroadcast,
  PawnLinkQuality,
  PawnTrim,
  Role,
  ThrusterTint,
} from '@kybernetes/protocol';
import {
  type AirAuthorityState,
  buildDeath,
  FIXED_DT,
  type HireOfferRecord,
  hireAboard,
  isDead,
  restartRun,
  roomContainingPoint,
  spawnPawn,
  talkToCaptain,
  tickWorld,
  type World,
  type WorldInput,
} from '@kybernetes/sim-core';
import { routeIntent } from './routers/intentRouter.js';
import {
  joinBeacon as admitToBeacon,
  type BeaconEntry,
  canJoinBeacon,
  createBeaconEntry,
  leaveBeacon,
} from './sessions.js';

export interface HostBroadcastClocks {
  snapshotEveryMs: number;
  telemetryEveryMs: number;
  vitalsEveryMs: number;
}

export const DEFAULT_CLOCKS: HostBroadcastClocks = {
  snapshotEveryMs: 100,
  telemetryEveryMs: 500,
  vitalsEveryMs: 200,
};

export interface HostCallbacks {
  onSnapshot: (world: World) => void;
  onTelemetry: (world: World) => void;
  onVitals: (world: World) => void;
}

export interface HostOptions {
  air?: AirAuthorityState;
  stationFrameId?: string;
  rng01?: () => number;
}

export interface HostClient {
  userId: string;
  pawnId: string;
  callsign: string;
  color: string;
  beacon: string;
  trim?: PawnTrim;
  thruster?: ThrusterTint;
}

export type JoinDenied = 'unknown-beacon' | 'beacon-full' | 'join-cooldown' | 'no-spawn';

export interface HostIntentResult {
  notice?: string;
  offer?: HireOfferRecord;
}

/** How long a held INPUT keeps driving its pawn without a refresh. */
export const INPUT_LATCH_MS = 1000;

/** Intents forwarded to the kernel movement/interaction pipeline. */
const KERNEL_INTENT_TYPES: ReadonlySet<string> = new Set([
  'INPUT',
  'DOOR',
  'SUIT',
  'CONSUME',
  'SLEEP',
  'FIRE',
  'RELOAD',
  'INTERACT',
  'CLAIM',
  'VEND',
  'COOK',
  'HARVEST',
  'RECYCLE',
  'REPAIR',
]);

interface HostObserver {
  readonly beacon: string;
  readonly connectedAtMs: number;
}

export class SimHost {
  private world: World;
  private timer: ReturnType<typeof setInterval> | null = null;
  private accumulatorMs = 0;
  private lastTickMs = 0;
  private pending: WorldInput[] = [];
  private droppedSteps = 0;
  private lastSnapshotMs = 0;
  private lastTelemetryMs = 0;
  private lastVitalsMs = 0;
  private readonly clients = new Map<string, HostClient>();
  private readonly observers = new Map<string, HostObserver>();
  private readonly beacons = new Map<string, BeaconEntry>();
  private readonly latched = new Map<string, { input: WorldInput; atMs: number }>();
  private readonly lastInputAt = new Map<string, number>();
  private readonly msgCounts = new Map<string, { count: number; windowStartMs: number }>();
  private tickSamples: { atMs: number; durationMs: number }[] = [];
  private tickMsLast = 0;
  private evictedClients: string[] = [];
  private readonly knownDead = new Set<string>();

  constructor(
    initialWorld: World,
    private readonly clocks: HostBroadcastClocks = DEFAULT_CLOCKS,
    private readonly callbacks: HostCallbacks | null = null,
    private readonly options: HostOptions = {}
  ) {
    this.world = initialWorld;
  }

  get currentWorld(): World {
    return this.world;
  }

  get droppedStepCount(): number {
    return this.droppedSteps;
  }

  /**
   * Client ids evicted by a same-userId resume since the last drain. The
   * transport terminates their sockets; their intents are already dropped
   * because eviction removes them from the client registry.
   */
  drainEvictedClients(): string[] {
    const evicted = this.evictedClients;
    this.evictedClients = [];
    return evicted;
  }

  /** Test-only world swap; sessions and clocks are preserved. */
  debugSetWorld(world: World): void {
    this.world = world;
  }

  enqueueInput(input: WorldInput): void {
    this.pending.push(input);
  }

  clientOf(clientId: string): HostClient | undefined {
    return this.clients.get(clientId);
  }

  isObserver(clientId: string): boolean {
    return this.observers.has(clientId);
  }

  get observerCount(): number {
    return this.observers.size;
  }

  get accumulatorDepthMs(): number {
    return Math.round(this.accumulatorMs * 100) / 100;
  }

  /** Rolling TPS + tick health for SERVER_STATS (same-port observer view). */
  tickHealth(nowMs: number): {
    tpsActual: number;
    tickMsAvg: number;
    tickMsLast: number;
    droppedSteps: number;
    accumulatorMs: number;
  } {
    const cutoff = nowMs - 5000;
    const inWindow = this.tickSamples.filter((sample) => sample.atMs >= cutoff);
    let tpsActual = 0;
    if (inWindow.length >= 2) {
      const spanS = Math.max(0.001, (nowMs - inWindow[0].atMs) / 1000);
      tpsActual = Math.round((inWindow.length / spanS) * 10) / 10;
    }
    const tickMsAvg =
      inWindow.length === 0
        ? 0
        : Math.round((inWindow.reduce((sum, s) => sum + s.durationMs, 0) / inWindow.length) * 100) /
          100;
    return {
      tpsActual,
      tickMsAvg,
      tickMsLast: this.tickMsLast,
      droppedSteps: this.droppedSteps,
      accumulatorMs: this.accumulatorDepthMs,
    };
  }

  /** Per-pawn link quality for the observer debug panel. */
  pawnLinks(nowMs: number): PawnLinkQuality[] {
    const links: PawnLinkQuality[] = [];
    for (const client of this.clients.values()) {
      const pawn = this.world.pawns[client.pawnId];
      if (pawn === undefined) continue;
      const lastAt = this.lastInputAt.get(client.pawnId) ?? 0;
      const counter = this.msgCounts.get(client.pawnId);
      const windowMs = counter === undefined ? 5000 : Math.max(1, nowMs - counter.windowStartMs);
      const msgsPerS =
        counter === undefined ? 0 : Math.round((counter.count / (windowMs / 1000)) * 10) / 10;
      links.push({
        pawnId: client.pawnId,
        callsign: client.callsign,
        frameId: pawn.frameId,
        roomHint: pawn.roomHint,
        lastInputAgeMs: lastAt <= 0 ? -1 : Math.max(0, Math.round(nowMs - lastAt)),
        latched: this.latched.has(client.pawnId),
        msgsPerS,
      });
    }
    return links.sort((a, b) => (a.pawnId < b.pawnId ? -1 : 1));
  }

  joinObserver(
    clientId: string,
    beacon: string,
    nowMs: number = Date.now()
  ): { ok: true } | { denied: JoinDenied } {
    const vessel = Object.values(this.world.vessels).find((entry) => entry.beacon === beacon);
    if (vessel === undefined) return { denied: 'unknown-beacon' };
    // Observers never take a beacon seat, spawn a pawn, or evict a player.
    this.observers.set(clientId, { beacon, connectedAtMs: nowMs });
    return { ok: true };
  }

  private evictPriorSession(clientId: string, id: string): void {
    // Single driver per pawn: a second session under the same userId evicts
    // the previous holder. Without this both sockets drive one pawn and its
    // facing and suit state flop between their inputs every tick.
    for (const [otherId, other] of this.clients) {
      if (otherId !== clientId && other.userId === id) {
        this.clients.delete(otherId);
        this.evictedClients.push(otherId);
      }
    }
  }

  private admitBeaconSeat(
    beacon: string,
    vesselId: string,
    id: string,
    nowMs: number
  ): { entry: BeaconEntry } | { denied: JoinDenied } {
    const entry = this.beacons.get(beacon) ?? createBeaconEntry(beacon, vesselId);
    if (!canJoinBeacon(entry, id, nowMs)) {
      return entry.members.size >= entry.cap
        ? { denied: 'beacon-full' }
        : { denied: 'join-cooldown' };
    }
    this.beacons.set(beacon, admitToBeacon(entry, id, nowMs));
    return { entry };
  }

  joinBeacon(
    clientId: string,
    beacon: string,
    callsign: string,
    color: string,
    userId?: string,
    nowMs: number = Date.now(),
    appearance?: { readonly trim?: PawnTrim; readonly thruster?: ThrusterTint }
  ): { pawnId: string; resumed: boolean } | { denied: JoinDenied } {
    const vessel = Object.values(this.world.vessels).find((entry) => entry.beacon === beacon);
    if (vessel === undefined) return { denied: 'unknown-beacon' };
    const id = userId ?? clientId;
    const pawnId = `pawn:${id}`;
    this.evictPriorSession(clientId, id);
    this.clients.set(clientId, {
      userId: id,
      pawnId,
      callsign,
      color,
      beacon,
      ...appearancePatch(appearance),
    });
    if (this.world.pawns[pawnId] !== undefined) {
      this.world = applyAppearance(this.world, pawnId, appearance);
      return { pawnId, resumed: true };
    }
    const admitted = this.admitBeaconSeat(beacon, vessel.id, id, nowMs);
    if ('denied' in admitted) return admitted;
    const point = stationSpawnPoint(this.world, this.stationFrame());
    if (point === undefined) return { denied: 'no-spawn' };
    this.world = spawnPawn(this.world, {
      id: pawnId,
      owner: id,
      frameId: point.frameId,
      roomId: point.roomId,
      x: point.x,
      y: point.y,
      color,
      ...appearancePatch(appearance),
    });
    return { pawnId, resumed: false };
  }

  leaveClient(clientId: string): void {
    this.observers.delete(clientId);
    const client = this.clients.get(clientId);
    this.clients.delete(clientId);
    if (client === undefined) return;
    // An evicted socket closing after a steal must not release the beacon
    // seat or drop the latch out from under the session that replaced it.
    const stillHeld = [...this.clients.values()].some((other) => other.userId === client.userId);
    if (stillHeld) return;
    const entry = this.beacons.get(client.beacon);
    if (entry !== undefined) this.beacons.set(client.beacon, leaveBeacon(entry, client.userId));
    this.latched.delete(client.pawnId);
  }

  private routeObserverIntent(
    clientId: string,
    intent: ClientIntent
  ): HostIntentResult | undefined {
    if (!this.observers.has(clientId)) return undefined;
    if (intent.type === 'OBSERVE') return this.handleObserve(clientId, intent.beacon);
    return { notice: 'observer-readonly' };
  }

  private routeSessionIntent(clientId: string, intent: ClientIntent): HostIntentResult | undefined {
    switch (intent.type) {
      case 'HELLO':
        return this.handleHello(
          clientId,
          intent.callsign,
          intent.color,
          intent.trim,
          intent.thruster
        );
      case 'RESTART':
        return this.handleRestart(clientId);
      case 'JOIN_BEACON':
        return this.handleJoin(clientId, intent.beacon, intent.userId);
      case 'OBSERVE':
        return this.handleObserve(clientId, intent.beacon);
      case 'TALK':
        return this.handleTalk(intent.npcId);
      case 'HIRE':
        return this.handleHire(clientId, intent.offerId, intent.job);
      default:
        return undefined;
    }
  }

  handleIntent(clientId: string, intent: ClientIntent): HostIntentResult {
    const observer = this.routeObserverIntent(clientId, intent);
    if (observer !== undefined) return observer;
    const session = this.routeSessionIntent(clientId, intent);
    if (session !== undefined) return session;
    if (KERNEL_INTENT_TYPES.has(intent.type)) return this.handleKernelIntent(clientId, intent);
    return { notice: `unknown-intent:${intent.type as string}` };
  }

  manifestFor(): ManifestBroadcast['crew'] {
    const crew: { id: string; callsign: string; role: Role; frameId: string }[] = [];
    for (const client of this.clients.values()) {
      const pawn = this.world.pawns[client.pawnId];
      if (pawn === undefined) continue;
      const role = this.world.crew[client.pawnId]?.role;
      crew.push({
        id: client.pawnId,
        callsign: client.callsign,
        role: role === 'captain' || role === undefined ? 'deckhand' : role,
        frameId: pawn.frameId,
      });
    }
    return crew;
  }

  vitalsFor(pawnId: string): { credits: number; clearance: number } {
    const record = this.world.crew[pawnId];
    return { credits: record?.credits ?? 0, clearance: record?.clearance ?? 1 };
  }

  start(nowMs: number, sliceMs = 50): void {
    if (this.timer !== null) return;
    this.lastTickMs = nowMs;
    this.timer = setInterval(() => this.slice(Date.now(), sliceMs), sliceMs);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.pending = [];
    this.latched.clear();
    this.observers.clear();
    this.lastInputAt.clear();
    this.msgCounts.clear();
    this.tickSamples = [];
    this.tickMsLast = 0;
    this.accumulatorMs = 0;
  }

  get running(): boolean {
    return this.timer !== null;
  }

  slice(nowMs: number, sliceMs: number): void {
    this.accumulatorMs += Math.min(Math.max(nowMs - this.lastTickMs, 0), sliceMs * 4);
    this.lastTickMs = nowMs;
    this.drainSteps(nowMs);
    this.fireClocks(nowMs);
  }

  private stationFrame(): string | undefined {
    if (this.options.stationFrameId !== undefined) return this.options.stationFrameId;
    return Object.keys(this.world.stations)[0];
  }

  private rng(): () => number {
    return this.options.rng01 ?? Math.random;
  }

  private handleHello(
    clientId: string,
    callsign: string,
    color: string,
    trim?: PawnTrim,
    thruster?: ThrusterTint
  ): HostIntentResult {
    const prior = this.clients.get(clientId);
    const session = resumeSession(prior, clientId);
    this.clients.set(clientId, {
      ...session,
      callsign,
      color,
      trim: trim ?? prior?.trim,
      thruster: thruster ?? prior?.thruster,
    });
    this.world = applyAppearance(this.world, session.pawnId, { trim, thruster });
    return {};
  }

  private handleRestart(clientId: string): HostIntentResult {
    const client = this.clients.get(clientId);
    if (client === undefined) return { notice: 'not-joined' };
    const point = stationSpawnPoint(this.world, this.stationFrame());
    if (point === undefined) return { notice: 'restart-no-spawn' };
    this.world = restartRun(this.world, client.pawnId, point);
    this.pending = this.pending.filter((input) => input.pawnId !== client.pawnId);
    this.latched.delete(client.pawnId);
    this.knownDead.delete(client.pawnId);
    return { notice: 'RESTART_ok' };
  }

  drainDeaths(nowMs: number): DeathBroadcast[] {
    const deaths: DeathBroadcast[] = [];
    for (const pawn of Object.values(this.world.pawns)) {
      if (!isDead(this.world, pawn.id)) {
        this.knownDead.delete(pawn.id);
        continue;
      }
      if (this.knownDead.has(pawn.id)) continue;
      this.knownDead.add(pawn.id);
      const built = buildDeath(this.world, pawn.id, nowMs);
      if (built !== undefined) deaths.push(built);
    }
    for (const pawnId of [...this.knownDead]) {
      if (this.world.pawns[pawnId] === undefined) this.knownDead.delete(pawnId);
    }
    return deaths;
  }

  private handleJoin(clientId: string, beacon: string, userId?: string): HostIntentResult {
    const prior = this.clients.get(clientId);
    const display = joinDisplay(prior, clientId);
    const joined = this.joinBeacon(
      clientId,
      beacon,
      display.callsign,
      display.color,
      userId ?? prior?.userId,
      Date.now(),
      { trim: prior?.trim, thruster: prior?.thruster }
    );
    return 'denied' in joined ? { notice: joined.denied } : {};
  }

  private handleObserve(clientId: string, beacon: string): HostIntentResult {
    const joined = this.joinObserver(clientId, beacon, Date.now());
    return 'denied' in joined ? { notice: joined.denied } : {};
  }

  private trackIngress(pawnId: string, nowMs: number): void {
    this.lastInputAt.set(pawnId, nowMs);
    const entry = this.msgCounts.get(pawnId);
    if (entry === undefined || nowMs - entry.windowStartMs >= 5000) {
      this.msgCounts.set(pawnId, { count: 1, windowStartMs: nowMs });
      return;
    }
    this.msgCounts.set(pawnId, { count: entry.count + 1, windowStartMs: entry.windowStartMs });
  }

  private handleKernelIntent(clientId: string, intent: ClientIntent): HostIntentResult {
    const client = this.clients.get(clientId);
    if (client === undefined) return { notice: 'not-joined' };
    this.trackIngress(client.pawnId, Date.now());
    const routed = routeIntent(this.world, client.pawnId, intent, this.pending);
    this.world = routed.world;
    this.pending = [...routed.movement];
    this.latchInput(client.pawnId, intent, routed.movement);
    return routed.notice === undefined ? {} : { notice: routed.notice };
  }

  private latchInput(pawnId: string, intent: ClientIntent, movement: readonly WorldInput[]): void {
    if (intent.type !== 'INPUT') return;
    const latest = movement[movement.length - 1];
    if (latest === undefined) return;
    this.latched.set(pawnId, { input: latest, atMs: this.lastTickMs });
  }

  private handleTalk(npcId: string): HostIntentResult {
    const { world, offer } = talkToCaptain(this.world, npcId, this.rng());
    this.world = world;
    return offer === undefined ? { notice: 'no-offer' } : { offer };
  }

  private handleHire(clientId: string, offerId: string, job: Role): HostIntentResult {
    const client = this.clients.get(clientId);
    if (client === undefined) return { notice: 'not-joined' };
    const offer = this.world.offers[offerId];
    if (offer === undefined) return { notice: 'hire-refused' };
    const { world, hired } = hireAboard(this.world, offer.vesselId, client.pawnId, job, offerId);
    this.world = world;
    return hired ? {} : { notice: 'hire-refused' };
  }

  private drainSteps(nowMs: number): void {
    const stepMs = FIXED_DT * 1000;
    let steps = 0;
    while (this.accumulatorMs >= stepMs) {
      if (steps >= 4) {
        this.droppedSteps += 1;
        this.accumulatorMs = 0;
        return;
      }
      this.stepOnce(nowMs);
      this.accumulatorMs -= stepMs;
      steps += 1;
    }
  }

  private recordTickSample(nowMs: number, durationMs: number): void {
    this.tickMsLast = Math.round(durationMs * 100) / 100;
    this.tickSamples.push({ atMs: nowMs, durationMs: this.tickMsLast });
    const cutoff = nowMs - 5000;
    this.tickSamples = this.tickSamples.filter((sample) => sample.atMs >= cutoff).slice(-100);
  }

  private stepOnce(nowMs: number): void {
    const started = Date.now();
    const inputs = [...this.heldInputs(nowMs), ...this.pending];
    this.pending = [];
    this.world = tickWorld(this.world, FIXED_DT, inputs, this.options.air);
    this.recordTickSample(nowMs, Date.now() - started);
  }

  private heldInputs(nowMs: number): WorldInput[] {
    const held: WorldInput[] = [];
    for (const [pawnId, entry] of this.latched) {
      if (nowMs - entry.atMs > INPUT_LATCH_MS) {
        this.latched.delete(pawnId);
        continue;
      }
      held.push(entry.input);
    }
    return held;
  }

  private fireClocks(nowMs: number): void {
    if (this.callbacks === null) return;
    this.fireSnapshot(nowMs);
    this.fireTelemetry(nowMs);
    this.fireVitals(nowMs);
  }

  private fireSnapshot(nowMs: number): void {
    if (nowMs - this.lastSnapshotMs < this.clocks.snapshotEveryMs) return;
    this.lastSnapshotMs = nowMs;
    this.callbacks?.onSnapshot(this.world);
  }

  private fireTelemetry(nowMs: number): void {
    if (nowMs - this.lastTelemetryMs < this.clocks.telemetryEveryMs) return;
    this.lastTelemetryMs = nowMs;
    this.callbacks?.onTelemetry(this.world);
  }

  private fireVitals(nowMs: number): void {
    if (nowMs - this.lastVitalsMs < this.clocks.vitalsEveryMs) return;
    this.lastVitalsMs = nowMs;
    this.callbacks?.onVitals(this.world);
  }
}

function resumeSession(
  prior: HostClient | undefined,
  clientId: string
): { userId: string; pawnId: string; beacon: string } {
  const userId = prior?.userId ?? clientId;
  return {
    userId,
    pawnId: prior?.pawnId ?? `pawn:${userId}`,
    beacon: prior?.beacon ?? '',
  };
}

function joinDisplay(
  prior: HostClient | undefined,
  clientId: string
): { callsign: string; color: string } {
  return {
    callsign: prior?.callsign ?? clientId,
    color: prior?.color ?? '#ffffff',
  };
}

function appearancePatch(
  appearance: { readonly trim?: PawnTrim; readonly thruster?: ThrusterTint } | undefined
): { readonly trim?: PawnTrim; readonly thruster?: ThrusterTint } {
  return {
    ...(appearance?.trim === undefined ? {} : { trim: appearance.trim }),
    ...(appearance?.thruster === undefined ? {} : { thruster: appearance.thruster }),
  };
}

function applyAppearance(
  world: World,
  pawnId: string,
  appearance: { readonly trim?: PawnTrim; readonly thruster?: ThrusterTint } | undefined
): World {
  const pawn = world.pawns[pawnId];
  if (pawn === undefined) return world;
  const patch = appearancePatch(appearance);
  if (patch.trim === undefined && patch.thruster === undefined) return world;
  return {
    ...world,
    pawns: {
      ...world.pawns,
      [pawnId]: { ...pawn, ...patch },
    },
  };
}

function stationSpawnPoint(
  world: World,
  stationFrameId: string | undefined
): { frameId: string; roomId: string; x: number; y: number } | undefined {
  if (stationFrameId === undefined) return undefined;
  const freshId = `${stationFrameId}.fresh_spawn`;
  const spawnId =
    world.spawns[freshId] === undefined
      ? Object.keys(world.spawns)
          .filter((id) => id.startsWith(`${stationFrameId}.`))
          .sort()[0]
      : freshId;
  if (spawnId !== undefined) {
    const spawn = world.spawns[spawnId];
    if (spawn !== undefined) {
      const roomId = roomContainingPoint(world, stationFrameId, spawn.x, spawn.y);
      if (roomId !== undefined) return { frameId: stationFrameId, roomId, x: spawn.x, y: spawn.y };
    }
  }
  const room = Object.values(world.rooms)
    .filter((entry) => entry.frameId === stationFrameId)
    .sort((a, b) => (a.id < b.id ? -1 : 1))[0];
  if (room === undefined) return undefined;
  return {
    frameId: stationFrameId,
    roomId: room.id,
    x: room.rect.x + room.rect.w / 2,
    y: room.rect.y + room.rect.h / 2,
  };
}
