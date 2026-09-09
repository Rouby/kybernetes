import { createStarterSkiff, damageShip } from '@kybernetes/sim-core';
import { describe, expect, it } from 'vitest';
import {
  createShipRegistry,
  ensureSoloShip,
  saveSoloShip,
  soloEntryFor,
  soloPawnIdFor,
} from './shipRegistry.js';

describe('shipRegistry (M1 solo ownership)', () => {
  it('issues one persistent starter skiff per user', () => {
    const registry = createShipRegistry();
    const first = ensureSoloShip(registry, 'u1');
    expect(first.shipId).toBe('ship:u1');
    const second = ensureSoloShip(registry, 'u1');
    expect(second).toEqual(first);
    expect(ensureSoloShip(registry, 'u2').shipId).toBe('ship:u2');
  });

  it('restarts fresh after a hard loss', () => {
    const registry = createShipRegistry();
    const ship = ensureSoloShip(registry, 'u9');
    saveSoloShip(registry, damageShip(ship, 999));
    const fresh = ensureSoloShip(registry, 'u9');
    expect(fresh.alive).toBe(true);
    expect(fresh.credits).toBe(20);
  });

  it('builds stable solo entries with pawn ids', () => {
    const registry = createShipRegistry();
    const entry = soloEntryFor(registry, 'u7', 'ship');
    expect(entry.pawnId).toBe(soloPawnIdFor('u7'));
    expect(entry.ship.ownerId).toBe('u7');
    expect(createStarterSkiff('u7').shipId).toBe(entry.ship.shipId);
  });
});
