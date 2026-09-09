import { describe, expect, it } from 'vitest';
import { SHIP_ORIGIN } from '../world/schedule.js';
import { HESPERIA_WALLS } from './deck.js';
import { carveWallsByFrame, getWorldOpaqueWalls } from './visibility.js';

function wallById(id: string) {
  const wall = HESPERIA_WALLS.find((entry) => entry.id === id);
  if (wall === undefined) throw new Error(`missing wall ${id}`);
  return wall;
}

function alongWall(id: string, frameId: string) {
  const wall = wallById(id);
  return { frameId, x1: wall.x1, y1: wall.y1, x2: wall.x2, y2: wall.y2 };
}

function idsOf(walls: readonly { id: string }[]): string[] {
  return walls.map((wall) => wall.id).sort();
}

describe('framed breach carving', () => {
  it('never lets a ship breach cut station walls', () => {
    const seg = alongWall('station.habitat.w', 'ship');
    const carved = carveWallsByFrame(HESPERIA_WALLS, [seg]);
    expect(carved.find((wall) => wall.id === 'station.habitat.w')).toEqual(
      wallById('station.habitat.w')
    );
  });

  it('never lets a station breach cut ship walls', () => {
    const seg = alongWall('ship.bruecke.e', 'station');
    const carved = carveWallsByFrame(HESPERIA_WALLS, [seg]);
    expect(carved.find((wall) => wall.id === 'ship.bruecke.e')).toEqual(wallById('ship.bruecke.e'));
  });

  it('still cuts same-frame walls', () => {
    const wall = wallById('station.habitat.w');
    const seg = { frameId: 'station', x1: wall.x1, y1: 50, x2: wall.x2, y2: 150 };
    const carved = carveWallsByFrame(HESPERIA_WALLS, [seg]);
    expect(carved.find((entry) => entry.id === 'station.habitat.w')).toBeUndefined();
    expect(carved.length).toBe(HESPERIA_WALLS.length + 1);
  });

  it('keeps legacy frameless segments carving every frame', () => {
    const wall = wallById('station.habitat.w');
    const seg = { x1: wall.x1, y1: wall.y1, x2: wall.x2, y2: wall.y2 };
    const carved = carveWallsByFrame(HESPERIA_WALLS, [seg]);
    expect(carved.find((entry) => entry.id === 'station.habitat.w')).toBeUndefined();
  });

  it('holds station sight blockers steady while the ship burns', () => {
    const seg = alongWall('station.habitat.w', 'ship');
    const calm = getWorldOpaqueWalls(HESPERIA_WALLS, [], [], { ...SHIP_ORIGIN });
    const shelled = getWorldOpaqueWalls(HESPERIA_WALLS, [], [seg], { ...SHIP_ORIGIN });
    const side = (walls: typeof calm) =>
      walls.filter(
        (wall) => !wall.id.startsWith('ship.') && !wall.id.startsWith('portal-shut.ship.')
      );
    expect(idsOf(side(shelled))).toEqual(idsOf(side(calm)));
  });
});

describe('puncture versus breach carving', () => {
  it('never carves sight walls for bullet punctures', () => {
    const wall = wallById('station.habitat.w');
    const puncture = {
      frameId: 'station',
      areaM2: 0.05,
      x1: wall.x1,
      y1: 50,
      x2: wall.x2,
      y2: 150,
    };
    const carved = carveWallsByFrame(HESPERIA_WALLS, [puncture]);
    expect(carved.find((entry) => entry.id === 'station.habitat.w')).toEqual(
      wallById('station.habitat.w')
    );
  });

  it('carves sight walls once the hole grows past the puncture threshold', () => {
    const wall = wallById('station.habitat.w');
    const breach = {
      frameId: 'station',
      areaM2: 0.3,
      x1: wall.x1,
      y1: 50,
      x2: wall.x2,
      y2: 150,
    };
    const carved = carveWallsByFrame(HESPERIA_WALLS, [breach]);
    expect(carved.find((entry) => entry.id === 'station.habitat.w')).toBeUndefined();
  });

  it('holds opaque sight blockers steady through punctures', () => {
    const wall = wallById('station.habitat.w');
    const puncture = {
      frameId: 'station',
      areaM2: 0.05,
      x1: wall.x1,
      y1: 50,
      x2: wall.x2,
      y2: 150,
    };
    const calm = getWorldOpaqueWalls(HESPERIA_WALLS, [], [], { ...SHIP_ORIGIN });
    const nicked = getWorldOpaqueWalls(HESPERIA_WALLS, [], [puncture], { ...SHIP_ORIGIN });
    expect(idsOf(nicked)).toEqual(idsOf(calm));
  });
});
