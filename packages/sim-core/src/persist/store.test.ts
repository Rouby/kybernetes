import { describe, expect, it } from 'vitest';
import { createStarterSkiff, wipeOnLoss } from '../world/ship/shipRecord.js';
import {
  createMemoryShipStore,
  decodeShipStore,
  decodeShipStoreJson,
  encodeShipStore,
  validateShipRecord,
} from './store.js';

describe('ship store codec (Strike 4)', () => {
  it('round-trips live and wiped records through JSON', () => {
    const store = createMemoryShipStore([
      { ...createStarterSkiff('u1'), credits: 90 },
      wipeOnLoss(createStarterSkiff('u2')),
    ]);
    const decoded = decodeShipStoreJson(JSON.stringify(encodeShipStore(store, 500)));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.value.size()).toBe(2);
    expect(decoded.value.get('u1')?.credits).toBe(90);
    expect(decoded.value.get('u2')?.alive).toBe(false);
    expect(decoded.value.get('u2')?.condition).toBe(0);
    expect(decoded.value.ids()).toEqual(['u1', 'u2']);
  });

  it('supports set/remove on the memory store', () => {
    const store = createMemoryShipStore();
    expect(store.size()).toBe(0);
    store.set(createStarterSkiff('u9'));
    expect(store.get('u9')?.shipId).toBe('ship:u9');
    expect(store.remove('u9')).toBe(true);
    expect(store.get('u9')).toBeUndefined();
  });

  it('rejects corrupt stores and records with typed errors', () => {
    expect(decodeShipStoreJson('nope {').ok).toBe(false);
    if (decodeShipStoreJson('nope {').ok) throw new Error('expected failure');
    const cases: unknown[] = [
      undefined,
      { version: 99, universeRev: 1, ships: {} },
      { version: 3, universeRev: 999, ships: {} },
      { version: 3, universeRev: 1, ships: { u1: { ownerId: 'u1' } } },
      {
        version: 3,
        universeRev: 1,
        ships: { u1: { ...createStarterSkiff('u1'), reactorTier: 7 } },
      },
      {
        version: 3,
        universeRev: 1,
        ships: { wrong: createStarterSkiff('u1') },
      },
    ];
    for (const input of cases) {
      expect(decodeShipStore(input).ok).toBe(false);
    }
    expect(validateShipRecord(undefined).ok).toBe(false);
    expect(validateShipRecord(createStarterSkiff('u1')).ok).toBe(true);
  });
});
