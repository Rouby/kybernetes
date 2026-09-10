/** @vitest-environment node */
import { describe, expect, it, vi } from 'vitest';
import { ConsoleStore } from './ConsoleStore';

function systems() {
  return {
    type: 'SHIP_SYSTEMS',
    v: 2,
    tick: 30,
    serverTimeMs: 3000,
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
  } as unknown as import('@kybernetes/protocol').ShipSystemsBroadcast;
}

describe('ConsoleStore', () => {
  it('toggles and closes consoles', () => {
    const store = new ConsoleStore();
    expect(store.getSnapshot().consoleOpen).toBeNull();
    store.toggleConsole('reactor_console');
    expect(store.getSnapshot().consoleOpen).toBe('reactor_console');
    store.toggleConsole('reactor_console');
    expect(store.getSnapshot().consoleOpen).toBeNull();
    store.toggleConsole('engine_console');
    store.closeConsole();
    expect(store.getSnapshot().consoleOpen).toBeNull();
  });

  it('publishes ship systems to subscribers', () => {
    const store = new ConsoleStore();
    const seen: string[] = [];
    store.subscribe((snapshot) => {
      seen.push(String(snapshot.consoleOpen));
    });
    store.setShipSystems(systems());
    expect(store.getSnapshot().shipSystems?.tempK).toBe(660);
    expect(seen.length).toBeGreaterThan(0);
  });

  it('fires onShipLost once per ship', () => {
    const onShipLost = vi.fn();
    const store = new ConsoleStore(onShipLost);
    const lost = {
      shipId: 'ship:u1',
    } as unknown as import('@kybernetes/protocol').ShipLostBroadcast;
    store.setShipLost(lost);
    store.setShipLost(lost);
    expect(onShipLost).toHaveBeenCalledTimes(1);
    store.setShipLost(null);
    store.setShipLost(lost);
    expect(onShipLost).toHaveBeenCalledTimes(2);
  });
});
