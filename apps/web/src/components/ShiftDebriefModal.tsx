import type { ShiftEvaluation } from '@kybernetes/protocol';
import { hudColors } from '@kybernetes/ui-tokens/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import { Award, CheckCircle2, Clock, HeartPulse, X } from 'lucide-react';
import type React from 'react';
import { useEffect } from 'react';
import { ShipAudioEngine } from '../audio/ShipAudioEngine';

const styles = stylex.create({
  scrimOverlay: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1100,
  },
  scrimBackdrop: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(5, 7, 11, 0.92)',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    margin: 0,
  },
  panel: {
    position: 'relative',
    zIndex: 2,
    width: 540,
    maxWidth: '92vw',
    backgroundColor: hudColors.bgPanel,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: hudColors.cyanTelemetry,
    borderRadius: 4,
    padding: 24,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    boxShadow: '0 12px 40px rgba(0, 0, 0, 0.85)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: hudColors.borderDim,
    paddingBottom: 12,
  },
  titleGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: 2,
    color: hudColors.cyanTelemetry,
    margin: 0,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: hudColors.textMuted,
    cursor: 'pointer',
    padding: 4,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradeHero: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    padding: 16,
    backgroundColor: hudColors.bgPanelLighter,
    borderRadius: 4,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: hudColors.borderDim,
  },
  gradeBadge: {
    fontSize: 48,
    fontWeight: 900,
    fontFamily: 'monospace',
    padding: '4px 20px',
    borderRadius: 4,
    borderWidth: 2,
    borderStyle: 'solid',
  },
  gradeDetails: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  gradeLabel: {
    fontSize: 10,
    letterSpacing: 1.5,
    color: hudColors.textMuted,
  },
  gradeTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: hudColors.textPrimary,
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 10,
  },
  statCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 12px',
    backgroundColor: hudColors.bgPanelLighter,
    borderRadius: 3,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: hudColors.borderDim,
  },
  statIcon: {
    color: hudColors.cyanTelemetry,
  },
  statInfo: {
    display: 'flex',
    flexDirection: 'column',
  },
  statLabel: {
    fontSize: 9,
    color: hudColors.textMuted,
    letterSpacing: 1,
  },
  statVal: {
    fontSize: 12,
    fontWeight: 700,
    color: hudColors.textPrimary,
    fontFamily: 'monospace',
  },
  evalRemarksBox: {
    padding: '10px 14px',
    backgroundColor: 'rgba(0, 229, 255, 0.05)',
    borderLeftWidth: 3,
    borderLeftStyle: 'solid',
    borderLeftColor: hudColors.cyanTelemetry,
    borderRadius: '0 3px 3px 0',
  },
  evalRemarksText: {
    fontSize: 11,
    lineHeight: 1.5,
    color: '#b0c4de',
    margin: 0,
    fontStyle: 'italic',
  },
  promotionBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 14px',
    backgroundColor: 'rgba(0, 255, 136, 0.1)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#00ff88',
    borderRadius: 3,
  },
  promotionText: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1.2,
    color: '#00ff88',
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 4,
  },
  commenceBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 20px',
    backgroundColor: hudColors.cyanTelemetry,
    color: hudColors.bgVoid,
    border: 'none',
    borderRadius: 3,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1.5,
    cursor: 'pointer',
    transition: 'opacity 0.15s ease',
  },
});

