/**
 * SocketStore: framework-free port of useHarborSocket (Phase 1).
 * Same wire semantics (HELLO + SPAWN_ABOARD, ticked SNAPSHOT/TELEMETRY/
 * VITALS, SHIP_SYSTEMS/STATUS/LOST, NAV_STATE, NOTICE, DEATH), but with a
 * subscribe/getState API so the future WebGL2 ScreenManager and the vanilla
 * debug view can run without React. The React hook stays untouched until
 * Phase 4; this store reuses handleMessage + merge guards verbatim.
 */

import type {
  ClientIntent,
  DeathBroadcast,
  DockStatusBroadcast,
  HireOfferBroadcast,
  ManifestBroadcast,
  NavStateBroadcast,
  ServerStatsBroadcast,
  ShipLostBroadcast,
  ShipStatusBroadcast,
  ShipSystemsBroadcast,
  SnapshotBroadcast,
  TelemetryBroadcast,
  VitalsBroadcast,
  WatchBroadcast,
} from '@kybernetes/protocol';
import { PROTOCOL_VERSION, shouldResumeAfterClose } from '@kybernetes/protocol';
import {
  createHarborCaches,
  type HarborCaches,
  type HarborIdentity,
  handleMessage,
  type SnapshotSetters,
} from '../../harbor/socketCore';
import {
  detachHarborSocket,
  handleHarborSocketError,
  scheduleHarborReconnect,
} from '../../harbor/socketLifecycle';

export type { HarborIdentity };

export interface SocketNotice {
  readonly id: number;
  readonly severity: string;
  readonly title: string;
  readonly message: string;
}

export interface SocketStoreState {
  readonly connected: boolean;
  readonly takenOver: boolean;
  readonly pawnId: string | null;
  readonly snapshot: SnapshotBroadcast | null;
  readonly telemetry: TelemetryBroadcast | null;
  readonly vitals: VitalsBroadcast | null;
  readonly watch: WatchBroadcast | null;
  readonly manifest: ManifestBroadcast | null;
  readonly stats: ServerStatsBroadcast | null;
  readonly dock: DockStatusBroadcast | null;
  readonly offer: HireOfferBroadcast | null;
  readonly notices: readonly SocketNotice[];
  readonly death: DeathBroadcast | null;
  readonly shipSystems: ShipSystemsBroadcast | null;
  readonly shipStatus: ShipStatusBroadcast | null;
  readonly shipLost: ShipLostBroadcast | null;
  readonly navState: NavStateBroadcast | null;
}

export type SocketListener = (state: SocketStoreState) => void;

export type SocketFactory = (url: string) => WebSocket;

export interface SocketStore {
  readonly getState: () => SocketStoreState;
  readonly subscribe: (listener: SocketListener) => () => void;
  readonly sendIntent: (intent: ClientIntent) => void;
  readonly clearDeath: () => void;
  readonly connect: () => void;
  readonly dispose: () => void;
}

function initialState(): SocketStoreState {
  return {
    connected: false,
    takenOver: false,
    pawnId: null,
    snapshot: null,
    telemetry: null,
    vitals: null,
    watch: null,
    manifest: null,
    stats: null,
    dock: null,
    offer: null,
    notices: [],
    death: null,
    shipSystems: null,
    shipStatus: null,
    shipLost: null,
    navState: null,
  };
}

function sendHandshake(socket: WebSocket, identity: HarborIdentity): void {
  socket.send(
    JSON.stringify({
      v: PROTOCOL_VERSION,
      type: 'HELLO',
      callsign: identity.callsign,
      color: identity.color,
      clientVersion: PROTOCOL_VERSION,
      ...(identity.trim === undefined ? {} : { trim: identity.trim }),
      ...(identity.thruster === undefined ? {} : { thruster: identity.thruster }),
    })
  );
  socket.send(
    JSON.stringify({ v: PROTOCOL_VERSION, type: 'SPAWN_ABOARD', seq: 0, userId: identity.userId })
  );
}

