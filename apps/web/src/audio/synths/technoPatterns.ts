/**
 * Techno pattern helpers: structural groove rules (shared by every track)
 * plus track-parameterized lookups into a TechnoTrack composition.
 * No DOM, no Web Audio — Vitest pins every decision without a context.
 */

import type { TechnoTrack } from './technoTracks';

export const TECHNO_BPM = 144;
export const TECHNO_STEPS_PER_LOOP = 32;

export function technoStepDurationSec(bpm: number = TECHNO_BPM): number {
  return 60 / bpm / 4;
}

export function midiToFreq(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function isKickStep(step: number): boolean {
  return step % 4 === 0;
}

export function isOpenHatStep(step: number): boolean {
  return step % 4 === 2;
}

export function isClosedHatStep(step: number): boolean {
  return step % 2 === 1;
}

export function isClapStep(step: number): boolean {
  const inBar = ((step % 16) + 16) % 16;
  return inBar === 4 || inBar === 12;
}

function loopStep(step: number): number {
  return ((step % TECHNO_STEPS_PER_LOOP) + TECHNO_STEPS_PER_LOOP) % TECHNO_STEPS_PER_LOOP;
}

export function bassMidiForStep(track: TechnoTrack, step: number): number {
  return track.bassRoot + track.bassOffsets[loopStep(step)];
}

export function isStabStep(track: TechnoTrack, step: number): boolean {
  return track.stabSteps.includes(loopStep(step));
}

/** Relentless bar-2 riff, every loop (schranz never rests). */
export function leadMidiForStep(track: TechnoTrack, step: number): number | null {
  const idx = loopStep(step);
  if (idx < 16) return null;
  const offset = track.leadOffsets[idx - 16];
  return offset === null || offset === undefined ? null : track.leadRoot + offset;
}

export function sirenShouldSound(track: TechnoTrack, loopIndex: number): boolean {
  const every = track.sirenEveryLoops;
  return every > 0 && loopIndex % every === every - 1;
}

export type TechnoVowel = 'ah' | 'eh' | 'ee' | 'oh';

export interface VocalChop {
  readonly step: number;
  readonly offset: number;
  readonly vowel: TechnoVowel;
}

export function vocalChopAt(track: TechnoTrack, step: number): VocalChop | null {
  const idx = loopStep(step);
  return track.chops.find((chop) => chop.step === idx) ?? null;
}

export function vocalMidiForChop(track: TechnoTrack, chop: VocalChop): number {
  return track.vocalRoot + chop.offset;
}

export function isRideStep(step: number): boolean {
  return step % 2 === 0;
}

export function isKnockStep(track: TechnoTrack, step: number): boolean {
  return track.knockSteps.includes(loopStep(step));
}

export function tomMidiForStep(track: TechnoTrack, step: number, loopIndex: number): number | null {
  if (loopIndex % 2 === 0) return null;
  return track.tomFill.find((fill) => fill[0] === loopStep(step))?.[1] ?? null;
}

export function crashShouldSound(track: TechnoTrack, step: number, loopIndex: number): boolean {
  const every = track.crashEveryLoops;
  return every > 0 && loopStep(step) === 0 && loopIndex % every === 0;
}

export function acidMidiForStep(track: TechnoTrack, step: number): number | null {
  return track.acidAccents.find((accent) => accent[0] === loopStep(step))?.[1] ?? null;
}

export type TechnoVoice =
  | 'kick'
  | 'hat'
  | 'clap'
  | 'ride'
  | 'knock'
  | 'toms'
  | 'crash'
  | 'bass'
  | 'acid'
  | 'stab'
  | 'chop'
  | 'lead'
  | 'siren';

export const TECHNO_VOICES: readonly TechnoVoice[] = [
  'kick',
  'hat',
  'clap',
  'ride',
  'knock',
  'toms',
  'crash',
  'bass',
  'acid',
  'stab',
  'chop',
  'lead',
  'siren',
];

export const TECHNO_VOICE_LABELS: Record<TechnoVoice, string> = {
  kick: 'KICK',
  hat: 'HATS',
  clap: 'CLAP',
  ride: 'RIDE',
  knock: 'KNOCK',
  toms: 'TOMS',
  crash: 'CRASH',
  bass: 'BASS',
  acid: 'ACID',
  stab: 'STAB',
  chop: 'CHOP',
  lead: 'LEAD',
  siren: 'SIREN',
};

/** Static hit steps per voice for a track and loop (toms/siren are loop-aware). */
export function voiceHitSteps(
  track: TechnoTrack,
  voice: TechnoVoice,
  loopIndex: number
): readonly number[] {
  const steps: number[] = [];
  for (let step = 0; step < TECHNO_STEPS_PER_LOOP; step++) {
    if (voiceHitsStep(track, voice, step, loopIndex)) steps.push(step);
  }
  return steps;
}

type HitTest = (track: TechnoTrack, step: number, loop: number) => boolean;

const VOICE_HIT_TESTS: Record<TechnoVoice, HitTest> = {
  kick: (_track, step) => isKickStep(step),
  hat: (_track, step) => isOpenHatStep(step) || isClosedHatStep(step),
  clap: (_track, step) => isClapStep(step),
  ride: (_track, step) => isRideStep(step),
  knock: (track, step) => isKnockStep(track, step),
  toms: (track, step, loop) => tomMidiForStep(track, step, loop) !== null,
  crash: (track, step, loop) => crashShouldSound(track, step, loop),
  bass: (track, step) => loopStep(step) % track.bassStride === track.bassPhase,
  acid: (track, step) => acidMidiForStep(track, step) !== null,
  stab: (track, step) => isStabStep(track, step),
  chop: (track, step) => vocalChopAt(track, step) !== null,
  lead: (track, step) => leadMidiForStep(track, step) !== null,
  siren: (track, step, loop) => step === 0 && sirenShouldSound(track, loop),
};

function voiceHitsStep(
  track: TechnoTrack,
  voice: TechnoVoice,
  step: number,
  loopIndex: number
): boolean {
  return VOICE_HIT_TESTS[voice](track, step, loopIndex);
}
