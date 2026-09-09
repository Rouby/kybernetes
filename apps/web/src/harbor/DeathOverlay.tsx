/**
 * DeathOverlay: server-declared death. Restart wipes the run at the
 * station spawn; Quit returns to the menu. Copy comes from deathNotice
 * so the terminal and the notices agree.
 */

import type { DeathCause } from '@kybernetes/protocol';
import * as stylex from '@stylexjs/stylex';
import { deathHint, deathTitle } from './deathNotice';
import { terminal } from './terminalStyles';

export interface DeathOverlayProps {
  readonly cause: DeathCause | undefined;
  readonly onRestart: () => void;
  readonly onQuit: () => void;
}

export function DeathOverlay({ cause, onRestart, onQuit }: DeathOverlayProps) {
  return (
    <div {...stylex.props(terminal.screen)}>
      <div {...stylex.props(terminal.panel)} role="dialog" aria-label="Run over">
        <div {...stylex.props(terminal.kicker)}>FLATLINE {'//'} AUTHORITATIVE</div>
        <div {...stylex.props(terminal.dangerTitle)}>{deathTitle(cause)}</div>
        <div {...stylex.props(terminal.subtitle)}>{deathHint(cause)}</div>
        <div {...stylex.props(terminal.buttonCol)}>
          <button
            type="button"
            {...stylex.props(terminal.button, terminal.buttonPrimary)}
            onClick={onRestart}
          >
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
      </div>
    </div>
  );
}
