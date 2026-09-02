import type { ClientAction, TelemetryDeltaBroadcast } from '@kybernetes/protocol';
import { useCallback, useEffect, useRef, useState } from 'react';

// fallow-ignore-next-line complexity
function handleSocketMessage(
  data: string,
  onTelemetry: (t: TelemetryDeltaBroadcast) => void,
  setNotice: (msg: string | null) => void
) {
  try {
    const msg = JSON.parse(data);
    if (msg.type === 'TELEMETRY_DELTA') {
      onTelemetry(msg);
    } else if (msg.type === 'DAMAGE_TRIAGE_RESULT') {
      setNotice(msg.message);
      setTimeout(() => setNotice(null), 3500);
    } else if (msg.type === 'NAVAL_DAMAGE_EVENT') {
      setNotice(`ALERT: Inbound ${msg.event.title}`);
      setTimeout(() => setNotice(null), 3500);
    }
  } catch {
    // ignore malformed
  }
}

export function useVesselSocket(onTelemetry: (t: TelemetryDeltaBroadcast) => void) {
  const wsRef = useRef<WebSocket | null>(null);
  const pendingActionsRef = useRef<ClientAction[]>([]);
  const [wsConnected, setWsConnected] = useState(false);
  const [triageNotice, setTriageNotice] = useState<string | null>(null);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      ws = new WebSocket('ws://localhost:3001');
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        while (pendingActionsRef.current.length > 0) {
          const act = pendingActionsRef.current.shift();
          if (act) ws?.send(JSON.stringify(act));
        }
      };

      ws.onmessage = (e) => handleSocketMessage(e.data, onTelemetry, setTriageNotice);

      ws.onclose = () => {
        setWsConnected(false);
        wsRef.current = null;
        reconnectTimeout = setTimeout(connect, 2000);
      };

      ws.onerror = () => ws?.close();
    };

    connect();

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) ws.close();
    };
  }, [onTelemetry]);

  const sendAction = useCallback((action: ClientAction) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(action));
    } else {
      pendingActionsRef.current.push(action);
    }
  }, []);

  return { wsConnected, triageNotice, sendAction };
}
