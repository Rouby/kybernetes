import type {
  AtmosOverlayMode,
  DoorState,
  PlayerVitals,
  ShiftChecklistState,
  ShiftEvaluation,
  StartingRole,
  StationFixture,
  TelemetryDeltaBroadcast,
  WeaponType,
} from '@kybernetes/protocol';
import {
  advanceShiftTask,
  calculateDutyRewards,
  calculateProjectedGrade,
  createInitialPlayerVitals,
  createInitialVesselState,
  evaluateShiftPerformance,
  generateShiftChecklist,
  HESPERIA_ROOMS,
  handoverWatchRotation,
  refillSuitO2,
  toggleDoor,
  toggleHelmet,
  updatePlayerVitals,
} from '@kybernetes/sim-core';
import { hudColors } from '@kybernetes/ui-tokens/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ShipAudioEngine } from './audio/ShipAudioEngine';
import { AudioSettingsModal } from './components/AudioSettingsModal';
import { BeaconLobbyModal } from './components/BeaconLobbyModal';
import { CharacterCreationModal, type CharacterProfile } from './components/CharacterCreationModal';
import { CrewManifestModal } from './components/CrewManifestModal';
import { MainMenu } from './components/MainMenu';
import { RoleSelectModal } from './components/RoleSelectModal';
import { ShiftDebriefModal } from './components/ShiftDebriefModal';
import { VesselCanvas } from './components/VesselCanvas';
import { usePawnMovement } from './hooks/usePawnMovement';
import { getStationActionConfig, useStationInteraction } from './hooks/useStationInteraction';
import { useVesselSocket } from './hooks/useVesselSocket';

const styles = stylex.create({
  container: {
    display: 'flex',
    flexDirection: 'column',
    width: '100vw',
    height: '100vh',
    backgroundColor: hudColors.bgVoid,
    color: hudColors.textPrimary,
  },
  mainLayout: {
    display: 'flex',
    flex: 1,
    width: '100vw',
    height: '100vh',
    position: 'relative',
    overflow: 'hidden',
  },
});

interface PersistedClientCrewState {
  userId: string;
  callsign: string;
  role: StartingRole;
  color: string;
  pawn: { x: number; y: number; facingAngle: number };
  vitals: PlayerVitals;
  credits: number;
  clearanceLevel: number;
  clearanceXp: number;
  shiftChecklist?: ShiftChecklistState;
}

function getOrCreateUserId(): string {
  if (typeof window === 'undefined') return 'user_default';
  let uid = localStorage.getItem('kybernetes_user_id');
  if (!uid) {
    uid = `user_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    localStorage.setItem('kybernetes_user_id', uid);
  }
  return uid;
}

function loadPersistedCrewState(beaconCode: string): PersistedClientCrewState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`kybernetes_crew_${beaconCode.toUpperCase()}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function savePersistedCrewState(beaconCode: string, state: PersistedClientCrewState): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`kybernetes_crew_${beaconCode.toUpperCase()}`, JSON.stringify(state));
  } catch {
    // ignore
  }
}

// fallow-ignore-next-line complexity
function resolveSessionProfile(
  existing: PersistedClientCrewState | null,
  defaults: { callsign: string; role: StartingRole; color: string }
) {
  return existing
    ? {
        callsign: existing.callsign ?? defaults.callsign,
        role: existing.role ?? defaults.role,
        color: existing.color ?? defaults.color,
      }
    : defaults;
}

// fallow-ignore-next-line complexity
function restorePersistedVitalsAndRewards(
  persisted: PersistedClientCrewState | null,
  setVitals: React.Dispatch<React.SetStateAction<PlayerVitals>>,
  setCredits: React.Dispatch<React.SetStateAction<number>>,
  setClearanceLevel: React.Dispatch<React.SetStateAction<number>>,
  setClearanceXp: React.Dispatch<React.SetStateAction<number>>,
  setShiftChecklist: React.Dispatch<React.SetStateAction<ShiftChecklistState>>,
  currentRole: StartingRole
): void {
  if (!persisted) return;
  setVitals(persisted.vitals ?? createInitialPlayerVitals());
  setCredits(persisted.credits ?? 120);
  setClearanceLevel(persisted.clearanceLevel ?? 1);
  setClearanceXp(persisted.clearanceXp ?? 0);
  if (persisted.shiftChecklist && persisted.shiftChecklist.role === currentRole) {
    setShiftChecklist(persisted.shiftChecklist);
  } else {
    setShiftChecklist(generateShiftChecklist(currentRole, 1));
  }
}

