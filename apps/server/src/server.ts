import type {
  ClientAction,
  CollabShiftUpdateBroadcast,
  ContributeCollabShiftAction,
  CrewManifestBroadcast,
  DamageTriageBroadcast,
  DualProtocolBroadcast,
  JoinVesselAction,
  LobbyStateBroadcast,
  NavalDamageEventBroadcast,
  PawnState,
  PlayerMoveIntent,
  ServerBroadcast,
  ShipAlertBroadcast,
  SpatialSnapshotBroadcast,
  StartingRole,
} from '@kybernetes/protocol';
import {
  applyWelderAoeDamage,
  type BotState,
  type CollabShiftState,
  createBotSession,
  createCollabShift,
  createDualProtocol,
  createInitialVesselState,
  createNavalDamageEvent,
  createPersistedCrewMember,
  createProjectile,
  type DualProtocolState,
  deployFireSuppression,
  deploySentryGun,
  engageIntruder,
  executeDualProtocol,
  GameLoop,
  HESPERIA_SPAWNS,
  interceptNavalEvent,
  joinCollabShift,
  leaveCollabShift,
  type PersistedCrewMember,
  primeDualProtocol,
  ROLE_DEFINITIONS,
  repairHullPlating,
  spawnBoardingEvent,
  stateToTelemetryBroadcast,
  tickBot,
  tickCollabShift,
  tickDualProtocol,
  tickVesselState,
  toggleBulkheadLock,
  toggleDoor,
  toggleRoomVenting,
  type VesselSimulationState,
  ventReactorCoolant,
} from '@kybernetes/sim-core';
import { WebSocket, WebSocketServer } from 'ws';

interface ClientSession {
  ws: WebSocket;
  id: string;
  userId?: string;
  callsign: string;
  role: StartingRole;
  pawn: PawnState;
  status: 'on_duty' | 'idle' | 'resting' | 'in_combat';
  dutyName?: string;
  vesselCode: string;
}

interface VesselSession {
  code: string;
  vesselState: VesselSimulationState;
  clients: Map<WebSocket, ClientSession>;
  persistedCrew: Map<string, PersistedCrewMember>;
  bots: Map<StartingRole, BotState>;
  dualProtocol: DualProtocolState;
  collabShift: CollabShiftState;
  loop: GameLoop;
}

function restoreExistingPawn(
  base: PawnState,
  action: JoinVesselAction,
  persisted: PersistedCrewMember
): PawnState {
  return {
    ...base,
    callsign: action.callsign ?? persisted.callsign,
    role: action.role ?? persisted.role,
    color: action.color ?? persisted.color,
    x: persisted.x,
    y: persisted.y,
    facingAngle: persisted.facingAngle,
    isWelding: false,
  };
}

// fallow-ignore-next-line complexity
function spawnFreshClientPawn(
  base: PawnState,
  role: StartingRole,
  callsign: string,
  color?: string
): PawnState {
  const spawn = HESPERIA_SPAWNS[role] ?? { x: 500, y: 350 };
  const fallbackColor = ROLE_DEFINITIONS[role]?.color ?? '#00e5ff';
  return {
    ...base,
    callsign,
    role,
    x: spawn.x,
    y: spawn.y,
    color: color ?? fallbackColor,
    isWelding: false,
  };
}

function createInitialClientPawn(
  client: ClientSession,
  action: JoinVesselAction,
  persisted?: PersistedCrewMember
): PawnState {
  return persisted
    ? restoreExistingPawn(client.pawn, action, persisted)
    : spawnFreshClientPawn(client.pawn, client.role, client.callsign, action.color);
}

export class VesselServer {
  private wss: WebSocketServer | null = null;
  private sessions: Map<string, VesselSession> = new Map();
  private socketToClient: Map<WebSocket, ClientSession> = new Map();
  private globalPersistedCrew: Map<string, Map<string, PersistedCrewMember>> = new Map();
  private defaultCode = 'HESP01';

  constructor(private readonly port: number = 3001) {
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
      // 20Hz tick loop (50ms interval) for real-time multiplayer spatial replication
      loop: new GameLoop(50, (dtSeconds) => this.onSimulationTick(session, dtSeconds)),
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
      status: 'idle',
      vesselCode: '',
    };

