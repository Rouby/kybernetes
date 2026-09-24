/**
 * TechnoTrack: a saved song as pure data. The scheduler (TechnoMusicSynth)
 * is the decks-and-mixer engine; tracks are the vinyl. No DOM, no audio.
 */

import type { VocalChop } from './technoPatterns';
import type { ChantKind } from './VocalChantSynth';

export interface TechnoTrack {
  readonly id: string;
  readonly title: string;
  readonly bpm: number;
  readonly bassRoot: number;
  readonly bassOffsets: readonly number[];
  readonly bassStride: 1 | 2 | 4;
  readonly bassPhase: number;
  readonly leadRoot: number;
  readonly leadOffsets: readonly (number | null)[];
  readonly vocalRoot: number;
  readonly chops: readonly VocalChop[];
  readonly stabMidis: readonly number[];
  readonly stabSteps: readonly number[];
  readonly knockSteps: readonly number[];
  readonly tomFill: readonly (readonly [number, number])[];
  readonly acidAccents: readonly (readonly [number, number])[];
  readonly pluck: readonly (readonly [number, number])[];
  readonly crashEveryLoops: number;
  readonly sirenEveryLoops: number;
  readonly vox: readonly VoxHit[];
  readonly defaultIntensity: number;
  readonly defaultFreak: number;
}

export interface VoxHit {
  readonly step: number;
  readonly kind: ChantKind;
  readonly everyLoops: number;
}

/** Song 1: the original freaky hardgroove loop, F minor at 144 BPM. */
export const FREAKY_MAIN_TRACK: TechnoTrack = {
  id: 'freaky-main',
  title: 'Reactor Rave',
  bpm: 144,
  bassRoot: 29,
  bassOffsets: [
    0, 0, 12, 0, 0, 0, 12, 0, 0, 0, 0, 0, 1, 0, 12, 0, 0, 0, 12, 0, 3, 0, 12, 0, 0, 0, 8, 0, 1, 0,
    10, 12,
  ],
  bassStride: 1,
  bassPhase: 0,
  leadRoot: 65,
  leadOffsets: [12, null, 12, 13, 12, null, 12, 10, 12, null, 13, 12, 7, null, 1, 12],
  vocalRoot: 77,
  chops: [
    { step: 8, offset: 12, vowel: 'ah' },
    { step: 10, offset: 15, vowel: 'ah' },
    { step: 11, offset: 13, vowel: 'eh' },
    { step: 12, offset: 12, vowel: 'oh' },
    { step: 14, offset: 10, vowel: 'ee' },
  ],
  stabMidis: [53, 56, 60, 61],
  stabSteps: [16, 23, 30],
  knockSteps: [7, 15, 23, 29],
  tomFill: [
    [24, 41],
    [26, 41],
    [27, 39],
    [28, 36],
    [29, 39],
    [30, 36],
    [31, 29],
  ],
  acidAccents: [
    [6, 53],
    [22, 54],
  ],
  pluck: [],
  crashEveryLoops: 2,
  sirenEveryLoops: 8,
  vox: [],
  defaultIntensity: 0.6,
  defaultFreak: 0.7,
};

/** Song 2: darker D-minor chapel groove at 140 BPM, driving 8th-note bass. */
export const IRON_CHAPEL_TRACK: TechnoTrack = {
  id: 'iron-chapel',
  title: 'Iron Chapel',
  bpm: 140,
  bassRoot: 26,
  bassOffsets: [
    0, 0, 12, 0, 0, 0, 10, 0, 0, 0, 12, 0, 3, 0, 8, 0, 7, 0, 5, 0, 3, 0, 1, 0, 0, 0, 12, 0, 10, 0,
    7, 0,
  ],
  bassStride: 2,
  bassPhase: 0,
  leadRoot: 62,
  leadOffsets: [12, null, null, 12, null, 10, null, null, 8, null, 7, null, 5, null, 3, 1],
  vocalRoot: 74,
  chops: [
    { step: 8, offset: 0, vowel: 'oh' },
    { step: 11, offset: -2, vowel: 'oh' },
    { step: 12, offset: -4, vowel: 'eh' },
    { step: 14, offset: -5, vowel: 'ah' },
  ],
  stabMidis: [50, 53, 57, 60],
  stabSteps: [20, 27],
  knockSteps: [11, 19, 27],
  tomFill: [
    [24, 38],
    [26, 38],
    [27, 36],
    [28, 34],
    [29, 36],
    [30, 34],
    [31, 26],
  ],
  acidAccents: [
    [14, 50],
    [30, 49],
  ],
  pluck: [],
  crashEveryLoops: 4,
  sirenEveryLoops: 0,
  vox: [],
  defaultIntensity: 0.7,
  defaultFreak: 0.6,
};

