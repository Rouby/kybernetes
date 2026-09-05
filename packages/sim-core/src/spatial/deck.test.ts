import { describe, expect, it } from 'vitest';
import { getDutiesForStation } from '../duties';
import { HESPERIA_STATIONS, HESPERIA_WALLS } from './deck';

describe('station hub fixtures', () => {
  it('exposes a job board in the station lobby', () => {
    const board = HESPERIA_STATIONS.find((s) => s.id === 'lobby_job_board');
    expect(board).toBeDefined();
    expect(board?.stationType).toBe('job_board');
    expect(board?.deckId).toBe('station');
  });

  it('flanks the dock with transparent window walls', () => {
    const wins = HESPERIA_WALLS.filter((w) => w.isWindow);
    expect(wins.map((w) => w.id).sort()).toEqual([
      'hull_win_cargo_east',
      'hull_win_cargo_west',
      'st_win_dock_east',
      'st_win_dock_west',
      'st_win_east_alpha',
      'st_win_east_beta',
      'st_win_west_alpha',
      'st_win_west_beta',
    ]);
    for (const w of wins) {
      expect(w.isOpaque).toBe(false);
      expect(w.isTraversable).toBe(false);
    }
  });

  it('keeps station ids unique', () => {
    const ids = HESPERIA_STATIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('assigns no duties to hub decor fixtures', () => {
    expect(getDutiesForStation('job_board')).toEqual([]);
    expect(getDutiesForStation('viewport_window')).toEqual([]);
  });
});
