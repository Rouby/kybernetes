/**
 * Socket core: framework-free protocol v2 message handling (Phase 3 Round 14).
 * Ticked snapshots in (SNAPSHOT full 1Hz plus SNAPSHOT_DELTA 10Hz, TELEMETRY
 * 2Hz full/delta, VITALS 5Hz, plus WATCH/MANIFEST event+heartbeat,
 * HIRE_OFFER/NOTICE/JOINED). Deltas merge onto cached full tables so
 * downstream renders keep reading plain SNAPSHOT/TELEMETRY; stale ticks and
 * same-rev manifests never re-render. No React; stores own the transport.
 */

import type {
  CargoStateBroadcast,
  ChartStateBroadcast,
  DeathBroadcast,
  DockStatusBroadcast,
  HireOfferBroadcast,
  ManifestBroadcast,
  MarketStateBroadcast,
  NavStateBroadcast,
  NoticeBroadcast,
  PawnTrim,
  ServerStatsBroadcast,
  ShipLostBroadcast,
  ShipStatusBroadcast,
  ShipSystemsBroadcast,
  SnapshotBroadcast,
  SnapshotDeltaBroadcast,
  TelemetryBroadcast,
  ThrusterTint,
  VitalsBroadcast,
  WatchBroadcast,
} from '@kybernetes/protocol';
import { isNewerTick, isV2Packet } from '@kybernetes/protocol';
import { BROADCAST_GUARDS, recordBroadcastDrop } from './broadcastGuards';
import { deathTitle } from './deathNotice';
import { mergeSnapshotDelta, mergeTelemetry } from './renderState';

interface HarborNotice {
  readonly id: number;
  readonly severity: string;
  readonly title: string;
  readonly message: string;
}

export interface HarborIdentity {
  readonly callsign: string;
  readonly color: string;
  readonly beacon: string;
  readonly userId: string;
  readonly trim?: PawnTrim;
  readonly thruster?: ThrusterTint;
}

let noticeId = 0;

function pushNotice(
  setNotices: (updater: HarborNotice[] | ((prev: HarborNotice[]) => HarborNotice[])) => void,
  severity: string,
  title: string,
  message: string
): void {
  noticeId += 1;
  const id = noticeId;
  setNotices((prev) => [...prev.slice(-4), { id, severity, title, message }]);
}

/** Merge caches; plain {current} shapes so unit tests can drive handleMessage. */
export interface HarborCaches {
  readonly snapshot: { current: SnapshotBroadcast | null };
  readonly telemetry: { current: TelemetryBroadcast | null };
  readonly vitalsTick: { current: number };
  readonly systemsTick: { current: number };
  readonly statusTick: { current: number };
  readonly navTick: { current: number };
  readonly chartTick: { current: number };
  readonly manifestRev: { current: number | undefined };
  readonly cargoTick: { current: number };
  readonly marketTick: { current: Record<string, number> };
  readonly manifestSeen: { current: boolean };
  readonly watchRev: { current: number | undefined };
  readonly watchRemaining: { current: number | undefined };
}

export function createHarborCaches(): HarborCaches {
  return {
    snapshot: { current: null },
    telemetry: { current: null },
    vitalsTick: { current: -1 },
    systemsTick: { current: -1 },
    statusTick: { current: -1 },
    navTick: { current: -1 },
    chartTick: { current: -1 },
    cargoTick: { current: -1 },
    marketTick: { current: {} },
    manifestRev: { current: undefined },
    manifestSeen: { current: false },
    watchRev: { current: undefined },
    watchRemaining: { current: undefined },
  };
}

/** Reset every tick cursor + rev guard (reconnect must not leave stale ship/nav). */
export function resetHarborCaches(caches: HarborCaches): void {
  caches.snapshot.current = null;
  caches.telemetry.current = null;
  caches.vitalsTick.current = -1;
  caches.systemsTick.current = -1;
  caches.statusTick.current = -1;
  caches.navTick.current = -1;
  caches.chartTick.current = -1;
  caches.cargoTick.current = -1;
  caches.marketTick.current = {};
  caches.manifestRev.current = undefined;
  caches.manifestSeen.current = false;
  caches.watchRev.current = undefined;
  caches.watchRemaining.current = undefined;
}