    this.socketToClient.set(ws, client);
    return client;
  }

  private sendInitialPackets(client: ClientSession, session: VesselSession): void {
    const lobbyBroadcast: LobbyStateBroadcast = {
      type: 'LOBBY_STATE',
      vesselCode: session.code,
      shipName: session.vesselState.shipName,
      connectedCrew: session.clients.size,
    };
    const telemetry = stateToTelemetryBroadcast(session.vesselState);
    client.ws.send(JSON.stringify(lobbyBroadcast));
    client.ws.send(JSON.stringify(telemetry));

    if (session.dualProtocol.stage === 'primed') {
      const protoUpdate: DualProtocolBroadcast = {
        type: 'DUAL_PROTOCOL_UPDATE',
        protocolId: session.dualProtocol.protocolId,
        stage: 'primed',
        initiatorCallsign: session.dualProtocol.initiatorCallsign,
        initiatorStation: session.dualProtocol.initiatorStation,
        targetStation: session.dualProtocol.targetStation,
        remainingSeconds: session.dualProtocol.remainingSeconds,
        title: session.dualProtocol.title,
        message: `${session.dualProtocol.initiatorCallsign} primed ${session.dualProtocol.title}! 10s Window to synchronize from Bridge Helm!`,
        timestamp: Date.now(),
      };
      client.ws.send(JSON.stringify(protoUpdate));
    }

    if (session.collabShift.participants.length > 0) {
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
      client.ws.send(JSON.stringify(shiftBroadcast));
    }
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
      this.broadcastCrewManifest(session);
      this.broadcastSpatialSnapshot(session);

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

    // Tick dual-operator critical protocol
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
        this.broadcastToSession(session, expiredNotice);
      }
    }

    // Tick collaborative heavy shifts
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
      this.broadcastToSession(session, shiftBroadcast);

      if (shiftRes.justCompleted) {
        const alert: ShipAlertBroadcast = {
          type: 'SHIP_ALERT',
          id: `collab_done_${Date.now()}`,
          severity: 'info',
          title: 'CO-OP SHIFT COMPLETED',
          message: `${session.collabShift.title} successfully completed! (+${session.collabShift.creditReward} Credits awarded to team).`,
          timestamp: Date.now(),
        };
        this.broadcastToSession(session, alert);
      }
    }

    this.tickActiveWelders(session);
    this.tickSessionBots(session, dtSeconds);
    this.broadcastSpatialSnapshot(session);
    this.broadcastToSession(session, stateToTelemetryBroadcast(session.vesselState));
  }

  private tickSessionBots(session: VesselSession, dtSeconds: number): void {
    for (const [role, bot] of session.bots.entries()) {
      const { nextBot, assistance } = tickBot(bot, dtSeconds, session.vesselState.boarding.doors);
      session.bots.set(role, nextBot);

      if (assistance.reactorTempDelta !== 0) {
        session.vesselState.reactorTemp = Math.max(
          290,
          Number((session.vesselState.reactorTemp + assistance.reactorTempDelta).toFixed(2))
        );
      }
      if (assistance.o2Delta !== 0) {
        const nextO2 = Math.min(
          100,
          Number((session.vesselState.oxygenLevelPercent + assistance.o2Delta).toFixed(2))
        );
        session.vesselState.oxygenLevelPercent = nextO2;
        session.vesselState.lifeSupport.o2LevelPercent = nextO2;
      }
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

  // fallow-ignore-next-line complexity
  private handleClientAction(ws: WebSocket, action: ClientAction): void {
    const client = this.socketToClient.get(ws);
    if (!client) return;

    if (action.type === 'JOIN_VESSEL') {
      this.handleJoinAction(client, action);
      return;
    }

    if (!client.vesselCode) return;
    const session = this.sessions.get(client.vesselCode);
    if (!session) return;

    if (action.type === 'PLAYER_MOVE') {
      this.handleMoveAction(client, action);
    } else if (action.type === 'INITIATE_DUAL_PROTOCOL') {
      this.handleInitiateDualProtocol(session, client, action.protocolId);
    } else if (action.type === 'EXECUTE_DUAL_PROTOCOL') {
      this.handleExecuteDualProtocol(session, client, action.protocolId);
    } else if (action.type === 'CONTRIBUTE_COLLAB_SHIFT') {
      this.handleContributeCollabShift(session, client, action);
    } else if (action.type === 'START_DUTY' || action.type === 'CANCEL_DUTY') {
      this.handleDutyAction(session, client, action);
    } else {
      this.handleCombatAndTriageActions(session, action);
    }
  }

  private resolveClientPawn(
    session: VesselSession,
    client: ClientSession,
    action: JoinVesselAction
  ): void {
    const userId = action.userId || client.id;
    client.userId = userId;
    const persisted = session.persistedCrew.get(userId);
    client.pawn = createInitialClientPawn(client, action, persisted);
    client.callsign = client.pawn.callsign;
    client.role = client.pawn.role;
    session.persistedCrew.set(userId, createPersistedCrewMember(userId, client.pawn));
  }

  // fallow-ignore-next-line complexity
  private handleJoinAction(client: ClientSession, action: JoinVesselAction): void {
    const targetCode = action.vesselCode ? action.vesselCode.toUpperCase() : this.defaultCode;
    if (client.vesselCode && targetCode !== client.vesselCode) {
      const oldSession = this.sessions.get(client.vesselCode);
      if (oldSession) {
        oldSession.clients.delete(client.ws);
        this.reconcileBotsForSession(oldSession);
        this.broadcastCrewManifest(oldSession);
        this.broadcastSpatialSnapshot(oldSession);
        if (oldSession.clients.size === 0 && oldSession.code !== this.defaultCode) {
          oldSession.loop.stop();
          this.sessions.delete(oldSession.code);
        }
      }
    }

    client.vesselCode = targetCode;
    if (action.callsign) client.callsign = action.callsign;
    if (action.role) client.role = action.role;

    const session = this.getOrCreateSession(targetCode);
    this.resolveClientPawn(session, client, action);
    session.clients.set(client.ws, client);
    this.reconcileBotsForSession(session);

    console.log(
      `[Kybernetes Server] Crew ${client.callsign} boarded vessel ${session.code} (${client.role}). Total crew: ${session.clients.size}`
    );

    this.sendInitialPackets(client, session);
    this.broadcastCrewManifest(session);
    this.broadcastSpatialSnapshot(session);
  }

  private handleMoveAction(client: ClientSession, action: PlayerMoveIntent): void {
    client.pawn.x = action.x;
    client.pawn.y = action.y;
    client.pawn.vx = action.vx;
    client.pawn.vy = action.vy;
    client.pawn.facingAngle = action.facingAngle;
    client.pawn.isWelding = Boolean(action.isWelding);

    if (client.userId && client.vesselCode) {
      const session = this.sessions.get(client.vesselCode);
      if (session) {
        session.persistedCrew.set(
          client.userId,
          createPersistedCrewMember(client.userId, client.pawn)
        );
      }
    }
  }

  private handleInitiateDualProtocol(
    session: VesselSession,
    client: ClientSession,
    protocolId: 'ftl_jump_alignment' | 'reactor_purge'
  ): void {
    session.dualProtocol = createDualProtocol(protocolId);
    session.dualProtocol = primeDualProtocol(session.dualProtocol, client.callsign);

    const update: DualProtocolBroadcast = {
      type: 'DUAL_PROTOCOL_UPDATE',
      protocolId,
      stage: 'primed',
      initiatorCallsign: client.callsign,
      initiatorStation: session.dualProtocol.initiatorStation,
      targetStation: session.dualProtocol.targetStation,
      remainingSeconds: session.dualProtocol.remainingSeconds,
      title: session.dualProtocol.title,
      message: `${client.callsign} primed ${session.dualProtocol.title}! 10s Window to synchronize from Bridge Helm!`,
      timestamp: Date.now(),
    };
    this.broadcastToSession(session, update);

    const alert: ShipAlertBroadcast = {
      type: 'SHIP_ALERT',
      id: `dual_primed_${Date.now()}`,
      severity: 'warning',
      title: 'DUAL-OPERATOR PROTOCOL PRIMED',
      message: `${client.callsign} initiated ${session.dualProtocol.title}. Bridge alignment required within 10s!`,
      timestamp: Date.now(),
    };
    this.broadcastToSession(session, alert);
  }

  private handleExecuteDualProtocol(
    session: VesselSession,
    client: ClientSession,
    _protocolId: 'ftl_jump_alignment' | 'reactor_purge'
  ): void {
    const res = executeDualProtocol(session.dualProtocol, 'bridge');
    session.dualProtocol = res.nextState;

    if (res.success) {
      const update: DualProtocolBroadcast = {
        type: 'DUAL_PROTOCOL_UPDATE',
        protocolId: session.dualProtocol.protocolId,
        stage: 'synchronized',
        initiatorCallsign: session.dualProtocol.initiatorCallsign,
        remainingSeconds: 0,
        title: session.dualProtocol.title,
        message: `DUAL PROTOCOL SYNCHRONIZED by ${client.callsign}! Core primed & alignment locked.`,
        timestamp: Date.now(),
      };
      this.broadcastToSession(session, update);

      const alert: ShipAlertBroadcast = {
        type: 'SHIP_ALERT',
        id: `dual_sync_${Date.now()}`,
        severity: 'info',
        title: 'PROTOCOL SYNCHRONIZED',
        message: `FTL Jump Drive successfully aligned! (+${session.dualProtocol.creditReward} Credits, +${session.dualProtocol.xpReward} XP awarded to crew)`,
        timestamp: Date.now(),
      };
      this.broadcastToSession(session, alert);
    }
  }

  private handleContributeCollabShift(
    session: VesselSession,
    client: ClientSession,
    action: ContributeCollabShiftAction
  ): void {
    if (action.active) {
      session.collabShift = joinCollabShift(session.collabShift, client.callsign);
      client.status = 'on_duty';
      client.dutyName = session.collabShift.title;
      client.pawn.isOperating = true;
    } else {
      session.collabShift = leaveCollabShift(session.collabShift, client.callsign);
      client.status = 'idle';
      client.dutyName = undefined;
      client.pawn.isOperating = false;
    }

    const broadcast: CollabShiftUpdateBroadcast = {
      type: 'COLLAB_SHIFT_UPDATE',
      shiftId: session.collabShift.shiftId,
      stationId: session.collabShift.stationId,
      title: session.collabShift.title,
      progressPercent: session.collabShift.progressPercent,
      participants: session.collabShift.participants,
      isCompleted: session.collabShift.isCompleted,
      timestamp: Date.now(),
    };
    this.broadcastToSession(session, broadcast);
    this.broadcastCrewManifest(session);
  }

  private handleDutyAction(
    session: VesselSession,
    client: ClientSession,
    action: ClientAction
  ): void {
    if (action.type === 'START_DUTY') {
      client.status = 'on_duty';
      client.dutyName = action.dutyId;
      client.pawn.isOperating = true;
    } else if (action.type === 'CANCEL_DUTY') {
      client.status = 'idle';
      client.dutyName = undefined;
      client.pawn.isOperating = false;
    }
    this.broadcastCrewManifest(session);
  }

  // fallow-ignore-next-line complexity
  private handleCombatAndTriageActions(session: VesselSession, action: ClientAction): void {
    if (action.type === 'TOGGLE_BATTLE_STATIONS') {
      session.vesselState.alertLevel = action.alertLevel;
    } else if (action.type === 'TRIGGER_PDT_INTERCEPT') {
      this.handlePdtIntercept(session, action.eventId);
    } else if (action.type === 'DEPLOY_FIRE_SUPPRESSION') {
      this.handleFireSuppression(session, action.roomId);
    } else if (action.type === 'EMERGENCY_HULL_REPAIR') {
      this.handleEmergencyHullRepair(session, action.roomId);
    } else if (action.type === 'VENT_REACTOR_COOLANT') {
      this.handleVentCoolant(session);
    } else if (action.type === 'TRIGGER_NAVAL_EVENT') {
      this.handleTriggerNavalEvent(session, action.eventType);
    } else if (action.type === 'TRIGGER_BOARDING_EVENT') {
      this.handleTriggerBoarding(session, action.breachRoomId);
    } else if (action.type === 'ENGAGE_INTRUDER') {
      this.handleEngageIntruder(session, action.intruderId, action.weaponType);
    } else if (action.type === 'BULKHEAD_LOCK') {
      session.vesselState.boarding = toggleBulkheadLock(
        session.vesselState.boarding,
        action.bulkheadId,
        action.locked
      );
    } else if (action.type === 'VENT_COMPARTMENT') {
      session.vesselState.boarding = toggleRoomVenting(
        session.vesselState.boarding,
        action.compartmentId,
        action.venting
      );
    } else if (action.type === 'DEPLOY_SENTRY') {
      session.vesselState.boarding = deploySentryGun(session.vesselState.boarding, action.roomId);
    } else if (action.type === 'FIRE_WEAPON') {
      const proj = createProjectile(
        action.originX,
        action.originY,
        action.targetX,
        action.targetY,
        action.weaponType,
        true,
        action.chargeRatio ?? 1.0
      );
      session.vesselState.boarding.projectiles = [
        ...(session.vesselState.boarding.projectiles || []),
        proj,
      ];
    } else if (action.type === 'WELDER_AOE') {
      const res = applyWelderAoeDamage(
        session.vesselState.boarding.intruders,
        action.originX,
        action.originY,
        action.facingAngle,
        action.damage,
        action.range || 48,
        session.vesselState.boarding.doors
      );
      session.vesselState.boarding.intruders = res.nextIntruders;
    } else if (action.type === 'TOGGLE_DOOR') {
      session.vesselState.boarding.doors = toggleDoor(
        session.vesselState.boarding.doors,
        action.doorId,
        action.open
      );
    }
    this.broadcastToSession(session, stateToTelemetryBroadcast(session.vesselState));
  }

  // fallow-ignore-next-line complexity
  private handlePdtIntercept(session: VesselSession, eventId: string): void {
    const ev = session.vesselState.activeEvents.find((e) => e.id === eventId);
    if (ev?.status !== 'incoming') return;
    if (session.vesselState.defense.pdtAmmo <= 0) session.vesselState.defense.pdtAmmo = 5;

    const res = interceptNavalEvent(ev, session.vesselState.defense, false);
    session.vesselState.defense = res.nextDefense;
    session.vesselState.activeEvents = session.vesselState.activeEvents.map((e) =>
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
    this.broadcastToSession(session, triage);
  }

  private handleFireSuppression(session: VesselSession, roomId: string): void {
    const res = deployFireSuppression(session.vesselState.activeFires, roomId);
    session.vesselState.activeFires = res.nextFires;
    const triage: DamageTriageBroadcast = {
      type: 'DAMAGE_TRIAGE_RESULT',
      actionType: 'FIRE_SUPPRESSION',
      success: res.extinguished,
      message: res.extinguished
        ? `Fire suppressed in ${roomId.toUpperCase()}`
        : 'No fire detected in target compartment.',
      timestamp: Date.now(),
    };
    this.broadcastToSession(session, triage);
  }

  private handleEmergencyHullRepair(session: VesselSession, roomId: string): void {
    const res = repairHullPlating(session.vesselState.hull, roomId);
    session.vesselState.hull = res.nextHull;
    session.vesselState.hullIntegrityPercent = res.nextHull.integrityPercent;
    const triage: DamageTriageBroadcast = {
      type: 'DAMAGE_TRIAGE_RESULT',
      actionType: 'HULL_REPAIR',
      success: true,
      message: res.patchedBreach
        ? `Breach patched and plating welded in ${roomId.toUpperCase()}`
        : 'Hull plating welded (+15% integrity)',
      timestamp: Date.now(),
    };
    this.broadcastToSession(session, triage);
  }

  private handleVentCoolant(session: VesselSession): void {
    const res = ventReactorCoolant(session.vesselState.reactor);
    session.vesselState.reactor = res.nextReactor;
    session.vesselState.reactorTemp = res.nextReactor.tempKelvin;
    const triage: DamageTriageBroadcast = {
      type: 'DAMAGE_TRIAGE_RESULT',
      actionType: 'COOLANT_VENT',
      success: res.success,
      message: res.success
        ? `Reactor coolant vented (-${res.tempDrop}K)`
        : 'Coolant reserves too low to vent safely.',
      timestamp: Date.now(),
    };
    this.broadcastToSession(session, triage);
  }

  private handleTriggerNavalEvent(
    session: VesselSession,
    type: import('@kybernetes/protocol').NavalDamageEventType
  ): void {
    if (session.vesselState.defense.pdtAmmo < 3) {
      session.vesselState.defense.pdtAmmo = 10;
      session.vesselState.defense.status = 'nominal';
    }
    if (session.vesselState.activeEvents.length >= 3) {
      session.vesselState.activeEvents = session.vesselState.activeEvents.slice(-2);
    }
    const event = createNavalDamageEvent(type);
    session.vesselState.activeEvents.push(event);
    session.vesselState.alertLevel = 'red';

    if (type === 'radiation_burst') {
      const spiked = Number((session.vesselState.reactor.tempKelvin + 250).toFixed(2));
      session.vesselState.reactor.tempKelvin = spiked;
      session.vesselState.reactorTemp = spiked;
      session.vesselState.reactor.status = 'degraded';
    }

    const broadcast: NavalDamageEventBroadcast = {
      type: 'NAVAL_DAMAGE_EVENT',
      event,
    };
    this.broadcastToSession(session, broadcast);

    const alert: ShipAlertBroadcast = {
      type: 'SHIP_ALERT',
      id: `alert_${Date.now()}`,
      severity: 'critical',
      title: 'BATTLE STATIONS: RED ALERT',
      message: `Inbound threat detected: ${event.title}`,
      timestamp: Date.now(),
    };
    this.broadcastToSession(session, alert);
  }

  private handleTriggerBoarding(session: VesselSession, breachRoomId?: string): void {
    session.vesselState.boarding = spawnBoardingEvent(
      session.vesselState.boarding,
      breachRoomId || 'cargo'
    );
    session.vesselState.alertLevel = 'red';

    const alert: ShipAlertBroadcast = {
      type: 'SHIP_ALERT',
      id: `alert_${Date.now()}`,
      severity: 'critical',
      title: 'INTRUDER ALERT: HOSTILE BREACH',
      message: 'Boarding pod drilled through hull in CARGO BAY! Repel intruders!',
      timestamp: Date.now(),
    };
    this.broadcastToSession(session, alert);
  }

  private handleEngageIntruder(
    session: VesselSession,
    intruderId: string,
    weaponType?: 'kinetic_rifle' | 'arc_welder' | 'shock_baton'
  ): void {
    const res = engageIntruder(
      session.vesselState.boarding,
      intruderId,
      weaponType || 'kinetic_rifle'
    );
    session.vesselState.boarding = res.nextState;

    if (res.neutralized) {
      const triage: DamageTriageBroadcast = {
        type: 'DAMAGE_TRIAGE_RESULT',
        actionType: 'INTRUDER_NEUTRALIZED',
        success: true,
        message: `Raider neutralized! (+${res.creditsReward} Credits, +${res.xpReward} XP)`,
        timestamp: Date.now(),
      };
      this.broadcastToSession(session, triage);
    }
  }

  private broadcastCrewManifest(session: VesselSession): void {
    const humanCrew = Array.from(session.clients.values()).map((c) => ({
      id: c.id,
      callsign: c.callsign,
      role: c.role,
      deckId: 'deck_a',
      status: c.status,
      dutyName: c.dutyName,
    }));
    const botCrew = Array.from(session.bots.values()).map((b) => ({
      id: b.id,
      callsign: b.persona.callsign,
      role: b.role,
      deckId: 'deck_a',
      status: (b.state === 'working_station' ? 'on_duty' : 'idle') as 'on_duty' | 'idle',
      dutyName: b.state === 'working_station' ? 'Department Maintenance' : undefined,
    }));
    const broadcast: CrewManifestBroadcast = {
      type: 'CREW_MANIFEST',
      crew: [...humanCrew, ...botCrew],
    };
    this.broadcastToSession(session, broadcast);
  }

  private broadcastSpatialSnapshot(session: VesselSession): void {
    const pawns: PawnState[] = [
      ...Array.from(session.clients.values()).map((c) => c.pawn),
      ...Array.from(session.bots.values()).map((b) => b.pawn),
    ];
    const snapshot: SpatialSnapshotBroadcast = {
      type: 'SPATIAL_SNAPSHOT',
      timestamp: Date.now(),
      pawns,
      bulkheads: [],
    };
    this.broadcastToSession(session, snapshot);
  }

  private broadcastToSession(session: VesselSession, broadcast: ServerBroadcast): void {
    const payload = JSON.stringify(broadcast);
    for (const client of session.clients.values()) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(payload);
      }
    }
  }
}
