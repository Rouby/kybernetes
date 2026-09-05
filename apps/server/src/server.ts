import type {
  ClientAction,
  CollabShiftUpdateBroadcast,
  DamageTriageBroadcast,
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
  createInitialIntroState,
  createInitialPlayerVitals,
  createInitialVesselState,
  type DockFrameOffset,
  GameLoop,
  generateShiftChecklist,
  getBreachLocation,
  getBreachWeldSeconds,
  getShipDockingOffset,
  getShipKinematics,
  isAboardShip,
  isGauntletDoorId,
  normalizeBreachRoomId,
  type PersistedCrewMember,
  ROLE_DEFINITIONS,
  repairHullPlating,
  resolveAtmosphereAt,
  resolveFramedMovement,
  STATION_BAY_SPAWN,
  sampleAirflowVelocityAt,
  stateToTelemetryBroadcast,
  tickBot,
  tickCollabShift,
  tickDualProtocol,
  tickIntroState,
  tickVesselState,
  toggleDoor,
  toShipLocal,
  toWorld,
  trackBreachWelding,
  updatePlayerVitals,
} from '@kybernetes/sim-core';
import { type WebSocket, WebSocketServer } from 'ws';
import {
  broadcastCrewManifest,
  broadcastSpatialSnapshot,
  broadcastToSession,
  broadcastVitals,
} from './broadcast/deltaBroadcaster';
import { ActionRouter } from './handlers/actionRouter.js';
import { broadcastDocking, syncGauntletDoors } from './handlers/introHandler.js';
import type { ClientSession, VesselSession } from './types.js';

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

  public getPort(): number {
    const address = this.wss?.address();
    if (address && typeof address === 'object') return address.port;
    return this.port;
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
      breachRepairProgress: new Map(),
      intro: createInitialIntroState(),
      hireOfferCounter: 0,
      lastIntroPhase: 'inbound',
      lastShipOffset: getShipDockingOffset(createInitialIntroState()),
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
        const spawn = createBotSession(role, i * 4);
        const offset = getShipDockingOffset(session.intro);
        spawn.pawn.x = Number((spawn.pawn.x + offset.x).toFixed(2));
        spawn.pawn.y = Number((spawn.pawn.y + offset.y).toFixed(2));
        session.bots.set(role, spawn);
      }
    }
  }

  private registerClient(ws: WebSocket): ClientSession {
    const id = `crew_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const role: StartingRole = 'wiper';
    const spawn = STATION_BAY_SPAWN;
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
  private carryAboardPawns(session: VesselSession, prev: { x: number; y: number }): void {
    const next = getShipDockingOffset(session.intro);
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    if (dx === 0 && dy === 0) {
      session.lastShipOffset = next;
      return;
    }
    for (const client of session.clients.values()) {
      if (isAboardShip(client.pawn.x, client.pawn.y, prev)) {
        client.pawn.x = Number((client.pawn.x + dx).toFixed(2));
        client.pawn.y = Number((client.pawn.y + dy).toFixed(2));
      }
    }
    for (const bot of session.bots.values()) {
      if (isAboardShip(bot.pawn.x, bot.pawn.y, prev)) {
        bot.pawn.x = Number((bot.pawn.x + dx).toFixed(2));
        bot.pawn.y = Number((bot.pawn.y + dy).toFixed(2));
      }
    }
    for (const intruder of session.vesselState.boarding?.intruders || []) {
      if (isAboardShip(intruder.x, intruder.y, prev)) {
        intruder.x = Number((intruder.x + dx).toFixed(2));
        intruder.y = Number((intruder.y + dy).toFixed(2));
      }
    }
    for (const sentry of session.vesselState.boarding?.sentries || []) {
      if (isAboardShip(sentry.x, sentry.y, prev)) {
        sentry.x = Number((sentry.x + dx).toFixed(2));
        sentry.y = Number((sentry.y + dy).toFixed(2));
      }
    }
    session.lastShipOffset = next;
  }

  private tickIntro(session: VesselSession, dtSeconds: number): void {
    session.intro = tickIntroState(session.intro, dtSeconds);
    this.carryAboardPawns(session, session.lastShipOffset);
    syncGauntletDoors(session);
    if (session.intro.phase !== session.lastIntroPhase) {
      session.lastIntroPhase = session.intro.phase;
      broadcastDocking(session);
    }
  }

  private onSimulationTick(session: VesselSession, dtSeconds: number): void {
    const offset = getShipDockingOffset(session.intro);
    const kinematics = getShipKinematics(session.intro);
    session.vesselState = tickVesselState(session.vesselState, dtSeconds, offset, {
      vx: kinematics.vx,
      vy: kinematics.vy,
    });
    this.tickIntro(session, dtSeconds);

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
    this.tickActiveWelders(session, dtSeconds);
    this.tickSessionBots(session, dtSeconds);
    broadcastSpatialSnapshot(session);
    broadcastToSession(session, stateToTelemetryBroadcast(session.vesselState));
  }

  // fallow-ignore-next-line complexity
  private tickClientVitalsAndAtmosphere(session: VesselSession, dtSeconds: number): void {
    const atmos = session.vesselState.atmos;
    const offset = getShipDockingOffset(session.intro);
    for (const client of session.clients.values()) {
      const cellAtmos = resolveAtmosphereAt(atmos, client.pawn.x, client.pawn.y, offset);
      const aboard = isAboardShip(client.pawn.x, client.pawn.y, offset);
      const local = aboard ? toShipLocal(client.pawn.x, client.pawn.y, offset) : client.pawn;
      const wind = aboard ? sampleAirflowVelocityAt(atmos, local.x, local.y) : { vx: 0, vy: 0 };
      if (!client.pawn.isOperating && Math.hypot(wind.vx, wind.vy) > 20) {
        const targetX = client.pawn.x + wind.vx * dtSeconds * 0.5;
        const targetY = client.pawn.y + wind.vy * dtSeconds * 0.5;
        const res = resolveFramedMovement(
          client.pawn.x,
          client.pawn.y,
          targetX,
          targetY,
          14,
          session.vesselState.boarding?.doors || [],
          offset
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

  private isDoorCrowded(session: VesselSession, doorId: string): boolean {
    const door = session.vesselState.boarding.doors.find((d) => d.id === doorId);
    if (!door) return true;
    const midX = (door.x1 + door.x2) / 2;
    const midY = (door.y1 + door.y2) / 2;
    for (const cl of session.clients.values()) {
      if (Math.hypot(cl.pawn.x - midX, cl.pawn.y - midY) < 60) return true;
    }
    for (const bot of session.bots.values()) {
      if (Math.hypot(bot.pawn.x - midX, bot.pawn.y - midY) < 60) return true;
    }
    return false;
  }

  // fallow-ignore-next-line complexity
  private tickSessionBots(session: VesselSession, dtSeconds: number): void {
    const offset = getShipDockingOffset(session.intro);
    for (const [role, bot] of session.bots.entries()) {
      const aboard = isAboardShip(bot.pawn.x, bot.pawn.y, offset);
      const localPawn = aboard ? toShipLocal(bot.pawn.x, bot.pawn.y, offset) : bot.pawn;
      const framed: typeof bot = aboard
        ? {
            ...bot,
            pawn: { ...bot.pawn, x: localPawn.x, y: localPawn.y },
          }
        : bot;
      const { nextBot, assistance, doorToOpen, doorToToggle, doorsToClose } = tickBot(
        framed,
        dtSeconds,
        session.vesselState.boarding.doors
      );
      const worldPawn = aboard ? toWorld(nextBot.pawn.x, nextBot.pawn.y, offset) : nextBot.pawn;
      const worldBot = aboard
        ? {
            ...nextBot,
            pawn: { ...nextBot.pawn, x: worldPawn.x, y: worldPawn.y },
          }
        : nextBot;
      session.bots.set(role, worldBot);

      const openId = doorToOpen ?? doorToToggle;
      if (openId && !isGauntletDoorId(openId)) {
        session.vesselState.boarding.doors = toggleDoor(
          session.vesselState.boarding.doors,
          openId,
          true
        );
      }

      for (const closeId of doorsToClose ?? []) {
        if (this.isDoorCrowded(session, closeId)) continue;
        session.vesselState.boarding.doors = toggleDoor(
          session.vesselState.boarding.doors,
          closeId,
          false
        );
      }

      this.applyBotAssistance(session, assistance);
    }
  }

  private tickWelderBreachRepairs(
    session: VesselSession,
    cl: ClientSession,
    dtSeconds: number,
    offset: DockFrameOffset = { x: 0, y: 0 }
  ): void {
    const breaches = session.vesselState.hull.breaches;
    if (breaches.length === 0) return;

    for (const breach of breaches) {
      const norm = normalizeBreachRoomId(breach);
      const loc = getBreachLocation(breach);
      if (!loc) continue;

      const target = toWorld(loc.x, loc.y, offset);
      const dist = Math.hypot(cl.pawn.x - target.x, cl.pawn.y - target.y);
      if (dist <= 75) {
        const requiredSeconds = getBreachWeldSeconds(breach);
        const res = trackBreachWelding(
          session.breachRepairProgress,
          breach,
          dtSeconds,
          requiredSeconds
        );
        session.breachRepairProgress = res.nextProgress;
        if (res.completed) {
          const repairRes = repairHullPlating(session.vesselState.hull, breach);
          session.vesselState.hull = repairRes.nextHull;
          session.vesselState.hullIntegrityPercent = repairRes.nextHull.integrityPercent;

          const triage: DamageTriageBroadcast = {
            type: 'DAMAGE_TRIAGE_RESULT',
            actionType: 'HULL_REPAIR',
            success: true,
            message: `Breach patched and plating welded in ${norm.toUpperCase()} by ${cl.callsign}`,
            timestamp: Date.now(),
          };
          broadcastToSession(session, triage);
          break;
        }
      }
    }
  }

  private tickActiveWelders(session: VesselSession, dtSeconds: number): void {
    const offset = getShipDockingOffset(session.intro);
    for (const cl of session.clients.values()) {
      if (!cl.pawn.isWelding) continue;

      if (session.vesselState.boarding.intruders.length > 0) {
        const res = applyWelderAoeDamage(
          session.vesselState.boarding.intruders,
          cl.pawn.x,
          cl.pawn.y,
          cl.pawn.facingAngle,
          5,
          48,
          session.vesselState.boarding.doors,
          offset
        );
        session.vesselState.boarding.intruders = res.nextIntruders;
      }

      this.tickWelderBreachRepairs(session, cl, dtSeconds, offset);
    }
  }

  private handleClientAction(ws: WebSocket, action: ClientAction): void {
    const client = this.socketToClient.get(ws);
    if (!client) return;
    this.actionRouter.handleClientAction(client, action);
  }
}
