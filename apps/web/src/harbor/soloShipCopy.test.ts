import { describe, expect, it } from 'vitest';
import {
  GAME_OVER_TITLE,
  SOLO_INTRO_STEPS,
  SOLO_INTRO_TITLE,
  soloIntroStepTitles,
} from './soloShipCopy';

describe('soloShipCopy (M1 web slice)', () => {
  it('introduces owned-ship life without hire wording', () => {
    expect(SOLO_INTRO_TITLE).toBe('This is your ship');
    expect(soloIntroStepTitles()).toEqual(['Power', 'Plot', 'Haul', 'Trade']);
    expect(SOLO_INTRO_STEPS).toHaveLength(4);
    expect(GAME_OVER_TITLE).toBe('Ship lost');
  });
});
