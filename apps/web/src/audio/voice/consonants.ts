/**
 * Consonant onset and coda recipes for hype-shout synthesis.
 * Stops seal the throat then burst, fricatives hiss, voiced kinds murmur,
 * glides bend the throat from a neighbor vowel. Pure data, no audio.
 */

import type { VowelId } from './vowels';

export type OnsetKind =
  | 'p'
  | 't'
  | 'k'
  | 'b'
  | 'd'
  | 'g'
  | 'm'
  | 'n'
  | 's'
  | 'z'
  | 'f'
  | 'sh'
  | 'h'
  | 'v'
  | 'w'
  | 'y'
  | 'r'
  | 'l';

export interface Onset {
  readonly kind: OnsetKind;
  readonly seconds: number;
}

export interface OnsetRecipe {
  readonly gap: number;
  readonly murmur: number;
  readonly burst: readonly [number, number, number] | null;
  readonly hiss: readonly [number, number] | null;
  readonly glide: VowelId | null;
}

export const ONSET_RECIPES: Record<OnsetKind, OnsetRecipe> = {
  p: { gap: 0.6, murmur: 0, burst: [1200, 2, 0.8], hiss: null, glide: null },
  t: { gap: 0.6, murmur: 0, burst: [4500, 2, 0.9], hiss: null, glide: null },
  k: { gap: 0.6, murmur: 0, burst: [2500, 2, 0.9], hiss: null, glide: null },
  b: { gap: 0.5, murmur: 0.15, burst: [1000, 2, 0.8], hiss: null, glide: null },
  d: { gap: 0.5, murmur: 0.15, burst: [4000, 2, 0.8], hiss: null, glide: null },
  g: { gap: 0.65, murmur: 0, burst: [2300, 2.5, 1.1], hiss: null, glide: null },
  m: { gap: 0, murmur: 1, burst: null, hiss: null, glide: null },
  n: { gap: 0, murmur: 1, burst: null, hiss: null, glide: null },
  s: { gap: 0, murmur: 0, burst: null, hiss: [6500, 0.5], glide: null },
  z: { gap: 0, murmur: 0.5, burst: null, hiss: [6500, 0.4], glide: null },
  f: { gap: 0, murmur: 0, burst: null, hiss: [2500, 0.4], glide: null },
  sh: { gap: 0, murmur: 0, burst: null, hiss: [2800, 0.5], glide: null },
  h: { gap: 0, murmur: 0, burst: null, hiss: [1800, 0.35], glide: null },
  v: { gap: 0, murmur: 0.8, burst: null, hiss: [1400, 0.3], glide: null },
  w: { gap: 0, murmur: 1, burst: null, hiss: null, glide: 'oo' },
  y: { gap: 0, murmur: 1, burst: null, hiss: null, glide: 'ee' },
  r: { gap: 0, murmur: 1, burst: null, hiss: null, glide: 'oo' },
  l: { gap: 0, murmur: 1, burst: null, hiss: null, glide: 'oo' },
};

export type CodaKind = 's' | 'v' | 'f' | 'sh';

export interface Coda {
  readonly kind: CodaKind;
  readonly seconds: number;
}

export const CODA_FILTERS: Record<CodaKind, readonly [number, number, number]> = {
  s: [6500, 1500, 0.5],
  v: [1200, 600, 0.5],
  f: [2500, 1200, 0.4],
  sh: [2800, 1500, 0.5],
};