export interface SnapshotSetters {
  setSnapshot: (s: SnapshotBroadcast) => void;
  setTelemetry: (t: TelemetryBroadcast) => void;
  setVitals: (v: VitalsBroadcast) => void;
  setWatch: (w: WatchBroadcast) => void;
  setManifest: (m: ManifestBroadcast) => void;
  setOffer: (o: HireOfferBroadcast | null) => void;
  setPawnId: (id: string) => void;
  setNotices: (updater: HarborNotice[] | ((prev: HarborNotice[]) => HarborNotice[])) => void;
  setStats?: (s: ServerStatsBroadcast) => void;
  setDock?: (d: DockStatusBroadcast) => void;
  setDeath?: (d: DeathBroadcast | null) => void;
  setShipSystems?: (s: ShipSystemsBroadcast) => void;
  setShipStatus?: (s: ShipStatusBroadcast) => void;
  setShipLost?: (d: ShipLostBroadcast | null) => void;
  setNavState?: (n: NavStateBroadcast) => void;
  setChartState?: (c: ChartStateBroadcast) => void;
  setCargoState?: (c: CargoStateBroadcast) => void;
  setMarketState?: (m: MarketStateBroadcast) => void;
}

type ChannelHandler = (
  msg: Record<string, unknown>,
  caches: HarborCaches,
  setters: SnapshotSetters
) => void;

const CHANNEL_HANDLERS: Record<string, ChannelHandler> = {
  SNAPSHOT: (msg, caches, setters) => {
    const next = msg as unknown as SnapshotBroadcast;
    const prev = caches.snapshot.current;
    if (prev !== null && !isNewerTick(prev.tick, next.tick)) return;
    caches.snapshot.current = next;
    setters.setSnapshot(next);
  },
  SNAPSHOT_DELTA: (msg, caches, setters) => {
    const delta = msg as unknown as SnapshotDeltaBroadcast;
    const prev = caches.snapshot.current;
    if (prev === null) {
      if (!delta.full) return;
      applyDelta(emptySnapshot(delta), delta, caches, setters);
      return;
    }
    if (!isNewerTick(prev.tick, delta.tick)) return;
    if (!delta.full && delta.baseTick !== prev.tick) {
      recordBroadcastDrop('staleDeltaBase');
      return;
    }
    applyDelta(prev, delta, caches, setters);
  },
  TELEMETRY: (msg, caches, setters) => {
    const next = msg as unknown as TelemetryBroadcast;
    const prev = caches.telemetry.current;
    if (prev !== null && !isNewerTick(prev.tick, next.tick)) return;
    const merged = mergeTelemetry(prev, next);
    caches.telemetry.current = merged;
    setters.setTelemetry(merged);
  },
  VITALS: (msg, caches, setters) => {
    const next = msg as unknown as VitalsBroadcast;
    if (caches.vitalsTick.current >= 0 && !isNewerTick(caches.vitalsTick.current, next.tick))
      return;
    caches.vitalsTick.current = next.tick;
    setters.setVitals(next);
    // A fresh run after RESTART reports alive: retire the stale death flag
    // so the death screen never lingers past the respawn tick.
    if (!next.vitals.dead) setters.setDeath?.(null);
  },
  WATCH: (msg, caches, setters) => {
    const next = msg as unknown as WatchBroadcast;
    const sameRev = caches.watchRev.current !== undefined && caches.watchRev.current === next.rev;
    const sameClock = caches.watchRemaining.current === next.remainingS;
    if (sameRev && sameClock) return;
    caches.watchRev.current = next.rev;
    caches.watchRemaining.current = next.remainingS;
    setters.setWatch(next);
  },
  MANIFEST: (msg, caches, setters) => {
    const next = msg as unknown as ManifestBroadcast;
    if (
      next.rev !== undefined &&
      caches.manifestSeen.current &&
      caches.manifestRev.current === next.rev
    )
      return;
    caches.manifestRev.current = next.rev;
    caches.manifestSeen.current = true;
    setters.setManifest(next);
  },
  HIRE_OFFER: (msg, _caches, setters) => setters.setOffer(msg as unknown as HireOfferBroadcast),
  SERVER_STATS: (msg, _caches, setters) => {
    setters.setStats?.(msg as unknown as ServerStatsBroadcast);
  },
  DOCK_STATUS: (msg, _caches, setters) => {
    setters.setDock?.(msg as unknown as DockStatusBroadcast);
  },
  JOINED: (msg, _caches, setters) => {
    setters.setPawnId((msg as { pawnId?: string }).pawnId ?? '');
    setters.setOffer(null);
    setters.setDeath?.(null);
    setters.setShipLost?.(null);
  },
  SHIP_SYSTEMS: (msg, caches, setters) => {
    const next = msg as unknown as ShipSystemsBroadcast;
    if (caches.systemsTick.current >= 0 && !isNewerTick(caches.systemsTick.current, next.tick))
      return;
    caches.systemsTick.current = next.tick;
    setters.setShipSystems?.(next);
  },
  SHIP_STATUS: (msg, caches, setters) => {
    const next = msg as unknown as ShipStatusBroadcast;
    if (caches.statusTick.current >= 0 && !isNewerTick(caches.statusTick.current, next.tick))
      return;
    caches.statusTick.current = next.tick;
    setters.setShipStatus?.(next);
  },
  SHIP_LOST: (msg, _caches, setters) => {
    const lost = msg as unknown as ShipLostBroadcast;
    setters.setShipLost?.(lost);
    pushNotice(setters.setNotices, 'critical', 'Ship lost', 'Your ship is gone. Restart or quit.');
  },
  NAV_STATE: (msg, caches, setters) => {
    const next = msg as unknown as NavStateBroadcast;
    if (caches.navTick.current >= 0 && !isNewerTick(caches.navTick.current, next.tick)) return;
    caches.navTick.current = next.tick;
    setters.setNavState?.(next);
  },
  CHART_STATE: (msg, caches, setters) => {
    const next = msg as unknown as ChartStateBroadcast;
    if (caches.chartTick.current >= 0 && !isNewerTick(caches.chartTick.current, next.tick)) return;
    caches.chartTick.current = next.tick;
    setters.setChartState?.(next);
  },
  CARGO_STATE: (msg, caches, setters) => {
    const next = msg as unknown as CargoStateBroadcast;
    if (caches.cargoTick.current >= 0 && !isNewerTick(caches.cargoTick.current, next.tick)) return;
    caches.cargoTick.current = next.tick;
    setters.setCargoState?.(next);
  },
  MARKET_STATE: (msg, caches, setters) => {
    const next = msg as unknown as MarketStateBroadcast;
    const seen = caches.marketTick.current[next.hubId] ?? -1;
    if (seen >= 0 && !isNewerTick(seen, next.tick)) return;
    caches.marketTick.current = { ...caches.marketTick.current, [next.hubId]: next.tick };
    setters.setMarketState?.(next);
  },
  DEATH: (msg, _caches, setters) => {
    const death = msg as unknown as DeathBroadcast;
    setters.setDeath?.(death);
    pushNotice(
      setters.setNotices,
      'critical',
      deathTitle(death.cause),
      'Run over. Restart or quit to menu.'
    );
  },
  NOTICE: (msg, _caches, setters) => {
    const notice = msg as unknown as NoticeBroadcast;
    pushNotice(setters.setNotices, notice.severity, notice.title, notice.message);
  },
  HELLO_MISMATCH: (msg, _caches, setters) => {
    const notice = msg as unknown as { message?: string };
    pushNotice(setters.setNotices, 'critical', 'Version', notice.message ?? 'Client outdated');
  },
};

