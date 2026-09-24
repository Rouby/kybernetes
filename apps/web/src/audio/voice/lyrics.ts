/**
 * Hype-word recipes: hand-tuned Scooter-grade shouts as voice events.
 * Onsets crack, vowels scoop, codas spit. Pure data builders, no audio.
 */

import type { VoiceEvent } from './klatt';

export type HypeWord = 'go' | 'hey' | 'yes' | 'rave' | 'high';

export const HYPE_WORDS: readonly HypeWord[] = ['go', 'hey', 'yes', 'rave', 'high'];

function wordGo(): VoiceEvent[] {
  return [
    {
      onset: { kind: 'g', seconds: 0.18 },
      vowel: 'oh',
      f0Start: 165,
      f0End: 150,
      seconds: 0.4,
      gain: 0.9,
      breath: 0.2,
      attack: 0.004,
      drive: 0.8,
    },
  ];
}

function wordHey(): VoiceEvent[] {
  return [
    {
      onset: { kind: 'h', seconds: 0.09 },
      vowel: 'eh',
      glideTo: 'ee',
      f0Start: 175,
      f0End: 155,
      seconds: 0.3,
      gain: 0.9,
      breath: 0.2,
      attack: 0.005,
    },
  ];
}

function wordYes(): VoiceEvent[] {
  return [
    {
      onset: { kind: 'y', seconds: 0.06 },
      vowel: 'eh',
      f0Start: 190,
      f0End: 170,
      seconds: 0.18,
      gain: 0.9,
      breath: 0.2,
      attack: 0.005,
      coda: { kind: 's', seconds: 0.12 },
    },
  ];
}

function wordRave(): VoiceEvent[] {
  return [
    {
      onset: { kind: 'r', seconds: 0.08 },
      vowel: 'eh',
      glideTo: 'ee',
      f0Start: 150,
      f0End: 135,
      seconds: 0.3,
      gain: 0.9,
      breath: 0.2,
      attack: 0.005,
      coda: { kind: 'v', seconds: 0.14 },
    },
  ];
}

function wordHigh(): VoiceEvent[] {
  return [
    {
      onset: { kind: 'h', seconds: 0.09 },
      vowel: 'ah',
      glideTo: 'ee',
      f0Start: 200,
      f0End: 175,
      seconds: 0.45,
      gain: 0.9,
      breath: 0.2,
      attack: 0.005,
    },
  ];
}

export function hypeWord(word: HypeWord): VoiceEvent[] {
  if (word === 'go') return wordGo();
  if (word === 'hey') return wordHey();
  if (word === 'yes') return wordYes();
  if (word === 'rave') return wordRave();
  return wordHigh();
}
