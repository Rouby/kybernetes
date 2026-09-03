import type {
  PlayerVitals,
  ShiftChecklistState,
  ShiftEvaluation,
  StartingRole,
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
  updatePlayerVitals,
} from '@kybernetes/sim-core';
import { hudColors } from '@kybernetes/ui-tokens/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
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

  const { triageNotice, remotePawns, crewManifest, dualProtocol, collabShift, sendAction } =
    useVesselSocket(setTelemetry, activeVesselCode, {
      callsign,
      role,
      color: suitColor,
      userId,
    });

  const { pawn, setPawn, nearestStation, resetToSpawn } = usePawnMovement(
    role,
    telemetry.boarding?.doors
  );

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

  const handleToggleDoor = (doorId: string, open: boolean) => {
    sendAction({
      type: 'TOGGLE_DOOR',
      doorId,
      open,
    });
  };

  const activeDutyId = shiftChecklist.tasks[shiftChecklist.currentTaskIndex]?.dutyId;

  const { interaction, startInteraction, abortInteraction, tickInteraction } =
    useStationInteraction({
      role,
      activeDutyId,
      onCompleteDuty: (dutyId) => {
        processShiftDutyCompletion({
          dutyId,
          role,
          shiftChecklist,
          vitals,
          onReward: (creditsDelta, xpDelta) => {
            setCredits((c) => c + creditsDelta);
            setClearanceXp((prev) => {
              const nextXp = prev + xpDelta;
              if (nextXp >= 100 * clearanceLevel) setClearanceLevel((lvl) => lvl + 1);
              return nextXp;
            });
          },
          setShiftChecklist,
          onFinishShift: (evalResult) => {
            setShiftEvaluation(evalResult);
            setCredits((c) => c + evalResult.bonusCredits);
            setClearanceXp((prev) => {
              const nextXp = prev + evalResult.bonusXp;
              if (nextXp >= 100 * clearanceLevel) setClearanceLevel((lvl) => lvl + 1);
              return nextXp;
            });
            setShowDebriefModal(true);
            setInGameNotice(
              `[SHIFT #${shiftChecklist.shiftNumber} COMPLETE] Rating: Grade ${evalResult.grade}!`
            );
            setTimeout(() => setInGameNotice(null), 3000);
          },
          onNotice: (msg) => {
            setInGameNotice(msg);
            setTimeout(() => setInGameNotice(null), 3000);
          },
        });
      },
      onConsumePaste: () => setVitals((v) => ({ ...v, hunger: Math.min(100, v.hunger + 25) })),
      onDrinkWater: () => setVitals((v) => ({ ...v, thirst: Math.min(100, v.thirst + 30) })),
      onRestInBunk: () =>
        setVitals((v) => ({
          ...v,
          fatigue: Math.max(0, v.fatigue - 40),
          stamina: Math.min(100, v.stamina + 30),
        })),
      onVentCoolant: () => sendAction({ type: 'VENT_REACTOR_COOLANT' }),
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
        if (nearestStation?.id === 'bridge_helm' && dualProtocol?.stage === 'primed') {
          sendAction({
            type: 'EXECUTE_DUAL_PROTOCOL',
            protocolId: dualProtocol.protocolId as 'ftl_jump_alignment',
          });
          return;
        }
        if (nearestStation?.id === 'armory_sentry') {
          setEquippedWeapon((w) => {
            const next =
              w === 'kinetic_carbine'
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
      } else if (e.code === 'KeyF') {
        const active = telemetry.boarding?.intruders.find((i) => i.state !== 'neutralized');
        if (active) {
          sendAction({ type: 'ENGAGE_INTRUDER', intruderId: active.id });
          setInGameNotice(`[!] FIRED WEAPON AT ${active.name.toUpperCase()}`);
        }
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
  ]);

  const handleCommenceNextShift = useCallback(() => {
    setShowDebriefModal(false);
    setShiftChecklist((prev) => {
      const nextShift = generateShiftChecklist(role, prev.shiftNumber + 1);
      return nextShift;
    });
    setInGameNotice(`[WATCH ROTATION] Commencing Shift #${shiftChecklist.shiftNumber + 1}`);
    setTimeout(() => setInGameNotice(null), 3000);
  }, [role, shiftChecklist.shiftNumber]);

  // Main simulation tick loop
  useEffect(() => {
    const timer = setInterval(() => {
      const dt = 0.1;
      tickInteraction(dt);
      setVitals((v) =>
        updatePlayerVitals(v, dt, Boolean(pawn.isResting), Boolean(pawn.isOperating))
      );
      if (!shiftChecklist.isCompleted) {
        setShiftElapsedSec(Math.max(0, Math.floor((Date.now() - shiftChecklist.startedAt) / 1000)));
      }
    }, 100);

    return () => clearInterval(timer);
  }, [
    tickInteraction,
    pawn.isResting,
    pawn.isOperating,
    shiftChecklist.isCompleted,
    shiftChecklist.startedAt,
  ]);

  // Initialize headless ShipAudioEngine and register user gesture unlock immediately
  useEffect(() => {
    ShipAudioEngine.getInstance().init();
  }, []);

  // Sync live telemetry and vitals to headless ShipAudioEngine
  useEffect(() => {
    const currentRoom = HESPERIA_ROOMS.find(
      (r) => pawn.x >= r.x && pawn.x <= r.x + r.width && pawn.y >= r.y && pawn.y <= r.y + r.height
    )?.id;
    ShipAudioEngine.getInstance().updateTelemetry(telemetry, vitals, currentRoom);
  }, [telemetry, vitals, pawn.x, pawn.y]);

  // Determine current prompt text for nearest station
  const nearestActionConfig = useMemo(() => {
    return nearestStation ? getStationActionConfig(nearestStation, role, activeDutyId) : null;
  }, [nearestStation, role, activeDutyId]);

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
          activeInteraction={interaction}
          promptActionName={nearestActionConfig?.actionName}
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
          onToggleDoor={handleToggleDoor}
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
