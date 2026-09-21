/**
 * SimHost: owns one World plus its air authority, one accumulator (20Hz fixed
 * step, 50ms slice, max 4 steps, drop-and-count beyond), three broadcast clocks
 * (SNAPSHOT 10Hz, TELEMETRY 2Hz, VITALS 5Hz), and the client session registry
 * (beacon join, resume by userId, hire flow). Transport-agnostic: validated
 * intents go in, snapshot payloads come out through callbacks and getters.
 * Movement inputs latch per pawn (1s expiry on the slice clock) so held keys
 * survive the 500ms client heartbeat and packet jitter; a zero moveVec stops
 * the pawn on the next tick with no glide.
 */

import type {
  ClientIntent,
  DeathBroadcast,
  ManifestBroadcast,
  NoticeBroadcast,
  PawnLinkQuality,
  PawnTrim,
  Role,
  ShipLostReason,
  ThrusterTint,
} from '@kybernetes/protocol';
import { makeShipLost, makeShipStatus } from '@kybernetes/protocol';
import {
  type AirAuthorityState,
  buildDeath,
  creditShip,
  debitShip,
  type EngineTier,
  FIXED_DT,
  type FuelTransfer,
  type HireOfferRecord,
  type HopCursor,
  HUB_A,
  HUB_PORTS,
  hireAboard,
  hopBaseS,
  hopFrom,
  hopTo,
  isCarrying,
  isDead,
  isHubId,
  isTradeGood,
  removeCrate,
  resetVoyageTo,
  restartRun,
  roomContainingPoint,
  type ShipRecord,
  type ShipSystems,
  settleLegFood,
  spawnCrate,
  spawnPawn,
  starvePawn,
  sweepFuelToStores,
  syncEngineFuel,
  syncShipTiers,
  talkToCaptain,
  tickWorld,
  transferFuelFromEngine,
  transferFuelToEngine,
  tryBuy,
  trySell,
  type World,
  type WorldInput,
  wipeOnLoss,
} from '@kybernetes/sim-core';
import { routeIntent } from './routers/intentRouter.js';
import {
  joinBeacon as admitToBeacon,
  type BeaconEntry,
  canJoinBeacon,
  createBeaconEntry,
  leaveBeacon,
} from './sessions.js';
import {
  createShipRegistry,
  ensureSoloShip,
  getSoloShip,
  type ShipRegistry,
  saveSoloShip,
  soloPawnIdFor,
} from './shipRegistry.js';

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

export interface ShipNotice {
  readonly userId: string;
  readonly severity: NoticeBroadcast['severity'];
  readonly title: string;
  readonly message: string;
}

type EngineFuelGate =
  | { readonly notice: string }
  | { readonly record: ShipRecord; readonly systems: ShipSystems; readonly frameId: string };

function moveBunkerFuel(
  op: 'load' | 'unload',
  record: ShipRecord,
  systems: ShipSystems
): FuelTransfer {
  return op === 'load'
    ? transferFuelToEngine(record.stores.fuelCells, systems.engineFuel, systems.engineTier)
    : transferFuelFromEngine(record.stores.fuelCells, systems.engineFuel);
}

interface ShipEdgeMemory {
  readonly warned: boolean;
  readonly scrammed: boolean;
  readonly brownout: boolean;
  readonly flameout: boolean;
  readonly phase: string;
}

/** How long a held INPUT keeps driving its pawn without a refresh. */
export const INPUT_LATCH_MS = 1000;

/** Flat tow fee for a DISTRESS rescue; floored at zero so rescue never kills. */
const DISTRESS_FEE = 25;

