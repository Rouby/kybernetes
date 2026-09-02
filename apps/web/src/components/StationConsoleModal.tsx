import type {
  DutyDefinition,
  PlayerVitals,
  StartingRole,
  StationFixture,
} from '@kybernetes/protocol';
import { type ActiveDutyState, getDutiesForStation } from '@kybernetes/sim-core';
import { hudColors } from '@kybernetes/ui-tokens/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import { CheckCircle2, Coffee, Moon, Play, PowerOff, ShieldAlert, Utensils, X } from 'lucide-react';
import type React from 'react';

const styles = stylex.create({
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 900,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(6, 8, 12, 0.75)',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    margin: 0,
  },
  modal: {
    position: 'relative',
    zIndex: 1,
    width: 540,
    maxWidth: '92vw',
    backgroundColor: hudColors.bgPanel,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: hudColors.borderHighlight,
    borderRadius: 4,
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    boxShadow: '0 8px 32px rgba(0, 229, 255, 0.2)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: hudColors.borderDim,
    paddingBottom: 10,
  },
  title: {
    fontSize: 15,
    fontWeight: 700,
    letterSpacing: 1.5,
    color: hudColors.cyanTelemetry,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: hudColors.textSecondary,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
    ':hover': {
      color: hudColors.alertRed,
    },
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  dutyCard: {
    padding: 12,
    backgroundColor: hudColors.bgPanelLighter,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: hudColors.borderDim,
    borderRadius: 2,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  dutyHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dutyTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: hudColors.textPrimary,
  },
  dutyDesc: {
    fontSize: 11,
    color: hudColors.textSecondary,
  },
  dutyStats: {
    fontSize: 11,
    color: hudColors.amberTelemetry,
    display: 'flex',
    gap: 12,
  },
  progressBarBg: {
    width: '100%',
    height: 8,
    backgroundColor: hudColors.borderDim,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: hudColors.cyanTelemetry,
    transition: 'width 0.1s linear',
  },
  actionButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '8px 16px',
    backgroundColor: hudColors.bgPanelLighter,
    color: hudColors.textPrimary,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: hudColors.borderBright,
    borderRadius: 2,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    ':hover': {
      borderColor: hudColors.cyanTelemetry,
      color: hudColors.cyanTelemetry,
    },
  },
  sleepButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '10px 20px',
    backgroundColor: hudColors.bgPanelLighter,
    color: hudColors.amberTelemetry,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: hudColors.amberDim,
    borderRadius: 2,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: hudColors.borderDim,
    paddingTop: 10,
    fontSize: 11,
    color: hudColors.textMuted,
  },
});

const BunkCard: React.FC<{
  vitals: PlayerVitals;
  isSleeping: boolean;
  onToggleSleep: () => void;
}> = ({ vitals, isSleeping, onToggleSleep }) => (
  <div {...stylex.props(styles.dutyCard)}>
    <div {...stylex.props(styles.dutyTitle)}>Crew Bunk Rest Cycle</div>
    <div {...stylex.props(styles.dutyDesc)}>
      Occupying your assigned bunk discharges physical fatigue rapidly and regenerates stamina.
    </div>
    <div {...stylex.props(styles.dutyStats)}>
      <span>Fatigue: {Math.round(vitals.fatigue)}%</span>
      <span>
        Stamina: {Math.round(vitals.stamina)} / {Math.round(vitals.maxStamina)}
      </span>
    </div>
    <button
      {...stylex.props(styles.sleepButton)}
      style={{ borderColor: isSleeping ? '#00e5ff' : '#ffb000' }}
      onClick={onToggleSleep}
    >
      <Moon size={16} />
      {isSleeping ? 'WAKE UP FROM BUNK' : 'REST IN BUNK (SLEEP)'}
    </button>
  </div>
);

const DutyProgress: React.FC<{ activeDuty: ActiveDutyState }> = ({ activeDuty }) => {
  const pct = (activeDuty.progressSeconds / activeDuty.durationSeconds) * 100;
  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 10,
          color: '#00e5ff',
          marginBottom: 2,
        }}
      >
        <span>SHIFT PROGRESS</span>
        <span>{Math.round(pct)}%</span>
      </div>
      <div {...stylex.props(styles.progressBarBg)}>
        <div {...stylex.props(styles.progressBarFill)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};

const DutyActionBtn: React.FC<{
  isCurrent: boolean;
  canStart: boolean;
  onStart: () => void;
  onCancel: () => void;
}> = ({ isCurrent, canStart, onStart, onCancel }) => {
  if (isCurrent) {
    return (
      <button
        {...stylex.props(styles.actionButton)}
        style={{ borderColor: '#ff2244', color: '#ff2244' }}
        onClick={onCancel}
      >
        <ShieldAlert size={14} />
        ABORT SHIFT
      </button>
    );
  }
  return (
    <button {...stylex.props(styles.actionButton)} disabled={!canStart} onClick={onStart}>
      <Play size={14} />
      BEGIN SHIFT DUTY
    </button>
  );
};