/** Song 3: 1999 rave anthem — A minor at 138 BPM, offbeat pumping bass. */
export const RAVE_99_TRACK: TechnoTrack = {
  id: 'rave-99',
  title: 'Rave 99',
  bpm: 138,
  bassRoot: 33,
  bassOffsets: [
    0, 0, 0, 0, 0, 0, 12, 0, 0, 0, 0, 0, 0, 0, 12, 0, 0, 0, 3, 0, 0, 0, 12, 0, 0, 0, 10, 0, 0, 0, 7,
    0,
  ],
  bassStride: 4,
  bassPhase: 2,
  leadRoot: 69,
  leadOffsets: [12, null, 12, null, 15, null, 12, null, 10, null, 12, null, 7, 12, 19, 12],
  vocalRoot: 81,
  chops: [
    { step: 8, offset: 0, vowel: 'ah' },
    { step: 10, offset: 3, vowel: 'eh' },
    { step: 12, offset: 7, vowel: 'ah' },
    { step: 14, offset: 12, vowel: 'ee' },
  ],
  stabMidis: [57, 60, 64, 67],
  stabSteps: [16, 24],
  knockSteps: [3, 11, 19, 27],
  tomFill: [
    [24, 45],
    [26, 45],
    [27, 43],
    [28, 41],
    [29, 43],
    [30, 41],
    [31, 33],
  ],
  acidAccents: [
    [6, 45],
    [14, 48],
    [22, 45],
    [30, 43],
  ],
  pluck: [],
  crashEveryLoops: 2,
  sirenEveryLoops: 0,
  vox: [
    { step: 0, kind: 'oh', everyLoops: 2 },
    { step: 8, kind: 'go', everyLoops: 4 },
    { step: 10, kind: 'go', everyLoops: 8 },
    { step: 16, kind: 'aah', everyLoops: 8 },
    { step: 24, kind: 'hey', everyLoops: 8 },
  ],
  defaultIntensity: 0.75,
  defaultFreak: 0.7,
};

/**
 * Song 4: a sparse G-minor bed built around the voice. No lead riffs,
 * chops, acid or stabs fighting the formants — kick, hats, ride, a simple
 * 8th bass, sparse knocks and toms, high pluck answers, and the vox hook
 * as the lead instrument.
 */
export const HYMN_TRACK: TechnoTrack = {
  id: 'hymn',
  title: 'Hymn',
  bpm: 142,
  bassRoot: 31,
  bassOffsets: [
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 12, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 7, 0, 0, 0, 5, 0, 0, 0, 10,
    0,
  ],
  bassStride: 2,
  bassPhase: 0,
  leadRoot: 79,
  leadOffsets: [
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
  ],
  vocalRoot: 74,
  chops: [],
  stabMidis: [],
  stabSteps: [],
  knockSteps: [11, 27],
  tomFill: [
    [24, 43],
    [26, 43],
    [27, 41],
    [28, 39],
    [29, 41],
    [30, 39],
    [31, 31],
  ],
  acidAccents: [],
  pluck: [
    [4, 79],
    [20, 86],
    [28, 84],
  ],
  crashEveryLoops: 4,
  sirenEveryLoops: 0,
  vox: [
    { step: 0, kind: 'oh', everyLoops: 2 },
    { step: 8, kind: 'go', everyLoops: 4 },
    { step: 12, kind: 'hey', everyLoops: 4 },
    { step: 16, kind: 'aah', everyLoops: 8 },
    { step: 24, kind: 'yes', everyLoops: 8 },
  ],
  defaultIntensity: 0.7,
  defaultFreak: 0.5,
};

export const TECHNO_TRACKS: readonly TechnoTrack[] = [
  FREAKY_MAIN_TRACK,
  IRON_CHAPEL_TRACK,
  RAVE_99_TRACK,
  HYMN_TRACK,
];

export function trackById(id: string): TechnoTrack {
  return TECHNO_TRACKS.find((track) => track.id === id) ?? FREAKY_MAIN_TRACK;
}