/** How close pawn and crate must be to a market stall to trade. */
const MARKET_REACH_PX = 150;

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
  'REACTOR_TUNE',
  'REACTOR_RESTART',
  'ENGINE_TUNE',
  'NAV_PLOT',
  'NAV_CANCEL',
  'HAIL',
  'CARGO_PICKUP',
  'CARGO_DROP',
  'CARGO_UNPACK',
  'CARGO_REPACK',
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
  private readonly ships: ShipRegistry = createShipRegistry();
  private readonly shipEdges = new Map<string, ShipEdgeMemory>();
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
      case 'SPAWN_ABOARD':
        return this.handleSpawnAboard(clientId, intent.userId);
      case 'DISTRESS':
        return this.handleDistress(clientId);
      case 'OBSERVE':
        return this.handleObserve(clientId, intent.beacon);
      case 'TALK':
        return this.handleTalk(intent.npcId);
      case 'HIRE':
        return this.handleHire(clientId, intent.offerId, intent.job);
      default:
        return this.routeTradeIntent(clientId, intent);
    }
  }

  /** Solo-trader market intents (M5 economy). Thin dispatch, no math. */
  private routeTradeIntent(clientId: string, intent: ClientIntent): HostIntentResult | undefined {
    switch (intent.type) {
      case 'MARKET_BUY':
        return this.handleMarketBuy(clientId, intent.hubId, intent.items);
      case 'MARKET_SELL':
        return this.handleMarketSell(clientId, intent.hubId, intent.crateIds);
      case 'ENGINE_FUEL':
        return this.handleEngineFuel(clientId, intent.op);
      default:
        return undefined;
    }
  }

  /** Engine bunker load/unload: loose cells <-> fuel-value, docked at engine console. */
  private handleEngineFuel(clientId: string, op: 'load' | 'unload'): HostIntentResult {
    const gated = this.gateEngineFuel(clientId);
    if (!('record' in gated)) return { notice: gated.notice };
    const moved = moveBunkerFuel(op, gated.record, gated.systems);
    if (!moved.ok) return { notice: `ENGINE_${moved.reason}` };
    saveSoloShip(this.ships, {
      ...gated.record,
      stores: { ...gated.record.stores, fuelCells: moved.looseCells },
      engineFuel: moved.engineFuel,
    });
    this.world = syncEngineFuel(this.world, gated.frameId, moved.engineFuel);
    return { notice: 'ENGINE_ok' };
  }

  private gateEngineFuel(clientId: string): EngineFuelGate {
    const client = this.clients.get(clientId);
    if (client === undefined) return { notice: 'not-joined' };
    return this.gateEngineFuelPawn(client);
  }

  private gateEngineFuelPawn(client: HostClient): EngineFuelGate {
    const pawn = this.world.pawns[client.pawnId];
    const systems = pawn === undefined ? undefined : this.world.ships[pawn.frameId];
    if (pawn === undefined || systems === undefined) return { notice: 'ENGINE_denied' };
    if (this.world.vessels[pawn.frameId] === undefined) return { notice: 'ENGINE_too-far' };
    if (systems.nav.phase !== 'docked') return { notice: 'ENGINE_underway' };
    if (isCarrying(this.world.cargo, client.pawnId)) return { notice: 'ENGINE_hands-full' };
    if (!this.shipConsoleNear(pawn.frameId, pawn.pos)) return { notice: 'ENGINE_too-far' };
    const record = getSoloShip(this.ships, client.userId);
    if (record === undefined) return { notice: 'ENGINE_denied' };
    return { record, systems, frameId: pawn.frameId };
  }

  private shipConsoleNear(frameId: string, pos: { x: number; y: number }): boolean {
    return this.engineConsoleNear(frameId, pos) || this.navConsoleNear(frameId, pos);
  }

  private engineConsoleNear(frameId: string, pos: { x: number; y: number }): boolean {
    return this.consoleNear(frameId, pos, 'engine_console');
  }

  private navConsoleNear(frameId: string, pos: { x: number; y: number }): boolean {
    return this.consoleNear(frameId, pos, 'nav_console');
  }

  private consoleNear(
    frameId: string,
    pos: { x: number; y: number },
    kind: 'engine_console' | 'nav_console'
  ): boolean {
    return Object.values(this.world.fixtures).some(
      (fix) =>
        fix.kind === kind &&
        fix.roomId.startsWith(`${frameId}.`) &&
        Math.hypot(pos.x - fix.pos.x, pos.y - fix.pos.y) <= 150
    );
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
    for (const client of this.clients.values()) {
      if (client.pawnId !== pawnId) continue;
      const ship = getSoloShip(this.ships, client.userId);
      if (ship !== undefined) return { credits: ship.credits, clearance: 1 };
    }
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

  /** Solo loop (TRANSFORM M1): spawn aboard the player's own persistent ship. */
  spawnAboardOwnShip(
    clientId: string,
    callsign: string,
    color: string,
    userId?: string,
    appearance?: { readonly trim?: PawnTrim; readonly thruster?: ThrusterTint }
  ): { pawnId: string; resumed: boolean } | { denied: JoinDenied } {
    const id = userId ?? clientId;
    const ship = ensureSoloShip(this.ships, id);
    const pawnId = soloPawnIdFor(id);
    this.evictPriorSession(clientId, id);
    this.clients.set(clientId, {
      userId: id,
      pawnId,
      callsign,
      color,
      beacon: ship.shipId,
      ...appearancePatch(appearance),
    });
    if (this.world.pawns[pawnId] !== undefined) {
      this.world = applyAppearance(this.world, pawnId, appearance);
      return { pawnId, resumed: true };
    }
    const point = soloSpawnPoint(this.world, this.stationFrame());
    if (point === undefined) return { denied: 'no-spawn' };
    this.world = spawnPawn(this.world, soloSpawnRequest(pawnId, id, point, color, appearance));
    this.world = syncShipTiers(this.world, point.frameId, ship.reactorTier, ship.engineTier);
    this.world = syncEngineFuel(this.world, point.frameId, ship.engineFuel);
    return { pawnId, resumed: false };
  }

  /** Owned-ship record for status snapshots; undefined until first spawn. */
  shipRecordFor(userId: string): ShipRecord | undefined {
    return getSoloShip(this.ships, userId);
  }

  /** Versioned SHIP_STATUS payload for one owner's ship, if known. */
  shipStatusFor(
    userId: string,
    tick: number,
    nowMs: number
  ): ReturnType<typeof makeShipStatus> | undefined {
    const ship = getSoloShip(this.ships, userId);
    if (ship === undefined) return undefined;
    return makeShipStatus(ship, tick, nowMs);
  }

  /**
   * Tick-edge ship notices (overheat warning, scram, brownout) plus hull
   * mirroring: kernel condition flows into the aboard owners' records so
   * SHIP_STATUS stays live. Daemon drains this after each slice.
   */
  drainShipNotices(): ShipNotice[] {
    const notices: ShipNotice[] = [];
    for (const systems of Object.values(this.world.ships)) {
      this.settleArrival(systems.vesselId, systems.nav.phase);
      notices.push(...this.drainVesselNotices(systems.vesselId));
      this.mirrorHull(systems.vesselId, systems.condition, systems.engineFuel);
    }
    return notices;
  }

  private drainVesselNotices(vesselId: string): ShipNotice[] {
    const systems = this.world.ships[vesselId];
    if (systems === undefined) return [];
    const prev = this.shipEdges.get(vesselId) ?? freshEdgeMemory();
    this.shipEdges.set(vesselId, edgeMemoryOf(systems));
    const crew = this.aboardUserIds(vesselId);
    return [
      ...reactorEdgeNotices(systems, prev, crew),
      ...engineEdgeNotices(systems, prev, crew),
      ...voyageEdgeNotices(systems, prev, crew),
    ];
  }

  /** User ids crewed aboard a vessel: the scoped audience for ship telemetry. */
  aboardUserIds(vesselId: string): string[] {
    return this.userIdsOnFrame(vesselId);
  }

  /** User ids with pawns on a frame: stations scope their market the same way. */
  userIdsOnFrame(frameId: string): string[] {
    const users = new Set<string>();
    for (const client of this.clients.values()) {
      const pawn = this.world.pawns[client.pawnId];
      if (pawn !== undefined && pawn.frameId === frameId) users.add(client.userId);
    }
    return [...users];
  }

  /** Arrival edge: a leg just ended, so settle one leg of food per aboard owner. */
  private settleArrival(vesselId: string, phase: string): void {
    const prev = this.shipEdges.get(vesselId);
    if (prev === undefined || prev.phase === 'docked' || phase !== 'docked') return;
    for (const userId of this.aboardUserIds(vesselId)) this.settleUserLeg(vesselId, userId);
  }

  private settleUserLeg(vesselId: string, userId: string): void {
    const record = getSoloShip(this.ships, userId);
    if (record === undefined) return;
    const settled = settleLegFood(this.world.cargo.secured[vesselId] ?? {}, record.stores);
    this.world = {
      ...this.world,
      cargo: {
        ...this.world.cargo,
        secured: { ...this.world.cargo.secured, [vesselId]: settled.secured },
      },
    };
    if (settled.stores !== record.stores) {
      saveSoloShip(this.ships, { ...record, stores: settled.stores });
    }
    if (settled.shortfall > 0) {
      const pawnId = this.pawnIdForUser(userId);
      if (pawnId !== undefined) this.world = starvePawn(this.world, pawnId, settled.shortfall);
    }
  }

  private pawnIdForUser(userId: string): string | undefined {
    for (const client of this.clients.values()) {
      if (client.userId === userId) return client.pawnId;
    }
    return undefined;
  }

  private mirrorHull(vesselId: string, condition: number, engineFuel: number): void {
    for (const userId of this.aboardUserIds(vesselId)) {
      const record = getSoloShip(this.ships, userId);
      if (record === undefined) continue;
      if (record.condition !== condition || record.engineFuel !== engineFuel) {
        saveSoloShip(this.ships, { ...record, condition, engineFuel });
      }
    }
  }

  /** Hard-fail wipe: mark the owned ship lost and emit SHIP_LOST. */
  loseShipFor(
    userId: string,
    reason: ShipLostReason,
    tick: number,
    nowMs: number
  ): ReturnType<typeof makeShipLost> | undefined {
    const ship = getSoloShip(this.ships, userId);
    if (ship === undefined) return undefined;
    saveSoloShip(this.ships, wipeOnLoss(ship));
    return makeShipLost(ship.shipId, reason, tick, nowMs);
  }

  /** Flat tow fee for a DISTRESS rescue; floored at zero so rescue never kills. */
  private handleDistress(clientId: string): HostIntentResult {
    const client = this.clients.get(clientId);
    if (client === undefined) return { notice: 'not-joined' };
    const pawn = this.world.pawns[client.pawnId];
    const systems = pawn === undefined ? undefined : this.world.ships[pawn.frameId];
    if (pawn === undefined || systems === undefined) return { notice: 'DISTRESS_denied' };
    if (systems.nav.phase !== 'in_transit') return { notice: 'DISTRESS_denied' };
    const record = getSoloShip(this.ships, client.userId);
    if (record === undefined) return { notice: 'DISTRESS_denied' };
    const paid = debitShip(record, Math.min(record.credits, DISTRESS_FEE)) ?? record;
    this.world = resetVoyageTo(
      this.world,
      pawn.frameId,
      nearestHub(systems.nav, systems.engineTier)
    );
    saveSoloShip(this.ships, paid);
    return { notice: 'DISTRESS_ok' };
  }

  /** Market buy: funds + stock checked server-side, mixed crate spawns on the bay. */
  private handleMarketBuy(
    clientId: string,
    hubId: string,
    items: readonly { goodId: string; qty: number }[]
  ): HostIntentResult {
    const client = this.clients.get(clientId);
    if (client === undefined) return { notice: 'not-joined' };
    const station = this.marketStation(client.pawnId, hubId);
    if (station === undefined) return { notice: 'MARKET_wrong-frame' };
    const gate = this.marketGate(client.pawnId, station, false);
    if (gate !== undefined) return gate;
    if (!items.every((item) => isTradeGood(item.goodId))) {
      return { notice: 'MARKET_unknown-good' };
    }
    const record = getSoloShip(this.ships, client.userId);
    if (record === undefined) return { notice: 'MARKET_no-ship' };
    const bought = tryBuy(this.world.market, hubId, items, record.credits, this.world.timeMs);
    if (!bought.ok) return { notice: `MARKET_${bought.reason}` };
    const paid = debitShip(record, bought.cost);
    if (paid === undefined) return { notice: 'MARKET_insufficient-funds' };
    const spawned = this.spawnBayCrate(station, items);
    if (spawned === undefined) return { notice: 'MARKET_denied' };
    this.world = { ...this.world, market: bought.ledger, cargo: spawned };
    saveSoloShip(this.ships, paid);
    return { notice: 'MARKET_ok' };
  }

  /** Market sell: every valid bay crate near the stall pays out and despawns. */
  private handleMarketSell(
    clientId: string,
    hubId: string,
    crateIds: readonly string[]
  ): HostIntentResult {
    const client = this.clients.get(clientId);
    if (client === undefined) return { notice: 'not-joined' };
    const station = this.marketStation(client.pawnId, hubId);
    if (station === undefined) return { notice: 'MARKET_wrong-frame' };
    const gate = this.marketGate(client.pawnId, station, true);
    if (gate !== undefined) return gate;
    const record = getSoloShip(this.ships, client.userId);
    if (record === undefined) return { notice: 'MARKET_no-ship' };
    const sold = this.sellBayCrates(client.pawnId, station, hubId, crateIds);
    if (sold.count < 1) return { notice: 'MARKET_denied' };
    saveSoloShip(this.ships, creditShip(record, sold.revenue));
    return { notice: `MARKET_sold:${sold.count}` };
  }

  /** The pawn must stand on the traded hub's station frame. */
  private marketStation(pawnId: string, hubId: string): string | undefined {
    const port = HUB_PORTS[hubId];
    const pawn = this.world.pawns[pawnId];
    if (port === undefined || pawn === undefined) return undefined;
    return pawn.frameId === port.stationFrame ? port.stationFrame : undefined;
  }

  /** Buyers go hands-free; sellers may hand over the carried crate directly. */
  private marketGate(
    pawnId: string,
    station: string,
    allowCarry: boolean
  ): HostIntentResult | undefined {
    if (!allowCarry && isCarrying(this.world.cargo, pawnId)) {
      return { notice: 'MARKET_hands-full' };
    }
    if (!this.stallNear(station, this.world.pawns[pawnId]?.pos))
      return { notice: 'MARKET_too-far' };
    return undefined;
  }

  private stallNear(station: string, pos: { x: number; y: number } | undefined): boolean {
    if (pos === undefined) return false;
    return Object.values(this.world.fixtures).some(
      (fix) =>
        fix.kind === 'market_stall' &&
        fix.roomId.startsWith(`${station}.`) &&
        Math.hypot(pos.x - fix.pos.x, pos.y - fix.pos.y) <= MARKET_REACH_PX
    );
  }

  private marketStallAt(station: string): { x: number; y: number } | undefined {
    const stall = Object.values(this.world.fixtures).find(
      (fix) => fix.kind === 'market_stall' && fix.roomId.startsWith(`${station}.`)
    );
    return stall === undefined ? undefined : { ...stall.pos };
  }

  private spawnBayCrate(station: string, items: readonly { goodId: string; qty: number }[]) {
    const at = this.marketStallAt(station) ?? { x: 0, y: 0 };
    const n = Object.keys(this.world.cargo.crates).length;
    const spawned = spawnCrate(this.world.cargo, {
      id: `mkt:${this.world.tick}:${n}`,
      items: items.map((item) => ({ goodId: item.goodId, qty: item.qty })),
      where: 'bayFloor',
      frameId: station,
      x: at.x + 30 + (n % 5) * 20,
      y: at.y + Math.floor(n / 5) * 20,
    });
    return spawned.ok ? spawned.hold : undefined;
  }

  private sellBayCrates(
    pawnId: string,
    station: string,
    hubId: string,
    crateIds: readonly string[]
  ): { count: number; revenue: number } {
    let ledger = this.world.market;
    let hold = this.world.cargo;
    let count = 0;
    let revenue = 0;
    for (const id of crateIds) {
      const crate = hold.crates[id];
      if (crate === undefined) continue;
      if (!this.isSellableCrate(crate, pawnId, station)) continue;
      if (!crate.items.every((item) => isTradeGood(item.goodId))) continue;
      const deal = trySell(ledger, hubId, crate.items, this.world.timeMs);
      if (!deal.ok) continue;
      ledger = deal.ledger;
      revenue += deal.revenue;
      hold = removeCrate(hold, id);
      count += 1;
    }
    if (count > 0) this.world = { ...this.world, market: ledger, cargo: hold };
    return { count, revenue };
  }

  private isSellableCrate(
    crate: { where: string; frameId: string; carrierId?: string; x: number; y: number },
    pawnId: string,
    station: string
  ): boolean {
    if (crate.where === 'carriedBy' && crate.carrierId === pawnId) return true;
    if (crate.where !== 'bayFloor' || crate.frameId !== station) return false;
    return this.stallNear(station, crate);
  }

  private handleSpawnAboard(clientId: string, userId?: string): HostIntentResult {
    const prior = this.clients.get(clientId);
    const display = joinDisplay(prior, clientId);
    const joined = this.spawnAboardOwnShip(
      clientId,
      display.callsign,
      display.color,
      userId ?? prior?.userId,
      {
        trim: prior?.trim,
        thruster: prior?.thruster,
      }
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
    if (intent.type === 'CARGO_UNPACK' && routed.notice === 'CARGO_ok') {
      this.sweepUnpackedFuel(client.userId, client.pawnId);
    }
    return routed.notice === undefined ? {} : { notice: routed.notice };
  }

  /** Unpacked fuel cells feed loose ship stores (load them into the engine separately). */
  private sweepUnpackedFuel(userId: string, pawnId: string): void {
    const pawn = this.world.pawns[pawnId];
    if (pawn === undefined || this.world.vessels[pawn.frameId] === undefined) return;
    const swept = sweepFuelToStores(this.world.cargo, pawn.frameId);
    if (swept.fuel < 1) return;
    this.world = { ...this.world, cargo: swept.hold };
    const record = getSoloShip(this.ships, userId);
    if (record === undefined) return;
    const refueled = record.stores.fuelCells + swept.fuel;
    saveSoloShip(this.ships, {
      ...record,
      stores: { ...record.stores, fuelCells: refueled },
    });
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
    const { world, hired, hold } = hireAboard(
      this.world,
      offer.vesselId,
      client.pawnId,
      job,
      offerId
    );
    this.world = world;
    if (hired) return {};
    if (hold === 'aboard-first') return { notice: 'hire-aboard-first' };
    if (hold === 'tube-busy') return { notice: 'hire-tube-busy' };
    return { notice: 'hire-refused' };
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

/** Tow target must be a hub dock mouth: prefer the nearer chain end, else any hub aboard, else home. */
function nearestHub(nav: HopCursor & { remainingS: number }, engineTier: EngineTier): string {
  const pastHalf = nav.remainingS > hopBaseS(hopFrom(nav), hopTo(nav), engineTier) / 2;
  const ordered = pastHalf
    ? [nav.portHubId, ...nav.stops, nav.destHubId]
    : [nav.destHubId, ...[...nav.stops].reverse(), nav.portHubId];
  for (const id of ordered) {
    if (id !== undefined && isHubId(id)) return id;
  }
  return HUB_A;
}

function freshEdgeMemory(): ShipEdgeMemory {
  return { warned: false, scrammed: false, brownout: false, flameout: false, phase: 'docked' };
}

function edgeMemoryOf(systems: ShipSystems): ShipEdgeMemory {
  return {
    warned: systems.reactor.warned,
    scrammed: systems.reactor.scrammed,
    brownout: systems.engine.brownout,
    flameout: systems.nav.flameout,
    phase: systems.nav.phase,
  };
}

function reactorEdgeNotices(
  systems: ShipSystems,
  prev: ShipEdgeMemory,
  crew: readonly string[]
): ShipNotice[] {
  if (systems.reactor.warned && !prev.warned) {
    return crew.map((userId) =>
      warnNotice(
        userId,
        'Reactor hot',
        'Temperature above the nominal band. Trim rods and coolant.'
      )
    );
  }
  if (systems.reactor.scrammed && !prev.scrammed) {
    return crew.map((userId) =>
      warnNotice(userId, 'REACTOR SCRAM', 'Blackout. Restart at the reactor console.', 'critical')
    );
  }
  return [];
}

function engineEdgeNotices(
  systems: ShipSystems,
  prev: ShipEdgeMemory,
  crew: readonly string[]
): ShipNotice[] {
  if (systems.engine.brownout && !prev.brownout) {
    return crew.map((userId) =>
      warnNotice(userId, 'Brownout', 'Load outgrows reactor output. Spool stalled.')
    );
  }
  return [];
}

function voyageEdgeNotices(
  systems: ShipSystems,
  prev: ShipEdgeMemory,
  crew: readonly string[]
): ShipNotice[] {
  if (systems.nav.flameout && !prev.flameout) {
    return crew.map((userId) => flameoutNotice(userId));
  }
  return [];
}

function warnNotice(
  userId: string,
  title: string,
  message: string,
  severity: ShipNotice['severity'] = 'warning'
): ShipNotice {
  return { userId, severity, title, message };
}

function flameoutNotice(userId: string): ShipNotice {
  return warnNotice(
    userId,
    'Adrift — flameout',
    'Bunker dry or burn stalled. HAIL a drone, refuel, or DISTRESS tow.'
  );
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

function soloSpawnRequest(
  pawnId: string,
  owner: string,
  point: { frameId: string; roomId: string; x: number; y: number },
  color: string,
  appearance: { readonly trim?: PawnTrim; readonly thruster?: ThrusterTint } | undefined
): {
  id: string;
  owner: string;
  frameId: string;
  roomId: string;
  x: number;
  y: number;
  color: string;
} & ReturnType<typeof appearancePatch> {
  return {
    id: pawnId,
    owner,
    frameId: point.frameId,
    roomId: point.roomId,
    x: point.x,
    y: point.y,
    color,
    ...appearancePatch(appearance),
  };
}

function vesselSpawnPoint(
  world: World,
  vesselId: string
): { frameId: string; roomId: string; x: number; y: number } | undefined {
  const spawnId = Object.keys(world.spawns)
    .filter((id) => id.startsWith(`${vesselId}.`))
    .sort()[0];
  if (spawnId !== undefined) return spawnPointAt(world, vesselId, world.spawns[spawnId]);
  return firstRoomCenter(world, vesselId);
}

function spawnPointAt(
  world: World,
  frameId: string,
  spawn: { x: number; y: number } | undefined
): { frameId: string; roomId: string; x: number; y: number } | undefined {
  if (spawn === undefined) return firstRoomCenter(world, frameId);
  const roomId = roomContainingPoint(world, frameId, spawn.x, spawn.y);
  if (roomId === undefined) return firstRoomCenter(world, frameId);
  return { frameId, roomId, x: spawn.x, y: spawn.y };
}

function firstRoomCenter(
  world: World,
  frameId: string
): { frameId: string; roomId: string; x: number; y: number } | undefined {
  const room = Object.values(world.rooms)
    .filter((entry) => entry.frameId === frameId)
    .sort((a, b) => (a.id < b.id ? -1 : 1))[0];
  if (room === undefined) return undefined;
  return {
    frameId,
    roomId: room.id,
    x: room.rect.x + room.rect.w / 2,
    y: room.rect.y + room.rect.h / 2,
  };
}

function soloSpawnPoint(
  world: World,
  stationFrameId: string | undefined
): { frameId: string; roomId: string; x: number; y: number } | undefined {
  const vesselId = Object.keys(world.vessels).sort()[0];
  if (vesselId !== undefined) {
    const aboard = vesselSpawnPoint(world, vesselId);
    if (aboard !== undefined) return aboard;
  }
  return stationSpawnPoint(world, stationFrameId);
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
