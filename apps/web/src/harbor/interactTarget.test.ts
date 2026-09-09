import { buildHarborWorld } from '@kybernetes/sim-core';
import { describe, expect, it } from 'vitest';
import {
  CURSOR_RADIUS_PX,
  CURSOR_WEIGHT,
  DOOR_USE_RADIUS_PX,
  type DoorSpot,
  doorSpotsOf,
  INTERACT_CONE_RAD,
  INTERACT_NEAR_PX,
  selectInteractTarget,
  sightBlockers,
  targetIntent,
  targetPrompt,
  visibleFrom,
} from './interactTarget';

const STOVE = {
  id: 'ship.stove',
  kind: 'stove',
  roomId: 'ship.kajute_nord',
  x: 110,
  y: 170,
  integrity: 100,
  online: true,
} as const;

function doors(...spots: DoorSpot[]): DoorSpot[] {
  return spots;
}

function openById(entries: ReadonlyArray<[string, boolean]>): Map<string, boolean> {
  return new Map(entries);
}

describe('selectInteractTarget', () => {
  it('returns null with nothing around', () => {
    expect(
      selectInteractTarget({
        fixtures: [],
        doors: [],
        openById: openById([]),
        frameId: 'ship',
        at: { x: 0, y: 0 },
        facing: 0,
      })
    ).toBeNull();
  });

  it('picks what you face over what is nearer behind you', () => {
    const behind = { ...STOVE, id: 'ship.behind', x: -40, y: 0 };
    const ahead = { ...STOVE, id: 'ship.ahead', x: 100, y: 0 };
    const target = selectInteractTarget({
      fixtures: [behind, ahead],
      doors: [],
      openById: openById([]),
      frameId: 'ship',
      at: { x: 0, y: 0 },
      facing: 0,
    });
    expect(target?.kind).toBe('fixture');
    if (target?.kind === 'fixture') expect(target.contact.id).toBe('ship.ahead');
  });

  it('honors the tuned cone edge', () => {
    const dist = 100;
    const inside = {
      ...STOVE,
      id: 'ship.edge_in',
      x: Math.cos(INTERACT_CONE_RAD - 0.05) * dist,
      y: Math.sin(INTERACT_CONE_RAD - 0.05) * dist,
    };
    const outside = {
      ...STOVE,
      id: 'ship.edge_out',
      x: Math.cos(INTERACT_CONE_RAD + 0.05) * dist,
      y: Math.sin(INTERACT_CONE_RAD + 0.05) * dist,
    };
    const seen = selectInteractTarget({
      fixtures: [inside],
      doors: [],
      openById: openById([]),
      frameId: 'ship',
      at: { x: 0, y: 0 },
      facing: 0,
    });
    expect(seen?.kind).toBe('fixture');
    const missed = selectInteractTarget({
      fixtures: [outside],
      doors: [],
      openById: openById([]),
      frameId: 'ship',
      at: { x: 0, y: 0 },
      facing: 0,
    });
    expect(missed).toBeNull();
  });

  it('uses the tuned near radius regardless of facing', () => {
    const underfoot = { ...STOVE, id: 'ship.near', x: 0, y: -(INTERACT_NEAR_PX - 2) };
    const target = selectInteractTarget({
      fixtures: [underfoot],
      doors: [],
      openById: openById([]),
      frameId: 'ship',
      at: { x: 0, y: 0 },
      facing: 0,
    });
    expect(target?.kind).toBe('fixture');
  });

  it('ignores candidates outside the cone', () => {
    const side = { ...STOVE, id: 'ship.side', x: 0, y: 100 };
    const target = selectInteractTarget({
      fixtures: [side],
      doors: [],
      openById: openById([]),
      frameId: 'ship',
      at: { x: 0, y: 0 },
      facing: 0,
    });
    expect(target).toBeNull();
  });

  it('uses what you stand on regardless of facing', () => {
    const underfoot = { ...STOVE, id: 'ship.under', x: 0, y: -20 };
    const target = selectInteractTarget({
      fixtures: [underfoot],
      doors: [],
      openById: openById([]),
      frameId: 'ship',
      at: { x: 0, y: 0 },
      facing: 0,
    });
    if (target?.kind !== 'fixture') throw new Error('underfoot fixture missed');
    expect(target.contact.id).toBe('ship.under');
  });

  it('lets the nearer kind win inside the cone', () => {
    const target = selectInteractTarget({
      fixtures: [{ ...STOVE, id: 'ship.far', x: 80, y: 0 }],
      doors: doors({ id: 'ship.door_a', x: 50, y: 0 }),
      openById: openById([['ship.door_a', false]]),
      frameId: 'ship',
      at: { x: 0, y: 0 },
      facing: 0,
    });
    expect(target?.kind).toBe('door');
    if (target?.kind === 'door') {
      expect(targetIntent(target)).toEqual({
        type: 'DOOR',
        seq: 0,
        portalId: 'ship.door_a',
        wantOpen: true,
      });
      expect(targetPrompt(target)).toBe('Open door');
    }
  });

  it('reads door open state for toggle prompts', () => {
    const target = selectInteractTarget({
      fixtures: [],
      doors: doors({ id: 'ship.door_b', x: 60, y: 0 }),
      openById: openById([['ship.door_b', true]]),
      frameId: 'ship',
      at: { x: 0, y: 0 },
      facing: 0,
    });
    if (target?.kind !== 'door') throw new Error('door missed');
    expect(targetIntent(target)).toEqual({
      type: 'DOOR',
      seq: 0,
      portalId: 'ship.door_b',
      wantOpen: false,
    });
    expect(targetPrompt(target)).toBe('Close door');
  });

  it('ignores other frames', () => {
    const target = selectInteractTarget({
      fixtures: [{ ...STOVE, id: 'ship.stove', x: 10, y: 0 }],
      doors: [],
      openById: openById([]),
      frameId: 'station',
      at: { x: 10, y: 0 },
      facing: 0,
    });
    expect(target).toBeNull();
  });

  it('respects door reach', () => {
    const far = { id: 'ship.far_door', x: DOOR_USE_RADIUS_PX + 10, y: 0 };
    const target = selectInteractTarget({
      fixtures: [],
      doors: doors(far),
      openById: openById([]),
      frameId: 'ship',
      at: { x: 0, y: 0 },
      facing: 0,
    });
    expect(target).toBeNull();
  });
});

