import type {
  ClientAction,
  DamageTriageBroadcast,
  NavalDamageEventBroadcast,
  ServerBroadcast,
  ShipAlertBroadcast,
} from '@kybernetes/protocol';
import {
  createInitialVesselState,
  createNavalDamageEvent,
  deployFireSuppression,
  GameLoop,
  interceptNavalEvent,
  repairHullPlating,
  stateToTelemetryBroadcast,
  tickVesselState,
  type VesselSimulationState,
  ventReactorCoolant,
} from '@kybernetes/sim-core';
import { WebSocket, WebSocketServer } from 'ws';

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
        console.log(
          `[Kybernetes Server] Client connected. Total active crew: ${this.clients.size}`
        );

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

  public async stop(): Promise<void> {
    if (!this.loop.running) return;
    this.loop.stop();
    this.terminateClients();

    if (this.wss) {
      await new Promise<void>((resolve) => {
        this.wss?.close((err) => {
          if (err) {
            console.error('[Kybernetes Server] Error closing WebSocket server:', err);
          }
          this.wss = null;
          console.log('[Kybernetes Server] Daemon stopped cleanly. Port released.');
          resolve();
        });
      });
    }
  }

  private terminateClients(): void {
    for (const client of this.clients) {
      try {
        client.terminate();
      } catch {
        // ignore already closed
      }
    }
    this.clients.clear();
  }

  private onSimulationTick(dtSeconds: number): void {
    this.vesselState = tickVesselState(this.vesselState, dtSeconds);
    const telemetry = stateToTelemetryBroadcast(this.vesselState);
    this.broadcast(telemetry);
  }

  // fallow-ignore-next-line complexity
  private handleClientAction(_ws: WebSocket, action: ClientAction): void {
    if (action.type === 'TOGGLE_BATTLE_STATIONS') {
      this.vesselState.alertLevel = action.alertLevel;
    } else if (action.type === 'TRIGGER_PDT_INTERCEPT') {
      this.handlePdtIntercept(action.eventId);
    } else if (action.type === 'DEPLOY_FIRE_SUPPRESSION') {
      this.handleFireSuppression(action.roomId);
    } else if (action.type === 'EMERGENCY_HULL_REPAIR') {
      this.handleEmergencyHullRepair(action.roomId);
    } else if (action.type === 'VENT_REACTOR_COOLANT') {
      this.handleVentCoolant();
    } else if (action.type === 'TRIGGER_NAVAL_EVENT') {
      this.handleTriggerNavalEvent(action.eventType);
    }
    this.broadcast(stateToTelemetryBroadcast(this.vesselState));
  }

  // fallow-ignore-next-line complexity
  private handlePdtIntercept(eventId: string): void {
    const ev = this.vesselState.activeEvents.find((e) => e.id === eventId);
    if (ev?.status !== 'incoming') return;

    if (this.vesselState.defense.pdtAmmo <= 0) {
      this.vesselState.defense.pdtAmmo = 5;
    }
    const res = interceptNavalEvent(ev, this.vesselState.defense, false);
    this.vesselState.defense = res.nextDefense;
    this.vesselState.activeEvents = this.vesselState.activeEvents.map((e) =>
      e.id === eventId ? res.nextEvent : e
    );

    const triage: DamageTriageBroadcast = {
      type: 'DAMAGE_TRIAGE_RESULT',
      eventId,
      actionType: 'PDT_INTERCEPT',
      success: res.success,
      message: res.success ? 'Point-Defense interception successful!' : 'PDT Intercept failed!',
      timestamp: Date.now(),
    };
    this.broadcast(triage);
  }

  private handleFireSuppression(roomId: string): void {
    const res = deployFireSuppression(this.vesselState.activeFires, roomId);
    this.vesselState.activeFires = res.nextFires;

    const triage: DamageTriageBroadcast = {
      type: 'DAMAGE_TRIAGE_RESULT',
      actionType: 'FIRE_SUPPRESSION',
      success: res.extinguished,
      message: res.extinguished
        ? `Fire suppressed in ${roomId.toUpperCase()}`
        : 'No fire detected in target compartment.',
      timestamp: Date.now(),
    };
    this.broadcast(triage);
  }

  private handleEmergencyHullRepair(roomId: string): void {
    const res = repairHullPlating(this.vesselState.hull, roomId);
    this.vesselState.hull = res.nextHull;
    this.vesselState.hullIntegrityPercent = res.nextHull.integrityPercent;

    const triage: DamageTriageBroadcast = {
      type: 'DAMAGE_TRIAGE_RESULT',
      actionType: 'HULL_REPAIR',
      success: true,
      message: res.patchedBreach
        ? `Breach patched and plating welded in ${roomId.toUpperCase()}`
        : 'Hull plating welded (+15% integrity)',
      timestamp: Date.now(),
    };
    this.broadcast(triage);
  }

  private handleVentCoolant(): void {
    const res = ventReactorCoolant(this.vesselState.reactor);
    this.vesselState.reactor = res.nextReactor;
    this.vesselState.reactorTemp = res.nextReactor.tempKelvin;

    const triage: DamageTriageBroadcast = {
      type: 'DAMAGE_TRIAGE_RESULT',
      actionType: 'COOLANT_VENT',
      success: res.success,
      message: res.success
        ? `Reactor coolant vented (-${res.tempDrop}K)`
        : 'Coolant reserves too low to vent safely.',
      timestamp: Date.now(),
    };
    this.broadcast(triage);
  }

  private handleTriggerNavalEvent(type: import('@kybernetes/protocol').NavalDamageEventType): void {
    if (this.vesselState.defense.pdtAmmo < 3) {
      this.vesselState.defense.pdtAmmo = 10;
      this.vesselState.defense.status = 'nominal';
    }
    if (this.vesselState.activeEvents.length >= 3) {
      this.vesselState.activeEvents = this.vesselState.activeEvents.slice(-2);
    }
    const event = createNavalDamageEvent(type);
    this.vesselState.activeEvents.push(event);
    this.vesselState.alertLevel = 'red';

    if (type === 'radiation_burst') {
      const spiked = Number((this.vesselState.reactor.tempKelvin + 250).toFixed(2));
      this.vesselState.reactor.tempKelvin = spiked;
      this.vesselState.reactorTemp = spiked;
      this.vesselState.reactor.status = 'degraded';
    }

    const broadcast: NavalDamageEventBroadcast = {
      type: 'NAVAL_DAMAGE_EVENT',
      event,
    };
    this.broadcast(broadcast);

    const alert: ShipAlertBroadcast = {
      type: 'SHIP_ALERT',
      id: `alert_${Date.now()}`,
      severity: 'critical',
      title: 'BATTLE STATIONS: RED ALERT',
      message: `Inbound threat detected: ${event.title}`,
      timestamp: Date.now(),
    };
    this.broadcast(alert);
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
