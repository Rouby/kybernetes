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
    demandMW: 28,
    scrammed: false,
    warned: false,
    spool: 1,
    tune: 0.8,
    wear: 0,
    brownout: false,
    condition: 100,
    ...over,
  };
}

describe('shipConsoleModel (M2 panels)', () => {
  it('reads nominal reactor state with ignite disabled', () => {
    const vm = reactorViewModel(systems());
    expect(vm.status).toBe('nominal');
    expect(vm.powerOk).toBe(true);
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

  it('reads engine spool tune and brownout', () => {
    const vm = engineViewModel(systems());
    expect(vm.spoolPct).toBe(100);
    expect(vm.spoolLabel).toBe('SPOOL OFF');
    expect(vm.brownout).toBe(false);
    const stalled = engineViewModel(systems({ spool: 0.2, brownout: true }));
    expect(stalled.spoolLabel).toBe('SPOOL ON');
    expect(stalled.brownout).toBe(true);
  });
});