function formatSeconds(totalSec: number): string {
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function getGradePresentation(grade: string) {
  if (grade === 'S') return { color: '#00ff88', title: 'EXCEPTIONAL MERIT (TIER 1)' };
  if (grade === 'A') return { color: '#00e5ff', title: 'SUPERIOR OPERATIONAL CADENCE' };
  if (grade === 'B') return { color: '#ffb000', title: 'STANDARD DEPARTMENTAL ROTATION' };
  return { color: '#ff3344', title: 'DEFICIENT CADENCE / REQUIRING COUNSEL' };
}

interface StatItemProps {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}

function StatItem({ icon, label, value }: StatItemProps) {
  return (
    <div {...stylex.props(styles.statCard)}>
      <span {...stylex.props(styles.statIcon)}>{icon}</span>
      <div {...stylex.props(styles.statInfo)}>
        <span {...stylex.props(styles.statLabel)}>{label}</span>
        <span {...stylex.props(styles.statVal)}>{value}</span>
      </div>
    </div>
  );
}

interface ShiftDebriefModalProps {
  evaluation: ShiftEvaluation;
  onCommenceNextShift: () => void;
  onClose: () => void;
}

// fallow-ignore-next-line complexity
export const ShiftDebriefModal: React.FC<ShiftDebriefModalProps> = ({
  evaluation,
  onCommenceNextShift,
  onClose,
}) => {
  const { color: gradeColor, title: gradeTitle } = getGradePresentation(evaluation.grade);

  useEffect(() => {
    ShipAudioEngine.getInstance().playDebriefStamp();
  }, []);

  return (
    <div {...stylex.props(styles.scrimOverlay)} data-testid="shift-debrief-modal">
      <button
        type="button"
        {...stylex.props(styles.scrimBackdrop)}
        onClick={onClose}
        aria-label="Close modal backdrop"
      />

      <div {...stylex.props(styles.panel)}>
        <div {...stylex.props(styles.header)}>
          <div {...stylex.props(styles.titleGroup)}>
            <Award size={16} color={hudColors.cyanTelemetry} />
            <h2 {...stylex.props(styles.title)}>
              SHIFT DEBRIEF {'//'} WATCH #{evaluation.shiftNumber}
            </h2>
          </div>
          <button
            type="button"
            {...stylex.props(styles.closeBtn)}
            onClick={onClose}
            aria-label="Close modal"
          >
            <X size={16} />
          </button>
        </div>

        <div {...stylex.props(styles.gradeHero)}>
          <div
            {...stylex.props(styles.gradeBadge)}
            style={{
              color: gradeColor,
              borderColor: gradeColor,
              boxShadow: `0 0 16px ${gradeColor}44`,
            }}
          >
            {evaluation.grade}
          </div>
          <div {...stylex.props(styles.gradeDetails)}>
            <span {...stylex.props(styles.gradeLabel)}>OVERALL PERFORMANCE EVALUATION</span>
            <span {...stylex.props(styles.gradeTitle)}>{gradeTitle}</span>
          </div>
        </div>

        <div {...stylex.props(styles.statsGrid)}>
          <StatItem
            icon={<Clock size={16} />}
            label="WATCH DURATION"
            value={formatSeconds(evaluation.elapsedSeconds)}
          />
          <StatItem
            icon={<HeartPulse size={16} />}
            label="AVG CREW VITALS"
            value={`${evaluation.vitalsAverage}%`}
          />
          <StatItem
            icon={<CheckCircle2 size={16} />}
            label="CREDIT REMUNERATION"
            value={`+${evaluation.baseCredits} + ${evaluation.bonusCredits} bonus Cr`}
          />
          <StatItem
            icon={<Award size={16} />}
            label="CLEARANCE XP"
            value={`+${evaluation.baseXp} + ${evaluation.bonusXp} bonus XP`}
          />
        </div>

        {evaluation.promoted && (
          <div {...stylex.props(styles.promotionBanner)}>
            <Award size={16} color="#00ff88" />
            <span {...stylex.props(styles.promotionText)}>
              PROMOTED TO {evaluation.rankTitle?.toUpperCase()} [{evaluation.rankBadge}] — SALARY
              BONUS UNLOCKED
            </span>
          </div>
        )}

        <div {...stylex.props(styles.evalRemarksBox)}>
          <p {...stylex.props(styles.evalRemarksText)}>"{evaluation.evaluationText}"</p>
        </div>

        <div {...stylex.props(styles.actions)}>
          <button
            type="button"
            data-testid="btn-next-shift"
            {...stylex.props(styles.commenceBtn)}
            onClick={onCommenceNextShift}
          >
            COMMENCE NEXT WATCH SHIFT
          </button>
        </div>
      </div>
    </div>
  );
};
