/**
 * SoloShipIntro: first-run card for the owned-ship loop (TRANSFORM M1).
 * Rendered after Customize when the player spawns aboard their own skiff.
 * Static StyleX only; copy lives in soloShipCopy so tests pin wording.
 */

import * as stylex from '@stylexjs/stylex';
import { SOLO_INTRO_STEPS, SOLO_INTRO_TITLE } from './soloShipCopy';
import { terminal } from './terminalStyles';

export interface SoloShipIntroProps {
  readonly shipId: string;
  readonly onEmbark: () => void;
}

export function SoloShipIntro({ shipId, onEmbark }: SoloShipIntroProps) {
  return (
    <div {...stylex.props(terminal.screen)}>
      <div {...stylex.props(terminal.panel)} role="dialog" aria-label={SOLO_INTRO_TITLE}>
        <div {...stylex.props(terminal.kicker)}>
          SOLO COMMISSION {'//'} {shipId}
        </div>
        <div {...stylex.props(terminal.title)}>{SOLO_INTRO_TITLE}</div>
        <div {...stylex.props(terminal.subtitle)}>Solo. No crew. Keep her running.</div>
        <div {...stylex.props(terminal.buttonCol)}>
          {SOLO_INTRO_STEPS.map((step) => (
            <div key={step.title} {...stylex.props(terminal.subtitle)}>
              {step.title}: {step.body}
            </div>
          ))}
        </div>
        <div {...stylex.props(terminal.buttonCol)}>
          <button
            type="button"
            {...stylex.props(terminal.button, terminal.buttonPrimary)}
            onClick={onEmbark}
          >
            EMBARK
          </button>
        </div>
      </div>
    </div>
  );
}
