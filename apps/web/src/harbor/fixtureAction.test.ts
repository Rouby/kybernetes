import type { FixtureSnapshot } from '@kybernetes/protocol';
import { describe, expect, it } from 'vitest';
import { fixturePrompt, fixtureUseIntent, scanFixtures } from './fixtureAction';

function snap(over: Partial<FixtureSnapshot> & { id: string }): FixtureSnapshot {
  return {
    kind: 'stove',
    roomId: 'ship.kajute_nord',
    x: 110,
    y: 170,
    integrity: 100,
    online: true,
    ...over,
  };
}

describe('scanFixtures', () => {
  it('returns null without fixtures', () => {
    expect(scanFixtures(undefined, 'ship', { x: 0, y: 0 })).toBeNull();
    expect(scanFixtures([], 'ship', { x: 0, y: 0 })).toBeNull();
  });

  it('picks the nearest fixture on the pawn frame', () => {
    const fixtures = [
      snap({ id: 'ship.stove', x: 110, y: 170 }),
      snap({ id: 'ship.freezer', kind: 'freezer', x: 170, y: 170 }),
    ];
    const found = scanFixtures(fixtures, 'ship', { x: 165, y: 170 });
    expect(found?.id).toBe('ship.freezer');
  });

  it('ignores other frames and distant fixtures', () => {
    const fixtures = [
      snap({
        id: 'station.vending_wall',
        kind: 'vending_wall',
        roomId: 'station.frachthalle',
        x: 165,
        y: 170,
      }),
      snap({ id: 'ship.stove', x: 900, y: 900 }),
    ];
    expect(scanFixtures(fixtures, 'ship', { x: 165, y: 170 })).toBeNull();
  });
});

describe('fixtureUseIntent', () => {
  it('repairs broken fixtures first', () => {
    const broken = snap({ id: 'ship.stove', integrity: 0, online: false });
    const at = { x: 110, y: 170 };
    const found = scanFixtures([broken], 'ship', at);
    expect(found).not.toBeNull();
    if (found === null) return;
    expect(fixtureUseIntent(found)).toEqual({ type: 'REPAIR', seq: 0, fixtureId: 'ship.stove' });
    expect(fixturePrompt(found)).toBe('Repair stove');
  });

  it('claims unclaimed bunks and lockers', () => {
    const bunk = snap({
      id: 'ship.bunk_a',
      kind: 'claim_bunk',
      roomId: 'ship.kajute_sued',
      x: 120,
      y: 390,
    });
    const found = scanFixtures([bunk], 'ship', { x: 120, y: 385 });
    if (found === null) throw new Error('bunk not found');
    expect(fixtureUseIntent(found)).toEqual({ type: 'CLAIM', seq: 0, fixtureId: 'ship.bunk_a' });
    expect(fixturePrompt(found)).toBe('Claim bunk');
  });

  it('maps work verbs per kind', () => {
    const cases: Array<[string, Record<string, string>]> = [
      ['vending_wall', { type: 'VEND' }],
      ['stove', { type: 'COOK' }],
      ['hydro_tray', { type: 'HARVEST' }],
      ['water_recycler', { type: 'RECYCLE' }],
      ['aid_cabinet', { type: 'INTERACT' }],
      ['mess_table', { type: 'INTERACT' }],
    ];
    for (const [kind, want] of cases) {
      const found = scanFixtures([snap({ id: 'f.' + kind, kind: kind as never })], 'ship', {
        x: 110,
        y: 170,
      });
      if (found === null) throw new Error('missing ' + kind);
      expect(fixtureUseIntent(found).type).toBe(want.type);
    }
  });

  it('names prompts for the HUD', () => {
    const stove = scanFixtures([snap({ id: 'ship.stove' })], 'ship', { x: 110, y: 170 });
    if (stove === null) throw new Error('stove missing');
    expect(fixturePrompt(stove)).toBe('Cook meal');
    const cooking = scanFixtures([snap({ id: 'ship.stove', progressPct: 40 })], 'ship', {
      x: 110,
      y: 170,
    });
    if (cooking === null) throw new Error('cooking missing');
    expect(fixturePrompt(cooking)).toBe('Cooking');
  });
});
