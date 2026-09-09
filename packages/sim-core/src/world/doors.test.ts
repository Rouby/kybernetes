import { describe, expect, it } from 'vitest';
import { assembleWorld, spawnPawn } from './assemble.js';
import { HesperiaV2Spec } from './content/HesperiaV2.hull.js';
import { nearestPortal, tryToggleDoor } from './doors.js';
import type { World } from './types.js';

function shipWorld(): World {
  const assembled = assembleWorld([
    { frameId: 'ship', hull: HesperiaV2Spec, vessel: { name: 'Hesperia', beacon: 'HESP' } },
  ]);
  return spawnPawn(assembled, {
    id: 'p1',
    owner: 'u1',
    frameId: 'ship',
    roomId: 'ship.korridor_schiff',
    x: 30,
    y: 200,
    color: '#fff',
  });
}

describe('world doors', () => {
  it('finds the nearest portal within range', () => {
    const world = shipWorld();
    expect(nearestPortal(world, 'p1', 80)?.id).toBe('ship.kajute_nord_korridor');
    expect(nearestPortal(world, 'p1', 10)).toBeUndefined();
    expect(nearestPortal(world, 'ghost', 1000)).toBeUndefined();
  });

  it('rejects toggles below the portal clearance', () => {
    const world = shipWorld();
    const portal = world.portals['ship.kajute_nord_korridor'];
    if (portal === undefined) throw new Error('missing kajute_nord_korridor');
    const guarded: World = {
      ...world,
      portals: { ...world.portals, [portal.id]: { ...portal, clearance: 2 } },
    };
    const denied = tryToggleDoor(guarded, portal.id, true, 0);
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.reason).toBe('clearance');
    expect(tryToggleDoor(guarded, portal.id, true, 2).ok).toBe(true);
  });

  it('reports unknown portals without throwing', () => {
    const denied = tryToggleDoor(shipWorld(), 'ship.nope', true, 0);
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.reason).toBe('not-found');
  });
});