function applyDelta(
  base: SnapshotBroadcast,
  delta: SnapshotDeltaBroadcast,
  caches: HarborCaches,
  setters: SnapshotSetters
): void {
  const merged = mergeSnapshotDelta(base, delta);
  caches.snapshot.current = merged;
  setters.setSnapshot(merged);
}

function emptySnapshot(delta: SnapshotDeltaBroadcast): SnapshotBroadcast {
  return {
    type: 'SNAPSHOT',
    v: 2,
    tick: delta.baseTick,
    serverTimeMs: delta.serverTimeMs,
    pawns: [],
    impacts: [],
    portals: [],
    projectiles: [],
    frames: [],
    decals: [],
    crates: [],
  };
}

/**
 * Adopt rule for multi-dock streams: walkable docks win (arrival), updates
 * for the adopted dock always apply, and the last non-walkable state sticks
 * so mid-transit broadcasts never flap between far docks.
 */
export function adoptDock(
  prev: DockStatusBroadcast | null,
  next: DockStatusBroadcast
): DockStatusBroadcast {
  if (prev === null) return next;
  if (next.walkable) return next;
  if (next.dockId === prev.dockId) return next;
  return prev;
}

export function handleMessage(data: string, caches: HarborCaches, setters: SnapshotSetters): void {
  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(data) as Record<string, unknown>;
  } catch {
    recordBroadcastDrop('shape');
    return;
  }
  if (!isV2Packet(msg)) {
    recordBroadcastDrop('version');
    return;
  }
  const type = msg.type as string;
  const guard = BROADCAST_GUARDS[type];
  if (guard === undefined) {
    recordBroadcastDrop('unknownType');
    return;
  }
  if (!guard(msg)) {
    recordBroadcastDrop('shape');
    return;
  }
  const handler = CHANNEL_HANDLERS[type];
  if (handler !== undefined) handler(msg, caches, setters);
}
