import { describe, expect, it } from 'vitest';
import { getWorldStations, HESPERIA_STATIONS, HESPERIA_WALLS } from './deck';

describe('station hub fixtures', () => {
  it('stages harbor fixtures with frame-aware world offsets', () => {
    const board = HESPERIA_STATIONS.find((s) => s.id === 'lobby_job_board');
    expect(board?.stationType).toBe('job_board');
    expect(board?.deckId).toBe('station');
    const helm = HESPERIA_STATIONS.find((s) => s.id === 'bridge_helm');
    expect(helm?.stationType).toBe('bridge');
    const world = getWorldStations({ x: 1400, y: 0 });
    expect(world.find((s) => s.id === 'lobby_job_board')).toMatchObject({ x: 300, y: 200 });
    expect(world.find((s) => s.id === 'bridge_helm')).toMatchObject({ x: 1580, y: 260 });
  });

  it('glazes the lobby with a sight-passing window wall', () => {
    const wins = HESPERIA_WALLS.filter((w) => w.isWindow);
    expect(wins.map((w) => w.id).sort()).toEqual(['portal.lobby_window', 'portal.overlook_window']);
    for (const w of wins) {
      expect(w.isOpaque).toBe(false);
      expect(w.isTraversable).toBe(false);
    }
    const pane = wins[0];
    expect(pane).toBeDefined();
    expect([pane?.x1, pane?.y1, pane?.x2, pane?.y2]).toEqual([100, 0, 500, 0]);
  });

  it('keeps station ids unique', () => {
    const ids = HESPERIA_STATIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
