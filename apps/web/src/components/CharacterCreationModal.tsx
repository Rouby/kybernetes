import type { StartingRole } from '@kybernetes/protocol';
import { ROLE_DEFINITIONS } from '@kybernetes/sim-core';
import { hudColors } from '@kybernetes/ui-tokens/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import { Check, ChevronRight, Palette, RefreshCw, Shield, User, X } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';

export interface CharacterProfile {
  callsign: string;
  role: StartingRole;
  color: string;
}

const SUIT_COLOR_PALETTE = [
  { id: 'hazard_amber', name: 'Hazard Amber', hex: '#ffb000' },
  { id: 'cyan_tech', name: 'Cyan Tech', hex: '#00e5ff' },
  { id: 'bio_emerald', name: 'Bio Emerald', hex: '#00ff88' },
  { id: 'security_crimson', name: 'Security Crimson', hex: '#ff3355' },
  { id: 'warp_violet', name: 'Warp Violet', hex: '#b55fe6' },
  { id: 'steel_grey', name: 'Steel Grey', hex: '#94a3b8' },
  { id: 'neon_orange', name: 'Neon Orange', hex: '#ff7700' },
  { id: 'deep_azure', name: 'Deep Azure', hex: '#2b7fff' },
];

const RANDOM_CALLSIGNS = [
  'Valkyrie',
  'Ghost-7',
  'Apex',
  'Spectre',
  'Nova-1',
  'Orion',
  'Echo-4',
  'Zenith',
  'Cipher',
  'Kestrel',
  'Apex-9',
  'Vanguard',
  'Rook',
  'Phoenix',
  'Talon',
];

const ROLES: StartingRole[] = [
  'wiper',
  'galley_hand',
  'security_private',
  'hydro_tender',
  'stevedore',
];

const styles = stylex.create({
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(4, 5, 10, 0.85)',
    backdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    zIndex: 1000,
    boxSizing: 'border-box',
  },
  modal: {
    width: '100%',
    maxWidth: 720,
    maxHeight: '92vh',
    overflowY: 'auto',
    backgroundColor: hudColors.bgPanel,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: hudColors.borderDim,
    borderRadius: 6,
    padding: 24,
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    boxShadow: '0 12px 48px rgba(0, 0, 0, 0.7)',
    color: hudColors.textPrimary,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: hudColors.borderDim,
    paddingBottom: 12,
  },
  headerLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  beaconBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '2px 8px',
    backgroundColor: 'rgba(0, 229, 255, 0.1)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: hudColors.cyanTelemetry,
    borderRadius: 3,
    fontSize: 10,
    fontWeight: 700,
    color: hudColors.cyanTelemetry,
    fontFamily: 'monospace',
    letterSpacing: 1,
    alignSelf: 'flex-start',
  },
  title: {
    fontSize: 18,
    fontWeight: 900,
    letterSpacing: 2,
    color: hudColors.textPrimary,
    margin: 0,
  },
  subtitle: {
    fontSize: 11,
    color: hudColors.textSecondary,
    fontFamily: 'monospace',
    margin: 0,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1.5,
    color: hudColors.amberTelemetry,
    fontFamily: 'monospace',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  nameInputRow: {
    display: 'flex',
    gap: 8,
  },
  textInput: {
    flex: 1,
    padding: '10px 14px',
    backgroundColor: hudColors.bgPanelLighter,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: hudColors.borderDim,
    borderRadius: 3,
    color: hudColors.cyanTelemetry,
    fontSize: 13,
    fontFamily: 'monospace',
    letterSpacing: 1,
    outline: 'none',
  },
  iconBtn: {
    padding: '10px 12px',
    backgroundColor: hudColors.bgPanelLighter,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: hudColors.borderDim,
    borderRadius: 3,
    color: hudColors.textSecondary,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
    gap: 8,
  },
  roleCard: {
    padding: '10px 12px',
    backgroundColor: hudColors.bgPanelLighter,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: hudColors.borderDim,
    borderRadius: 4,
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    textAlign: 'left',
  },
  roleSelected: {
    borderColor: hudColors.cyanTelemetry,
    backgroundColor: 'rgba(0, 229, 255, 0.08)',
  },
  roleName: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1,
  },
  roleDept: {
    fontSize: 9,
    color: hudColors.textMuted,
    fontFamily: 'monospace',
  },
  colorGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(8, 1fr)',
    gap: 8,
  },
  colorSwatch: {
    height: 36,
    borderRadius: 4,
    borderWidth: 2,
    borderStyle: 'solid',
    borderColor: 'transparent',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorSwatchSelected: {
    borderColor: hudColors.textPrimary,
    boxShadow: '0 0 10px rgba(255, 255, 255, 0.4)',
  },
  previewContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: '12px 16px',
    backgroundColor: hudColors.bgVoid,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: hudColors.borderDim,
    borderRadius: 4,
  },
  avatarRing: {
    width: 44,
    height: 44,
    borderRadius: '50%',
    borderWidth: 2,
    borderStyle: 'solid',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  avatarVisor: {
    width: 14,
    height: 6,
    borderRadius: 3,
    backgroundColor: hudColors.cyanTelemetry,
    boxShadow: '0 0 8px rgba(0, 229, 255, 0.8)',
  },
  previewTextGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  previewCallsign: {
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: 1,
    color: hudColors.textPrimary,
  },
  previewRoleBadge: {
    fontSize: 10,
    fontFamily: 'monospace',
    color: hudColors.textSecondary,
    letterSpacing: 0.5,
  },
  actionsRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: hudColors.borderDim,
    paddingTop: 16,
  },
  backBtn: {
    padding: '10px 16px',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: hudColors.borderDim,
    borderRadius: 3,
    color: hudColors.textSecondary,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1,
    cursor: 'pointer',
  },
  confirmBtn: {
    flex: 1,
    padding: '12px 20px',
    backgroundColor: 'rgba(0, 255, 102, 0.15)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: hudColors.phosphorGreen,
    borderRadius: 3,
    color: hudColors.phosphorGreen,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 2,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
});

