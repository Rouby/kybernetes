import { hudColors } from '@kybernetes/ui-tokens/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import { Volume2, VolumeX, X } from 'lucide-react';
import type React from 'react';
import { useAudio } from '../audio/useAudio';

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
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
    borderRadius: 4,
  },
  busList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  busRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  busHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 12,
    letterSpacing: 1,
    color: hudColors.textPrimary,
  },
  busPct: {
    fontFamily: 'monospace',
    color: hudColors.amberTelemetry,
  },
  sliderContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  sliderInput: {
    flex: 1,
    accentColor: hudColors.cyanTelemetry,
    cursor: 'pointer',
    height: 4,
  },
  muteToggleBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 14px',
    backgroundColor: hudColors.bgPanelLighter,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: hudColors.borderDim,
    borderRadius: 4,
    color: hudColors.textPrimary,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 1,
  },
  muteToggleActive: {
    borderColor: hudColors.alertRed,
    color: hudColors.alertRed,
  },
  testControls: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: hudColors.borderDim,
  },
  testBtn: {
    padding: '6px 12px',
    backgroundColor: hudColors.bgVoid,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: hudColors.cyanDim,
    color: hudColors.cyanTelemetry,
    borderRadius: 3,
    fontSize: 11,
    letterSpacing: 1,
    cursor: 'pointer',
  },
});

interface VolumeSliderRowProps {
  label: string;
  value: number;
  onChange: (val: number) => void;
}

const VolumeSliderRow: React.FC<VolumeSliderRowProps> = ({ label, value, onChange }) => (
  <div {...stylex.props(styles.busRow)}>
    <div {...stylex.props(styles.busHeader)}>
      <span>{label}</span>
      <span {...stylex.props(styles.busPct)}>{Math.round(value * 100)}%</span>
    </div>
    <div {...stylex.props(styles.sliderContainer)}>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={value}
        onChange={(e) => onChange(Number.parseFloat(e.target.value))}
        {...stylex.props(styles.sliderInput)}
      />
    </div>
  </div>
);

interface AudioSettingsModalProps {
  onClose: () => void;
}

export const AudioSettingsModal: React.FC<AudioSettingsModalProps> = ({ onClose }) => {
  const { volumes, setVolume, toggleMute, playUiClick, playDebriefStamp, engine } = useAudio();

  const handleSlider = (bus: 'master' | 'ambience' | 'foley' | 'ui' | 'crisis', val: number) => {
    setVolume(bus, val);
  };

  return (
    <div {...stylex.props(styles.scrimOverlay)} data-testid="audio-settings-modal">
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close audio settings"
        {...stylex.props(styles.scrimBackdrop)}
        onClick={onClose}
      />
      <div {...stylex.props(styles.panel)}>
        <div {...stylex.props(styles.header)}>
          <div {...stylex.props(styles.titleGroup)}>
            <Volume2 size={18} color={hudColors.cyanTelemetry} />
            <h2 {...stylex.props(styles.title)}>ACOUSTIC MIXER {'//'} SHIP TELEMETRY</h2>
          </div>
          <button
            type="button"
            aria-label="Close modal"
            data-testid="close-audio-btn"
            {...stylex.props(styles.closeBtn)}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        <button
          type="button"
          data-testid="mute-toggle-btn"
          {...stylex.props(styles.muteToggleBtn, volumes.isMuted && styles.muteToggleActive)}
          onClick={toggleMute}
        >
          {volumes.isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          {volumes.isMuted ? 'ALL AUDIO MUTED [U]' : 'MUTE MASTER AUDIO [U]'}
        </button>

        <div {...stylex.props(styles.busList)}>
          <VolumeSliderRow
            label="MASTER BUS"
            value={volumes.master}
            onChange={(v) => handleSlider('master', v)}
          />
          <VolumeSliderRow
            label="SHIP AMBIENCE (Reactors, Life Support)"
            value={volumes.ambience}
            onChange={(v) => handleSlider('ambience', v)}
          />
          <VolumeSliderRow
            label="MECHANICAL FOLEY (Footsteps, Weapons, Doors)"
            value={volumes.foley}
            onChange={(v) => handleSlider('foley', v)}
          />
          <VolumeSliderRow
            label="TERMINAL & UI (Keyclicks, Telemetry, Stamp)"
            value={volumes.ui}
            onChange={(v) => handleSlider('ui', v)}
          />
          <VolumeSliderRow
            label="CRISIS & ALARMS (Klaxons, Heartbeat, Suffocation)"
            value={volumes.crisis}
            onChange={(v) => handleSlider('crisis', v)}
          />
        </div>

        <div {...stylex.props(styles.testControls)}>
          <button
            type="button"
            {...stylex.props(styles.testBtn)}
            onClick={() => engine.playLocalFootstep('steel')}
          >
            TEST FOOTSTEP
          </button>
          <button
            type="button"
            {...stylex.props(styles.testBtn)}
            onClick={() => engine.playWeaponFire(0, 0, 'pulse_laser', 1.0, true)}
          >
            TEST LASER
          </button>
          <button type="button" {...stylex.props(styles.testBtn)} onClick={playDebriefStamp}>
            TEST DEBRIEF STAMP
          </button>
          <button
            type="button"
            {...stylex.props(styles.testBtn)}
            onClick={() => {
              const dest = engine.busManager?.crisisGain;
              if (dest) engine.alarmSynth?.playRedAlertKlaxon(dest);
            }}
          >
            TEST KLAXON
          </button>
          <button type="button" {...stylex.props(styles.testBtn)} onClick={playUiClick}>
            TEST CLICK
          </button>
        </div>
      </div>
    </div>
  );
};
