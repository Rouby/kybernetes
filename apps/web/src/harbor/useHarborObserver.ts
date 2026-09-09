/**
 * Harbor observer: pawn-less same-port debug transport.
 * Sends HELLO + OBSERVE only; never sends INPUT/DOOR/FIRE, never owns a
 * pawn, never evicts the player. Receives SNAPSHOT/TELEMETRY read-only plus
 * SERVER_STATS (1Hz) and DOCK_STATUS for the general world-sim debug view.
 */

import type {
  DockStatusBroadcast,
  ServerStatsBroadcast,
  SnapshotBroadcast,
  TelemetryBroadcast,
} from '@kybernetes/protocol';
import { PROTOCOL_VERSION } from '@kybernetes/protocol';
import { useEffect, useRef, useState } from 'react';
import {
  detachHarborSocket,
  handleHarborSocketError,
  scheduleHarborReconnect,
} from './socketLifecycle';
import { createHarborCaches, handleMessage, type SnapshotSetters } from './useHarborSocket';

export interface HarborObserverIdentity {
  readonly beacon: string;
}

export function useHarborObserver(identity: HarborObserverIdentity) {
  const [connected, setConnected] = useState(false);
  const [snapshot, setSnapshot] = useState<SnapshotBroadcast | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetryBroadcast | null>(null);
  const [stats, setStats] = useState<ServerStatsBroadcast | null>(null);
  const [dock, setDock] = useState<DockStatusBroadcast | null>(null);
  const [notices, setNotices] = useState<
    { id: number; severity: string; title: string; message: string }[]
  >([]);
  const wsRef = useRef<WebSocket | null>(null);
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const cachesRef = useRef<ReturnType<typeof createHarborCaches> | null>(null);
  if (cachesRef.current === null) cachesRef.current = createHarborCaches();

  useEffect(() => {
    let isDisposed = false;
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const caches = cachesRef.current ?? createHarborCaches();
    cachesRef.current = caches;
    const setters: SnapshotSetters = {
      setSnapshot,
      setTelemetry,
      setVitals: () => undefined,
      setWatch: () => undefined,
      setManifest: () => undefined,
      setOffer: () => undefined,
      setPawnId: () => undefined,
      setNotices: setNotices as SnapshotSetters['setNotices'],
      setStats,
      setDock,
    };
    const connect = (): void => {
      if (isDisposed) return;
      const socket = new WebSocket('ws://localhost:3001');
      ws = socket;
      wsRef.current = socket;
      caches.snapshot.current = null;
      caches.telemetry.current = null;
      socket.onopen = () => {
        if (isDisposed) return;
        setConnected(true);
        socket.send(
          JSON.stringify({
            v: PROTOCOL_VERSION,
            type: 'HELLO',
            callsign: 'observer',
            color: '#8a9bb5',
            clientVersion: PROTOCOL_VERSION,
          })
        );
        socket.send(
          JSON.stringify({
            v: PROTOCOL_VERSION,
            type: 'OBSERVE',
            beacon: identityRef.current.beacon,
            seq: 0,
          })
        );
      };
      socket.onmessage = (event) => {
        if (isDisposed) return;
        handleMessage(event.data, caches, setters);
      };
      socket.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        if (isDisposed) return;
        retry = scheduleHarborReconnect(connect);
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
      setConnected(false);
    };
  }, []);

  return { connected, snapshot, telemetry, stats, dock, notices };
}
