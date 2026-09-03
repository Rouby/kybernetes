import { generateBeaconCode, isValidBeaconCode } from '@kybernetes/sim-core';
import { hudColors } from '@kybernetes/ui-tokens/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import { Compass, Dna, RefreshCw, X } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';

const styles = stylex.create({
  lobbyOverlay: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1040,
  },
  lobbyBackdrop: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(4, 6, 10, 0.9)',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    margin: 0,
  },
  dialogWindow: {
    position: 'relative',
    zIndex: 2,
    width: 490,
    maxWidth: '88vw',
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
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  label: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1,
    color: hudColors.textSecondary,
    fontFamily: 'monospace',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  inputRow: {
    display: 'flex',
    gap: 8,
  },
  input: {
    flex: 1,
    padding: '8px 12px',
    backgroundColor: hudColors.bgPanelLighter,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: hudColors.borderDim,
    borderRadius: 3,
    color: hudColors.cyanTelemetry,
    fontSize: 14,
    fontFamily: 'monospace',
    letterSpacing: 2,
    outline: 'none',
  },
  genBtn: {
    padding: '8px 12px',
    backgroundColor: 'rgba(0, 229, 255, 0.1)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: hudColors.cyanTelemetry,
    borderRadius: 3,
    color: hudColors.cyanTelemetry,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 11,
    fontWeight: 700,
  },
  submitBtn: {
    marginTop: 8,
    padding: '10px 16px',
    backgroundColor: 'rgba(0, 255, 102, 0.15)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: hudColors.phosphorGreen,
    borderRadius: 3,
    color: hudColors.phosphorGreen,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 1,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  errorText: {
    color: hudColors.alertRed,
    fontSize: 11,
  },
});

interface BeaconLobbyModalProps {
  currentBeacon: string;
  currentCallsign: string;
  onJoin: (beacon: string, callsign: string) => void;
  onClose: () => void;
}

export const BeaconLobbyModal: React.FC<BeaconLobbyModalProps> = ({
  currentBeacon,
  currentCallsign,
  onJoin,
  onClose,
}) => {
  const [beacon, setBeacon] = useState(currentBeacon);
  const [callsign, setCallsign] = useState(currentCallsign);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanBeacon = beacon.trim().toUpperCase();
    const cleanCallsign = callsign.trim() || 'Cadet';

    if (!isValidBeaconCode(cleanBeacon)) {
      setError('Beacon code must be 6 alphanumeric characters (e.g. HESP01)');
      return;
    }

    onJoin(cleanBeacon, cleanCallsign);
    onClose();
  };

  return (
    <div {...stylex.props(styles.lobbyOverlay)} data-testid="beacon-modal">
      <button
        type="button"
        {...stylex.props(styles.lobbyBackdrop)}
        onClick={onClose}
        aria-label="Close modal"
      />
      <div {...stylex.props(styles.dialogWindow)}>
        <div {...stylex.props(styles.header)}>
          <div {...stylex.props(styles.titleGroup)}>
            <Compass size={16} color={hudColors.cyanTelemetry} />
            <h2 {...stylex.props(styles.title)}>SUBSPACE BEACON FREQUENCY</h2>
          </div>
          <button
            type="button"
            {...stylex.props(styles.closeBtn)}
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <form {...stylex.props(styles.form)} onSubmit={handleSubmit}>
          <label {...stylex.props(styles.label)}>
            <span>VESSEL BEACON CODE (6-CHAR)</span>
            <div {...stylex.props(styles.inputRow)}>
              <input
                {...stylex.props(styles.input)}
                data-testid="beacon-input"
                value={beacon}
                onChange={(e) => {
                  setBeacon(e.target.value.toUpperCase());
                  setError(null);
                }}
                maxLength={6}
                placeholder="HESP01"
              />
              <button
                type="button"
                {...stylex.props(styles.genBtn)}
                onClick={() => setBeacon(generateBeaconCode())}
                title="Generate new frequency"
              >
                <RefreshCw size={12} />
                <span>RANDOM</span>
              </button>
            </div>
          </label>

          <label {...stylex.props(styles.label)}>
            <span>CREW CALLSIGN</span>
            <input
              {...stylex.props(styles.input)}
              data-testid="callsign-input"
              value={callsign}
              onChange={(e) => setCallsign(e.target.value)}
              maxLength={16}
              placeholder="Alpha-1"
            />
          </label>

          {error && <span {...stylex.props(styles.errorText)}>{error}</span>}

          <button
            type="submit"
            {...stylex.props(styles.submitBtn)}
            data-testid="join-beacon-submit"
          >
            <Dna size={14} />
            <span>SYNC QUANTUM BEACON</span>
          </button>
        </form>
      </div>
    </div>
  );
};
