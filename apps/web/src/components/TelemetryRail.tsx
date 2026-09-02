import type { TelemetryDeltaBroadcast } from '@kybernetes/protocol';
import type { RoleDefinition } from '@kybernetes/sim-core';
import { hudColors } from '@kybernetes/ui-tokens/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import { Flame, Shield, Wind } from 'lucide-react';
import type React from 'react';

const styles = stylex.create({
  panel: {
    width: 320,
    backgroundColor: hudColors.bgPanel,
    borderLeftWidth: 1,
    borderLeftStyle: 'solid',
    borderLeftColor: hudColors.borderDim,
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
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
  postingSection: {
    marginTop: 12,
  },
  deptName: {
    fontSize: 12,
    color: hudColors.textPrimary,
    marginBottom: 4,
  },
  deptTrait: {
    fontSize: 11,
    color: hudColors.textSecondary,
  },
});

interface TelemetryRailProps {
  telemetry: TelemetryDeltaBroadcast;
  roleDef: RoleDefinition;
}

export const TelemetryRail: React.FC<TelemetryRailProps> = ({ telemetry, roleDef }) => {
  return (
    <aside {...stylex.props(styles.panel)}>
      <div {...stylex.props(styles.title)}>Telemetry & Subsystems</div>

      <div>
        <div {...stylex.props(styles.statRow)}>
          <span>
            <Flame size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Reactor Thermal
          </span>
          <span>{telemetry.reactorTemp} K</span>
        </div>
        <div {...stylex.props(styles.progressBarBg)}>
          <div
            {...stylex.props(styles.progressBarFill)}
            style={{
              width: `${(telemetry.reactorTemp / telemetry.reactorMaxTemp) * 100}%`,
              backgroundColor: '#ffb000',
            }}
          />
        </div>
      </div>

      <div>
        <div {...stylex.props(styles.statRow)}>
          <span>
            <Wind size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Atmosphere O2
          </span>
          <span>{telemetry.oxygenLevelPercent}%</span>
        </div>
        <div {...stylex.props(styles.progressBarBg)}>
          <div
            {...stylex.props(styles.progressBarFill)}
            style={{
              width: `${telemetry.oxygenLevelPercent}%`,
              backgroundColor: '#00ff66',
            }}
          />
        </div>
      </div>

      <div>
        <div {...stylex.props(styles.statRow)}>
          <span>
            <Shield size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Hull Plating
          </span>
          <span>{telemetry.hullIntegrityPercent}%</span>
        </div>
        <div {...stylex.props(styles.progressBarBg)}>
          <div
            {...stylex.props(styles.progressBarFill)}
            style={{
              width: `${telemetry.hullIntegrityPercent}%`,
              backgroundColor: '#00e5ff',
            }}
          />
        </div>
      </div>

      <div {...stylex.props(styles.postingSection)}>
        <div {...stylex.props(styles.title)}>Department Posting</div>
        <div {...stylex.props(styles.deptName)}>{roleDef.department}</div>
        <div {...stylex.props(styles.deptTrait)}>{roleDef.trait}</div>
      </div>
    </aside>
  );
};
