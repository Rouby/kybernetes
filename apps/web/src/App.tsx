import type {
  NavalDamageEventType,
  StartingRole,
  TelemetryDeltaBroadcast,
} from '@kybernetes/protocol';
import {
  calculateDutyRewards,
  createInitialPlayerVitals,
  createInitialVesselState,
  getRoleDefinition,
  updatePlayerVitals,
} from '@kybernetes/sim-core';
import { hudColors } from '@kybernetes/ui-tokens/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import { User, X } from 'lucide-react';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { RoleSelectModal } from './components/RoleSelectModal';
import { TelemetryRail } from './components/TelemetryRail';
import { VesselCanvas } from './components/VesselCanvas';
import { VitalsPanel } from './components/VitalsPanel';
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
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 16px',
    backgroundColor: hudColors.bgPanel,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: hudColors.borderDim,
  },
  logoGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: 2,
    color: hudColors.cyanTelemetry,
  },
  badge: {
    fontSize: 11,
    padding: '2px 6px',
    borderRadius: 2,
    backgroundColor: hudColors.borderDim,
    color: hudColors.amberTelemetry,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: hudColors.amberDim,
  },
  interactiveBadge: {
    fontSize: 11,
    padding: '2px 8px',
    borderRadius: 2,
    backgroundColor: hudColors.bgPanelLighter,
    color: hudColors.cyanTelemetry,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: hudColors.borderHighlight,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  mainLayout: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  centerViewport: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    backgroundColor: '#040609',
    overflow: 'hidden',
  },
  triageNoticeBanner: {
    position: 'absolute',
    top: 16,
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: 'rgba(15, 20, 29, 0.95)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: hudColors.cyanTelemetry,
    borderRadius: 3,
    padding: '8px 16px',
    color: hudColors.cyanTelemetry,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 1,
    zIndex: 10,
    pointerEvents: 'none',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 16px',
    backgroundColor: hudColors.bgPanel,
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: hudColors.borderDim,
    fontSize: 11,
    color: hudColors.textMuted,
  },
  onlineIndicator: {
    display: 'inline-block',
    width: 8,
    height: 8,
    borderRadius: '50%',
    marginRight: 6,
  },
  viewportOverlayHelp: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    padding: '6px 12px',
    backgroundColor: 'rgba(15, 20, 29, 0.85)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: hudColors.borderDim,
    borderRadius: 3,
    fontSize: 11,
    color: hudColors.textSecondary,
    pointerEvents: 'none',
    display: 'flex',
    gap: 12,
  },
  leanInteractionBar: {
    position: 'absolute',
    bottom: 48,
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: 'rgba(10, 16, 26, 0.94)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: hudColors.cyanTelemetry,
    borderRadius: 4,
    padding: '8px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    minWidth: 280,
    zIndex: 10,
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.5)',
  },
  leanActionRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  leanActionTitle: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1,
    color: hudColors.cyanTelemetry,
    fontFamily: 'monospace',
  },
  leanActionPercent: {
    fontSize: 12,
    fontWeight: 700,
    color: hudColors.textPrimary,
    fontFamily: 'monospace',
  },
  leanTrack: {
    width: '100%',
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  leanFill: {
    height: '100%',
    borderRadius: 3,
    transition: 'width 0.1s linear',
  },
  leanAbortBtn: {
    alignSelf: 'flex-end',
    marginTop: 2,
    fontSize: 10,
    fontWeight: 700,
    padding: '3px 8px',
    borderRadius: 2,
    backgroundColor: 'rgba(255, 34, 68, 0.2)',
    color: hudColors.alertRed,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: hudColors.alertRed,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
});

