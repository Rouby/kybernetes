import { describe, expect, it } from 'vitest';
import { assembleWorld } from './assemble.js';
import { HesperiaV2Spec } from './content/HesperiaV2.hull.js';
import { addDecal, baseDecalRadius, decalRadiusFor, MAX_DECALS, shouldDecal } from './decals.js';
import type { WorldDecal } from './types.js';

function decal(id: string): WorldDecal {
  return {
    id,
    frameId: 'ship',
    x: 10,
    y: 20,
    angle: 0,
    radius: 3.4,
    weapon: 'kinetic_carbine',
    bornTick: 1,
  };
}

describe('persistent scorch decals', () => {
  it('decals only wall-like hits, never misses or pawn hits', () => {
    expect(shouldDecal('breach')).toBe(true);
    expect(shouldDecal('door')).toBe(true);
    expect(shouldDecal('miss')).toBe(false);
    expect(shouldDecal('pawn')).toBe(false);
  });

  it('scales crater radius by weapon and energy', () => {
    expect(baseDecalRadius('kinetic_carbine')).toBe(3.4);
    expect(baseDecalRadius('pulse_laser')).toBe(3.8);
    expect(decalRadiusFor('kinetic_carbine', 0)).toBeLessThan(decalRadiusFor('kinetic_carbine', 1));
    expect(decalRadiusFor('kinetic_carbine', 5)).toBe(decalRadiusFor('kinetic_carbine', 1));
  });

  it('caps the table LRU at MAX_DECALS, oldest first', () => {
    let table: readonly WorldDecal[] = [];
    for (let i = 0; i < MAX_DECALS + 10; i += 1) table = addDecal(table, decal(`decal.${i}`));
    expect(table).toHaveLength(MAX_DECALS);
    expect(table[0].id).toBe('decal.10');
    expect(table[table.length - 1].id).toBe(`decal.${MAX_DECALS + 9}`);
  });

  it('harbor world starts with an empty decal table', () => {
    const world = assembleWorld([{ frameId: 'ship', hull: HesperiaV2Spec }]);
    expect(world.decals).toEqual([]);
  });
});
