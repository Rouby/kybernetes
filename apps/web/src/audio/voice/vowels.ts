/**
 * Vowel formant tables (adult male, Peterson-Barney inspired).
 * Each vowel is five [frequencyHz, bandwidthHz] cascade resonators.
 * Pure data, no audio.
 */

export type VowelId = 'ah' | 'eh' | 'ee' | 'oh' | 'oo';

export interface VowelFormant {
  readonly f: number;
  readonly bw: number;
}

export const VOWEL_FORMANTS: Record<VowelId, readonly VowelFormant[]> = {
  ah: [
    { f: 730, bw: 80 },
    { f: 1090, bw: 90 },
    { f: 2440, bw: 120 },
    { f: 3300, bw: 150 },
    { f: 4000, bw: 200 },
  ],
  eh: [
    { f: 530, bw: 70 },
    { f: 1840, bw: 100 },
    { f: 2480, bw: 120 },
    { f: 3400, bw: 150 },
    { f: 4050, bw: 200 },
  ],
  ee: [
    { f: 270, bw: 60 },
    { f: 2290, bw: 100 },
    { f: 3010, bw: 120 },
    { f: 3300, bw: 150 },
    { f: 4000, bw: 200 },
  ],
  oh: [
    { f: 500, bw: 80 },
    { f: 1000, bw: 100 },
    { f: 2800, bw: 120 },
    { f: 3300, bw: 150 },
    { f: 4000, bw: 200 },
  ],
  oo: [
    { f: 300, bw: 60 },
    { f: 870, bw: 80 },
    { f: 2240, bw: 120 },
    { f: 3300, bw: 150 },
    { f: 4000, bw: 200 },
  ],
};
