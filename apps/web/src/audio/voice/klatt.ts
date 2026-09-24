/**
 * Klatt-lite singing DSP: LF-model glottal flow driving a cascade of
 * vowel resonators, locus-based coarticulation out of consonants, VOT
 * overlap so voicing starts inside the burst, plus breath and envelopes.
 * Pure sample math — no DOM, no Web Audio, Vitest pins it in Node.
 */

import {
  CODA_FILTERS,
  type Coda,
  ONSET_RECIPES,
  type Onset,
  type OnsetKind,
} from './consonants';

/** F2 locus per place of articulation: where the vowel starts bending from. */
const CONSONANT_LOCI: Partial<Record<OnsetKind, number>> = {
  g: 2100,
  k: 2100,
  d: 1800,
  t: 1800,
  n: 1800,
  s: 1800,
  z: 1800,
  b: 800,
  p: 800,
  m: 800,
};

const LOCUS_GLIDE_SEC = 0.03;
const VOT_OVERLAP_SEC = 0.025;

import { VOWEL_FORMANTS, type VowelFormant, type VowelId } from './vowels';

export interface VoiceEvent {
  readonly drive?: number;
  readonly onset?: Onset;
  readonly coda?: Coda;
  readonly vowel: VowelId;
  readonly glideTo?: VowelId;
  readonly f0Start: number;
  readonly f0End: number;
  readonly seconds: number;
  readonly gapAfter?: number;
  readonly gain?: number;
  readonly breath?: number;
  readonly attack?: number;
  readonly vibratoHz?: number;
  readonly vibratoDepth?: number;
}

interface Resonator {
  a: number;
  b: number;
  c: number;
  y1: number;
  y2: number;
}

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function resonatorCoeffs(sr: number, f: number, bw: number): Resonator {
  const r = Math.exp((-Math.PI * bw) / sr);
  const c = -r * r;
  const b = 2 * r * Math.cos((2 * Math.PI * f) / sr);
  return { a: 1 - b - c, b, c, y1: 0, y2: 0 };
}

export function resonatorsFor(sr: number, formants: readonly VowelFormant[]): Resonator[] {
  return formants.map((formant) => resonatorCoeffs(sr, formant.f, formant.bw));
}

function runResonator(res: Resonator, x: number): number {
  const y = res.a * x + res.b * res.y1 + res.c * res.y2;
  res.y2 = res.y1;
  res.y1 = y;
  return y;
}

function morphFormants(from: VowelId, to: VowelId | undefined, mix: number): VowelFormant[] {
  const a = VOWEL_FORMANTS[from];
  const b = to === undefined ? a : VOWEL_FORMANTS[to];
  return a.map((fa, i) => {
    const fb = b[Math.min(i, b.length - 1)];
    return { f: fa.f + (fb.f - fa.f) * mix, bw: fa.bw + (fb.bw - fa.bw) * mix };
  });
}

function eventEnvelope(t: number, dur: number, attack: number): number {
  const head = Math.min(1, t / Math.max(0.001, attack));
  const tail = Math.min(1, (dur - t) / 0.06);
  return Math.max(0, Math.min(head, tail));
}

export function renderVoice(sr: number, events: readonly VoiceEvent[], seed = 7): Float32Array {
  const rand = mulberry32(seed);
  const total = eventSamples(sr, events);
  const out = new Float32Array(total);
  const state = { phase: 0 };
  let cursor = 0;
  for (const event of events) cursor = renderEvent(sr, event, rand, state, out, cursor);
  applyRadiation(out);
  return out;
}

/** Lip radiation: gentle first-difference highpass clearing flow mud. */
function applyRadiation(out: Float32Array): void {
  let prev = 0;
  for (let i = 0; i < out.length; i++) {
    const x = out[i];
    out[i] = x - 0.35 * prev;
    prev = x;
  }
}

