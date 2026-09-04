import type {
  ClientAction,
  CollabShiftUpdateBroadcast,
  CrewManifestBroadcast,
  DualProtocolBroadcast,
  LobbyStateBroadcast,
  PawnState,
  ServerBroadcast,
  StartingRole,
  TelemetryDeltaBroadcast,
  VitalsDeltaBroadcast,
} from '@kybernetes/protocol';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ShipAudioEngine } from '../audio/ShipAudioEngine';

export interface UseVesselSocketOptions {
  callsign?: string;
  role?: StartingRole;
  color?: string;
  userId?: string;
  onVitalsDelta?: (v: VitalsDeltaBroadcast) => void;
}

// fallow-ignore-next-line complexity
function handleSocketMessage(
  data: string,
  callbacks: {
    onTelemetry: (t: TelemetryDeltaBroadcast) => void;
    onVitalsDelta?: (v: VitalsDeltaBroadcast) => void;
    setNotice: (msg: string | null) => void;
    setRemotePawns: (pawns: PawnState[]) => void;
    setCrewManifest: (crew: CrewManifestBroadcast['crew']) => void;
    setDualProtocol: (d: DualProtocolBroadcast | null) => void;
    setCollabShift: (s: CollabShiftUpdateBroadcast | null) => void;
    setLobbyState: (l: LobbyStateBroadcast) => void;
    localCallsign: string;
  }
) {
  try {
    const msg: ServerBroadcast = JSON.parse(data);
    if (msg.type === 'TELEMETRY_DELTA') {
      callbacks.onTelemetry(msg);
    } else if (msg.type === 'VITALS_DELTA') {
      callbacks.onVitalsDelta?.(msg);
    } else if (msg.type === 'SPATIAL_SNAPSHOT') {
      const others = msg.pawns.filter((p) => p.callsign !== callbacks.localCallsign);
      callbacks.setRemotePawns(others);
    } else if (msg.type === 'CREW_MANIFEST') {
      callbacks.setCrewManifest(msg.crew);
    } else if (msg.type === 'DUAL_PROTOCOL_UPDATE') {
      callbacks.setDualProtocol(msg);
      if (msg.stage === 'synchronized' || msg.stage === 'expired') {
        callbacks.setNotice(msg.message);
        setTimeout(() => callbacks.setNotice(null), 4000);
      }
    } else if (msg.type === 'COLLAB_SHIFT_UPDATE') {
      callbacks.setCollabShift(msg);
    } else if (msg.type === 'LOBBY_STATE') {
      callbacks.setLobbyState(msg);
    } else if (msg.type === 'SHIP_ALERT') {
      const eng = ShipAudioEngine.getInstance();
      const uiGain = eng.busManager?.uiGain;
      if (uiGain) eng.uiSynth?.playTelemetrySquelch(uiGain);
      callbacks.setNotice(`[ALERT] ${msg.title}: ${msg.message}`);
      setTimeout(() => callbacks.setNotice(null), 4000);
    } else if (msg.type === 'DAMAGE_TRIAGE_RESULT') {
      callbacks.setNotice(msg.message);
      setTimeout(() => callbacks.setNotice(null), 3500);
    } else if (msg.type === 'NAVAL_DAMAGE_EVENT') {
      ShipAudioEngine.getInstance().playExplosionShockwave();
      callbacks.setNotice(`ALERT: Inbound ${msg.event.title}`);
      setTimeout(() => callbacks.setNotice(null), 3500);
    }
  } catch {
    // ignore malformed
  }
}

