/**
 * GameOverShell: hard-fail screen for the solo loop (TRANSFORM M1 shell).
 * Wired to SHIP_LOST in M6; M1 ships the copy-backed panel only.
 */

import * as stylex from '@stylexjs/stylex';
import { GAME_OVER_BODY, GAME_OVER_TITLE } from './soloShipCopy';
import { terminal } from './terminalStyles';

export interface GameOverShellProps {
  readonly shipId: string;
  readonly onRestart: () => void;
}

export function GameOverShell({ shipId, onRestart }: GameOverShellProps) {
  return (
    <div {...stylex.props(terminal.screen)}>
      <div {...stylex.props(terminal.panel)} role="dialog" aria-label={GAME_OVER_TITLE}>
        <div {...stylex.props(terminal.kicker)}>
          HULL LOSS {'//'} {shipId}
        </div>
        <div {...stylex.props(terminal.title)}>{GAME_OVER_TITLE}</div>
        <div {...stylex.props(terminal.subtitle)}>{GAME_OVER_BODY}</div>
        <div {...stylex.props(terminal.buttonCol)}>
          <button
            type="button"
            {...stylex.props(terminal.button, terminal.buttonPrimary)}
            onClick={onRestart}
          >
            RESTART WITH STARTER SKIFF
          </button>
        </div>
      </div>
    </div>
  );
}
