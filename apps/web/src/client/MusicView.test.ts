/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import type { TechnoMusicSnapshot } from '../audio/synths/TechnoMusicSynth';
import type { TechnoVoice } from '../audio/synths/technoPatterns';
import { FREAKY_MAIN_TRACK, IRON_CHAPEL_TRACK } from '../audio/synths/technoTracks';
import { describeMusicRow } from './MusicView';

const VOICES: readonly TechnoVoice[] = [
  'kick',
  'hat',
  'clap',
  'bass',
  'stab',
  'chop',
  'lead',
  'siren',
];

function snapshot(over: Partial<TechnoMusicSnapshot> = {}): TechnoMusicSnapshot {
  const lastHit = {} as TechnoMusicSnapshot['lastHit'];
  for (const voice of VOICES) lastHit[voice] = { step: -1, loop: -1, at: -1 };
  return {
    playing: true,
    loop: 1,
    trackId: 'freaky-main',
    bpm: 144,
    intensity: 0.85,
    freak: 0.9,
    muted: [],
    solo: null,
    lastHit,
    ...over,
  };
}

describe('describeMusicRow', () => {
  it('maps static hits, playhead, and audibility', () => {
    const row = describeMusicRow(snapshot(), FREAKY_MAIN_TRACK, 'kick', 4, 100);
    expect(row.label).toBe('KICK');
    expect(row.cells).toHaveLength(32);
    expect(row.cells[0]?.hit).toBe(true);
    expect(row.cells[1]?.hit).toBe(false);
    expect(row.cells[4]?.current).toBe(true);
    expect(row.cells[5]?.current).toBe(false);
    expect(row.muted).toBe(false);
    expect(row.audible).toBe(true);
  });

  it('strikes muted rows and honors solos', () => {
    const muted = describeMusicRow(
      snapshot({ muted: ['bass'] }),
      FREAKY_MAIN_TRACK,
      'bass',
      0,
      100
    );
    expect(muted.muted).toBe(true);
    expect(muted.audible).toBe(false);
    const soloed = describeMusicRow(snapshot({ solo: 'chop' }), FREAKY_MAIN_TRACK, 'bass', 0, 100);
    expect(soloed.audible).toBe(false);
    const star = describeMusicRow(snapshot({ solo: 'chop' }), FREAKY_MAIN_TRACK, 'chop', 0, 100);
    expect(star.soloed).toBe(true);
    expect(star.audible).toBe(true);
  });

  it('flashes only the recently triggered cell', () => {
    const snap = snapshot();
    snap.lastHit.chop = { step: 10, loop: 1, at: 99.9 };
    const row = describeMusicRow(snap, FREAKY_MAIN_TRACK, 'chop', 12, 100);
    expect(row.cells[10]?.fired).toBe(true);
    expect(row.cells[8]?.fired).toBe(false);
    const stale = describeMusicRow(snap, FREAKY_MAIN_TRACK, 'chop', 12, 120);
    expect(stale.cells[10]?.fired).toBe(false);
  });

  it('renders the other track from its own data', () => {
    const row = describeMusicRow(snapshot(), IRON_CHAPEL_TRACK, 'stab', 0, 100);
    expect(row.cells[20]?.hit).toBe(true);
    expect(row.cells[16]?.hit).toBe(false);
  });

  it('degrades gracefully without a snapshot', () => {
    const row = describeMusicRow(null, FREAKY_MAIN_TRACK, 'siren', 0, 0);
    expect(row.cells).toHaveLength(32);
    expect(row.audible).toBe(true);
    expect(row.cells.every((cell) => !cell.fired)).toBe(true);
  });
});
