/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { ONSET_RECIPES } from './consonants';
import { renderVoice } from './klatt';
import { HYPE_WORDS, hypeWord } from './lyrics';

function rms(out: Float32Array): number {
  let sum = 0;
  for (const sample of out) sum += sample * sample;
  return Math.sqrt(sum / Math.max(1, out.length));
}

describe('consonant recipes', () => {
  it('covers stops, fricatives, nasals and glides with sane levels', () => {
    const kinds = Object.keys(ONSET_RECIPES);
    expect(kinds.length).toBeGreaterThanOrEqual(15);
    for (const recipe of Object.values(ONSET_RECIPES)) {
      expect(recipe.gap).toBeGreaterThanOrEqual(0);
      expect(recipe.murmur).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('hypeWord', () => {
  it('renders every hype word to finite energetic audio', () => {
    expect(HYPE_WORDS).toEqual(['go', 'hey', 'yes', 'rave', 'high']);
    for (const word of HYPE_WORDS) {
      const events = hypeWord(word);
      expect(events.length).toBe(1);
      const out = renderVoice(44100, events);
      expect(out.length).toBeGreaterThan(0);
      for (const sample of out) expect(Number.isFinite(sample)).toBe(true);
      expect(rms(out)).toBeGreaterThan(0.01);
    }
  });

  it('gives each word its own mouth shape', () => {
    const seen = new Set<string>();
    for (const word of HYPE_WORDS) {
      const first = hypeWord(word)[0];
      seen.add(`${first.onset?.kind}:${first.vowel}`);
    }
    expect(seen.size).toBe(HYPE_WORDS.length);
  });
});
