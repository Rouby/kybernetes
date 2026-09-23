/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import {
  acidMidiForStep,
  bassMidiForStep,
  crashShouldSound,
  isClapStep,
  isClosedHatStep,
  isKickStep,
  isKnockStep,
  isOpenHatStep,
  isRideStep,
  isStabStep,
  leadMidiForStep,
  midiToFreq,
  sirenShouldSound,
  TECHNO_BPM,
  TECHNO_STEPS_PER_LOOP,
  technoStepDurationSec,
  tomMidiForStep,
  vocalChopAt,
  vocalMidiForChop,
  voiceHitSteps,
} from './technoPatterns';
import { FREAKY_MAIN_TRACK, IRON_CHAPEL_TRACK, RAVE_99_TRACK } from './technoTracks';

const MAIN = FREAKY_MAIN_TRACK;
const CHAPEL = IRON_CHAPEL_TRACK;

describe('technoPatterns groove', () => {
  it('runs a 2-bar 16th loop at peak-time tempo', () => {
    expect(TECHNO_BPM).toBe(144);
    expect(TECHNO_STEPS_PER_LOOP).toBe(32);
    expect(technoStepDurationSec()).toBeCloseTo(60 / 144 / 4, 9);
    expect(technoStepDurationSec(CHAPEL.bpm)).toBeCloseTo(60 / 140 / 4, 9);
  });

  it('keeps four-on-the-floor with offbeat open hats', () => {
    for (let step = 0; step < 32; step++) {
      expect(isKickStep(step)).toBe(step % 4 === 0);
      expect(isOpenHatStep(step)).toBe(step % 4 === 2);
      expect(isClosedHatStep(step)).toBe(step % 2 === 1);
      expect(isRideStep(step)).toBe(step % 2 === 0);
    }
  });

  it('claps on beats 2 and 4 of each bar', () => {
    expect(isClapStep(4)).toBe(true);
    expect(isClapStep(12)).toBe(true);
    expect(isClapStep(20)).toBe(true);
    expect(isClapStep(28)).toBe(true);
    expect(isClapStep(0)).toBe(false);
    expect(isClapStep(8)).toBe(false);
  });

  it('rolls the bass around F1 with a b2 freak creep', () => {
    expect(bassMidiForStep(MAIN, 0)).toBe(29);
    expect(bassMidiForStep(MAIN, 2)).toBe(41);
    expect(bassMidiForStep(MAIN, 12)).toBe(30);
    expect(bassMidiForStep(MAIN, 28)).toBe(30);
    expect(midiToFreq(69)).toBeCloseTo(440, 6);
  });

  it('stabs on the bar-2 downbeat plus offbeat chops', () => {
    expect(isStabStep(MAIN, 16)).toBe(true);
    expect(isStabStep(MAIN, 23)).toBe(true);
    expect(isStabStep(MAIN, 30)).toBe(true);
    expect(isStabStep(MAIN, 0)).toBe(false);
    expect(isStabStep(MAIN, 17)).toBe(false);
    expect(isStabStep(CHAPEL, 20)).toBe(true);
    expect(isStabStep(CHAPEL, 27)).toBe(true);
    expect(isStabStep(CHAPEL, 16)).toBe(false);
  });

  it('hammers the industrial lead on bar 2 of every loop', () => {
    expect(leadMidiForStep(MAIN, 0)).toBeNull();
    expect(leadMidiForStep(MAIN, 16)).toBe(77);
    expect(leadMidiForStep(MAIN, 17)).toBeNull();
    expect(leadMidiForStep(MAIN, 30)).toBe(66);
    expect(leadMidiForStep(MAIN, 31)).toBe(77);
    expect(leadMidiForStep(CHAPEL, 16)).toBe(74);
    expect(leadMidiForStep(CHAPEL, 30)).toBe(65);
    expect(leadMidiForStep(CHAPEL, 31)).toBe(63);
  });

  it('saves the siren for every 8th loop, never on the chapel', () => {
    expect(sirenShouldSound(MAIN, 7)).toBe(true);
    expect(sirenShouldSound(MAIN, 15)).toBe(true);
    expect(sirenShouldSound(MAIN, 3)).toBe(false);
    expect(sirenShouldSound(MAIN, 0)).toBe(false);
    expect(sirenShouldSound(CHAPEL, 7)).toBe(false);
    expect(crashShouldSound(MAIN, 0, 0)).toBe(true);
    expect(crashShouldSound(MAIN, 0, 1)).toBe(false);
    expect(crashShouldSound(MAIN, 0, 2)).toBe(true);
    expect(crashShouldSound(CHAPEL, 0, 2)).toBe(false);
    expect(crashShouldSound(CHAPEL, 0, 4)).toBe(true);
  });

  it('chops a five-hit vocal hook on the back half of bar 1', () => {
    expect(vocalChopAt(MAIN, 0)).toBeNull();
    expect(vocalChopAt(MAIN, 9)).toBeNull();
    expect(vocalChopAt(MAIN, 8)).toEqual({ step: 8, offset: 12, vowel: 'ah' });
    expect(vocalChopAt(MAIN, 10)?.vowel).toBe('ah');
    expect(vocalChopAt(MAIN, 11)?.vowel).toBe('eh');
    expect(vocalChopAt(MAIN, 12)?.vowel).toBe('oh');
    expect(vocalChopAt(MAIN, 14)).toEqual({ step: 14, offset: 10, vowel: 'ee' });
    expect(vocalChopAt(MAIN, 16)).toBeNull();
    expect(vocalChopAt(CHAPEL, 8)).toEqual({ step: 8, offset: 0, vowel: 'oh' });
    expect(vocalChopAt(CHAPEL, 10)).toBeNull();
  });

  it('syncopates knocks off the grid', () => {
    expect(isKnockStep(MAIN, 7)).toBe(true);
    expect(isKnockStep(MAIN, 8)).toBe(false);
    expect(isKnockStep(CHAPEL, 11)).toBe(true);
    expect(isKnockStep(CHAPEL, 7)).toBe(false);
  });

  it('maps static hit steps per voice for the lab grid', () => {
    expect(voiceHitSteps(MAIN, 'kick', 0)).toEqual([0, 4, 8, 12, 16, 20, 24, 28]);
    expect(voiceHitSteps(MAIN, 'clap', 0)).toEqual([4, 12, 20, 28]);
    expect(voiceHitSteps(MAIN, 'stab', 0)).toEqual([16, 23, 30]);
    expect(voiceHitSteps(MAIN, 'chop', 0)).toEqual([8, 10, 11, 12, 14]);
    expect(voiceHitSteps(MAIN, 'bass', 0)).toHaveLength(32);
    expect(voiceHitSteps(CHAPEL, 'bass', 0)).toHaveLength(16);
    expect(voiceHitSteps(RAVE_99_TRACK, 'bass', 0)).toEqual([2, 6, 10, 14, 18, 22, 26, 30]);
    expect(voiceHitSteps(MAIN, 'hat', 0)).toHaveLength(24);
    expect(voiceHitSteps(MAIN, 'lead', 0)).toEqual([
      16, 18, 19, 20, 22, 23, 24, 26, 27, 28, 30, 31,
    ]);
    expect(voiceHitSteps(MAIN, 'lead', 1)).toEqual(voiceHitSteps(MAIN, 'lead', 0));
    expect(voiceHitSteps(MAIN, 'siren', 0)).toEqual([]);
    expect(voiceHitSteps(MAIN, 'siren', 7)).toEqual([0]);
  });

  it('maps the drum and synth layers for the lab grid', () => {
    expect(voiceHitSteps(MAIN, 'ride', 0)).toHaveLength(16);
    expect(voiceHitSteps(MAIN, 'ride', 0)[0]).toBe(0);
    expect(voiceHitSteps(MAIN, 'knock', 0)).toEqual([7, 15, 23, 29]);
    expect(voiceHitSteps(MAIN, 'toms', 0)).toEqual([]);
    expect(voiceHitSteps(MAIN, 'toms', 1)).toEqual([24, 26, 27, 28, 29, 30, 31]);
    expect(tomMidiForStep(MAIN, 24, 1)).toBe(41);
    expect(tomMidiForStep(MAIN, 28, 1)).toBe(36);
    expect(tomMidiForStep(MAIN, 31, 1)).toBe(29);
    expect(tomMidiForStep(MAIN, 25, 1)).toBeNull();
    expect(tomMidiForStep(MAIN, 24, 0)).toBeNull();
    expect(tomMidiForStep(CHAPEL, 31, 1)).toBe(26);
    expect(voiceHitSteps(MAIN, 'crash', 0)).toEqual([0]);
    expect(voiceHitSteps(MAIN, 'crash', 1)).toEqual([]);
    expect(voiceHitSteps(MAIN, 'crash', 2)).toEqual([0]);
    expect(voiceHitSteps(MAIN, 'acid', 0)).toEqual([6, 22]);
    expect(acidMidiForStep(MAIN, 6)).toBe(53);
    expect(acidMidiForStep(MAIN, 22)).toBe(54);
    expect(acidMidiForStep(MAIN, 7)).toBeNull();
    expect(acidMidiForStep(CHAPEL, 14)).toBe(50);
    expect(acidMidiForStep(CHAPEL, 6)).toBeNull();
  });

  it('pitches vocal chops off the track root', () => {
    const chop = vocalChopAt(MAIN, 10);
    expect(chop).not.toBeNull();
    if (chop !== null) expect(vocalMidiForChop(MAIN, chop)).toBe(77 + 15);
    const chapelChop = vocalChopAt(CHAPEL, 14);
    expect(chapelChop).not.toBeNull();
    if (chapelChop !== null) expect(vocalMidiForChop(CHAPEL, chapelChop)).toBe(74 - 5);
  });
});