interface ShiftProgressionContext {
  dutyId: string;
  role: StartingRole;
  shiftChecklist: ShiftChecklistState;
  vitals: PlayerVitals;
  onReward: (credits: number, xp: number) => void;
  setShiftChecklist: React.Dispatch<React.SetStateAction<ShiftChecklistState>>;
  onFinishShift: (evaluation: ShiftEvaluation) => void;
  onNotice: (msg: string) => void;
}

// fallow-ignore-next-line complexity
function processShiftDutyCompletion(ctx: ShiftProgressionContext): void {
  const activeTask = ctx.shiftChecklist.tasks[ctx.shiftChecklist.currentTaskIndex];
  const isScheduled =
    Boolean(activeTask) && activeTask.dutyId === ctx.dutyId && !ctx.shiftChecklist.isCompleted;

  if (!isScheduled) {
    ctx.onNotice('[UNSCHEDULED TASK] Action completed - No shift XP awarded');
    return;
  }

  const rew = calculateDutyRewards(ctx.dutyId, ctx.role);
  ctx.onReward(rew.credits, rew.xp);

  const stepRes = advanceShiftTask(ctx.shiftChecklist, ctx.dutyId);
  ctx.setShiftChecklist(stepRes.nextShift);

  if (stepRes.shiftFinished) {
    const evalResult = evaluateShiftPerformance(stepRes.nextShift, ctx.vitals);
    ctx.onFinishShift(evalResult);
  } else {
    ctx.onNotice(`[SHIFT TASK COMPLETE] +${rew.credits} Cr, +${rew.xp} XP`);
  }
}

// fallow-ignore-next-line complexity
function resolvePromptActionName(
  door: DoorState | null | undefined,
  station: StationFixture | null,
  role: StartingRole,
  activeDutyId?: string
): string | undefined {
  if (door) {
    return door.isOpen ? 'Close Hatch' : 'Open Hatch';
  }
  if (!station) return undefined;
  return getStationActionConfig(station, role, activeDutyId)?.actionName;
}

