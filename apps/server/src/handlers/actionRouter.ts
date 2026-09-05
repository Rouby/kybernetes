import type {
  ClientAction,
  CollabShiftUpdateBroadcast,
  ContributeCollabShiftAction,
  DamageTriageBroadcast,
  DualProtocolBroadcast,
  DutyCompletedBroadcast,
  JoinVesselAction,
  NavalDamageEventBroadcast,
  NavalDamageEventType,
  PawnState,
  PlayerMoveIntent,
  ShipAlertBroadcast,
  StartingRole,
} from '@kybernetes/protocol';
import {
  advanceShiftTask,
  applyDutySubsystemImpact,
  applyWelderAoeDamage,
  calculateDutyRewards,
  createDualProtocol,
  createNavalDamageEvent,
  createPersistedCrewMember,
  createProjectile,
  deployFireSuppression,
  deploySentryGun,
  engageIntruder,
  executeDualProtocol,
  HESPERIA_SPAWNS,
  handoverWatchRotation,
  interceptNavalEvent,
  joinCollabShift,
  leaveCollabShift,
  type PersistedCrewMember,
  patchSuitIntegrity,
  primeDualProtocol,
  ROLE_DEFINITIONS,
  refillSuitO2,
  repairHullPlating,
  reviveCrew,
  spawnBoardingEvent,
  stateToTelemetryBroadcast,
  toggleBulkheadLock,
  toggleDoor,
  toggleHelmet,
  toggleRoomVenting,
  ventReactorCoolant,
} from '@kybernetes/sim-core';
import {
  broadcastCrewManifest,
  broadcastSpatialSnapshot,
  broadcastToSession,
  broadcastVitals,
  sendInitialPackets,
} from '../broadcast/deltaBroadcaster';
import type { ClientSession, VesselSession } from '../types.js';

export interface ServerRouterContext {
  getOrCreateSession: (code: string) => VesselSession;
  reconcileBotsForSession: (session: VesselSession) => void;
  sessions: Map<string, VesselSession>;
  defaultCode: string;
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

export class ActionRouter {
  constructor(private ctx: ServerRouterContext) {}