// fallow-ignore-next-line complexity
export const App: React.FC = () => {
  const [telemetry, setTelemetry] = useState<TelemetryDeltaBroadcast>(() => ({
    type: 'TELEMETRY_DELTA',
    timestamp: Date.now(),
    ...createInitialVesselState(),
  }));

  const [role, setRole] = useState<StartingRole>('wiper');
  const [showRoleSelect, setShowRoleSelect] = useState(false);
  const [vitals, setVitals] = useState(createInitialPlayerVitals);
  const [credits, setCredits] = useState(120);
  const [clearanceXp, setClearanceXp] = useState(0);
  const [clearanceLevel, setClearanceLevel] = useState(1);
  const [inGameNotice, setInGameNotice] = useState<string | null>(null);

  const { wsConnected, triageNotice, sendAction } = useVesselSocket(setTelemetry);
  const { pawn, setPawn, nearestStation, resetToSpawn } = usePawnMovement(role);

  const roleDef = getRoleDefinition(role);

  const { interaction, startInteraction, abortInteraction, tickInteraction } =
    useStationInteraction({
      role,
      onCompleteDuty: (dutyId) => {
        const rew = calculateDutyRewards(dutyId, role);
        setCredits((c) => c + rew.credits);
        setClearanceXp((xp) => {
          const nextXp = xp + rew.xp;
          if (nextXp >= 100 * clearanceLevel) setClearanceLevel((lvl) => lvl + 1);
          return nextXp;
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
        if (interaction) {
          abortInteraction();
        } else if (nearestStation) {
          startInteraction(nearestStation);
        }
      } else if (e.code === 'KeyF') {
        const active = telemetry.boarding?.intruders.find((i) => i.state !== 'neutralized');
        if (active) {
          sendAction({ type: 'ENGAGE_INTRUDER', intruderId: active.id });
          setInGameNotice(`[!] FIRED WEAPON AT ${active.name.toUpperCase()}`);
        }
      } else if (e.code === 'Escape') {
        if (interaction) {
          abortInteraction();
        }
        if (showRoleSelect) setShowRoleSelect(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    interaction,
    nearestStation,
    showRoleSelect,
    startInteraction,
    abortInteraction,
    telemetry.boarding,
    sendAction,
  ]);

  // Main simulation tick loop
  useEffect(() => {
    const timer = setInterval(() => {
      const dt = 0.1;
      tickInteraction(dt);
      setVitals((v) =>
        updatePlayerVitals(v, dt, Boolean(pawn.isResting), Boolean(pawn.isOperating))
      );
    }, 100);

    return () => clearInterval(timer);
  }, [tickInteraction, pawn.isResting, pawn.isOperating]);

  // Determine current prompt text for nearest station
  const nearestActionConfig = useMemo(() => {
    return nearestStation ? getStationActionConfig(nearestStation, role) : null;
  }, [nearestStation, role]);

  return (
    <div {...stylex.props(styles.container)}>
      <header {...stylex.props(styles.header)}>
        <div {...stylex.props(styles.logoGroup)}>
          <span {...stylex.props(styles.title)}>KYBERNETES</span>
          <span {...stylex.props(styles.badge)}>VESSEL: {telemetry.shipName}</span>
          <button
            {...stylex.props(styles.interactiveBadge)}
            onClick={() => setShowRoleSelect(true)}
            title="Click to change origin role"
          >
            <User size={12} />
            <span>
              ROLE: {roleDef.name.toUpperCase()} ({roleDef.badge})
            </span>
          </button>
        </div>
        <div {...stylex.props(styles.logoGroup)}>
          <span {...stylex.props(styles.badge)}>
            CLEARANCE: LVL {clearanceLevel} ({clearanceXp} XP)
          </span>
          <span {...stylex.props(styles.badge)}>CREDITS: {credits} ¢</span>
        </div>
      </header>

      <main {...stylex.props(styles.mainLayout)}>
        <VitalsPanel
          vitals={vitals}
          onConsumePaste={() => setVitals((v) => ({ ...v, hunger: Math.min(100, v.hunger + 25) }))}
          onDrinkWater={() => setVitals((v) => ({ ...v, thirst: Math.min(100, v.thirst + 30) }))}
          onRestInBunk={() => setVitals((v) => ({ ...v, fatigue: Math.max(0, v.fatigue - 40) }))}
        />

        <section
          {...stylex.props(styles.centerViewport)}
          style={{ position: 'relative', flex: 1, height: '100%', overflow: 'hidden' }}
        >
          {(triageNotice || inGameNotice) && (
            <div {...stylex.props(styles.triageNoticeBanner)}>{inGameNotice || triageNotice}</div>
          )}

          <VesselCanvas
            pawn={pawn}
            nearestStation={nearestStation}
            activeInteraction={interaction}
            promptActionName={nearestActionConfig?.actionName}
            alertLevel={telemetry.alertLevel}
            activeFires={telemetry.activeFires}
            breaches={telemetry.hull?.breaches}
            boarding={telemetry.boarding}
            onStationClick={(st) => {
              if (interaction) abortInteraction();
              else startInteraction(st);
            }}
            onEngageIntruder={(id) => {
              sendAction({ type: 'ENGAGE_INTRUDER', intruderId: id });
              setInGameNotice('[!] FIRED WEAPON AT INTRUDER');
            }}
          />

          {/* In-Game Round Progress Bar Lean HUD Overlay */}
          {interaction && (
            <div {...stylex.props(styles.leanInteractionBar)}>
              <div {...stylex.props(styles.leanActionRow)}>
                <span {...stylex.props(styles.leanActionTitle)}>
                  SHIFT PROGRESS: {interaction.actionName.toUpperCase()}
                </span>
                <span {...stylex.props(styles.leanActionPercent)}>
                  {Math.round(interaction.progress * 100)}%
                </span>
              </div>
              <div {...stylex.props(styles.leanTrack)}>
                <div
                  {...stylex.props(styles.leanFill)}
                  style={{
                    width: `${Math.round(interaction.progress * 100)}%`,
                    backgroundColor: interaction.color || '#00e5ff',
                  }}
                />
              </div>
              <button
                {...stylex.props(styles.leanAbortBtn)}
                onClick={abortInteraction}
                title="Abort Shift"
              >
                <X size={10} />
                <span>ABORT SHIFT [ESC]</span>
              </button>
            </div>
          )}

          <div {...stylex.props(styles.viewportOverlayHelp)}>
            <span>
              <strong>[W][A][S][D]</strong> Locomotion
            </span>
            <span>
              <strong>[E]</strong>{' '}
              {interaction
                ? `Abort Shift (${Math.round(interaction.progress * 100)}%)`
                : nearestStation
                  ? `${nearestStation.name} — ${nearestActionConfig?.actionName || 'Interact'}`
                  : 'Interact'}
            </span>
            <span>
              <strong>[F]</strong> Fire
            </span>
            <span>
              <strong>[ESC]</strong> Abort
            </span>
          </div>
        </section>

        <TelemetryRail
          telemetry={telemetry}
          roleDef={roleDef}
          onToggleBattleStations={(level) => {
            sendAction({ type: 'TOGGLE_BATTLE_STATIONS', alertLevel: level });
            setTelemetry((t) => ({ ...t, alertLevel: level }));
          }}
          onTriggerPdtIntercept={(eventId) =>
            sendAction({ type: 'TRIGGER_PDT_INTERCEPT', eventId })
          }
          onDeployFireSuppression={(roomId) =>
            sendAction({ type: 'DEPLOY_FIRE_SUPPRESSION', roomId })
          }
          onEmergencyHullRepair={(roomId) => sendAction({ type: 'EMERGENCY_HULL_REPAIR', roomId })}
          onVentReactorCoolant={() => sendAction({ type: 'VENT_REACTOR_COOLANT' })}
          onTriggerNavalEvent={(eventType: NavalDamageEventType) =>
            sendAction({ type: 'TRIGGER_NAVAL_EVENT', eventType })
          }
          onTriggerBoarding={(roomId) =>
            sendAction({ type: 'TRIGGER_BOARDING_EVENT', breachRoomId: roomId })
          }
          onEngageIntruder={(id) => {
            sendAction({ type: 'ENGAGE_INTRUDER', intruderId: id });
            setInGameNotice('[!] ENGAGING HOSTILE RAIDER');
          }}
          onBulkheadLock={(roomId, locked) =>
            sendAction({ type: 'BULKHEAD_LOCK', bulkheadId: roomId, locked })
          }
          onVentCompartment={(roomId, venting) =>
            sendAction({ type: 'VENT_COMPARTMENT', compartmentId: roomId, venting })
          }
          onDeploySentry={(roomId) => sendAction({ type: 'DEPLOY_SENTRY', roomId })}
        />
      </main>

      <footer {...stylex.props(styles.footer)}>
        <div>
          <span
            {...stylex.props(styles.onlineIndicator)}
            style={{ backgroundColor: wsConnected ? '#00ff66' : '#ffb000' }}
          />
          <span>
            VESSEL DAEMON: {wsConnected ? 'SYNCED (10 Hz)' : 'CONNECTING...'} • POS: (
            {Math.round(pawn.x)}, {Math.round(pawn.y)})
          </span>
        </div>
        <div>
          <span>TURBOREPO MONOREPO • REACT 19 • STYLEX • TS 7 • VITE 8</span>
        </div>
      </footer>

      {showRoleSelect && (
        <RoleSelectModal
          currentRole={role}
          onSelectRole={(r) => {
            setRole(r);
            resetToSpawn(r);
            setShowRoleSelect(false);
            abortInteraction();
          }}
          onClose={() => setShowRoleSelect(false)}
        />
      )}
    </div>
  );
};