// fallow-ignore-next-line complexity
export function useVesselSocket(
  onTelemetry: (t: TelemetryDeltaBroadcast) => void,
  activeVesselCode: string | null,
  options?: UseVesselSocketOptions
) {
  const wsRef = useRef<WebSocket | null>(null);
  const pendingActionsRef = useRef<ClientAction[]>([]);
  const [wsConnected, setWsConnected] = useState(false);
  const [triageNotice, setTriageNotice] = useState<string | null>(null);
  const [remotePawns, setRemotePawns] = useState<PawnState[]>([]);
  const [crewManifest, setCrewManifest] = useState<CrewManifestBroadcast['crew']>([]);
  const [dualProtocol, setDualProtocol] = useState<DualProtocolBroadcast | null>(null);
  const [collabShift, setCollabShift] = useState<CollabShiftUpdateBroadcast | null>(null);
  const [lobbyState, setLobbyState] = useState<LobbyStateBroadcast | null>(null);

  const currentOptsRef = useRef({
    vesselCode: activeVesselCode || '',
    callsign: options?.callsign || 'Cadet',
    role: options?.role || 'wiper',
    color: options?.color || '#00e5ff',
    userId: options?.userId || '',
    onVitalsDelta: options?.onVitalsDelta,
  });

  // fallow-ignore-next-line complexity
  useEffect(() => {
    if (activeVesselCode) currentOptsRef.current.vesselCode = activeVesselCode;
    if (options?.callsign) currentOptsRef.current.callsign = options.callsign;
    if (options?.role) currentOptsRef.current.role = options.role;
    if (options?.color) currentOptsRef.current.color = options.color;
    if (options?.userId) currentOptsRef.current.userId = options.userId;
    currentOptsRef.current.onVitalsDelta = options?.onVitalsDelta;
  }, [
    activeVesselCode,
    options?.callsign,
    options?.role,
    options?.color,
    options?.userId,
    options?.onVitalsDelta,
  ]);

  const sendAction = useCallback((action: ClientAction) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(action));
    } else {
      pendingActionsRef.current.push(action);
    }
  }, []);

  useEffect(() => {
    // Only connect when onboard an active vessel session
    if (!activeVesselCode) {
      setWsConnected(false);
      setRemotePawns([]);
      setCrewManifest([]);
      setDualProtocol(null);
      setCollabShift(null);
      setLobbyState(null);
      return;
    }

    let isDisposed = false;
    let ws: WebSocket | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (isDisposed) return;
      ws = new WebSocket('ws://localhost:3001');
      wsRef.current = ws;

      ws.onopen = () => {
        if (isDisposed) return;
        setWsConnected(true);

        const joinAct: ClientAction = {
          type: 'JOIN_VESSEL',
          vesselCode: activeVesselCode,
          callsign: currentOptsRef.current.callsign,
          role: currentOptsRef.current.role,
          color: currentOptsRef.current.color,
          userId: currentOptsRef.current.userId,
        };
        ws?.send(JSON.stringify(joinAct));

        while (pendingActionsRef.current.length > 0) {
          const act = pendingActionsRef.current.shift();
          if (act) ws?.send(JSON.stringify(act));
        }
      };

      ws.onmessage = (e) => {
        if (isDisposed) return;
        handleSocketMessage(e.data, {
          onTelemetry,
          onVitalsDelta: currentOptsRef.current.onVitalsDelta,
          setNotice: setTriageNotice,
          setRemotePawns,
          setCrewManifest,
          setDualProtocol,
          setCollabShift,
          setLobbyState,
          localCallsign: currentOptsRef.current.callsign,
        });
      };

      ws.onclose = () => {
        setWsConnected(false);
        wsRef.current = null;
        if (!isDisposed) {
          reconnectTimeout = setTimeout(connect, 2000);
        }
      };

      ws.onerror = () => {
        if (!isDisposed) ws?.close();
      };
    };

    connect();

    return () => {
      isDisposed = true;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onclose = null;
        ws.onerror = null;
        ws.close();
      }
      wsRef.current = null;
      setWsConnected(false);
    };
  }, [activeVesselCode, onTelemetry]);

  return {
    wsConnected,
    triageNotice,
    remotePawns,
    crewManifest,
    dualProtocol,
    collabShift,
    lobbyState,
    sendAction,
    setNotice: setTriageNotice,
  };
}