interface CharacterCreationModalProps {
  vesselCode: string;
  initialProfile?: Partial<CharacterProfile>;
  onConfirm: (profile: CharacterProfile) => void;
  onAbort: () => void;
}

const CallsignField: React.FC<{
  callsign: string;
  onChange: (val: string) => void;
  onRandomize: () => void;
}> = ({ callsign, onChange, onRandomize }) => (
  <div {...stylex.props(styles.section)}>
    <span {...stylex.props(styles.sectionLabel)}>
      <User size={13} />
      <span>OPERATOR CALLSIGN / NAME</span>
    </span>
    <div {...stylex.props(styles.nameInputRow)}>
      <input
        {...stylex.props(styles.textInput)}
        data-testid="dossier-callsign-input"
        value={callsign}
        onChange={(e) => onChange(e.target.value)}
        maxLength={16}
        placeholder="Cadet"
      />
      <button
        type="button"
        {...stylex.props(styles.iconBtn)}
        onClick={onRandomize}
        data-testid="random-callsign-btn"
        title="Generate Random Callsign"
      >
        <RefreshCw size={14} />
      </button>
    </div>
  </div>
);

const RoleGrid: React.FC<{
  selectedRole: StartingRole;
  onSelectRole: (role: StartingRole) => void;
}> = ({ selectedRole, onSelectRole }) => (
  <div {...stylex.props(styles.section)}>
    <span {...stylex.props(styles.sectionLabel)}>
      <Shield size={13} />
      <span>OPERATIONAL ROLE ASSIGNMENT</span>
    </span>
    <div {...stylex.props(styles.roleGrid)}>
      {ROLES.map((r) => {
        const def = ROLE_DEFINITIONS[r];
        const isSelected = selectedRole === r;
        return (
          <button
            type="button"
            key={r}
            data-testid={`dossier-role-${r}`}
            {...stylex.props(styles.roleCard, isSelected && styles.roleSelected)}
            onClick={() => onSelectRole(r)}
          >
            <span
              {...stylex.props(styles.roleName)}
              style={{ color: def.color || hudColors.cyanTelemetry }}
            >
              {def.name}
            </span>
            <span {...stylex.props(styles.roleDept)}>{def.department}</span>
          </button>
        );
      })}
    </div>
  </div>
);

const SuitColorGrid: React.FC<{
  selectedColor: string;
  onSelectColor: (hex: string) => void;
}> = ({ selectedColor, onSelectColor }) => (
  <div {...stylex.props(styles.section)}>
    <span {...stylex.props(styles.sectionLabel)}>
      <Palette size={13} />
      <span>TACTICAL SUIT HUE & VISOR IDENTIFIER</span>
    </span>
    <div {...stylex.props(styles.colorGrid)}>
      {SUIT_COLOR_PALETTE.map((c) => {
        const isSelected = selectedColor.toLowerCase() === c.hex.toLowerCase();
        return (
          <button
            type="button"
            key={c.id}
            data-testid={`suit-color-${c.id}`}
            title={c.name}
            {...stylex.props(styles.colorSwatch, isSelected && styles.colorSwatchSelected)}
            style={{
              backgroundColor: c.hex,
              borderColor: isSelected ? '#ffffff' : 'transparent',
            }}
            onClick={() => onSelectColor(c.hex)}
          >
            {isSelected && <Check size={16} color="#04050a" strokeWidth={3} />}
          </button>
        );
      })}
    </div>
  </div>
);