function eventSamples(sr: number, events: readonly VoiceEvent[]): number {
  let total = 0;
  for (const event of events) {
    total += Math.floor(event.seconds * sr) + Math.floor((event.gapAfter ?? 0) * sr);
    if (event.onset) total += Math.floor(event.onset.seconds * sr);
    if (event.coda) total += Math.floor(event.coda.seconds * sr);
  }
  return total;
}

interface VoiceState {
  phase: number;
}

function renderEvent(
  sr: number,
  event: VoiceEvent,
  rand: () => number,
  state: VoiceState,
  out: Float32Array,
  cursor: number
): number {
  const count = Math.floor(event.seconds * sr);
  const gain = event.gain ?? 0.8;
  const resonators = resonatorsFor(sr, VOWEL_FORMANTS[event.vowel]);
  let at = cursor;
  if (event.onset) at = renderOnset(sr, event.onset, event, gain, rand, resonators, state, out, at);
  const overlap =
    event.onset && ONSET_RECIPES[event.onset.kind].burst ? Math.floor(VOT_OVERLAP_SEC * sr) : 0;
  const locus = event.onset ? CONSONANT_LOCI[event.onset.kind] : undefined;
  for (let i = 0; i < count; i++) {
    if (i % 64 === 0) retuneLocus(sr, resonators, event, locus, i / sr, i / count);
    out[at - overlap + i] +=
      voiceSample(sr, event, resonators, rand, state, i / sr, count / sr) * gain;
  }
  at += count;
  if (event.coda) at = renderCoda(sr, event.coda, gain, rand, out, at);
  return renderGap(sr, event, out, at);
}

/** F2 starts at the consonant locus and releases to the vowel in 50 ms. */
function retuneLocus(
  sr: number,
  resonators: Resonator[],
  event: VoiceEvent,
  locusF2: number | undefined,
  tInEvent: number,
  glideMix: number
): void {
  retuneResonators(sr, resonators, event.vowel, event.glideTo, glideMix);
  if (locusF2 === undefined) return;
  const blend = Math.min(1, tInEvent / LOCUS_GLIDE_SEC);
  if (blend >= 1) return;
  const targets = morphFormants(event.vowel, event.glideTo, glideMix);
  const next = resonatorCoeffs(sr, locusF2 + (targets[1].f - locusF2) * blend, targets[1].bw);
  const res = resonators[1];
  res.a = next.a;
  res.b = next.b;
  res.c = next.c;
}

function retuneResonators(
  sr: number,
  resonators: Resonator[],
  from: VowelId,
  to: VowelId | undefined,
  mix: number
): void {
  const targets = morphFormants(from, to, mix);
  for (let i = 0; i < resonators.length; i++) {
    const next = resonatorCoeffs(sr, targets[i].f, targets[i].bw);
    const res = resonators[i];
    res.a = next.a;
    res.b = next.b;
    res.c = next.c;
  }
}

/**
 * Liljencrants-Fant style glottal pulse: skewed rise, snapped close,
 * tiny return dip. Naturally tilted spectrum, no click train, no filter.
 */
export function glottalPulse(phase: number): number {
  const p = phase - Math.floor(phase);
  const Te = 0.62;
  if (p < Te) return Math.sin(Math.PI * (p / Te) ** 1.3);
  return -0.25 * Math.sin((Math.PI * (p - Te)) / (1 - Te));
}

function voiceSample(
  sr: number,
  event: VoiceEvent,
  resonators: Resonator[],
  rand: () => number,
  state: VoiceState,
  tInEvent: number,
  dur: number
): number {
  const f0 = eventF0(event, tInEvent, tInEvent / dur);
  state.phase = (state.phase + f0 / sr) % 1;
  const breath = (event.breath ?? 0.3) * 0.4 * (rand() * 2 - 1);
  let sample = glottalPulse(state.phase) * 0.9 + breath;
  for (const res of resonators) sample = runResonator(res, sample);
  return shapeSample(sample * eventEnvelope(tInEvent, dur, event.attack ?? 0.015), event.drive ?? 0);
}

/** PA-style saturation: overdriven shout grit, bypassed at zero drive. */
function shapeSample(sample: number, drive: number): number {
  if (drive <= 0) return sample;
  return Math.tanh(sample * (1 + drive * 2));
}

