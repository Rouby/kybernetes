import { WebSocketServer, WebSocket } from 'ws';
import {
  createInitialVesselState,
  tickVesselState,
  stateToTelemetryBroadcast,
  GameLoop,
  VesselSimulationState,
} from '@kybernetes/sim-core';
import { ServerBroadcast, ClientAction } from '@kybernetes/protocol';

export class VesselServer {
  private wss: WebSocketServer | null = null;
  private vesselState: VesselSimulationState;
  private loop: GameLoop;
  private clients: Set<WebSocket> = new Set();

  constructor(private readonly port: number = 3001) {
    this.vesselState = createInitialVesselState();
    this.loop = new GameLoop(100, (dtSeconds) => this.onSimulationTick(dtSeconds));
  }

  public start(): Promise<void> {
    return new Promise((resolve) => {
      this.wss = new WebSocketServer({ port: this.port }, () => {
        console.log(`[Kybernetes Server] Vessel Daemon running on ws://localhost:${this.port}`);
        this.loop.start();
        resolve();
      });

      this.wss.on('connection', (ws: WebSocket) => {
        this.clients.add(ws);
        console.log(`[Kybernetes Server] Client connected. Total active crew: ${this.clients.size}`);

        // Send initial telemetry immediately
        const initialTelemetry = stateToTelemetryBroadcast(this.vesselState);
        ws.send(JSON.stringify(initialTelemetry));

        ws.on('message', (data: string) => {
          try {
            const action: ClientAction = JSON.parse(data.toString());
            this.handleClientAction(ws, action);
          } catch (err) {
            console.error('[Kybernetes Server] Failed to parse client message:', err);
          }
        });

        ws.on('close', () => {
          this.clients.delete(ws);
          console.log(`[Kybernetes Server] Client disconnected. Active crew: ${this.clients.size}`);
        });
      });
    });
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      this.loop.stop();

      // Immediately terminate any active client connections to allow port release
      for (const client of this.clients) {
        try {
          client.terminate();
        } catch {
          // ignore already closed
        }
      }
      this.clients.clear();

      if (this.wss) {
        this.wss.close((err) => {
          if (err) {
            console.error('[Kybernetes Server] Error closing WebSocket server:', err);
          }
          this.wss = null;
          console.log('[Kybernetes Server] Daemon stopped cleanly. Port released.');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  private onSimulationTick(dtSeconds: number): void {
    this.vesselState = tickVesselState(this.vesselState, dtSeconds);

    // Broadcast telemetry to all connected clients
    const telemetry = stateToTelemetryBroadcast(this.vesselState);
    this.broadcast(telemetry);
  }

  private handleClientAction(ws: WebSocket, action: ClientAction): void {
    if (action.type === 'TOGGLE_BATTLE_STATIONS') {
      this.vesselState.alertLevel = action.alertLevel;
      console.log(`[Kybernetes Server] Battle stations changed to ${action.alertLevel.toUpperCase()}`);
    }
  }

  private broadcast(broadcast: ServerBroadcast): void {
    const payload = JSON.stringify(broadcast);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }
}
