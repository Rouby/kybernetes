/**
 * Harbor socket: protocol v2 client transport. Input-only intents out with
 * auto-incremented seq; ticked snapshots in (SNAPSHOT full 1Hz plus
 * SNAPSHOT_DELTA 10Hz, TELEMETRY 2Hz full/delta, VITALS 5Hz suppressed while
 * unchanged, plus WATCH/MANIFEST event+heartbeat, HIRE_OFFER/NOTICE/JOINED).
 * Deltas merge onto cached full tables so downstream renders keep reading
 * plain SNAPSHOT/TELEMETRY; stale ticks and same-rev manifests never
 * re-render. Reconnects with backoff and resumes the same pawn via userId.
 */

import type {
  ClientIntent,
  DeathBroadcast,
  DockStatusBroadcast,
  HireOfferBroadcast,
  ManifestBroadcast,
  NoticeBroadcast,
  PawnTrim,
  ServerStatsBroadcast,
  SnapshotBroadcast,
  SnapshotDeltaBroadcast,
  TelemetryBroadcast,
  ThrusterTint,
  VitalsBroadcast,
  WatchBroadcast,
} from '@kybernetes/protocol';
import { isNewerTick, PROTOCOL_VERSION, shouldResumeAfterClose } from '@kybernetes/protocol';
import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { deathTitle } from './deathNotice';
import { mergeSnapshotDelta, mergeTelemetry } from './renderState';
import {
  detachHarborSocket,
  handleHarborSocketError,
  scheduleHarborReconnect,
} from './socketLifecycle';

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

declare global {
  interface Window {
    __kybernetesSocket?: WebSocket;
  }
}

/** HELLO + JOIN_BEACON handshake sent on every (re)connect. */
function sendJoinHandshake(socket: WebSocket, id: HarborIdentity): void {
  socket.send(
    JSON.stringify({
      v: PROTOCOL_VERSION,
      type: 'HELLO',
      callsign: id.callsign,
      color: id.color,
      clientVersion: PROTOCOL_VERSION,
      ...(id.trim === undefined ? {} : { trim: id.trim }),
      ...(id.thruster === undefined ? {} : { thruster: id.thruster }),
    })
  );
  socket.send(
    JSON.stringify({
      v: PROTOCOL_VERSION,
      type: 'JOIN_BEACON',
      beacon: id.beacon,
      seq: 0,
      userId: id.userId,
    })
  );
}

function releaseSocketRef(socket: WebSocket, wsRef: { current: WebSocket | null }): void {
  if (window.__kybernetesSocket === socket) delete window.__kybernetesSocket;
  wsRef.current = null;
}

/**
 * Takeover notice for the no-reconnect path. Returns true when the client
 * should schedule a reconnect.
 */
function shouldReconnectAfterClose(
  event: CloseEvent,
  setTakenOver: (taken: boolean) => void,
  setNotices: Dispatch<SetStateAction<HarborNotice[]>>
): boolean {
  // Our pawn was resumed in another tab: reconnecting would steal
  // it straight back every 2s while both tabs flop its inputs.
  if (shouldResumeAfterClose(event.code)) return true;
  setTakenOver(true);
  pushNotice(setNotices, 'warning', 'Session taken over', 'This pawn resumed in another tab.');
  return false;
}

let noticeId = 0;

function pushNotice(
  setNotices: Dispatch<SetStateAction<HarborNotice[]>>,
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
  readonly manifestRev: { current: number | undefined };
  readonly manifestSeen: { current: boolean };
  readonly watchRev: { current: number | undefined };
  readonly watchRemaining: { current: number | undefined };
}

export function createHarborCaches(): HarborCaches {
  return {
    snapshot: { current: null },
    telemetry: { current: null },
    vitalsTick: { current: -1 },
    manifestRev: { current: undefined },
    manifestSeen: { current: false },
    watchRev: { current: undefined },
    watchRemaining: { current: undefined },
  };
}

