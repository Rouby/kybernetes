import type {
  ClientAction,
  CollabShiftUpdateBroadcast,
  DualProtocolBroadcast,
  PawnState,
  ShipAlertBroadcast,
  StartingRole,
} from '@kybernetes/protocol';
import {
  applyWelderAoeDamage,
  createBotSession,
  createCollabShift,
  createDualProtocol,
  createInitialPlayerVitals,
  createInitialVesselState,
  GameLoop,
  generateShiftChecklist,
  HESPERIA_SPAWNS,
  HESPERIA_WALLS,
  type PersistedCrewMember,
  ROLE_DEFINITIONS,
  resolvePawnMovement,
  sampleAirflowVelocityAt,
  sampleAtmosphereAt,
  stateToTelemetryBroadcast,
  tickBot,
  tickCollabShift,
  tickDualProtocol,
  tickVesselState,
  toggleDoor,
  updatePlayerVitals,
} from '@kybernetes/sim-core';
import { type WebSocket, WebSocketServer } from 'ws';
import {
  broadcastCrewManifest,
  broadcastSpatialSnapshot,
  broadcastToSession,
  broadcastVitals,
} from './broadcast/deltaBroadcaster';
import { ActionRouter } from './handlers/actionRouter';
import type { ClientSession, VesselSession } from './types';

export class VesselServer {
  private wss: WebSocketServer | null = null;
  private sessions: Map<string, VesselSession> = new Map();
  private socketToClient: Map<WebSocket, ClientSession> = new Map();
  private globalPersistedCrew: Map<string, Map<string, PersistedCrewMember>> = new Map();
  private defaultCode = 'HESP01';
  private actionRouter: ActionRouter;

  constructor(private readonly port: number = 3001) {
    this.actionRouter = new ActionRouter({
      getOrCreateSession: (code) => this.getOrCreateSession(code),
      reconcileBotsForSession: (session) => this.reconcileBotsForSession(session),
      sessions: this.sessions,
      defaultCode: this.defaultCode,
    });
    this.getOrCreateSession(this.defaultCode);
  }

  public start(): Promise<void> {
    return new Promise((resolve) => {
      this.wss = new WebSocketServer({ port: this.port }, () => {
        console.log(`[Kybernetes Server] Vessel Daemon running on ws://localhost:${this.port}`);
        resolve();
      });

      this.wss.on('connection', (ws: WebSocket) => {
        const client = this.registerClient(ws);
        console.log(
          `[Kybernetes Server] Client connected (${client.id}). Awaiting JOIN_VESSEL intent.`
        );

        ws.on('message', (data: string) => {
          try {
            const action: ClientAction = JSON.parse(data.toString());
            this.handleClientAction(ws, action);
          } catch (err) {
            console.error('[Kybernetes Server] Failed to parse message:', err);
          }
        });

        ws.on('close', () => {
          this.handleClientDisconnect(ws);
        });
      });
    });
  }

  public async stop(): Promise<void> {
    for (const session of this.sessions.values()) {
      if (session.loop.running) {
        session.loop.stop();
      }
    }
    this.terminateClients();

    if (this.wss) {
      await new Promise<void>((resolve) => {
        this.wss?.close((err) => {
          if (err) console.error('[Kybernetes Server] Error closing WebSocket server:', err);
          this.wss = null;
          console.log('[Kybernetes Server] Daemon stopped cleanly. Port released.');
          resolve();
        });
      });
    }
  }

  private terminateClients(): void {
    for (const ws of this.socketToClient.keys()) {
      try {
        ws.terminate();
      } catch {
        // ignore
      }
    }
    this.socketToClient.clear();
  }

  private getOrCreateSession(code: string): VesselSession {
    const existing = this.sessions.get(code);
    if (existing) return existing;

    const persistedCrew = this.globalPersistedCrew.get(code) || new Map();
    this.globalPersistedCrew.set(code, persistedCrew);

    const session: VesselSession = {
      code,
      vesselState: createInitialVesselState(),
      clients: new Map(),
      persistedCrew,
      bots: new Map(),
      dualProtocol: createDualProtocol('ftl_jump_alignment'),
      collabShift: createCollabShift(),
      loop: new GameLoop(50, (dtSeconds) => this.onSimulationTick(session, dtSeconds)),
      watchNumber: 1,
      activeSection: 'alpha',
      watchPhase: 'active_watch',
      timeRemainingSeconds: 180,
    };
    this.reconcileBotsForSession(session);
    session.loop.start();
    this.sessions.set(code, session);
    return session;
  }

