/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import {
  glottalPulse,
  mulberry32,
  renderVoice,
  resonatorCoeffs,
  resonatorsFor,
  type VoiceEvent,
} from './klatt';
import { VOWEL_FORMANTS } from './vowels';

function note(vowel: VoiceEvent['vowel'], seconds = 0.3): VoiceEvent {
  return { vowel, f0Start: 220, f0End: 220, seconds };
}

function meanAbsDiff(a: Float32Array, b: Float32Array): number {
  const count = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < count; i++) sum += Math.abs(a[i] - b[i]);
  return sum / Math.max(1, count);
}

describe('klatt resonators', () => {
  it('builds stable decaying resonators for every vowel', () => {
    for (const formants of Object.values(VOWEL_FORMANTS)) {
      const resonators = resonatorsFor(44100, formants);
      expect(resonators.length).toBeGreaterThanOrEqual(4);
      for (const res of resonators) {
        expect(Number.isFinite(res.a)).toBe(true);
        expect(Math.abs(res.c)).toBeLessThan(1);
      }
    }
    const res = resonatorCoeffs(44100, 730, 80);
    expect(res.a + res.b + res.c).toBeCloseTo(1, 9);
  });

  it('deals deterministic noise from a seed', () => {
    const first = mulberry32(7);
    const second = mulberry32(7);
    expect(first()).toBe(second());
    expect(mulberry32(8)()).not.toBe(mulberry32(9)());
  });
});

describe('glottalPulse', () => {
  it('rises skewed, snaps shut, and repeats', () => {
    expect(glottalPulse(0)).toBe(0);
    expect(glottalPulse(0.62)).toBeCloseTo(0, 9);
    let peak = 0;
    for (let p = 0; p < 0.7; p += 0.01) peak = Math.max(peak, glottalPulse(p));
    expect(peak).toBeCloseTo(1, 2);
    expect(glottalPulse(1.2)).toBeCloseTo(glottalPulse(0.2), 12);
    expect(glottalPulse(0.85)).toBeLessThan(0);
  });
});

describe('renderVoice', () => {
  it('renders the exact requested length of finite audio', () => {
    const out = renderVoice(44100, [note('ah', 0.2), { ...note('ee', 0.3), gapAfter: 0.1 }]);
    expect(out.length).toBe(
      Math.floor(0.2 * 44100) + Math.floor(0.3 * 44100) + Math.floor(0.1 * 44100)
    );
    for (const sample of out) expect(Number.isFinite(sample)).toBe(true);
    expect(out.some((sample) => sample !== 0)).toBe(true);
  });

  it('renders silence for zero gain and trailing gaps', () => {
    const out = renderVoice(44100, [{ ...note('ah', 0.1), gain: 0, gapAfter: 0.05 }]);
    expect(out.every((sample) => sample === 0)).toBe(true);
  });

  it('renders deterministically for a fixed seed', () => {
    const first = renderVoice(44100, [note('oh', 0.2)], 11);
    const second = renderVoice(44100, [note('oh', 0.2)], 11);
    expect(first).toEqual(second);
  });

  it('tells vowels apart and glides between them', () => {
    const ah = renderVoice(44100, [note('ah')]);
    const ee = renderVoice(44100, [note('ee')]);
    expect(meanAbsDiff(ah, ee)).toBeGreaterThan(0.01);
    const gliding = renderVoice(44100, [{ ...note('ah'), glideTo: 'ee' }]);
    expect(meanAbsDiff(gliding, ah)).toBeGreaterThan(0.005);
    expect(meanAbsDiff(gliding, ee)).toBeGreaterThan(0.005);
  });

  it('seals stops, hisses fricatives, and spits codas', () => {
    const stopped = renderVoice(44100, [{ ...note('oh'), onset: { kind: 'g', seconds: 0.16 } }]);
    const closure = stopped.slice(0, Math.floor(0.03 * 44100));
    expect(Math.max(...closure.map(Math.abs))).toBeLessThan(1e-6);
    const hissed = renderVoice(44100, [{ ...note('eh'), onset: { kind: 'h', seconds: 0.14 } }]);
    const breath = hissed.slice(0, Math.floor(0.06 * 44100));
    const breathLevel = breath.reduce((sum, s) => sum + Math.abs(s), 0) / breath.length;
    expect(breathLevel).toBeGreaterThan(0.005);
    const crackly = renderVoice(44100, [{ ...note('oh'), onset: { kind: 'g', seconds: 0.18 } }]);
    const burstAt = Math.floor(0.65 * 0.18 * 44100);
    const burst = crackly.slice(burstAt, burstAt + Math.floor(0.02 * 44100));
    expect(Math.max(...burst.map(Math.abs))).toBeGreaterThan(0.05);
    const tailed = renderVoice(44100, [{ ...note('eh', 0.1), coda: { kind: 'v', seconds: 0.14 } }]);
    const tail = tailed.slice(Math.floor(0.1 * 44100));
    expect(Math.max(...tail.map(Math.abs))).toBeGreaterThan(0.02);
  });

  it('saturates shouts without breaking determinism', () => {
    const clean = renderVoice(44100, [{ ...note('oh'), drive: 0 }]);
    const dirty = renderVoice(44100, [{ ...note('oh'), drive: 0.8 }]);
    expect(meanAbsDiff(clean, dirty)).toBeGreaterThan(0.005);
    for (const sample of dirty) expect(Number.isFinite(sample)).toBe(true);
    expect(dirty).toEqual(renderVoice(44100, [{ ...note('oh'), drive: 0.8 }]));
  });

  it('bends pitch from start to end frequency', () => {
    const flat = renderVoice(44100, [note('oh')]);
    const scoop = renderVoice(44100, [{ ...note('oh'), f0Start: 200, f0End: 240 }]);
    expect(meanAbsDiff(flat, scoop)).toBeGreaterThan(0.005);
  });

  it('cracks onsets and spits codas', () => {
    const plain = renderVoice(44100, [note('oh')]);
    const stopped = renderVoice(44100, [{ ...note('oh'), onset: { kind: 'g', seconds: 0.12 } }]);
    expect(stopped.length).toBe(plain.length + Math.floor(0.12 * 44100));
    expect(meanAbsDiff(plain, stopped)).toBeGreaterThan(0.005);
    const hissed = renderVoice(44100, [{ ...note('eh'), onset: { kind: 's', seconds: 0.1 } }]);
    expect(meanAbsDiff(plain, hissed)).toBeGreaterThan(0.005);
    const tailed = renderVoice(44100, [{ ...note('eh'), coda: { kind: 's', seconds: 0.12 } }]);
    expect(tailed.length).toBe(plain.length + Math.floor(0.12 * 44100));
    for (const sample of tailed) expect(Number.isFinite(sample)).toBe(true);
  });
});
