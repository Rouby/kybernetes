/**
 * SettingsPanel: master volume plus mute over the existing AudioBusManager.
 * Volumes persist through the bus; when audio has no context yet (menu
 * before first gesture) an enable button arms it from the click gesture.
 */

import * as stylex from '@stylexjs/stylex';
import { useMasterAudio } from './audioControls';
import { terminal } from './terminalStyles';

export function SettingsPanel() {
  const audio = useMasterAudio();
  if (!audio.ready) {
    return (
      <div>
        <div {...stylex.props(terminal.sectionLabel)}>SHIP AUDIO</div>
        <button type="button" {...stylex.props(terminal.button)} onClick={audio.enable}>
          ENABLE AUDIO
        </button>
      </div>
    );
  }
  return (
    <div>
      <div {...stylex.props(terminal.sectionLabel)}>SHIP AUDIO</div>
      <div {...stylex.props(terminal.sliderRow)}>
        <label htmlFor="master-volume">MASTER</label>
        <input
          id="master-volume"
          type="range"
          min={0}
          max={100}
          value={audio.masterPct}
          onChange={(event) => audio.setMasterPct(Number(event.target.value))}
          {...stylex.props(terminal.slider)}
        />
        <span {...stylex.props(terminal.sliderValue)}>{audio.masterPct}%</span>
      </div>
      <div {...stylex.props(terminal.sliderRow)}>
        <label htmlFor="mute-toggle">MUTE</label>
        <input
          id="mute-toggle"
          type="checkbox"
          checked={audio.muted}
          onChange={(event) => audio.setMuted(event.target.checked)}
        />
      </div>
    </div>
  );
}
