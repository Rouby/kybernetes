import { describe, expect, it } from 'vitest';
import { getWorldStations, HESPERIA_STATIONS, HESPERIA_WALLS } from './deck';

describe('station hub fixtures', () => {
  it('defers interactables to a later milestone (no stations yet)', () => {
    expect(HESPERIA_STATIONS).toEqual([]);
    expect(getWorldStations({ x: 1400, y: 0 })).toEqual([]);
  });

  it('glazes the lobby with a sight-passing window wall', () => {
    const wins = HESPERIA_WALLS.filter((w) => w.isWindow);
    expect(wins.map((w) => w.id).sort()).toEqual(['portal.lobby_window']);
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
