import { describe, expect, it } from 'vitest';
import { createEmptyWorld, type World } from '../types.js';
import {
  CARRY_SPEED_MULT,
  dropCrate,
  emptyCargo,
  handsPosFor,
  isCarrying,
  normalizeCrateAngle,
  pickupCrate,
  repackCargo,
  securedQty,
  snapOrthogonal,
  spawnCrate,
  speedMultiplierFor,
  syncCarriedPositions,
  tickCargo,
  unpackCrates,
} from './cargo.js';

function holdWithBayCrate() {
  const spawned = spawnCrate(emptyCargo(), {
    id: 'c1',
    items: [
      { goodId: 'scrap', qty: 3 },
      { goodId: 'rations', qty: 2 },
    ],
    where: 'bayFloor',
    frameId: 'station',
    x: 100,
    y: 100,
  });
  if (!spawned.ok) throw new Error('seed failed');
  return spawned.hold;
}

describe('cargo hauling (M4 floor model)', () => {
  it('round-trips pickup -> shipFloor -> unpack -> repack', () => {
    let hold = holdWithBayCrate();
    const picked = pickupCrate(hold, 'c1', 'pawn:u1', 'station', { x: 105, y: 105 });
    expect(picked.ok).toBe(true);
    if (!picked.ok) return;
    hold = picked.hold;
    expect(isCarrying(hold, 'pawn:u1')).toBe(true);
    const dropped = dropCrate(hold, 'pawn:u1', 'ship', 50, 50, 'shipFloor');
    expect(dropped.ok).toBe(true);
    if (!dropped.ok) return;
    hold = dropped.hold;
    expect(hold.crates.c1?.where).toBe('shipFloor');
    const unpacked = unpackCrates(hold, 'ship', 'ship', ['c1']);
    expect(unpacked.ok).toBe(true);
    if (!unpacked.ok) return;
    hold = unpacked.hold;
    expect(securedQty(hold, 'ship', 'scrap')).toBe(3);
    expect(securedQty(hold, 'ship', 'rations')).toBe(2);
    expect(hold.crates.c1).toBeUndefined();
    const repacked = repackCargo(
      hold,
      'ship',
      'ship',
      [
        { goodId: 'scrap', qty: 1 },
        { goodId: 'rations', qty: 1 },
      ],
      { id: 'c2', frameId: 'ship', x: 60, y: 60 }
    );
    expect(repacked.ok).toBe(true);
    if (!repacked.ok) return;
    expect(securedQty(repacked.hold, 'ship', 'scrap')).toBe(2);
    expect(securedQty(repacked.hold, 'ship', 'rations')).toBe(1);
    expect(repacked.hold.crates.c2?.items).toEqual([
      { goodId: 'scrap', qty: 1 },
      { goodId: 'rations', qty: 1 },
    ]);
  });

  it('rejects overfilled crates by footprint area', () => {
    const burst = spawnCrate(emptyCargo(), {
      id: 'big',
      items: [{ goodId: 'scrap', qty: 10 }],
      where: 'bayFloor',
      frameId: 'station',
      x: 0,
      y: 0,
    });
    expect(burst).toEqual({ ok: false, reason: 'overfilled' });
    expect(
      spawnCrate(emptyCargo(), {
        id: 'none',
        items: [],
        where: 'bayFloor',
        frameId: 'station',
        x: 0,
        y: 0,
      })
    ).toEqual({
      ok: false,
      reason: 'bad-qty',
    });
  });

  it('rejects double-pickup while hands are full', () => {
    let hold = holdWithBayCrate();
    const second = spawnCrate(hold, {
      id: 'c2',
      items: [{ goodId: 'scrap', qty: 1 }],
      where: 'bayFloor',
      frameId: 'station',
      x: 102,
      y: 102,
    });
    if (!second.ok) throw new Error('seed2 failed');
    hold = second.hold;
    const first = pickupCrate(hold, 'c1', 'pawn:u1', 'station', { x: 100, y: 100 });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const again = pickupCrate(first.hold, 'c2', 'pawn:u1', 'station', { x: 102, y: 102 });
    expect(again.ok).toBe(false);
  });

  it('snaps the grab orthogonal and frees the drop angle', () => {
    const hold = holdWithBayCrate();
    expect(snapOrthogonal(0.3)).toBe(0);
    expect(snapOrthogonal(Math.PI / 2)).toBeCloseTo(Math.PI / 2, 6);
    expect(snapOrthogonal(2)).toBeCloseTo(Math.PI / 2, 6);
    const picked = pickupCrate(hold, 'c1', 'pawn:u1', 'station', { x: 100, y: 100 }, 0.3);
    expect(picked.ok).toBe(true);
    if (!picked.ok) return;
    expect(picked.hold.crates.c1?.angle).toBe(0);
    const dropped = dropCrate(picked.hold, 'pawn:u1', 'station', 200, 200, 'bayFloor', [], 0.7);
    expect(dropped.ok).toBe(true);
    if (!dropped.ok) return;
    expect(dropped.hold.crates.c1?.angle).toBeCloseTo(0.7, 6);
    expect(normalizeCrateAngle(Number.NaN)).toBe(0);
  });

  it('rejects far pickup and cross-frame grab', () => {
    const hold = holdWithBayCrate();
    expect(pickupCrate(hold, 'c1', 'pawn:u1', 'station', { x: 900, y: 900 }).ok).toBe(false);
    expect(pickupCrate(hold, 'c1', 'pawn:u1', 'ship', { x: 100, y: 100 }).ok).toBe(false);
  });

  it('slows carriers by the locked 25% penalty', () => {
    let hold = holdWithBayCrate();
    expect(speedMultiplierFor(hold, 'pawn:u1')).toBe(1);
    const picked = pickupCrate(hold, 'c1', 'pawn:u1', 'station', { x: 100, y: 100 });
    if (!picked.ok) throw new Error('pickup failed');
    hold = picked.hold;
    expect(speedMultiplierFor(hold, 'pawn:u1')).toBe(CARRY_SPEED_MULT);
  });

  it('nudges drops off crowded fixture tiles', () => {
    const hold = holdWithBayCrate();
    const picked = pickupCrate(hold, 'c1', 'pawn:u1', 'station', { x: 100, y: 100 });
    if (!picked.ok) throw new Error('pickup failed');
    const dropped = dropCrate(picked.hold, 'pawn:u1', 'station', 200, 200, 'bayFloor', [
      { x: 200, y: 200 },
    ]);
    expect(dropped.ok).toBe(true);
    if (!dropped.ok) return;
    expect(dropped.hold.crates.c1?.x).toBe(240);
  });

  it('rides crates at the pawn hands and swings them with facing', () => {
    let hold = holdWithBayCrate();
    const picked = pickupCrate(hold, 'c1', 'pawn:u1', 'station', { x: 100, y: 100 });
    if (!picked.ok) throw new Error('pickup failed');
    hold = picked.hold;
    expect(handsPosFor({ x: 100, y: 100 }, 0)).toEqual({ x: 122, y: 100 });
    const ahead = syncCarriedPositions(hold, {
      'pawn:u1': { frameId: 'station', x: 150, y: 160, facing: 0 },
    });
    expect(ahead.crates.c1?.x).toBe(172);
    expect(ahead.crates.c1?.y).toBe(160);
    expect(ahead.crates.c1?.angle).toBe(0);
    const turned = syncCarriedPositions(hold, {
      'pawn:u1': { frameId: 'station', x: 150, y: 160, facing: Math.PI / 2 },
    });
    expect(turned.crates.c1?.x).toBeCloseTo(150, 6);
    expect(turned.crates.c1?.y).toBe(182);
    expect(turned.crates.c1?.angle).toBeCloseTo(Math.PI / 2, 6);
  });

  it('drops carried crates on death and follows live carriers', () => {
    let hold = holdWithBayCrate();
    const picked = pickupCrate(hold, 'c1', 'pawn:u1', 'station', { x: 100, y: 100 });
    if (!picked.ok) throw new Error('pickup failed');
    hold = picked.hold;
    const followed = syncCarriedPositions(hold, {
      'pawn:u1': { frameId: 'station', x: 150, y: 160, facing: 0 },
    });
    expect(followed.crates.c1?.x).toBe(172);
    const world = {
      ...createEmptyWorld(),
      cargo: followed,
      pawns: {
        'pawn:u1': {
          id: 'pawn:u1',
          owner: 'u1',
          frameId: 'station',
          roomHint: 'station.hall',
          pos: { x: 150, y: 160 },
          vel: { x: 0, y: 0 },
          facing: 0,
          radius: 12,
          speed: 200,
          health: { hp: 0, maxHp: 100, suitSealed: false, incapacitated: false },
          color: '#fff',
          say: '',
          sayUntilTick: 0,
        },
      },
    } as unknown as World;
    const ticked = tickCargo(world);
    expect(ticked.cargo.crates.c1?.where).toBe('bayFloor');
    expect(ticked.cargo.crates.c1?.x).toBe(172);
  });

  it('rejects unpack off-ship and over-repack', () => {
    const hold = holdWithBayCrate();
    expect(unpackCrates(hold, 'ship', 'station', ['c1']).ok).toBe(false);
    expect(
      repackCargo(hold, 'ship', 'ship', [{ goodId: 'scrap', qty: 5 }], {
        id: 'c9',
        frameId: 'ship',
        x: 1,
        y: 1,
      }).ok
    ).toBe(false);
  });
});
