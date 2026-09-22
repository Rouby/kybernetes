import { describe, expect, it } from 'vitest';
import { SHIP_ORIGIN } from '../world/schedule.js';
import {
  applyShipOffsetToWalls,
  getWorldStations,
  HESPERIA_STATIONS,
  HESPERIA_WALLS,
  isShipSideRoom,
  isShipSideWall,
  isStationRoom,
  keepLoaded,
  partitionFrameWalls,
  stationFrameOf,
  visibleStationFrames,
} from './deck';
import { carveWallsByFrame, getWorldOpaqueWalls } from './visibility.js';

function breachSeg(
  wall: (typeof HESPERIA_WALLS)[number],
  midX: number,
  midY: number,
  half: number
) {
  const horizontal = Math.abs(wall.y2 - wall.y1) < Math.abs(wall.x2 - wall.x1);
  return horizontal
    ? { frameId: 'ship', areaM2: 1.5, x1: midX - half, y1: midY, x2: midX + half, y2: midY }
    : { frameId: 'ship', areaM2: 1.5, x1: midX, y1: midY - half, x2: midX, y2: midY + half };
}

describe('station hub fixtures', () => {
  it('tags every console with a loadable frame so the renderer cull resolves', () => {
    for (const station of HESPERIA_STATIONS) {
      const tag = station.deckId;
      const loadable = tag === 'station' || tag === 'ship' || tag.startsWith('hub_');
      expect(loadable, station.id).toBe(true);
      expect(keepLoaded(new Set(['ship', tag]), tag)).toBe(true);
    }
  });

  it('stages harbor fixtures with frame-aware world offsets', () => {
    const board = HESPERIA_STATIONS.find((s) => s.id === 'korridor_job_board');
    expect(board?.stationType).toBe('job_board');
    expect(board?.deckId).toBe('station');
    const helm = HESPERIA_STATIONS.find((s) => s.id === 'bridge_helm');
    expect(helm?.stationType).toBe('bridge');
    const world = getWorldStations({ x: 1210, y: -80 });
    expect(world.find((s) => s.id === 'korridor_job_board')).toMatchObject({ x: 460, y: 240 });
    expect(world.find((s) => s.id === 'bridge_helm')).toMatchObject({ x: 1350, y: -15 });
  });

  it('glazes the habitat with a sight-passing window wall', () => {
    const wins = HESPERIA_WALLS.filter((w) => w.isWindow);
    expect(wins.map((w) => w.id).sort()).toEqual([
      'hub_b.portal.habitat_window',
      'hub_b.portal.sued_window',
      'hub_c.portal.habitat_window',
      'hub_c.portal.sued_window',
      'hub_d.portal.habitat_window',
      'hub_d.portal.observatorium_window',
      'hub_d.portal.sued_window',
      'portal.habitat_window',
      'portal.sued_window',
    ]);
    for (const w of wins) {
      expect(w.isOpaque).toBe(false);
      expect(w.isTraversable).toBe(false);
    }
    const pane = wins[0];
    expect(pane).toBeDefined();
    expect([pane?.x1, pane?.y1, pane?.x2, pane?.y2]).toEqual([100, 0, 220, 0]);
  });

  it('keeps station ids unique', () => {
    const ids = HESPERIA_STATIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('station loading by ship state', () => {
  it('routes ids to their render frame', () => {
    expect(stationFrameOf('ship.bruecke')).toBe('ship');
    expect(stationFrameOf('habitat')).toBe('station');
    expect(stationFrameOf('station.habitat')).toBe('station');
    expect(stationFrameOf('hub_c.frachthalle')).toBe('hub_c');
    expect(stationFrameOf('hub_d.portal.observatorium_window')).toBe('hub_d');
    expect(keepLoaded(undefined, 'hub_c')).toBe(true);
    expect(keepLoaded(new Set(['ship']), 'hub_c')).toBe(false);
  });

  it('keeps the ship loaded and swaps stations with the leg', () => {
    expect(visibleStationFrames(null)).toEqual(new Set(['ship', 'station']));
    expect(visibleStationFrames({ phase: 'docked', portHubId: 'hub_c' })).toEqual(
      new Set(['ship', 'hub_c'])
    );
    expect(
      visibleStationFrames({ phase: 'docking', portHubId: 'hub_a', destHubId: 'hub_b' })
    ).toEqual(new Set(['ship', 'hub_b']));
    const departed = visibleStationFrames({
      phase: 'in_transit',
      portHubId: 'hub_a',
      destHubId: 'hub_b',
      remainingS: 33,
      legTotalS: 34,
    });
    expect(departed).toEqual(new Set(['ship', 'station']));
    const mid = visibleStationFrames({
      phase: 'in_transit',
      portHubId: 'hub_a',
      destHubId: 'hub_b',
      remainingS: 20,
      legTotalS: 34,
    });
    expect(mid).toEqual(new Set(['ship']));
    const arrival = visibleStationFrames({
      phase: 'in_transit',
      portHubId: 'hub_a',
      destHubId: 'hub_b',
      remainingS: 10,
      legTotalS: 34,
    });
    expect(arrival).toEqual(new Set(['ship', 'hub_b']));
    const poi = visibleStationFrames({
      phase: 'docked',
      portHubId: 'poi_kestrel',
    });
    expect(poi).toEqual(new Set(['ship']));
  });
});

describe('carved ship walls stay ship-side', () => {
  it('recognizes breach-carved ship pieces by base id and prefix', () => {
    const shipWall = HESPERIA_WALLS.find((w) => w.id.startsWith('ship.'));
    expect(shipWall).toBeDefined();
    if (shipWall === undefined) return;
    expect(isShipSideWall(shipWall)).toBe(true);
    expect(isShipSideWall({ ...shipWall, id: `${shipWall.id}_br_0a` })).toBe(true);
    expect(isShipSideWall({ ...shipWall, id: `${shipWall.id}_br_tail` })).toBe(true);
    const stationWall = HESPERIA_WALLS.find((w) => w.id.startsWith('station.'));
    expect(stationWall).toBeDefined();
    if (stationWall === undefined) return;
    expect(isShipSideWall(stationWall)).toBe(false);
    expect(isShipSideWall({ ...stationWall, id: `${stationWall.id}_br_0a` })).toBe(false);
  });

  it('offsets carved ship pieces to world space', () => {
    const shipWall = HESPERIA_WALLS.find((w) => w.id === 'ship.bruecke.n');
    const wall = shipWall ?? HESPERIA_WALLS.find((w) => w.id.startsWith('ship.'));
    expect(wall).toBeDefined();
    if (wall === undefined) return;
    const midX = (wall.x1 + wall.x2) / 2;
    const midY = (wall.y1 + wall.y2) / 2;
    const span = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
    const half = Math.max(4, Math.min(12, span / 6));
    const carved = carveWallsByFrame([wall], [breachSeg(wall, midX, midY, half)]);
    expect(carved.length).toBeGreaterThan(0);
    for (const piece of carved) expect(isShipSideWall(piece)).toBe(true);
    const offset = { ...SHIP_ORIGIN };
    const world = applyShipOffsetToWalls(carved, offset);
    for (const piece of world) {
      const local = carved.find((c) => c.id === piece.id);
      expect(piece.x1).toBeCloseTo((local?.x1 ?? 0) + offset.x);
      expect(piece.y1).toBeCloseTo((local?.y1 ?? 0) + offset.y);
    }
    const { ship } = partitionFrameWalls(carved);
    expect(ship).toHaveLength(carved.length);
  });

  it('keeps carved ship bulkheads in the ship viewport', () => {
    const shipWall = HESPERIA_WALLS.find((w) => w.id.startsWith('ship.'));
    expect(shipWall).toBeDefined();
    if (shipWall === undefined) return;
    const midX = (shipWall.x1 + shipWall.x2) / 2;
    const midY = (shipWall.y1 + shipWall.y2) / 2;
    const half = Math.min(12, Math.hypot(shipWall.x2 - shipWall.x1, shipWall.y2 - shipWall.y1) / 4);
    const horizontal = Math.abs(shipWall.y2 - shipWall.y1) < Math.abs(shipWall.x2 - shipWall.x1);
    const seg = horizontal
      ? { frameId: 'ship', areaM2: 1.5, x1: midX - half, y1: midY, x2: midX + half, y2: midY }
      : { frameId: 'ship', areaM2: 1.5, x1: midX, y1: midY - half, x2: midX, y2: midY + half };
    const carved = carveWallsByFrame(HESPERIA_WALLS, [seg]);
    const world = getWorldOpaqueWalls(HESPERIA_WALLS, [], [seg], { ...SHIP_ORIGIN });
    const carvedShipPieces = carved.filter(
      (w) => w.id.startsWith('ship.') || w.id.includes('_br_')
    );
    expect(carvedShipPieces.length).toBeGreaterThan(0);
    for (const piece of carvedShipPieces) {
      if (!piece.id.startsWith('ship.')) continue;
      const inWorld = world.find((w) => w.id === piece.id);
      expect(inWorld).toBeDefined();
    }
  });

  describe('room frame identification', () => {
    it('identifies all station rooms and hub variants including andock_tube', () => {
      expect(isStationRoom('andock_tube')).toBe(true);
      expect(isStationRoom('station.andock_tube')).toBe(true);
      expect(isStationRoom('hub_d.andock_tube')).toBe(true);
      expect(isStationRoom('hub_d.observatorium')).toBe(true);
      expect(isStationRoom('hub_b.hangar')).toBe(true);
      expect(isStationRoom('hub_c.labor')).toBe(true);
      expect(isStationRoom('unknown_void')).toBe(false);
    });

    it('identifies ship rooms with or without prefix', () => {
      expect(isShipSideRoom('bruecke')).toBe(true);
      expect(isShipSideRoom('ship.bruecke')).toBe(true);
      expect(isShipSideRoom('ship.korridor_schiff')).toBe(true);
      expect(isShipSideRoom('observatorium')).toBe(false);
    });
  });
});