  // fallow-ignore-next-line complexity
  public handleClientAction(client: ClientSession, action: ClientAction): void {
    if (action.type === 'JOIN_VESSEL') {
      this.handleJoinAction(client, action);
      return;
    }

    if (!client.vesselCode) return;
    const session = this.ctx.sessions.get(client.vesselCode);
    if (!session) return;

    if (action.type === 'PLAYER_MOVE') {
      this.handleMoveAction(client, action);
    } else if (action.type === 'INITIATE_DUAL_PROTOCOL') {
      this.handleInitiateDualProtocol(session, client, action.protocolId);
    } else if (action.type === 'EXECUTE_DUAL_PROTOCOL') {
      this.handleExecuteDualProtocol(session, client, action.protocolId);
    } else if (action.type === 'CONTRIBUTE_COLLAB_SHIFT') {
      this.handleContributeCollabShift(session, client, action);
    } else if (
      action.type === 'START_DUTY' ||
      action.type === 'CANCEL_DUTY' ||
      action.type === 'COMPLETE_DUTY'
    ) {
      this.handleDutyAction(session, client, action);
    } else if (
      action.type === 'TOGGLE_HELMET' ||
      action.type === 'REFILL_SUIT' ||
      action.type === 'PATCH_SUIT' ||
      action.type === 'REVIVE_CREW' ||
      action.type === 'CONSUME_ITEM' ||
      action.type === 'BUNK_SLEEP' ||
      action.type === 'WATCH_HANDOVER'
    ) {
      this.handleSurvivalAction(session, client, action);
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
    const targetCode = action.vesselCode ? action.vesselCode.toUpperCase() : this.ctx.defaultCode;
    if (client.vesselCode && targetCode !== client.vesselCode) {
      const oldSession = this.ctx.sessions.get(client.vesselCode);
      if (oldSession) {
        oldSession.clients.delete(client.ws);
        this.ctx.reconcileBotsForSession(oldSession);
        broadcastCrewManifest(oldSession);
        broadcastSpatialSnapshot(oldSession);
        if (oldSession.clients.size === 0 && oldSession.code !== this.ctx.defaultCode) {
          oldSession.loop.stop();
          this.ctx.sessions.delete(oldSession.code);
        }
      }
    }

    client.vesselCode = targetCode;
    if (action.callsign) client.callsign = action.callsign;
    if (action.role) client.role = action.role;

    const session = this.ctx.getOrCreateSession(targetCode);
    this.resolveClientPawn(session, client, action);
    session.clients.set(client.ws, client);
    this.ctx.reconcileBotsForSession(session);

    console.log(
      `[Kybernetes Server] Crew ${client.callsign} boarded vessel ${session.code} (${client.role}). Total crew: ${session.clients.size}`
    );

    sendInitialPackets(client, session);
    broadcastCrewManifest(session);
    broadcastSpatialSnapshot(session);
  }

  private handleMoveAction(client: ClientSession, action: PlayerMoveIntent): void {
    client.pawn.x = action.x;
    client.pawn.y = action.y;
    client.pawn.vx = action.vx;
    client.pawn.vy = action.vy;
    client.pawn.facingAngle = action.facingAngle;
    client.pawn.isWelding = Boolean(action.isWelding);

    if (client.userId && client.vesselCode) {
      const session = this.ctx.sessions.get(client.vesselCode);
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
    broadcastToSession(session, update);

    const alert: ShipAlertBroadcast = {
      type: 'SHIP_ALERT',
      id: `dual_primed_${Date.now()}`,
      severity: 'warning',
      title: 'DUAL-OPERATOR PROTOCOL PRIMED',
      message: `${client.callsign} initiated ${session.dualProtocol.title}. Bridge alignment required within 10s!`,
      timestamp: Date.now(),
    };
    broadcastToSession(session, alert);
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
      broadcastToSession(session, update);

      const alert: ShipAlertBroadcast = {
        type: 'SHIP_ALERT',
        id: `dual_sync_${Date.now()}`,
        severity: 'info',
        title: 'PROTOCOL SYNCHRONIZED',
        message: `FTL Jump Drive successfully aligned! (+${session.dualProtocol.creditReward} Credits, +${session.dualProtocol.xpReward} XP awarded to crew)`,
        timestamp: Date.now(),
      };
      broadcastToSession(session, alert);
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
    broadcastToSession(session, broadcast);
    broadcastCrewManifest(session);
  }

  // fallow-ignore-next-line complexity
  private processDutyCompletion(
    session: VesselSession,
    client: ClientSession,
    dutyId: string,
    stationId: string
  ): void {
    client.status = 'idle';
    client.dutyName = undefined;
    client.pawn.isOperating = false;

    const impact = applyDutySubsystemImpact(session.vesselState, dutyId);
    session.vesselState = impact.nextState;

    const rewards = calculateDutyRewards(dutyId, client.role, client.clearanceLevel);
    client.credits += rewards.credits;
    client.clearanceXp = (client.clearanceXp || 0) + rewards.xp;

    if (client.shiftChecklist && !client.shiftChecklist.isCompleted) {
      const step = advanceShiftTask(client.shiftChecklist, dutyId);
      client.shiftChecklist = step.nextShift;
    }

    const completion: DutyCompletedBroadcast = {
      type: 'DUTY_COMPLETED',
      dutyId,
      stationId,
      creditsEarned: rewards.credits,
      xpEarned: rewards.xp,
      timestamp: Date.now(),
    };
    broadcastToSession(session, completion);
    broadcastVitals(client);
    broadcastCrewManifest(session);
    broadcastToSession(session, stateToTelemetryBroadcast(session.vesselState));
  }

  // fallow-ignore-next-line complexity
  private processWatchHandover(session: VesselSession, client: ClientSession): void {
    if (!client.shiftChecklist) return;
    const res = handoverWatchRotation(
      client.shiftChecklist,
      client.vitals,
      client.clearanceLevel,
      client.clearanceXp || 0
    );
    client.shiftChecklist = res.nextShift;
    client.clearanceLevel = res.newClearanceLevel;
    client.clearanceXp = res.newClearanceXp;
    client.credits += res.evaluation.baseCredits + res.evaluation.bonusCredits;
    client.vitals = {
      ...client.vitals,
      fatigue: 0,
      stamina: client.vitals.maxStamina || 100,
    };
    broadcastVitals(client);
    broadcastCrewManifest(session);

    if (res.promoted) {
      const alert: ShipAlertBroadcast = {
        type: 'SHIP_ALERT',
        id: `promo_${Date.now()}`,
        severity: 'info',
        title: 'CLEARANCE PROMOTION',
        message: `${client.callsign} promoted to ${res.evaluation.rankTitle} [${res.evaluation.rankBadge}]! Salary bonus unlocked.`,
        timestamp: Date.now(),
      };
      broadcastToSession(session, alert);
    }
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
      broadcastCrewManifest(session);
    } else if (action.type === 'CANCEL_DUTY') {
      client.status = 'idle';
      client.dutyName = undefined;
      client.pawn.isOperating = false;
      broadcastCrewManifest(session);
    } else if (action.type === 'COMPLETE_DUTY') {
      this.processDutyCompletion(session, client, action.dutyId, action.stationId);
    }
  }

  // fallow-ignore-next-line complexity
  private handleSurvivalAction(
    session: VesselSession,
    client: ClientSession,
    action: ClientAction
  ): void {
    if (action.type === 'TOGGLE_HELMET') {
      client.vitals = toggleHelmet(client.vitals, action.sealed);
      broadcastVitals(client);
    } else if (action.type === 'REFILL_SUIT') {
      client.vitals = refillSuitO2(client.vitals, 600);
      broadcastVitals(client);
    } else if (action.type === 'PATCH_SUIT') {
      client.vitals = patchSuitIntegrity(client.vitals);
      broadcastVitals(client);
    } else if (action.type === 'REVIVE_CREW') {
      for (const target of session.clients.values()) {
        if (target.id === action.targetPlayerId) {
          target.vitals = reviveCrew(target.vitals);
          broadcastVitals(target);
          break;
        }
      }
    } else if (action.type === 'CONSUME_ITEM') {
      const supplies = session.vesselState.supplies;
      if (action.itemId === 'nutrient_paste' || action.itemId === 'ration_tin') {
        supplies.rations = Math.max(0, supplies.rations - 1);
        client.vitals = { ...client.vitals, hunger: Math.min(100, client.vitals.hunger + 25) };
      } else if (action.itemId === 'recycled_water' || action.itemId === 'recaf') {
        supplies.waterLitres = Math.max(0, supplies.waterLitres - 0.5);
        client.vitals = { ...client.vitals, thirst: Math.min(100, client.vitals.thirst + 30) };
      }
      broadcastVitals(client);
      broadcastToSession(session, stateToTelemetryBroadcast(session.vesselState));
    } else if (action.type === 'BUNK_SLEEP') {
      client.pawn.isResting = action.active;
      client.status = action.active ? 'resting' : 'idle';
      broadcastCrewManifest(session);
      broadcastSpatialSnapshot(session);
    } else if (action.type === 'WATCH_HANDOVER') {
      this.processWatchHandover(session, client);
    }
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
    broadcastToSession(session, stateToTelemetryBroadcast(session.vesselState));
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
    broadcastToSession(session, triage);
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
    broadcastToSession(session, triage);
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
    broadcastToSession(session, triage);
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
    broadcastToSession(session, triage);
  }

  private handleTriggerNavalEvent(session: VesselSession, type: NavalDamageEventType): void {
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
    broadcastToSession(session, broadcast);

    const alert: ShipAlertBroadcast = {
      type: 'SHIP_ALERT',
      id: `alert_${Date.now()}`,
      severity: 'critical',
      title: 'BATTLE STATIONS: RED ALERT',
      message: `Inbound threat detected: ${event.title}`,
      timestamp: Date.now(),
    };
    broadcastToSession(session, alert);
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
    broadcastToSession(session, alert);
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
      broadcastToSession(session, triage);
    }
  }
}
