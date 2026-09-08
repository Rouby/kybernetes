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
  HireOfferBroadcast,
  ManifestBroadcast,
  NoticeBroadcast,
  SnapshotBroadcast,
  SnapshotDeltaBroadcast,
  TelemetryBroadcast,
  VitalsBroadcast,
  WatchBroadcast,
} from '@kybernetes/protocol';
import { isNewerTick, PROTOCOL_VERSION } from '@kybernetes/protocol';
import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
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
}

declare global {
  interface Window {
    __kybernetesSocket?: WebSocket;
  }
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

export function useHarborSocket(identity: HarborIdentity) {
  const [connected, setConnected] = useState(false);
  const [pawnId, setPawnId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<SnapshotBroadcast | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetryBroadcast | null>(null);
  const [vitals, setVitals] = useState<VitalsBroadcast | null>(null);
  const [watch, setWatch] = useState<WatchBroadcast | null>(null);
  const [manifest, setManifest] = useState<ManifestBroadcast | null>(null);
  const [offer, setOffer] = useState<HireOfferBroadcast | null>(null);
  const [notices, setNotices] = useState<HarborNotice[]>([]);
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
        const id = identityRef.current;
        socket.send(
          JSON.stringify({
            v: PROTOCOL_VERSION,
            type: 'HELLO',
            callsign: id.callsign,
            color: id.color,
            clientVersion: PROTOCOL_VERSION,
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
        });
      };
      socket.onclose = () => {
        setConnected(false);
        if (window.__kybernetesSocket === socket) delete window.__kybernetesSocket;
        wsRef.current = null;
        if (!isDisposed) retry = setTimeout(connect, 2000);
      };
      socket.onerror = () => {
        if (!isDisposed) socket.close();
      };
    };
    connect();
    return () => {
      isDisposed = true;
      if (retry) clearTimeout(retry);
      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onclose = null;
        ws.onerror = null;
        ws.close();
      }
      wsRef.current = null;
      if (window.__kybernetesSocket === ws) delete window.__kybernetesSocket;
      setConnected(false);
    };
  }, []);

  return {
    connected,
    pawnId,
    snapshot,
    telemetry,
    vitals,
    watch,
    manifest,
    offer,
    notices,
    sendIntent,
  };
}

interface SnapshotSetters {
  setSnapshot: (s: SnapshotBroadcast) => void;
  setTelemetry: (t: TelemetryBroadcast) => void;
  setVitals: (v: VitalsBroadcast) => void;
  setWatch: (w: WatchBroadcast) => void;
  setManifest: (m: ManifestBroadcast) => void;
  setOffer: (o: HireOfferBroadcast | null) => void;
  setPawnId: (id: string) => void;
  setNotices: Dispatch<SetStateAction<HarborNotice[]>>;
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
  JOINED: (msg, _caches, setters) => {
    setters.setPawnId((msg as { pawnId?: string }).pawnId ?? '');
    setters.setOffer(null);
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