/** Channel useState bundle; one hook so the socket hook stays under hook-density limits. */
function useHarborChannelState() {
  const [connected, setConnected] = useState(false);
  const [pawnId, setPawnId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<SnapshotBroadcast | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetryBroadcast | null>(null);
  const [vitals, setVitals] = useState<VitalsBroadcast | null>(null);
  const [watch, setWatch] = useState<WatchBroadcast | null>(null);
  const [manifest, setManifest] = useState<ManifestBroadcast | null>(null);
  const [stats, setStats] = useState<ServerStatsBroadcast | null>(null);
  const [dock, setDock] = useState<DockStatusBroadcast | null>(null);
  const [offer, setOffer] = useState<HireOfferBroadcast | null>(null);
  const [notices, setNotices] = useState<HarborNotice[]>([]);
  const [death, setDeath] = useState<DeathBroadcast | null>(null);
  const [takenOver, setTakenOver] = useState(false);
  return {
    connected,
    takenOver,
    pawnId,
    snapshot,
    telemetry,
    vitals,
    watch,
    manifest,
    stats,
    dock,
    offer,
    notices,
    death,
    setConnected,
    setTakenOver,
    setPawnId,
    setSnapshot,
    setTelemetry,
    setVitals,
    setWatch,
    setManifest,
    setStats,
    setDock,
    setOffer,
    setNotices,
    setDeath,
  };
}

export function useHarborSocket(identity: HarborIdentity) {
  const channels = useHarborChannelState();
  const {
    setConnected,
    setTakenOver,
    setPawnId,
    setSnapshot,
    setTelemetry,
    setVitals,
    setWatch,
    setManifest,
    setStats,
    setDock,
    setOffer,
    setNotices,
    setDeath,
  } = channels;
  const wsRef = useRef<WebSocket | null>(null);
  const seqRef = useRef(0);
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const cachesRef = useRef<HarborCaches | null>(null);
  if (cachesRef.current === null) cachesRef.current = createHarborCaches();

  const sendIntent = useCallback((intent: ClientIntent) => {
    seqRef.current += 1;
    const ws = wsRef.current;
    if (ws === null || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ v: PROTOCOL_VERSION, ...intent, seq: seqRef.current }));
  }, []);

  // Optimistic retire for the Restart button; the next alive VITALS confirms it.
  // setDeath is a stable useState setter, so this callback never goes stale.
  const clearDeath = useCallback((): void => {
    setDeath(null);
  }, [setDeath]);

  useEffect(() => {
    let isDisposed = false;
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const caches = cachesRef.current ?? createHarborCaches();
    cachesRef.current = caches;

    const connect = (): void => {
      if (isDisposed) return;
      const socket = new WebSocket('ws://localhost:3001');
      ws = socket;
      wsRef.current = socket;
      window.__kybernetesSocket = socket;
      seqRef.current = 0;
      caches.snapshot.current = null;
      caches.telemetry.current = null;
      caches.vitalsTick.current = -1;
      caches.manifestSeen.current = false;
      socket.onopen = () => {
        if (isDisposed) return;
        setConnected(true);
        sendJoinHandshake(socket, identityRef.current);
      };
      socket.onmessage = (event) => {
        if (isDisposed) return;
        handleMessage(event.data, caches, {
          setSnapshot,
          setTelemetry,
          setVitals,
          setWatch,
          setManifest,
          setOffer,
          setPawnId,
          setNotices,
          setStats,
          setDock,
          setDeath,
        });
      };
      socket.onclose = (event) => {
        setConnected(false);
        releaseSocketRef(socket, wsRef);
        if (isDisposed) return;
        if (shouldReconnectAfterClose(event, setTakenOver, setNotices)) {
          retry = scheduleHarborReconnect(connect);
        }
      };
      socket.onerror = () => {
        handleHarborSocketError(socket, isDisposed);
      };
    };
    connect();
    return () => {
      isDisposed = true;
      if (retry) clearTimeout(retry);
      detachHarborSocket(ws);
      wsRef.current = null;
      if (window.__kybernetesSocket === ws) delete window.__kybernetesSocket;
      setConnected(false);
    };
    // Channel setters are stable useState setters: listing them satisfies
    // exhaustive-deps without ever restarting the connection.
  }, [
    setConnected,
    setTakenOver,
    setPawnId,
    setSnapshot,
    setTelemetry,
    setVitals,
    setWatch,
    setManifest,
    setStats,
    setDock,
    setOffer,
    setNotices,
    setDeath,
  ]);

  return {
    connected: channels.connected,
    takenOver: channels.takenOver,
    pawnId: channels.pawnId,
    snapshot: channels.snapshot,
    telemetry: channels.telemetry,
    vitals: channels.vitals,
    watch: channels.watch,
    manifest: channels.manifest,
    stats: channels.stats,
    dock: channels.dock,
    offer: channels.offer,
    notices: channels.notices,
    death: channels.death,
    clearDeath,
    sendIntent,
  };
}

export interface SnapshotSetters {
  setSnapshot: (s: SnapshotBroadcast) => void;
  setTelemetry: (t: TelemetryBroadcast) => void;
  setVitals: (v: VitalsBroadcast) => void;
  setWatch: (w: WatchBroadcast) => void;
  setManifest: (m: ManifestBroadcast) => void;
  setOffer: (o: HireOfferBroadcast | null) => void;
  setPawnId: (id: string) => void;
  setNotices: Dispatch<SetStateAction<HarborNotice[]>>;
  setStats?: (s: ServerStatsBroadcast) => void;
  setDock?: (d: DockStatusBroadcast) => void;
  setDeath?: (d: DeathBroadcast | null) => void;
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
  };
}

export function handleMessage(data: string, caches: HarborCaches, setters: SnapshotSetters): void {
  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(data) as Record<string, unknown>;
  } catch {
    return;
  }
  const handler = typeof msg.type === 'string' ? CHANNEL_HANDLERS[msg.type] : undefined;
  if (handler !== undefined) handler(msg, caches, setters);
}
