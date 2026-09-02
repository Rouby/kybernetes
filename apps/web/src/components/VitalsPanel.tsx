import type { PlayerVitals } from '@kybernetes/protocol';
import { hudColors } from '@kybernetes/ui-tokens/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import { Activity, Award, Coffee, Moon, Utensils } from 'lucide-react';
import type React from 'react';

const styles = stylex.create({
  panel: {
    width: 280,
    backgroundColor: hudColors.bgPanel,
    borderRightWidth: 1,
    borderRightStyle: 'solid',
    borderRightColor: hudColors.borderDim,
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    overflowY: 'auto',
  },
  title: {
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: hudColors.textSecondary,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: hudColors.borderDim,
    paddingBottom: 4,
    marginBottom: 4,
  },
  statRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
    fontSize: 13,
  },
  progressBarBg: {
    width: '100%',
    height: 6,
    backgroundColor: hudColors.borderDim,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 2,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
    transition: 'width 0.2s ease',
  },
  button: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '6px 12px',
    backgroundColor: hudColors.bgPanelLighter,
    color: hudColors.textPrimary,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: hudColors.borderBright,
    borderRadius: 2,
    fontSize: 12,
    cursor: 'pointer',
    marginTop: 4,
    ':hover': {
      borderColor: hudColors.cyanTelemetry,
      color: hudColors.cyanTelemetry,
    },
  },
});

interface VitalsPanelProps {
  vitals: PlayerVitals;
  onConsumePaste: () => void;
  onDrinkWater: () => void;
  onRestInBunk: () => void;
}

export const VitalsPanel: React.FC<VitalsPanelProps> = ({
  vitals,
  onConsumePaste,
  onDrinkWater,
  onRestInBunk,
}) => {
  return (
    <aside {...stylex.props(styles.panel)}>
      <div {...stylex.props(styles.title)}>Crew Vitals</div>

      <div>
        <div {...stylex.props(styles.statRow)}>
          <span>
            <Utensils size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Nutrition
          </span>
          <span>{Math.round(vitals.hunger)}%</span>
        </div>
        <div {...stylex.props(styles.progressBarBg)}>
          <div
            {...stylex.props(styles.progressBarFill)}
            style={{
              width: `${vitals.hunger}%`,
              backgroundColor: vitals.hunger < 20 ? '#ff2244' : '#ffb000',
            }}
          />
        </div>
        <button {...stylex.props(styles.button)} onClick={onConsumePaste}>
          Consume Paste (+25%)
        </button>
      </div>

      <div>
        <div {...stylex.props(styles.statRow)}>
          <span>
            <Coffee size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Hydration
          </span>
          <span>{Math.round(vitals.thirst)}%</span>
        </div>
        <div {...stylex.props(styles.progressBarBg)}>
          <div
            {...stylex.props(styles.progressBarFill)}
            style={{
              width: `${vitals.thirst}%`,
              backgroundColor: vitals.thirst < 20 ? '#ff2244' : '#00e5ff',
            }}
          />
        </div>
        <button {...stylex.props(styles.button)} onClick={onDrinkWater}>
          Drink Water (+30%)
        </button>
      </div>

      <div>
        <div {...stylex.props(styles.statRow)}>
          <span>
            <Moon size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Fatigue
          </span>
          <span>{Math.round(vitals.fatigue)}%</span>
        </div>
        <div {...stylex.props(styles.progressBarBg)}>
          <div
            {...stylex.props(styles.progressBarFill)}
            style={{
              width: `${vitals.fatigue}%`,
              backgroundColor: vitals.fatigue > 80 ? '#ff2244' : '#ffb000',
            }}
          />
        </div>
        <button {...stylex.props(styles.button)} onClick={onRestInBunk}>
          Rest in Bunk (-40%)
        </button>
      </div>

      <div>
        <div {...stylex.props(styles.statRow)}>
          <span>
            <Activity size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Stamina
          </span>
          <span>
            {Math.round(vitals.stamina)} / {Math.round(vitals.maxStamina)}
          </span>
        </div>
        <div {...stylex.props(styles.progressBarBg)}>
          <div
            {...stylex.props(styles.progressBarFill)}
            style={{
              width: `${(vitals.stamina / vitals.maxStamina) * 100}%`,
              backgroundColor: '#00ff66',
            }}
          />
        </div>
      </div>

      <div>
        <div {...stylex.props(styles.statRow)}>
          <span>
            <Award size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Vitality
          </span>
          <span>{Math.round(vitals.health)}%</span>
        </div>
        <div {...stylex.props(styles.progressBarBg)}>
          <div
            {...stylex.props(styles.progressBarFill)}
            style={{ width: `${vitals.health}%`, backgroundColor: '#00e5ff' }}
          />
        </div>
      </div>
    </aside>
  );
};