// fallow-ignore-next-line complexity
export const App: React.FC = () => {
  const [telemetry, setTelemetry] = useState<TelemetryDeltaBroadcast>(() => ({
    type: 'TELEMETRY_DELTA',
    timestamp: Date.now(),
    ...createInitialVesselState(),
  }));

  // fallow-ignore-next-line complexity
  const urlParams = useMemo(() => {
    if (typeof window === 'undefined') return { beacon: 'HESP01', callsign: 'Cadet', isE2E: false };
    const params = new URLSearchParams(window.location.search);
    return {
      beacon: (params.get('beacon') || 'HESP01').toUpperCase(),
      callsign: params.get('callsign') || 'Cadet',
      isE2E:
        params.get('e2e') === 'true' ||
        params.has('e2e') ||
        Boolean((window as unknown as { __E2E__?: boolean }).__E2E__),
    };
  }, []);

  const userId = useMemo(() => getOrCreateUserId(), []);
  const [activeVesselCode, setActiveVesselCode] = useState<string | null>(null);
  const [pendingBeaconCode, setPendingBeaconCode] = useState<string | null>(null);
  const [showCharacterCreation, setShowCharacterCreation] = useState(false);
  const [beaconCode, setBeaconCode] = useState(urlParams.beacon);
  const [callsign, setCallsign] = useState(urlParams.callsign);
  const [suitColor, setSuitColor] = useState('#00e5ff');
  const [isWeldingLocal, setIsWeldingLocal] = useState(false);
  const [showBeaconModal, setShowBeaconModal] = useState(false);
  const [showManifestModal, setShowManifestModal] = useState(false);
  const [showAudioModal, setShowAudioModal] = useState(false);

  const [role, setRole] = useState<StartingRole>('wiper');
  const [showRoleSelect, setShowRoleSelect] = useState(false);
  const [shiftChecklist, setShiftChecklist] = useState<ShiftChecklistState>(() =>
    generateShiftChecklist('wiper', 1)
  );
  const [showDebriefModal, setShowDebriefModal] = useState(false);
  const [shiftEvaluation, setShiftEvaluation] = useState<ShiftEvaluation | null>(null);
  const [pendingNextShift, setPendingNextShift] = useState<ShiftChecklistState | null>(null);
  const [vitals, setVitals] = useState(createInitialPlayerVitals);
  const [shiftElapsedSec, setShiftElapsedSec] = useState(0);

  const projectedGrade = useMemo(
    () => calculateProjectedGrade(shiftElapsedSec, vitals),
    [shiftElapsedSec, vitals]
  );

  const shiftTimerFormatted = useMemo(() => {
    const mins = Math.floor(shiftElapsedSec / 60);
    const secs = shiftElapsedSec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, [shiftElapsedSec]);
  const [credits, setCredits] = useState(120);
  const [clearanceXp, setClearanceXp] = useState(0);
  const [clearanceLevel, setClearanceLevel] = useState(1);
  const [inGameNotice, setInGameNotice] = useState<string | null>(null);
  const [equippedWeapon, setEquippedWeapon] = useState<WeaponType>('kinetic_carbine');
  const [overlayMode, setOverlayMode] = useState<AtmosOverlayMode>('off');

  const { triageNotice, remotePawns, crewManifest, dualProtocol, collabShift, sendAction } =
    useVesselSocket(setTelemetry, activeVesselCode, {
      callsign,
      role,
      color: suitColor,
      userId,
      onVitalsDelta: (v) => setVitals(v.vitals),
    });

  const facingAngleRef = useRef(0);
  const { pawn, setPawn, nearestStation, nearestDoor, resetToSpawn } = usePawnMovement(
    role,
    telemetry.boarding?.doors,
    undefined,
    facingAngleRef,
    vitals,
    telemetry.roomAtmospheres,
    telemetry.hull?.breaches
  );

  const currentRoomId = useMemo(() => {
    return HESPERIA_ROOMS.find(
      (r) => pawn.x >= r.x && pawn.x <= r.x + r.width && pawn.y >= r.y && pawn.y <= r.y + r.height
    )?.id;
  }, [pawn.x, pawn.y]);

  const handleToggleHelmet = useCallback(() => {
    setVitals((prev) => {
      const next = toggleHelmet(prev);
      ShipAudioEngine.getInstance().playVisorToggle(next.suit.isSealed);
      return next;
    });
    sendAction({ type: 'TOGGLE_HELMET' });
  }, [sendAction]);

  const handleRefillSuit = useCallback(() => {
    setVitals((prev) => refillSuitO2(prev));
    sendAction({ type: 'REFILL_SUIT', resource: 'o2', stationId: 'airlock_console' });
    setInGameNotice('[SUIT] Oxygen tanks replenished to 100%');
    setTimeout(() => setInGameNotice(null), 2500);
  }, [sendAction]);

  const handleCycleOverlay = useCallback(() => {
    setOverlayMode((curr) => {
      const next: AtmosOverlayMode =
        curr === 'off' ? 'o2' : curr === 'o2' ? 'temp' : curr === 'temp' ? 'pressure' : 'off';
      const label =
        next === 'off'
          ? 'NORMAL'
          : next === 'o2'
            ? 'OXYGEN [O2]'
            : next === 'temp'
              ? 'TEMPERATURE [TEMP]'
              : 'PRESSURE [ATM]';
      setInGameNotice(`[SENSOR] Deck View: ${label}`);
      setTimeout(() => setInGameNotice(null), 2500);
      ShipAudioEngine.getInstance().playUiClick();
      return next;
    });
  }, []);

  // Synchronize pawn callsign and color with local state
  useEffect(() => {
    setPawn((p) => ({ ...p, callsign, color: suitColor }));
  }, [callsign, suitColor, setPawn]);

  // Broadcast movement to authoritative server only when onboard
  useEffect(() => {
    if (!activeVesselCode) return;
    sendAction({
      type: 'PLAYER_MOVE',
      x: pawn.x,
      y: pawn.y,
      vx: pawn.vx,
      vy: pawn.vy,
      facingAngle: pawn.facingAngle,
      isWelding: isWeldingLocal,
    });
  }, [
    activeVesselCode,
    pawn.x,
    pawn.y,
    pawn.vx,
    pawn.vy,
    pawn.facingAngle,
    isWeldingLocal,
    sendAction,
  ]);

  // Persist crew state to localStorage
  useEffect(() => {
    if (!activeVesselCode) return;
    savePersistedCrewState(activeVesselCode, {
      userId,
      callsign,
      role,
      color: suitColor,
      pawn: { x: pawn.x, y: pawn.y, facingAngle: pawn.facingAngle },
      vitals,
      credits,
      clearanceLevel,
      clearanceXp,
      shiftChecklist,
    });
  }, [
    activeVesselCode,
    userId,
    callsign,
    role,
    suitColor,
    pawn.x,
    pawn.y,
    pawn.facingAngle,
    vitals,
    credits,
    clearanceLevel,
    clearanceXp,
    shiftChecklist,
  ]);

  const startSession = useCallback(
    (code: string, chosenCallsign: string, chosenRole: StartingRole, chosenColor: string) => {
      const cleanCode = code.toUpperCase();
      setBeaconCode(cleanCode);
      setCallsign(chosenCallsign);
      setRole(chosenRole);
      setSuitColor(chosenColor);

      const persisted = loadPersistedCrewState(cleanCode);
      if (persisted?.pawn) {
        setPawn((p) => ({
          ...p,
          x: persisted.pawn.x,
          y: persisted.pawn.y,
          facingAngle: persisted.pawn.facingAngle,
          callsign: chosenCallsign,
          role: chosenRole,
          color: chosenColor,
        }));
        restorePersistedVitalsAndRewards(
          persisted,
          setVitals,
          setCredits,
          setClearanceLevel,
          setClearanceXp,
          setShiftChecklist,
          chosenRole
        );
      } else {
        resetToSpawn(chosenRole);
        setPawn((p) => ({
          ...p,
          callsign: chosenCallsign,
          role: chosenRole,
          color: chosenColor,
        }));
        setShiftChecklist(generateShiftChecklist(chosenRole, 1));
      }

      setActiveVesselCode(cleanCode);
    },
    [resetToSpawn, setPawn]
  );

  const handleCommissionVessel = (newCode: string) => {
    setPendingBeaconCode(newCode);
    const existing = loadPersistedCrewState(newCode);
    if (existing) {
      setCallsign(existing.callsign);
      setRole(existing.role);
      setSuitColor(existing.color);
    }
    setShowCharacterCreation(true);
  };

  const handleBoardVessel = (code: string) => {
    const cleanCode = code.toUpperCase();
    setPendingBeaconCode(cleanCode);
    const existing = loadPersistedCrewState(cleanCode);
    if (existing) {
      setCallsign(existing.callsign);
      setRole(existing.role);
      setSuitColor(existing.color);
    }
    setShowCharacterCreation(true);
  };

  const handleQuickBoard = (beacon: string) => {
    const existing = loadPersistedCrewState(beacon);
    const profile = resolveSessionProfile(existing, { callsign, role, color: suitColor });
    startSession(beacon, profile.callsign, profile.role, profile.color);
  };

  const handleConfirmDossier = (profile: CharacterProfile) => {
    const code = pendingBeaconCode || beaconCode || 'HESP01';
    setShowCharacterCreation(false);
    startSession(code, profile.callsign, profile.role, profile.color);
  };

  const handleWeldingChange = useCallback(
    (isWelding: boolean) => {
      setIsWeldingLocal(isWelding);
      if (!activeVesselCode) return;
      sendAction({
        type: 'PLAYER_MOVE',
        x: pawn.x,
        y: pawn.y,
        vx: pawn.vx,
        vy: pawn.vy,
        facingAngle: pawn.facingAngle,
        isWelding,
      });
    },
    [activeVesselCode, pawn.x, pawn.y, pawn.vx, pawn.vy, pawn.facingAngle, sendAction]
  );

  const handleLeaveShip = () => {
    setActiveVesselCode(null);
    setShowCharacterCreation(false);
    abortInteraction();
  };

  const handleJoinBeacon = (newBeacon: string, newCallsign: string) => {
    const cleanCode = newBeacon.toUpperCase();
    setBeaconCode(cleanCode);
    setCallsign(newCallsign);
    setActiveVesselCode(cleanCode);
  };

  const handleFireWeapon = (
    originX: number,
    originY: number,
    targetX: number,
    targetY: number,
    weaponType: WeaponType,
    chargeRatio = 1.0
  ) => {
    sendAction({
      type: 'FIRE_WEAPON',
      originX,
      originY,
      targetX,
      targetY,
      weaponType,
      chargeRatio,
    });
  };

  const handleWelderAoe = (
    originX: number,
    originY: number,
    facingAngle: number,
    damage: number,
    range = 135
  ) => {
    sendAction({
      type: 'WELDER_AOE',
      originX,
      originY,
      facingAngle,
      damage,
      range,
    });
  };

  const handleToggleDoor = useCallback(
    (doorId: string, open: boolean) => {
      sendAction({
        type: 'TOGGLE_DOOR',
        doorId,
        open,
      });
      setTelemetry((prev) => {
        if (!prev.boarding?.doors) return prev;
        const nextDoors = toggleDoor(prev.boarding.doors, doorId, open);
        const target = nextDoors.find((d) => d.id === doorId);
        if (target) {
          ShipAudioEngine.getInstance().playDoorToggle(
            (target.x1 + target.x2) / 2,
            (target.y1 + target.y2) / 2,
            open
          );
        }
        return {
          ...prev,
          boarding: {
            ...prev.boarding,
            doors: nextDoors,
          },
        };
      });
    },
    [sendAction]
  );

  const activeDutyId = shiftChecklist.tasks[shiftChecklist.currentTaskIndex]?.dutyId;

  const shiftChecklistRef = useRef(shiftChecklist);
  shiftChecklistRef.current = shiftChecklist;
  const vitalsRef = useRef(vitals);
  vitalsRef.current = vitals;
  const telemetryAtmospheresRef = useRef(telemetry.roomAtmospheres);
  telemetryAtmospheresRef.current = telemetry.roomAtmospheres;
  const currentRoomIdRef = useRef(currentRoomId);
  currentRoomIdRef.current = currentRoomId;
  const isRestingRef = useRef(pawn.isResting);
  isRestingRef.current = pawn.isResting;
  const isOperatingRef = useRef(pawn.isOperating);
  isOperatingRef.current = pawn.isOperating;

  const { interaction, startInteraction, abortInteraction, tickInteraction } =
    useStationInteraction({
      role,
      activeDutyId,
      onCompleteDuty: (dutyId, stationId) => {
        sendAction({ type: 'COMPLETE_DUTY', dutyId, stationId });
        processShiftDutyCompletion({
          dutyId,
          role,
          shiftChecklist: shiftChecklistRef.current,
          vitals: vitalsRef.current,
          onReward: (creditsDelta, xpDelta) => {
            setCredits((c) => c + creditsDelta);
            setClearanceXp((prev) => {
              const nextXp = prev + xpDelta;
              if (nextXp >= 100 * clearanceLevel) setClearanceLevel((lvl) => lvl + 1);
              return nextXp;
            });
          },
          setShiftChecklist: (nextVal) => {
            setShiftChecklist((prev) => {
              const resolved = typeof nextVal === 'function' ? nextVal(prev) : nextVal;
              shiftChecklistRef.current = resolved;
              return resolved;
            });
          },
          onFinishShift: (evalResult) => {
            setShiftEvaluation(evalResult);
            if (urlParams.isE2E) {
              setCredits((c) => c + evalResult.bonusCredits);
              setClearanceXp((prev) => {
                const nextXp = prev + evalResult.bonusXp;
                if (nextXp >= 100 * clearanceLevel) setClearanceLevel((lvl) => lvl + 1);
                return nextXp;
              });
              setShowDebriefModal(true);
            } else {
              setInGameNotice(
                '[WATCH DUTIES COMPLETE] Off-duty liberty authorized. Report to crew quarters bunk to hand over watch.'
              );
              setTimeout(() => setInGameNotice(null), 4000);
            }
          },
          onNotice: (msg) => {
            setInGameNotice(msg);
            setTimeout(() => setInGameNotice(null), 3000);
          },
        });
      },
      onConsumePaste: () => {
        setVitals((v) => ({ ...v, hunger: Math.min(100, v.hunger + 25) }));
        sendAction({ type: 'CONSUME_ITEM', itemId: 'nutrient_paste' });
      },
      onDrinkWater: () => {
        setVitals((v) => ({ ...v, thirst: Math.min(100, v.thirst + 30) }));
        sendAction({ type: 'CONSUME_ITEM', itemId: 'recycled_water' });
      },
      onRestInBunk: () => {
        setVitals((v) => ({
          ...v,
          fatigue: 0,
          stamina: v.maxStamina || 100,
        }));
        sendAction({ type: 'BUNK_SLEEP', bunkId: 'berth_pod_alpha', active: true });

        const currentShift = shiftChecklistRef.current;
        if (currentShift.phase === 'off_duty' || currentShift.isCompleted) {
          const res = handoverWatchRotation(
            currentShift,
            vitalsRef.current,
            clearanceLevel,
            clearanceXp
          );
          setShiftEvaluation(res.evaluation);
          setCredits((c) => c + res.evaluation.bonusCredits);
          setClearanceXp(res.newClearanceXp);
          if (res.promoted) {
            setClearanceLevel(res.newClearanceLevel);
          }
          setPendingNextShift(res.nextShift);
          setShowDebriefModal(true);
          sendAction({ type: 'WATCH_HANDOVER', bunkId: 'berth_pod_alpha' });
        }
      },
      onVentCoolant: () => sendAction({ type: 'VENT_REACTOR_COOLANT' }),
      onRefillSuit: handleRefillSuit,
      onNotice: (msg) => {
        setInGameNotice(msg);
        setTimeout(() => setInGameNotice(null), 3000);
      },
    });

  // Sync pawn operating / resting state with active interaction
  useEffect(() => {
    if (interaction) {
      const isRest = interaction.actionName.includes('Rest');
      setPawn((p) => ({ ...p, isOperating: !isRest, isResting: isRest }));
    } else {
      setPawn((p) => ({ ...p, isOperating: false, isResting: false }));
    }
  }, [interaction, setPawn]);

  // Keyboard controls for direct station interaction (no modals!)
  useEffect(() => {
    // fallow-ignore-next-line complexity
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'KeyE') {
        if (nearestDoor) {
          handleToggleDoor(nearestDoor.id, !nearestDoor.isOpen);
          return;
        }
        if (
          (nearestStation?.id === 'bridge_helm' || nearestStation?.id === 'bridge_helm_console') &&
          dualProtocol?.stage === 'primed'
        ) {
          sendAction({
            type: 'EXECUTE_DUAL_PROTOCOL',
            protocolId: dualProtocol.protocolId as 'ftl_jump_alignment',
          });
          return;
        }
        if (
          nearestStation?.id === 'armory_sentry' ||
          nearestStation?.id === 'armory_tactical_locker'
        ) {
          setEquippedWeapon((w) => {
            const next =
              w === 'kinetic_carbine'
                ? 'railgun_pistol'
                : w === 'railgun_pistol'
                  ? 'pulse_laser'
                  : w === 'pulse_laser'
                    ? 'arc_welder'
                    : 'kinetic_carbine';
            setInGameNotice(`[ARMORY LOCKER] Equipped: ${next.toUpperCase()}`);
            return next;
          });
          return;
        }
        if (interaction) {
          abortInteraction();
        } else if (nearestStation) {
          startInteraction(nearestStation);
        }
      } else if (e.code === 'KeyH') {
        handleToggleHelmet();
      } else if (e.code === 'KeyP' || (e.code === 'KeyR' && e.shiftKey)) {
        setShowRoleSelect((v) => !v);
      } else if (e.code === 'KeyM') {
        setShowManifestModal((v) => !v);
      } else if (e.code === 'KeyB') {
        setShowBeaconModal((v) => !v);
      } else if (e.code === 'KeyU') {
        const isMuted = ShipAudioEngine.getInstance().busManager?.toggleMute();
        setInGameNotice(isMuted ? '[AUDIO] All Audio Muted' : '[AUDIO] Audio Unmuted');
        setTimeout(() => setInGameNotice(null), 2500);
      } else if (e.code === 'KeyO') {
        setShowAudioModal((v) => !v);
      } else if (e.code === 'Digit1') {
        setEquippedWeapon('kinetic_carbine');
        setInGameNotice('[LOADOUT] Equipped Kinetic Carbine');
      } else if (e.code === 'Digit2') {
        setEquippedWeapon('pulse_laser');
        setInGameNotice('[LOADOUT] Equipped Pulse Laser');
      } else if (e.code === 'Digit3') {
        setEquippedWeapon('arc_welder');
        setInGameNotice('[LOADOUT] Equipped Arc Welder');
      } else if (e.code === 'Digit4') {
        setEquippedWeapon('railgun_pistol');
        setInGameNotice('[LOADOUT] Equipped Railgun Pistol');
      } else if (e.code === 'KeyF') {
        const active = telemetry.boarding?.intruders.find((i) => i.state !== 'neutralized');
        if (active) {
          sendAction({ type: 'ENGAGE_INTRUDER', intruderId: active.id });
          setInGameNotice(`[!] FIRED WEAPON AT ${active.name.toUpperCase()}`);
        }
      } else if (e.code === 'KeyV') {
        handleCycleOverlay();
      } else if (e.code === 'Escape') {
        if (interaction) abortInteraction();
        if (showRoleSelect) setShowRoleSelect(false);
        if (showManifestModal) setShowManifestModal(false);
        if (showBeaconModal) setShowBeaconModal(false);
        if (showAudioModal) setShowAudioModal(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    interaction,
    nearestStation,
    showRoleSelect,
    showManifestModal,
    showBeaconModal,
    showAudioModal,
    dualProtocol,
    startInteraction,
    abortInteraction,
    telemetry.boarding,
    sendAction,
    nearestDoor,
    handleToggleDoor,
    handleToggleHelmet,
    handleCycleOverlay,
  ]);

  const handleCommenceNextShift = useCallback(() => {
    setShowDebriefModal(false);
    sendAction({ type: 'BUNK_SLEEP', bunkId: 'berth_pod_alpha', active: false });
    sendAction({ type: 'WATCH_HANDOVER', bunkId: 'berth_pod_alpha' });

    setShiftChecklist((prev) => {
      const next =
        pendingNextShift ||
        generateShiftChecklist(
          role,
          prev.shiftNumber + 1,
          Date.now(),
          prev.watchSection || 'alpha',
          clearanceLevel
        );
      shiftChecklistRef.current = next;
      return next;
    });
    setPendingNextShift(null);
    setVitals((v) => ({ ...v, fatigue: 0, stamina: v.maxStamina || 100 }));
    ShipAudioEngine.getInstance().playUiClick();
    setInGameNotice(
      `[WATCH ROTATION] Commencing Watch #${shiftChecklistRef.current?.shiftNumber || 1}`
    );
    setTimeout(() => setInGameNotice(null), 3000);
  }, [role, clearanceLevel, pendingNextShift, sendAction]);

  // Main simulation tick loop
  useEffect(() => {
    let lastTime = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(0.25, Math.max(0.01, rawDt));
      tickInteraction(dt);
      const summary = telemetryAtmospheresRef.current?.[currentRoomIdRef.current ?? 'corridor'];
      const cellAtmos = summary
        ? {
            pressureKpa: summary.pressureKpa,
            o2Percent: summary.o2Percent,
            co2Ppm: summary.co2Ppm,
            tempCelsius: summary.tempCelsius,
            toxicSmokePercent: summary.toxicSmokePercent,
            velX: 0,
            velY: 0,
            roomId: summary.roomId,
          }
        : undefined;
      setVitals((v) =>
        updatePlayerVitals(
          v,
          dt,
          Boolean(isRestingRef.current),
          Boolean(isOperatingRef.current),
          cellAtmos
        )
      );
      const curShift = shiftChecklistRef.current;
      if (urlParams.isE2E) {
        (window as unknown as { __shiftChecklist?: ShiftChecklistState }).__shiftChecklist =
          curShift;
      }
      if (!curShift.isCompleted) {
        setShiftElapsedSec(Math.max(0, Math.floor((Date.now() - curShift.startedAt) / 1000)));
      }
    }, 100);

    return () => clearInterval(timer);
  }, [tickInteraction, urlParams.isE2E]);

  // Initialize headless ShipAudioEngine and register user gesture unlock immediately
  useEffect(() => {
    ShipAudioEngine.getInstance().init();
  }, []);

  // Sync live telemetry and vitals to headless ShipAudioEngine
  useEffect(() => {
    ShipAudioEngine.getInstance().updateTelemetry(telemetry, vitals, currentRoomId);
  }, [telemetry, vitals, currentRoomId]);

  // Determine current prompt text for nearest station or hatch
  const promptActionName = useMemo(
    () => resolvePromptActionName(nearestDoor, nearestStation, role, activeDutyId),
    [nearestDoor, nearestStation, role, activeDutyId]
  );

  if (!activeVesselCode) {
    return (
      <>
        <MainMenu
          onCommissionVessel={handleCommissionVessel}
          onBoardVessel={handleBoardVessel}
          onQuickBoard={handleQuickBoard}
          initialBeacon={beaconCode}
          isE2E={urlParams.isE2E}
        />
        {showCharacterCreation && (
          <CharacterCreationModal
            vesselCode={pendingBeaconCode || beaconCode}
            initialProfile={{
              callsign,
              role,
              color: suitColor,
            }}
            onConfirm={handleConfirmDossier}
            onAbort={() => setShowCharacterCreation(false)}
          />
        )}
      </>
    );
  }

  return (
    <div {...stylex.props(styles.container)}>
      <main {...stylex.props(styles.mainLayout)}>
        <VesselCanvas
          pawn={pawn}
          remotePawns={remotePawns}
          vitals={vitals}
          telemetry={telemetry}
          nearestStation={nearestStation}
          nearestDoor={nearestDoor}
          facingAngleRef={facingAngleRef}
          activeInteraction={interaction}
          promptActionName={promptActionName}
          alertLevel={telemetry.alertLevel}
          boarding={telemetry.boarding}
          beaconCode={beaconCode}
          crewCount={crewManifest.length || 1}
          clearanceLevel={clearanceLevel}
          clearanceXp={clearanceXp}
          credits={credits}
          equippedWeapon={equippedWeapon}
          shiftChecklist={shiftChecklist}
          projectedGrade={projectedGrade}
          shiftTimerFormatted={shiftTimerFormatted}
          triageNotice={triageNotice}
          inGameNotice={inGameNotice}
          dualProtocol={dualProtocol}
          collabShift={collabShift}
          currentRoomId={currentRoomId}
          overlayMode={overlayMode}
          onCycleOverlay={handleCycleOverlay}
          onToggleHelmet={handleToggleHelmet}
          onRefillSuit={handleRefillSuit}
          onStationClick={(st) => {
            if (interaction) {
              ShipAudioEngine.getInstance().playUiClick();
              abortInteraction();
            } else {
              ShipAudioEngine.getInstance().playStationInteract();
              startInteraction(st);
            }
          }}
          onFireWeapon={handleFireWeapon}
          onWelderAoe={handleWelderAoe}
          onWeldingStateChange={handleWeldingChange}
          onBeaconClick={() => setShowBeaconModal(true)}
          onManifestClick={() => setShowManifestModal(true)}
          onRoleClick={() => setShowRoleSelect(true)}
          onAudioClick={() => setShowAudioModal(true)}
          onDisembarkClick={handleLeaveShip}
          onEquipWeapon={setEquippedWeapon}
          onAbortInteraction={abortInteraction}
          onExecuteDualProtocol={() => {
            if (dualProtocol) {
              sendAction({
                type: 'EXECUTE_DUAL_PROTOCOL',
                protocolId: dualProtocol.protocolId as 'ftl_jump_alignment',
              });
            }
          }}
          onJoinCollabShift={() => {
            sendAction({
              type: 'CONTRIBUTE_COLLAB_SHIFT',
              shiftId: 'thruster_overhaul',
              stationId: 'cargo',
              active: true,
            });
          }}
        />
      </main>

      {showRoleSelect && (
        <RoleSelectModal
          currentRole={role}
          onSelectRole={(r) => {
            setRole(r);
            resetToSpawn(r);
            setShowRoleSelect(false);
            abortInteraction();
            setShiftChecklist(generateShiftChecklist(r, 1));
            sendAction({
              type: 'JOIN_VESSEL',
              vesselCode: beaconCode,
              callsign,
              role: r,
            });
          }}
          onClose={() => setShowRoleSelect(false)}
        />
      )}

      {showDebriefModal && shiftEvaluation && (
        <ShiftDebriefModal
          evaluation={shiftEvaluation}
          onCommenceNextShift={handleCommenceNextShift}
          onClose={() => setShowDebriefModal(false)}
        />
      )}

      {showBeaconModal && (
        <BeaconLobbyModal
          currentBeacon={beaconCode}
          currentCallsign={callsign}
          onJoin={handleJoinBeacon}
          onClose={() => setShowBeaconModal(false)}
        />
      )}

      {showManifestModal && (
        <CrewManifestModal
          vesselCode={beaconCode}
          crew={crewManifest}
          onClose={() => setShowManifestModal(false)}
        />
      )}

      {showAudioModal && <AudioSettingsModal onClose={() => setShowAudioModal(false)} />}
    </div>
  );
};
