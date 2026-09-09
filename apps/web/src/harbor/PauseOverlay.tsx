/**
 * PauseOverlay: Esc menu. The server tick never stops, so this only
 * blocks local input: the world stays live behind the panel.
 */

import * as stylex from '@stylexjs/stylex';
import { SettingsPanel } from './SettingsPanel';
import { terminal } from './terminalStyles';

export interface PauseOverlayProps {
  readonly onResume: () => void;
  readonly onRestart: () => void;
  readonly onQuit: () => void;
}

export function PauseOverlay({ onResume, onRestart, onQuit }: PauseOverlayProps) {
  return (
    <div {...stylex.props(terminal.screen)}>
      <div {...stylex.props(terminal.panel)} role="dialog" aria-label="Paused">
        <div {...stylex.props(terminal.kicker)}>HOLDING {'//'} WORLD LIVE</div>
        <div {...stylex.props(terminal.title)}>PAUSED</div>
        <div {...stylex.props(terminal.subtitle)}>Input held. The harbor keeps ticking.</div>
        <div {...stylex.props(terminal.buttonCol)}>
          <button
            type="button"
            {...stylex.props(terminal.button, terminal.buttonPrimary)}
            onClick={onResume}
          >
            RESUME
          </button>
          <button type="button" {...stylex.props(terminal.button)} onClick={onRestart}>
            RESTART RUN
          </button>
          <button
            type="button"
            {...stylex.props(terminal.button, terminal.buttonDanger)}
            onClick={onQuit}
          >
            QUIT TO MENU
          </button>
        </div>
        <SettingsPanel />
      </div>
    </div>
  );
}