describe('cursor signal', () => {
  it('pulls a hovered machine ahead of a nearer unhovered one', () => {
    const near = { ...STOVE, id: 'ship.near', x: 80, y: 0 };
    const hovered = { ...STOVE, id: 'ship.hovered', x: 95, y: 0 };
    const base = {
      fixtures: [near, hovered],
      doors: [],
      openById: openById([]),
      frameId: 'ship',
      at: { x: 0, y: 0 },
      facing: 0,
    };
    const plain = selectInteractTarget(base);
    if (plain?.kind !== 'fixture') throw new Error('expected a fixture');
    expect(plain.contact.id).toBe('ship.near');
    const pulled = selectInteractTarget({ ...base, cursor: { x: 95, y: 0 } });
    if (pulled?.kind !== 'fixture') throw new Error('expected a fixture');
    expect(pulled.contact.id).toBe('ship.hovered');
  });

  it('keeps hover pull steeper than one score point per pixel', () => {
    expect(CURSOR_WEIGHT / CURSOR_RADIUS_PX).toBeGreaterThan(1);
  });

  it('ignores a cursor parked far away', () => {
    const target = selectInteractTarget({
      fixtures: [{ ...STOVE, id: 'ship.a', x: 80, y: 0 }],
      doors: [],
      openById: openById([]),
      frameId: 'ship',
      at: { x: 0, y: 0 },
      facing: 0,
      cursor: { x: CURSOR_RADIUS_PX + 500, y: 0 },
    });
    if (target?.kind !== 'fixture') throw new Error('expected a fixture');
    expect(target.contact.id).toBe('ship.a');
  });

  it('never selects behind you, however hard you stare', () => {
    const target = selectInteractTarget({
      fixtures: [{ ...STOVE, id: 'ship.behind', x: -40, y: 0 }],
      doors: [],
      openById: openById([]),
      frameId: 'ship',
      at: { x: 0, y: 0 },
      facing: 0,
      cursor: { x: -40, y: 0 },
    });
    expect(target).toBeNull();
  });
});

describe('occlusion', () => {
  const wall = [{ x1: 40, y1: -40, x2: 40, y2: 40 }];

  it('blocks sightlines crossing walls', () => {
    expect(visibleFrom(wall, { x: 0, y: 0 }, { x: 80, y: 0 })).toBe(false);
    expect(visibleFrom(wall, { x: 0, y: 0 }, { x: 20, y: 0 })).toBe(true);
    expect(visibleFrom([], { x: 0, y: 0 }, { x: 80, y: 0 })).toBe(true);
  });

  it('rejects occluded candidates from the contest', () => {
    const target = selectInteractTarget({
      fixtures: [{ ...STOVE, id: 'ship.hidden', x: 80, y: 0 }],
      doors: [],
      openById: openById([]),
      frameId: 'ship',
      at: { x: 0, y: 0 },
      facing: 0,
      blockers: wall,
    });
    expect(target).toBeNull();
  });

  it('still uses what you stand on behind cover', () => {
    const target = selectInteractTarget({
      fixtures: [{ ...STOVE, id: 'ship.near', x: 20, y: 0 }],
      doors: [],
      openById: openById([]),
      frameId: 'ship',
      at: { x: 0, y: 0 },
      facing: Math.PI,
      blockers: [{ x1: 10, y1: -40, x2: 10, y2: 40 }],
    });
    if (target?.kind !== 'fixture') throw new Error('expected the near fixture');
    expect(target.contact.id).toBe('ship.near');
  });

  it('treats shut doors as blockers and open leaves plus glass as clear', () => {
    const world = buildHarborWorld();
    const shut = sightBlockers(world, 'station', [
      { id: 'station.habitat_korridor', open: false, state: 'closed' },
    ]);
    expect(
      shut.some((seg) => seg.x1 === 140 && seg.y1 === 200 && seg.x2 === 180 && seg.y2 === 200)
    ).toBe(true);
    const swung = sightBlockers(world, 'station', [
      { id: 'station.habitat_korridor', open: true, state: 'open' },
    ]);
    expect(
      swung.some((seg) => seg.x1 === 140 && seg.y1 === 200 && seg.x2 === 180 && seg.y2 === 200)
    ).toBe(false);
    const glass = sightBlockers(world, 'station', []);
    expect(glass.some((seg) => seg.y1 === 0 && seg.y2 === 0 && seg.x1 === 100)).toBe(false);
  });
});

describe('doorSpotsOf', () => {
  it('lists non-dock doors per frame', () => {
    const world = buildHarborWorld();
    const spots = doorSpotsOf(world, 'station');
    expect(spots.length).toBeGreaterThan(0);
    expect(spots.every((spot) => spot.id.startsWith('station.'))).toBe(true);
    expect(spots.some((spot) => spot.id === 'station.korridor_ost_andock')).toBe(false);
  });
});
