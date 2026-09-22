/**
 * Solo-ship intro + game-over copy (TRANSFORM M1 web slice).
 * Pure strings/steps so the first playable keeps hire-modal wording out of
 * the new loop. The .tsx shells render these; tests pin the wording.
 */

export interface SoloIntroStep {
  readonly title: string;
  readonly body: string;
}

export const SOLO_INTRO_TITLE = 'This is your ship';

export const SOLO_INTRO_STEPS: readonly SoloIntroStep[] = [
  { title: 'Power', body: 'Ignite the reactor, load fuel, and fly.' },
  { title: 'Plot', body: 'Set a nav course for the next trade hub.' },
  { title: 'Haul', body: 'Carry crates from the cargo bay to your racks.' },
  { title: 'Trade', body: 'Sell high, buy supplies, keep flying.' },
] as const;

export const GAME_OVER_TITLE = 'Ship lost';

export const GAME_OVER_BODY = 'Your ship is gone. Restart with a fresh starter skiff.';

export function soloIntroStepTitles(): readonly string[] {
  return SOLO_INTRO_STEPS.map((step) => step.title);
}
