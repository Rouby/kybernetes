/**
 * ObserverStore: framework-free pawn-less debug transport (Phase 1).
 * Mirrors useHarborObserver (HELLO + OBSERVE, never INPUT) so the vanilla
 * debug view can run without React. Read-only: SNAPSHOT/TELEMETRY plus
 * SERVER_STATS and DOCK_STATUS.
 */

import type {
  DockStatusBroadcast,
  ServerStatsBroadcast,
  SnapshotBroadcast,
  TelemetryBroadcast,
} from '@kybernetes/protocol';
import { PROTOCOL_VERSION } from '@kybernetes/protocol';
import { harborWsUrl } from '../../harbor/harborEndpoint';
import {
  createHarborCaches,
  type HarborCaches,
  handleMessage,
  type SnapshotSetters,
} from '../../harbor/socketCore';
import {
  detachHarborSocket,
  handleHarborSocketError,
  scheduleHarborReconnect,
} from '../../harbor/socketLifecycle';

export interface ObserverState {
  readonly connected: boolean;
  readonly snapshot: SnapshotBroadcast | null;
  readonly telemetry: TelemetryBroadcast | null;
  readonly stats: ServerStatsBroadcast | null;
  readonly dock: DockStatusBroadcast | null;
}

type ObserverListener = (state: ObserverState) => void;

function initialObserverState(): ObserverState {
  return { connected: false, snapshot: null, telemetry: null, stats: null, dock: null };
}

export interface ObserverStore {
  readonly getState: () => ObserverState;
  readonly subscribe: (listener: ObserverListener) => () => void;
  readonly connect: () => void;
  readonly dispose: () => void;
}

export function createObserverStore(
  beacon: string,
  factory?: (url: string) => WebSocket
): ObserverStore {
  let state = initialObserverState();
  const listeners = new Set<ObserverListener>();
  const caches: HarborCaches = createHarborCaches();
  const createSocket = factory ?? ((url: string) => new WebSocket(url));
  let ws: WebSocket | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  function emit(): void {
    for (const listener of listeners) listener(state);
  }

  function patch(next: Partial<ObserverState>): void {
    state = { ...state, ...next };
    emit();
  }

  function setters(): SnapshotSetters {
    return {
      setSnapshot: (snapshot) => patch({ snapshot }),
      setTelemetry: (telemetry) => patch({ telemetry }),
      setVitals: () => undefined,
      setWatch: () => undefined,
      setManifest: () => undefined,
      setOffer: () => undefined,
      setPawnId: () => undefined,
      setNotices: () => undefined,
      setStats: (stats) => patch({ stats }),
      setDock: (dock) => patch({ dock }),
    };
  }

  function connect(): void {
    if (disposed) return;
    const socket = createSocket(harborWsUrl());
    ws = socket;
    caches.snapshot.current = null;
    caches.telemetry.current = null;
    const active = setters();
    socket.onopen = () => {
      if (disposed) return;
      patch({ connected: true });
      socket.send(
        JSON.stringify({
          v: PROTOCOL_VERSION,
          type: 'HELLO',
          callsign: 'observer',
          color: '#8a9bb5',
          clientVersion: PROTOCOL_VERSION,
        })
      );
      socket.send(JSON.stringify({ v: PROTOCOL_VERSION, type: 'OBSERVE', beacon, seq: 0 }));
    };
    socket.onmessage = (event) => {
      if (disposed) return;
      const data = typeof event.data === 'string' ? event.data : String(event.data);
      handleMessage(data, caches, active);
    };
    socket.onclose = () => {
      patch({ connected: false });
      ws = null;
      if (disposed) return;
      retry = scheduleHarborReconnect(connect);
    };
    socket.onerror = () => handleHarborSocketError(socket, disposed);
  }

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    connect,
    dispose: () => {
      disposed = true;
      if (retry !== null) clearTimeout(retry);
      detachHarborSocket(ws);
      ws = null;
      patch({ connected: false });
    },
  };
}
