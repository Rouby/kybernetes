import type { StartingRole } from '@kybernetes/protocol';
import { getAllRoles } from '@kybernetes/sim-core';
import { hudColors } from '@kybernetes/ui-tokens/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import { ShieldCheck, UserCheck } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';

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
    zIndex: 1000,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(6, 8, 12, 0.85)',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    margin: 0,
  },
  modal: {
    position: 'relative',
    zIndex: 1,
    width: 640,
    maxWidth: '90vw',
    backgroundColor: hudColors.bgPanel,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: hudColors.borderBright,
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
  title: {
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: 1.5,
    color: hudColors.cyanTelemetry,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  subtitle: {
    fontSize: 12,
    color: hudColors.textSecondary,
    lineHeight: 1.4,
  },
  roleList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    maxHeight: 380,
    overflowY: 'auto',
  },
  roleCard: {
    padding: 12,
    backgroundColor: hudColors.bgPanelLighter,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: hudColors.borderDim,
    borderRadius: 2,
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    transition: 'border-color 0.15s ease',
    textAlign: 'left',
    color: hudColors.textPrimary,
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  roleName: {
    fontSize: 14,
    fontWeight: 600,
    letterSpacing: 0.5,
  },
  roleBadge: {
    fontSize: 10,
    padding: '2px 6px',
    borderRadius: 2,
    backgroundColor: hudColors.borderDim,
  },
  roleDept: {
    fontSize: 11,
    color: hudColors.textSecondary,
  },
  roleTrait: {
    fontSize: 12,
    color: hudColors.textPrimary,
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: hudColors.borderDim,
    paddingTop: 12,
  },
  confirmButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 20px',
    backgroundColor: hudColors.bgPanelLighter,
    color: hudColors.cyanTelemetry,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: hudColors.cyanTelemetry,
    borderRadius: 2,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    letterSpacing: 1,
  },
});

interface RoleSelectModalProps {
  currentRole: StartingRole;
  onSelectRole: (role: StartingRole) => void;
  onClose?: () => void;
}

export const RoleSelectModal: React.FC<RoleSelectModalProps> = ({
  currentRole,
  onSelectRole,
  onClose,
}) => {
  const roles = getAllRoles();
  const [selectedRole, setSelectedRole] = useState<StartingRole>(currentRole);

  const handleConfirm = () => {
    onSelectRole(selectedRole);
  };

  return (
    <div
      {...stylex.props(styles.overlay)}
      role="dialog"
      aria-modal="true"
      style={{ position: 'fixed', inset: 0, zIndex: 1000 }}
    >
      <button
        type="button"
        {...stylex.props(styles.backdrop)}
        onClick={onClose}
        aria-label="Close modal backdrop"
      />
      <div {...stylex.props(styles.modal)}>
        <div {...stylex.props(styles.header)}>
          <div {...stylex.props(styles.title)}>
            <UserCheck size={18} />
            <span>CREW MANIFEST: SELECT STARTING ORIGIN</span>
          </div>
          <span style={{ fontSize: 11, color: '#ffb000' }}>GRADE 3 RECRUIT</span>
        </div>

        <p {...stylex.props(styles.subtitle)}>
          Select your departmental posting aboard the Class-IV Bulk Ore Carrier{' '}
          <em>CSS Hesperia</em>. Your role determines your starting station, duties, and passive
          survival traits.
        </p>

        <div {...stylex.props(styles.roleList)}>
          {roles.map((r) => {
            const isSelected = selectedRole === r.role;
            return (
              <button
                type="button"
                key={r.role}
                {...stylex.props(styles.roleCard)}
                style={{
                  borderColor: isSelected ? r.color : undefined,
                  boxShadow: isSelected ? `0 0 12px ${r.color}33` : undefined,
                }}
                onClick={() => setSelectedRole(r.role)}
              >
                <div {...stylex.props(styles.cardHeader)}>
                  <span {...stylex.props(styles.roleName)} style={{ color: r.color }}>
                    {r.name}
                  </span>
                  <span {...stylex.props(styles.roleBadge)} style={{ color: r.color }}>
                    {r.badge}
                  </span>
                </div>
                <div {...stylex.props(styles.roleDept)}>
                  Dept: {r.department} • Starting Station: {r.startingStationId}
                </div>
                <div {...stylex.props(styles.roleTrait)}>
                  <strong>Trait:</strong> {r.trait}
                </div>
              </button>
            );
          })}
        </div>

        <div {...stylex.props(styles.footer)}>
          <button {...stylex.props(styles.confirmButton)} onClick={handleConfirm}>
            <ShieldCheck size={16} />
            CONFIRM ASSIGNMENT
          </button>
        </div>
      </div>
    </div>
  );
};
