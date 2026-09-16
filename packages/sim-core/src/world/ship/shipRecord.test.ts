import { describe, expect, it } from 'vitest';
import {
  createStarterSkiff,
  creditShip,
  damageShip,
  debitShip,
  isShipLost,
  restartSkiff,
  restoreShipRecord,
  serializeShipRecord,
  wipeOnLoss,
} from './shipRecord.js';

describe('shipRecord (M1 ownership)', () => {
  it('creates a bare starter skiff', () => {
    const ship = createStarterSkiff('u1');
    expect(ship.ownerId).toBe('u1');
    expect(ship.shipId).toBe('ship:u1');
    expect(ship.reactorTier).toBe(0);
    expect(ship.engineTier).toBe(0);
    expect(ship.alive).toBe(true);
    expect(ship.credits).toBe(50);
    expect(ship.stores.fuelCells).toBe(1);
    expect(ship.engineFuel).toBe(0);
    expect(isShipLost(ship)).toBe(false);
  });

  it('round-trips through serialize/restore', () => {
    const ship = createStarterSkiff('u2');
    const back = restoreShipRecord(serializeShipRecord(ship));
    expect(back).toEqual(ship);
  });

  it('restores legacy saves without engineFuel as empty bunker', () => {
    const ship = createStarterSkiff('legacy');
    const { engineFuel: _dropped, ...legacy } = ship as unknown as Record<string, unknown>;
    void _dropped;
    expect(restoreShipRecord(JSON.stringify(legacy))?.engineFuel).toBe(0);
  });

  it('rejects corrupt restores', () => {
    expect(restoreShipRecord('not-json')).toBeUndefined();
    expect(restoreShipRecord(JSON.stringify({ ownerId: 'x' }))).toBeUndefined();
  });

  it('debits only with sufficient funds', () => {
    const ship = createStarterSkiff('u3');
    expect(debitShip(ship, 999)).toBeUndefined();
    expect(debitShip(ship, -5)).toBeUndefined();
    const paid = debitShip(ship, 5);
    expect(paid?.credits).toBe(45);
    expect(creditShip(ship, 5).credits).toBe(55);
  });

  it('wipes hard on lethal damage and restarts fresh', () => {
    const ship = createStarterSkiff('u4');
    const dead = damageShip(ship, 999);
    expect(isShipLost(dead)).toBe(true);
    expect(dead.credits).toBe(0);
    expect(wipeOnLoss(ship).alive).toBe(false);
    const fresh = restartSkiff('u4');
    expect(isShipLost(fresh)).toBe(false);
    expect(fresh.credits).toBe(50);
  });

  it('ignores non-positive damage', () => {
    const ship = createStarterSkiff('u5');
    expect(damageShip(ship, 0)).toEqual(ship);
  });
});