  // fallow-ignore-next-line complexity
  private reconcileBotsForSession(session: VesselSession): void {
    const allRoles: StartingRole[] = [
      'wiper',
      'galley_hand',
      'security_private',
      'hydro_tender',
      'stevedore',
    ];
    const humanRoles = new Set(Array.from(session.clients.values()).map((c) => c.role));

    for (let i = 0; i < allRoles.length; i++) {
      const role = allRoles[i];
      if (humanRoles.has(role)) {
        session.bots.delete(role);
      } else if (!session.bots.has(role)) {
        session.bots.set(role, createBotSession(role, i * 4));
      }
    }
  }

  private registerClient(ws: WebSocket): ClientSession {
    const id = `crew_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const role: StartingRole = 'wiper';
    const spawn = HESPERIA_SPAWNS[role] || { x: 500, y: 350 };
    const roleDef = ROLE_DEFINITIONS[role];

    const pawn: PawnState = {
      id,
      callsign: `Crew-${id.slice(-4).toUpperCase()}`,
      role,
      x: spawn.x,
      y: spawn.y,
      vx: 0,
      vy: 0,
      facingAngle: 0,
      currentDeck: 'deck_a',
      isOperating: false,
      isResting: false,
      color: roleDef.color || '#00e5ff',
    };

    const client: ClientSession = {
      ws,
      id,
      callsign: pawn.callsign,
      role,
      pawn,
      vitals: createInitialPlayerVitals(),
      credits: 120,
      clearanceLevel: 1,
      clearanceXp: 0,
      status: 'idle',
      watchSection: 'alpha',
      shiftChecklist: generateShiftChecklist(role, 1, Date.now(), 'alpha', 1),
      vesselCode: '',
    };

    this.socketToClient.set(ws, client);
    return client;
  }

  // fallow-ignore-next-line complexity
  private handleClientDisconnect(ws: WebSocket): void {
    const client = this.socketToClient.get(ws);
    if (!client) return;

    this.socketToClient.delete(ws);
    if (!client.vesselCode) return;

    const session = this.sessions.get(client.vesselCode);
    if (session) {
      session.clients.delete(ws);
      this.reconcileBotsForSession(session);
      console.log(
        `[Kybernetes Server] Crew ${client.callsign} left session ${session.code}. Remaining: ${session.clients.size}`
      );
      broadcastCrewManifest(session);
      broadcastSpatialSnapshot(session);

      if (session.clients.size === 0 && session.code !== this.defaultCode) {
        session.loop.stop();
        this.sessions.delete(session.code);
        console.log(`[Kybernetes Server] Session ${session.code} destroyed.`);
      }
    }
  }

  // fallow-ignore-next-line complexity
  private onSimulationTick(session: VesselSession, dtSeconds: number): void {
    session.vesselState = tickVesselState(session.vesselState, dtSeconds);

    if (session.dualProtocol.stage === 'primed') {
      const res = tickDualProtocol(session.dualProtocol, dtSeconds);
      session.dualProtocol = res.nextState;
      if (res.expired) {
        const expiredNotice: DualProtocolBroadcast = {
          type: 'DUAL_PROTOCOL_UPDATE',
          protocolId: session.dualProtocol.protocolId,
          stage: 'expired',
          remainingSeconds: 0,
          title: session.dualProtocol.title,
          message: 'CRITICAL WINDOW EXPIRED: Dual-operator synchronization failed.',
          timestamp: Date.now(),
        };
        broadcastToSession(session, expiredNotice);
      }
    }

    if (session.collabShift.participants.length > 0 && !session.collabShift.isCompleted) {
      const shiftRes = tickCollabShift(session.collabShift, dtSeconds);
      session.collabShift = shiftRes.nextState;

      const shiftBroadcast: CollabShiftUpdateBroadcast = {
        type: 'COLLAB_SHIFT_UPDATE',
        shiftId: session.collabShift.shiftId,
        title: session.collabShift.title,
        stationId: session.collabShift.stationId,
        progressPercent: session.collabShift.progressPercent,
        participants: session.collabShift.participants,
        isCompleted: session.collabShift.isCompleted,
        timestamp: Date.now(),
      };
      broadcastToSession(session, shiftBroadcast);

      if (shiftRes.justCompleted) {
        const alert: ShipAlertBroadcast = {
          type: 'SHIP_ALERT',
          id: `collab_done_${Date.now()}`,
          severity: 'info',
          title: 'CO-OP SHIFT COMPLETED',
          message: `${session.collabShift.title} successfully completed! (+${session.collabShift.creditReward} Credits awarded to team).`,
          timestamp: Date.now(),
        };
        broadcastToSession(session, alert);
      }
    }

    this.tickClientVitalsAndAtmosphere(session, dtSeconds);
    this.tickActiveWelders(session);
    this.tickSessionBots(session, dtSeconds);
    broadcastSpatialSnapshot(session);
    broadcastToSession(session, stateToTelemetryBroadcast(session.vesselState));
  }

  // fallow-ignore-next-line complexity
  private tickClientVitalsAndAtmosphere(session: VesselSession, dtSeconds: number): void {
    const atmos = session.vesselState.atmos;
    const closedDoors = (session.vesselState.boarding?.doors || [])
      .filter((d) => !d.isOpen)
      .map((d) => ({
        id: `door_wall_${d.id}`,
        x1: d.x1,
        y1: d.y1,
        x2: d.x2,
        y2: d.y2,
        isOpaque: true,
        isTraversable: false,
      }));
    const allWalls = closedDoors.length > 0 ? [...HESPERIA_WALLS, ...closedDoors] : HESPERIA_WALLS;

    for (const client of session.clients.values()) {
      const cellAtmos = sampleAtmosphereAt(atmos, client.pawn.x, client.pawn.y);
      const wind = sampleAirflowVelocityAt(atmos, client.pawn.x, client.pawn.y);
      if (!client.pawn.isOperating && Math.hypot(wind.vx, wind.vy) > 20) {
        const targetX = client.pawn.x + wind.vx * dtSeconds * 0.5;
        const targetY = client.pawn.y + wind.vy * dtSeconds * 0.5;
        const res = resolvePawnMovement(
          client.pawn.x,
          client.pawn.y,
          targetX,
          targetY,
          14,
          allWalls
        );
        client.pawn.x = res.x;
        client.pawn.y = res.y;
      }

      client.vitals = updatePlayerVitals(
        client.vitals,
        dtSeconds,
        Boolean(client.pawn.isResting),
        Boolean(client.pawn.isOperating),
        cellAtmos
      );
      broadcastVitals(client);
    }
  }

  private applyBotAssistance(
    session: VesselSession,
    delta: { reactorTempDelta: number; o2Delta: number }
  ): void {
    if (delta.reactorTempDelta !== 0) {
      session.vesselState.reactorTemp = Math.max(
        290,
        Number((session.vesselState.reactorTemp + delta.reactorTempDelta).toFixed(2))
      );
    }
    if (delta.o2Delta !== 0) {
      const nextO2 = Math.min(
        100,
        Number((session.vesselState.oxygenLevelPercent + delta.o2Delta).toFixed(2))
      );
      session.vesselState.oxygenLevelPercent = nextO2;
      session.vesselState.lifeSupport.o2LevelPercent = nextO2;
    }
  }

  // fallow-ignore-next-line complexity
  private tickSessionBots(session: VesselSession, dtSeconds: number): void {
    for (const [role, bot] of session.bots.entries()) {
      const { nextBot, assistance, doorToToggle } = tickBot(
        bot,
        dtSeconds,
        session.vesselState.boarding.doors
      );
      session.bots.set(role, nextBot);

      if (doorToToggle) {
        session.vesselState.boarding.doors = toggleDoor(
          session.vesselState.boarding.doors,
          doorToToggle,
          true
        );
      }

      this.applyBotAssistance(session, assistance);
    }
  }

  private tickActiveWelders(session: VesselSession): void {
    if (session.vesselState.boarding.intruders.length === 0) return;
    for (const cl of session.clients.values()) {
      if (cl.pawn.isWelding) {
        const res = applyWelderAoeDamage(
          session.vesselState.boarding.intruders,
          cl.pawn.x,
          cl.pawn.y,
          cl.pawn.facingAngle,
          5,
          48,
          session.vesselState.boarding.doors
        );
        session.vesselState.boarding.intruders = res.nextIntruders;
      }
    }
  }

  private handleClientAction(ws: WebSocket, action: ClientAction): void {
    const client = this.socketToClient.get(ws);
    if (!client) return;
    this.actionRouter.handleClientAction(client, action);
  }
}