let storeNoticeId = 0;

function pushStoreNotice(
  state: { notices: readonly SocketNotice[] },
  severity: string,
  title: string,
  message: string
): SocketNotice[] {
  storeNoticeId += 1;
  return [...state.notices.slice(-4), { id: storeNoticeId, severity, title, message }];
}

export function createSocketStore(identity: HarborIdentity, factory?: SocketFactory): SocketStore {
  let state = initialState();
  const listeners = new Set<SocketListener>();
  const caches: HarborCaches = createHarborCaches();
  const createSocket: SocketFactory = factory ?? ((url: string) => new WebSocket(url));
  let ws: WebSocket | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  let seq = 0;
  const currentIdentity = identity;

  function emit(): void {
    for (const listener of listeners) listener(state);
  }

  function patch(next: Partial<SocketStoreState>): void {
    state = { ...state, ...next };
    emit();
  }

  function buildSetters(): SnapshotSetters {
    return {
      setSnapshot: (snapshot) => patch({ snapshot }),
      setTelemetry: (telemetry) => patch({ telemetry }),
      setVitals: (vitals) => patch({ vitals }),
      setWatch: (watch) => patch({ watch }),
      setManifest: (manifest) => patch({ manifest }),
      setOffer: (offer) => patch({ offer }),
      setPawnId: (pawnId) => patch({ pawnId, offer: null, death: null, shipLost: null }),
      setNotices: (updater) => {
        const prev = state.notices.map((notice) => ({ ...notice }));
        const next =
          typeof updater === 'function'
            ? (updater as (prev: SocketNotice[]) => SocketNotice[])(prev)
            : (updater as SocketNotice[]);
        patch({ notices: next });
      },
      setStats: (stats) => patch({ stats }),
      setDock: (dock) => patch({ dock }),
      setDeath: (death) => patch({ death }),
      setShipSystems: (shipSystems) => patch({ shipSystems }),
      setShipStatus: (shipStatus) => patch({ shipStatus }),
      setShipLost: (shipLost) => {
        if (shipLost === null) {
          patch({ shipLost });
          return;
        }
        patch({
          shipLost,
          notices: pushStoreNotice(state, 'critical', 'Ship lost', 'Restart or quit.'),
        });
      },
      setNavState: (navState) => patch({ navState }),
    };
  }

  function handleClose(event: CloseEvent): void {
    patch({ connected: false });
    ws = null;
    if (disposed) return;
    if (shouldResumeAfterClose(event.code)) {
      retry = scheduleHarborReconnect(connect);
      return;
    }
    patch({
      takenOver: true,
      notices: pushStoreNotice(state, 'warning', 'Session taken over', 'Resumed in another tab.'),
    });
  }

  function connect(): void {
    if (disposed) return;
    const socket = createSocket('ws://localhost:3001');
    ws = socket;
    seq = 0;
    caches.snapshot.current = null;
    caches.telemetry.current = null;
    caches.vitalsTick.current = -1;
    caches.manifestSeen.current = false;
    const setters = buildSetters();
    socket.onopen = () => {
      if (disposed) return;
      patch({ connected: true });
      sendHandshake(socket, currentIdentity);
    };
    socket.onmessage = (event) => {
      if (disposed) return;
      const data = typeof event.data === 'string' ? event.data : String(event.data);
      handleMessage(data, caches, setters);
    };
    socket.onclose = (event) => handleClose(event as CloseEvent);
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
    sendIntent: (intent) => {
      seq += 1;
      if (ws === null || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ v: PROTOCOL_VERSION, ...intent, seq }));
    },
    clearDeath: () => patch({ death: null }),
    connect,
    dispose: () => {
      disposed = true;
      if (retry !== null) clearTimeout(retry);
      detachHarborSocket(ws as unknown as Parameters<typeof detachHarborSocket>[0]);
      ws = null;
      patch({ connected: false });
    },
  };
}
