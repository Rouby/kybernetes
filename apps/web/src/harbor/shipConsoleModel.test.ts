import type { ShipSystemsBroadcast } from '@kybernetes/protocol';
import { describe, expect, it } from 'vitest';
import { engineViewModel, reactorViewModel } from './shipConsoleModel';

function systems(over: Partial<ShipSystemsBroadcast> = {}): ShipSystemsBroadcast {
  return {
    type: 'SHIP_SYSTEMS',
    v: 2,
    tick: 10,
    serverTimeMs: 1000,
    vesselId: 'ship',
    tempK: 660,
    bandLo: 620,
    bandHi: 700,
    rods: 0.3,
    coolant: 0.5,
    outputMW: 31,
    scrammed: false,
    warned: false,
    condition: 100,
    ...over,
  };
}

describe('shipConsoleModel (M2 panels)', () => {
  it('reads nominal reactor state with ignite disabled', () => {
    const vm = reactorViewModel(systems());
    expect(vm.status).toBe('nominal');
    expect(vm.restartEnabled).toBe(false);
    expect(vm.tempPct).toBeGreaterThan(0);
    expect(vm.tempPct).toBeLessThan(100);
  });

  it('walks cold to warning to critical to scrammed', () => {
    expect(reactorViewModel(systems({ tempK: 300 })).status).toBe('cold');
    expect(reactorViewModel(systems({ tempK: 300 })).restartLabel).toBe('IGNITE REACTOR');
    expect(reactorViewModel(systems({ tempK: 300 })).restartEnabled).toBe(true);
    expect(reactorViewModel(systems({ tempK: 710 })).status).toBe('warning');
    expect(reactorViewModel(systems({ tempK: 770 })).status).toBe('critical');
    expect(reactorViewModel(systems({ scrammed: true })).status).toBe('scrammed');
    expect(reactorViewModel(systems({ scrammed: true })).restartLabel).toBe('RESTART REACTOR');
  });

  it('reads engine fuel bunker state', () => {
    const vm = engineViewModel(systems({ fuel: 1450, fuelMax: 2000, fuelSlots: 2 }));
    expect(vm.fuel).toBe(1450);
    expect(vm.fuelMax).toBe(2000);
    expect(vm.fuelSlots).toBe(2);
    expect(vm.fuelPct).toBe(73);
    expect(vm.fuelLabel).toBe('FUEL 1450/2000 SLOTS 2');
  });
});
