/**
 * Harbor socket: protocol v2 client transport. Input-only intents out with
 * auto-incremented seq; ticked snapshots in (SNAPSHOT 10Hz, TELEMETRY 2Hz,
 * VITALS 5Hz, plus WATCH/MANIFEST/HIRE_OFFER/NOTICE/JOINED). Reconnects with
 * backoff and resumes the same pawn via the stored userId.
 */

import type {
  ClientIntent,
  HireOfferBroadcast,
  ManifestBroadcast,
  NoticeBroadcast,
  SnapshotBroadcast,
  SnapshotPawn,
  TelemetryBroadcast,
  VitalsBroadcast,
  WatchBroadcast,
} from '@kybernetes/protocol';
import { PROTOCOL_VERSION } from '@kybernetes/protocol';
import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

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

    const connect = (): void => {
      if (isDisposed) return;
      const socket = new WebSocket('ws://localhost:3001');
      ws = socket;
      wsRef.current = socket;
      window.__kybernetesSocket = socket;
      seqRef.current = 0;
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
        handleMessage(event.data, {
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

function handleMessage(data: string, setters: SnapshotSetters): void {
  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(data) as Record<string, unknown>;
  } catch {
    return;
  }
  switch (msg.type) {
    case 'SNAPSHOT':
      setters.setSnapshot(msg as unknown as SnapshotBroadcast);
      break;
    case 'TELEMETRY':
      setters.setTelemetry(msg as unknown as TelemetryBroadcast);
      break;
    case 'VITALS':
      setters.setVitals(msg as unknown as VitalsBroadcast);
      break;
    case 'WATCH':
      setters.setWatch(msg as unknown as WatchBroadcast);
      break;
    case 'MANIFEST':
      setters.setManifest(msg as unknown as ManifestBroadcast);
      break;
    case 'HIRE_OFFER':
      setters.setOffer(msg as unknown as HireOfferBroadcast);
      break;
    case 'JOINED':
      setters.setPawnId((msg as { pawnId?: string }).pawnId ?? '');
      setters.setOffer(null);
      break;
    case 'NOTICE': {
      const notice = msg as unknown as NoticeBroadcast;
      pushNotice(setters.setNotices, notice.severity, notice.title, notice.message);
      break;
    }
    case 'HELLO_MISMATCH': {
      const notice = msg as unknown as { message?: string };
      pushNotice(setters.setNotices, 'critical', 'Version', notice.message ?? 'Client outdated');
      break;
    }
    default:
      break;
  }
}

export function remotePawns(
  snapshot: SnapshotBroadcast | null,
  pawnId: string | null
): readonly SnapshotPawn[] {
  if (snapshot === null) return [];
  if (pawnId === null) return snapshot.pawns;
  return snapshot.pawns.filter((pawn) => pawn.id !== pawnId);
}