function eventF0(event: VoiceEvent, tAbs: number, mix: number): number {
  const base = event.f0Start + (event.f0End - event.f0Start) * mix;
  const vibHz = event.vibratoHz ?? 0;
  const vibDepth = event.vibratoDepth ?? 0;
  if (vibHz <= 0 || vibDepth <= 0) return base;
  return base * (1 + vibDepth * Math.sin(2 * Math.PI * vibHz * tAbs));
}

interface FilterVoice {
  res: Resonator;
  gain: number;
}

function burstVoice(sr: number, freq: number, q: number, gain: number): FilterVoice {
  return { res: resonatorCoeffs(sr, freq, freq / Math.max(0.5, q)), gain };
}

function murmurSample(sr: number, f0: number, state: VoiceState): number {
  state.phase += f0 / sr;
  if (state.phase >= 1) state.phase -= 1;
  return Math.sin(2 * Math.PI * state.phase) * 0.35;
}

function renderOnset(
  sr: number,
  onset: Onset,
  event: VoiceEvent,
  gain: number,
  rand: () => number,
  resonators: Resonator[],
  state: VoiceState,
  out: Float32Array,
  cursor: number
): number {
  const recipe = ONSET_RECIPES[onset.kind];
  const count = Math.floor(onset.seconds * sr);
  const gapEnd = Math.floor(count * recipe.gap);
  const murEnd = Math.floor(count * (recipe.gap + recipe.murmur));
  const burst = recipe.burst
    ? burstVoice(sr, recipe.burst[0], recipe.burst[1], recipe.burst[2])
    : null;
  const hiss = recipe.hiss ? burstVoice(sr, recipe.hiss[0], 1, recipe.hiss[1]) : null;
  const from = recipe.glide ?? event.vowel;
  for (let i = 0; i < count; i++) {
    if (i % 64 === 0) retuneResonators(sr, resonators, from, event.vowel, i / Math.max(1, count));
    out[cursor + i] =
      onsetSample(
        sr,
        burst,
        hiss,
        rand,
        resonators,
        state,
        event,
        i,
        gapEnd,
        murEnd,
        count
      ) * gain;
  }
  return cursor + count;
}

function onsetSample(
  sr: number,
  burst: FilterVoice | null,
  hiss: FilterVoice | null,
  rand: () => number,
  resonators: Resonator[],
  state: VoiceState,
  event: VoiceEvent,
  i: number,
  gapEnd: number,
  murEnd: number,
  count: number
): number {
  if (i < gapEnd) return 0;
  let chain = 0;
  if (i < murEnd) chain = murmurSample(sr, event.f0Start, state);
  for (const res of resonators) chain = runResonator(res, chain);
  const sinceBurst = (i - gapEnd) / sr;
  if (burst)
    chain += runResonator(burst.res, rand() * 2 - 1) * Math.exp(-sinceBurst * 140) * burst.gain;
  if (hiss) chain += runResonator(hiss.res, rand() * 2 - 1) * hiss.gain * (1 - i / count);
  return shapeSample(chain, event.drive ?? 0);
}

function renderCoda(
  sr: number,
  coda: Coda,
  gain: number,
  rand: () => number,
  out: Float32Array,
  cursor: number
): number {
  const count = Math.floor(coda.seconds * sr);
  const [freq, bw, peak] = CODA_FILTERS[coda.kind];
  const filter = resonatorCoeffs(sr, freq, bw);
  for (let i = 0; i < count; i++) {
    const env = Math.min(1, i / (0.01 * sr)) * (1 - i / count);
    out[cursor + i] = runResonator(filter, rand() * 2 - 1) * peak * env * gain;
  }
  return cursor + count;
}

function renderGap(sr: number, event: VoiceEvent, out: Float32Array, cursor: number): number {
  const gap = Math.floor((event.gapAfter ?? 0) * sr);
  for (let i = 0; i < gap; i++) out[cursor + i] = 0;
  return cursor + gap;
}
