import type { CrewManifestBroadcast } from '@kybernetes/protocol';
import { hudColors } from '@kybernetes/ui-tokens/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import { Radio, Users, X } from 'lucide-react';
import type React from 'react';

const styles = stylex.create({
  scrimOverlay: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1050,
  },
  scrimBackdrop: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(5, 7, 11, 0.88)',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    margin: 0,
  },
  manifestPanel: {
    position: 'relative',
    zIndex: 2,
    width: 620,
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
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.7)',
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
    fontSize: 14,
    fontWeight: 700,
    letterSpacing: 2,
    color: hudColors.cyanTelemetry,
    margin: 0,
  },
  beaconBadge: {
    fontSize: 11,
    padding: '2px 8px',
    borderRadius: 2,
    backgroundColor: hudColors.bgPanelLighter,
    color: hudColors.amberTelemetry,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: hudColors.amberDim,
    fontFamily: 'monospace',
    fontWeight: 700,
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
  rosterList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    maxHeight: 380,
    overflowY: 'auto',
  },
  crewCard: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    backgroundColor: hudColors.bgPanelLighter,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: hudColors.borderDim,
    borderRadius: 3,
  },
  crewMeta: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  crewCallsign: {
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: 1,
    color: hudColors.textPrimary,
  },
  crewRole: {
    fontSize: 11,
    color: hudColors.textSecondary,
    fontFamily: 'monospace',
  },
  statusBadge: {
    fontSize: 10,
    fontWeight: 700,
    padding: '2px 8px',
    borderRadius: 2,
    borderWidth: 1,
    borderStyle: 'solid',
    fontFamily: 'monospace',
    textTransform: 'uppercase',
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: hudColors.borderDim,
    fontSize: 11,
    color: hudColors.textMuted,
  },
});

type CrewMember = CrewManifestBroadcast['crew'][number];

// fallow-ignore-next-line complexity
function CrewCard({ member }: { member: CrewMember }) {
  const isDuty = member.status === 'on_duty';
  const isCombat = member.status === 'in_combat';
  const badgeBg = isCombat
    ? 'rgba(255, 34, 68, 0.2)'
    : isDuty
      ? 'rgba(0, 229, 255, 0.15)'
      : 'rgba(255, 255, 255, 0.05)';
  const badgeColor = isCombat
    ? hudColors.alertRed
    : isDuty
      ? hudColors.cyanTelemetry
      : hudColors.textSecondary;
  const badgeBorder = isCombat
    ? hudColors.alertRed
    : isDuty
      ? hudColors.cyanTelemetry
      : hudColors.borderDim;

  return (
    <div {...stylex.props(styles.crewCard)} data-testid={`crew-member-${member.callsign}`}>
      <div {...stylex.props(styles.crewMeta)}>
        <span {...stylex.props(styles.crewCallsign)}>{member.callsign}</span>
        <span {...stylex.props(styles.crewRole)}>
          {member.role.toUpperCase()} • {member.deckId.toUpperCase()}
          {member.dutyName ? ` • ${member.dutyName}` : ''}
        </span>
      </div>
      <span
        {...stylex.props(styles.statusBadge)}
        style={{
          backgroundColor: badgeBg,
          color: badgeColor,
          borderColor: badgeBorder,
        }}
      >
        {member.status.replace('_', ' ')}
      </span>
    </div>
  );
}

interface CrewManifestModalProps {
  vesselCode: string;
  crew: CrewManifestBroadcast['crew'];
  onClose: () => void;
}

export const CrewManifestModal: React.FC<CrewManifestModalProps> = ({
  vesselCode,
  crew,
  onClose,
}) => {
  return (
    <div {...stylex.props(styles.scrimOverlay)} data-testid="crew-manifest-modal">
      <button
        type="button"
        {...stylex.props(styles.scrimBackdrop)}
        onClick={onClose}
        aria-label="Close modal"
      />
      <div {...stylex.props(styles.manifestPanel)}>
        <div {...stylex.props(styles.header)}>
          <div {...stylex.props(styles.titleGroup)}>
            <Users size={16} color={hudColors.cyanTelemetry} />
            <h2 {...stylex.props(styles.title)}>LIVE CREW MANIFEST</h2>
            <span {...stylex.props(styles.beaconBadge)}>BEACON: {vesselCode}</span>
          </div>
          <button
            type="button"
            {...stylex.props(styles.closeBtn)}
            onClick={onClose}
            aria-label="Close"
            data-testid="close-manifest-btn"
          >
            <X size={16} />
          </button>
        </div>

        <div {...stylex.props(styles.rosterList)}>
          {crew.length === 0 ? (
            <div style={{ padding: 16, textAlign: 'center', color: hudColors.textMuted }}>
              No crew members detected on sensors.
            </div>
          ) : (
            crew.map((member) => <CrewCard key={member.id} member={member} />)
          )}
        </div>

        <div {...stylex.props(styles.footer)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Radio size={12} color={hudColors.phosphorGreen} />
            <span>ENCRYPTED TRANSLOCATOR FEED ACTIVE</span>
          </div>
          <span>TOTAL COMPLEMENT: {crew.length}</span>
        </div>
      </div>
    </div>
  );
};