// fallow-ignore-next-line complexity
function DutyItemCard(props: {
  duty: DutyDefinition;
  isSpecialized: boolean;
  isCurrent: boolean;
  canStart: boolean;
  activeDuty: ActiveDutyState | null;
  onStart: () => void;
  onCancel: () => void;
}) {
  const { duty, isSpecialized, isCurrent, canStart, activeDuty, onStart, onCancel } = props;
  return (
    <div {...stylex.props(styles.dutyCard)}>
      <div {...stylex.props(styles.dutyHeader)}>
        <span {...stylex.props(styles.dutyTitle)}>
          {duty.name}{' '}
          {isSpecialized ? (
            <span style={{ color: '#00ff66', fontSize: 10 }}>[SPECIALIST]</span>
          ) : null}
        </span>
        <span style={{ fontSize: 11, color: '#ffb000' }}>
          +{duty.creditReward}¢ • +{duty.clearanceXp} XP
        </span>
      </div>
      <div {...stylex.props(styles.dutyDesc)}>{duty.description}</div>
      <div {...stylex.props(styles.dutyStats)}>
        <span>Duration: {duty.durationSeconds}s</span>
        <span>Stamina Cost: {duty.staminaCostPerSecond}/s</span>
      </div>

      {isCurrent && activeDuty ? <DutyProgress activeDuty={activeDuty} /> : null}

      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <DutyActionBtn
          isCurrent={isCurrent}
          canStart={canStart}
          onStart={onStart}
          onCancel={onCancel}
        />
      </div>
    </div>
  );
}

interface StationConsoleModalProps {
  station: StationFixture;
  role: StartingRole;
  vitals: PlayerVitals;
  activeDuty: ActiveDutyState | null;
  isSleeping: boolean;
  onClose: () => void;
  onStartDuty: (dutyId: string) => void;
  onCancelDuty: () => void;
  onToggleSleep: () => void;
  onConsumePaste?: () => void;
  onDrinkWater?: () => void;
}

// fallow-ignore-next-line complexity
export const StationConsoleModal: React.FC<StationConsoleModalProps> = ({
  station,
  role,
  vitals,
  activeDuty,
  isSleeping,
  onClose,
  onStartDuty,
  onCancelDuty,
  onToggleSleep,
  onConsumePaste,
  onDrinkWater,
}) => {
  const duties = getDutiesForStation(station.stationType);

  return (
    <div {...stylex.props(styles.overlay)} role="dialog" aria-modal="true">
      <button
        type="button"
        {...stylex.props(styles.backdrop)}
        onClick={onClose}
        aria-label="Close modal backdrop"
      />
      <div {...stylex.props(styles.modal)}>
        <div {...stylex.props(styles.header)}>
          <div {...stylex.props(styles.title)}>
            <CheckCircle2 size={16} />
            <span>{station.name.toUpperCase()}</span>
          </div>
          <button {...stylex.props(styles.closeBtn)} onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div {...stylex.props(styles.content)}>
          {station.stationType === 'bunk' && (
            <BunkCard vitals={vitals} isSleeping={isSleeping} onToggleSleep={onToggleSleep} />
          )}

          {station.id === 'water_dispenser' && (
            <div {...stylex.props(styles.dutyCard)}>
              <div {...stylex.props(styles.dutyTitle)}>Hydration Recycler</div>
              <div {...stylex.props(styles.dutyDesc)}>Dispenses recycled station water.</div>
              <button {...stylex.props(styles.actionButton)} onClick={onDrinkWater}>
                <Coffee size={16} />
                DRINK RECYCLED WATER (+30%)
              </button>
            </div>
          )}

          {station.id === 'paste_dispenser' && (
            <div {...stylex.props(styles.dutyCard)}>
              <div {...stylex.props(styles.dutyTitle)}>Nutrient Paste Synthesizer</div>
              <div {...stylex.props(styles.dutyDesc)}>
                Synthesizes caloric yeast nutrient paste.
              </div>
              <button {...stylex.props(styles.actionButton)} onClick={onConsumePaste}>
                <Utensils size={16} />
                CONSUME NUTRIENT PASTE (+25%)
              </button>
            </div>
          )}

          {duties.length > 0 && (
            <div>
              <div style={{ fontSize: 12, color: '#8a9bb5', marginBottom: 8, fontWeight: 600 }}>
                AVAILABLE SHIFT DUTIES
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {duties.map((d) => (
                  <DutyItemCard
                    key={d.id}
                    duty={d}
                    isSpecialized={d.roleBonus === role}
                    isCurrent={activeDuty ? activeDuty.dutyId === d.id : false}
                    canStart={vitals.stamina >= 10 && activeDuty === null}
                    activeDuty={activeDuty}
                    onStart={() => onStartDuty(d.id)}
                    onCancel={onCancelDuty}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <div {...stylex.props(styles.footer)}>
          <span>PRESS [ESC] OR CLICK OUTSIDE TO UNDOCK</span>
          <button
            {...stylex.props(styles.actionButton)}
            style={{ padding: '4px 10px', fontSize: 11 }}
            onClick={onClose}
          >
            <PowerOff size={12} />
            UNDOCK
          </button>
        </div>
      </div>
    </div>
  );
};