const AvatarPreview: React.FC<{
  color: string;
  callsign: string;
  role: StartingRole;
}> = ({ color, callsign, role }) => {
  const activeRoleDef = ROLE_DEFINITIONS[role];
  return (
    <div {...stylex.props(styles.previewContainer)}>
      <div
        {...stylex.props(styles.avatarRing)}
        style={{ borderColor: color, backgroundColor: `${color}22` }}
      >
        <div {...stylex.props(styles.avatarVisor)} />
      </div>
      <div {...stylex.props(styles.previewTextGroup)}>
        <span {...stylex.props(styles.previewCallsign)}>{callsign.trim() || 'Cadet'}</span>
        <span {...stylex.props(styles.previewRoleBadge)}>
          {activeRoleDef.name.toUpperCase()} • {activeRoleDef.department}
        </span>
      </div>
    </div>
  );
};

// fallow-ignore-next-line complexity
function getInitialProfileValues(
  initial?: Partial<CharacterProfile>
): [string, StartingRole, string] {
  const initRole = initial?.role ?? 'wiper';
  const initCallsign = initial?.callsign ?? 'Cadet';
  const initColor = initial?.color ?? ROLE_DEFINITIONS[initRole].color ?? '#00e5ff';
  return [initCallsign, initRole, initColor];
}

export const CharacterCreationModal: React.FC<CharacterCreationModalProps> = ({
  vesselCode,
  initialProfile,
  onConfirm,
  onAbort,
}) => {
  const [initCallsign, initRole, initColor] = getInitialProfileValues(initialProfile);
  const [callsign, setCallsign] = useState(initCallsign);
  const [role, setRole] = useState<StartingRole>(initRole);
  const [color, setColor] = useState(initColor);

  const handleRandomizeCallsign = () => {
    const picked = RANDOM_CALLSIGNS[Math.floor(Math.random() * RANDOM_CALLSIGNS.length)];
    setCallsign(picked);
  };

  const handleSelectRole = (r: StartingRole) => {
    setRole(r);
    if (!initialProfile?.color) {
      setColor(ROLE_DEFINITIONS[r].color ?? '#00e5ff');
    }
  };

  const handleConfirm = () => {
    const trimmed = callsign.trim();
    onConfirm({
      callsign: trimmed.length > 0 ? trimmed : 'Cadet',
      role,
      color,
    });
  };

  return (
    <div {...stylex.props(styles.overlay)} data-testid="character-creation-modal">
      <div {...stylex.props(styles.modal)}>
        <div {...stylex.props(styles.header)}>
          <div {...stylex.props(styles.headerLeft)}>
            <span {...stylex.props(styles.beaconBadge)}>VESSEL: {vesselCode}</span>
            <h2 {...stylex.props(styles.title)}>OPERATOR DOSSIER SPECIFICATION</h2>
            <p {...stylex.props(styles.subtitle)}>
              CONFIGURE CALLSIGN, DUTY ROLE & SUIT IDENTIFIER
            </p>
          </div>
          <button
            type="button"
            {...stylex.props(styles.iconBtn)}
            onClick={onAbort}
            data-testid="abort-dossier-btn"
          >
            <X size={16} />
          </button>
        </div>

        <CallsignField
          callsign={callsign}
          onChange={setCallsign}
          onRandomize={handleRandomizeCallsign}
        />

        <RoleGrid selectedRole={role} onSelectRole={handleSelectRole} />

        <SuitColorGrid selectedColor={color} onSelectColor={setColor} />

        <AvatarPreview color={color} callsign={callsign} role={role} />

        <div {...stylex.props(styles.actionsRow)}>
          <button type="button" {...stylex.props(styles.backBtn)} onClick={onAbort}>
            CANCEL
          </button>
          <button
            type="button"
            {...stylex.props(styles.confirmBtn)}
            onClick={handleConfirm}
            data-testid="confirm-dossier-btn"
          >
            <span>CONFIRM DOSSIER & EMBARK</span>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};
