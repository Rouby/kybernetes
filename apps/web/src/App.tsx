import type { StartingRole, StationFixture, TelemetryDeltaBroadcast } from '@kybernetes/protocol';
import {
  createInitialPlayerVitals,
  createInitialVesselState,
  getRoleDefinition,
  updatePlayerVitals,
} from '@kybernetes/sim-core';
import { hudColors } from '@kybernetes/ui-tokens/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import { User } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { RoleSelectModal } from './components/RoleSelectModal';
import { StationConsoleModal } from './components/StationConsoleModal';
import { TelemetryRail } from './components/TelemetryRail';
import { VesselCanvas } from './components/VesselCanvas';
import { VitalsPanel } from './components/VitalsPanel';
import { useDutyProgression } from './hooks/useDutyProgression';
import { usePawnMovement } from './hooks/usePawnMovement';

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
    backgroundColor: hudColors.phosphorGreen,
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
});

export const App: React.FC = () => {
  const [telemetry] = useState<TelemetryDeltaBroadcast>(() => ({
    type: 'TELEMETRY_DELTA',
    timestamp: Date.now(),
    ...createInitialVesselState(),
  }));

  const [role, setRole] = useState<StartingRole>('wiper');
  const [showRoleSelect, setShowRoleSelect] = useState(false);
  const [dockedStation, setDockedStation] = useState<StationFixture | null>(null);
  const [isSleeping, setIsSleeping] = useState(false);
  const [vitals, setVitals] = useState(createInitialPlayerVitals);

  const { pawn, setPawn, nearestStation, resetToSpawn } = usePawnMovement(role);
  const {
    activeDuty,
    credits,
    clearanceXp,
    clearanceLevel,
    startNewDuty,
    cancelActiveDuty,
    tickDuty,
  } = useDutyProgression(role);

  const roleDef = getRoleDefinition(role);

  const handleDock = useCallback(
    (st: StationFixture) => {
      setDockedStation(st);
      setPawn((p) => ({ ...p, isOperating: true }));
    },
    [setPawn]
  );

  const handleUndock = useCallback(() => {
    setDockedStation(null);
    setIsSleeping(false);
    setPawn((p) => ({ ...p, isOperating: false, isResting: false }));
  }, [setPawn]);

  useEffect(() => {
    // fallow-ignore-next-line complexity
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'KeyE') {
        if (dockedStation) handleUndock();
        else if (nearestStation) handleDock(nearestStation);
      } else if (e.code === 'Escape') {
        if (dockedStation) handleUndock();
        if (showRoleSelect) setShowRoleSelect(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dockedStation, nearestStation, showRoleSelect, handleDock, handleUndock]);

  useEffect(() => {
    const timer = setInterval(() => {
      const dt = 0.2;
      setVitals((v) => {
        const nextVitals = updatePlayerVitals(v, dt, isSleeping, Boolean(activeDuty));
        const staminaCost = tickDuty(dt, nextVitals);
        return { ...nextVitals, stamina: Math.max(0, nextVitals.stamina - staminaCost) };
      });
    }, 200);

    return () => clearInterval(timer);
  }, [activeDuty, isSleeping, tickDuty]);

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
          <VesselCanvas pawn={pawn} nearestStation={nearestStation} onStationClick={handleDock} />
          <div {...stylex.props(styles.viewportOverlayHelp)}>
            <span>
              <strong>[W][A][S][D]</strong> Locomotion
            </span>
            <span>
              <strong>[E]</strong> {nearestStation ? nearestStation.name : 'Interact'}
            </span>
            <span>
              <strong>[ESC]</strong> Undock
            </span>
          </div>
        </section>

        <TelemetryRail telemetry={telemetry} roleDef={roleDef} />
      </main>

      <footer {...stylex.props(styles.footer)}>
        <div>
          <span {...stylex.props(styles.onlineIndicator)} />
          <span>
            VESSEL DAEMON: SYNCED (10 Hz) • POS: ({Math.round(pawn.x)}, {Math.round(pawn.y)})
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
            handleUndock();
          }}
          onClose={() => setShowRoleSelect(false)}
        />
      )}

      {dockedStation && (
        <StationConsoleModal
          station={dockedStation}
          role={role}
          vitals={vitals}
          activeDuty={activeDuty}
          isSleeping={isSleeping}
          onClose={handleUndock}
          onStartDuty={(id) => dockedStation && startNewDuty(id, dockedStation.id)}
          onCancelDuty={cancelActiveDuty}
          onToggleSleep={() => {
            const next = !isSleeping;
            setIsSleeping(next);
            setPawn((p) => ({ ...p, isResting: next }));
          }}
          onConsumePaste={() => setVitals((v) => ({ ...v, hunger: Math.min(100, v.hunger + 25) }))}
          onDrinkWater={() => setVitals((v) => ({ ...v, thirst: Math.min(100, v.thirst + 30) }))}
        />
      )}
    </div>
  );
};
