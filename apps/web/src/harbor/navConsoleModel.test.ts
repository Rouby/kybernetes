import type {
  NavStateBroadcast,
  ShipStatusBroadcast,
  ShipSystemsBroadcast,
} from '@kybernetes/protocol';
import { describe, expect, it } from 'vitest';
import { hubLabel, navViewModel, otherHub } from './navConsoleModel';

function nav(over: Partial<NavStateBroadcast> = {}): NavStateBroadcast {
  return {
    type: 'NAV_STATE',
    v: 2,
    tick: 10,
    serverTimeMs: 1000,
    vesselId: 'ship',
    phase: 'docked',
    destHubId: undefined,
    remainingS: 0,
    legId: 0,
    portHubId: 'hub_a',
    flameout: false,
    ...over,
  };
}

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
    tune: 1,
    wear: 0,
    brownout: false,
    condition: 100,
    ...over,
  };
}

function status(over: Partial<ShipStatusBroadcast> = {}): ShipStatusBroadcast {
  return {
    type: 'SHIP_STATUS',
    v: 2,
    tick: 10,
    serverTimeMs: 1000,
    shipId: 'ship:u1',
    hullId: 'skiff_alpha',
    reactorTier: 0,
    engineTier: 0,
    credits: 20,
    condition: 100,
    locationHubId: 'hub_a',
    alive: true,
    stores: { rations: 2, waterL: 4, o2Cells: 2, fuelCells: 1 },
    ...over,
  };
}

describe('navConsoleModel (M3 panel)', () => {
  it('labels hubs and mirrors the other side', () => {
    expect(hubLabel('hub_a')).toBe('NEW ANCHORAGE');
    expect(hubLabel('hub_b')).toBe('KEPLER YARD');
    expect(hubLabel(undefined)).toBe('—');
    expect(otherHub('hub_a')).toBe('hub_b');
    expect(otherHub('hub_b')).toBe('hub_a');
  });

  it('offers plot while docked with a T0 estimate', () => {
    const vm = navViewModel(nav(), systems(), status());
    expect(vm.phase).toBe('docked');
    expect(vm.canPlot).toBe(true);
    expect(vm.canCancel).toBe(false);
    expect(vm.canDistress).toBe(false);
    expect(vm.otherHubId).toBe('hub_b');
    expect(vm.destLabel).toBe('—');
    expect(vm.etaS).toBe(150);
    expect(vm.fuelCells).toBe(1);
  });

  it('counts down in transit and arms cancel and distress per phase', () => {
    const cruise = navViewModel(
      nav({ phase: 'in_transit', destHubId: 'hub_b', remainingS: 87.4 }),
      systems(),
      status()
    );
    expect(cruise.countdownS).toBe(88);
    expect(cruise.canPlot).toBe(false);
    expect(cruise.canDistress).toBe(true);
    expect(cruise.destLabel).toBe('KEPLER YARD');
    const spooling = navViewModel(
      nav({ phase: 'spooling', destHubId: 'hub_b', remainingS: 6 }),
      systems(),
      status()
    );
    expect(spooling.canCancel).toBe(true);
    expect(spooling.canDistress).toBe(false);
    const flamed = navViewModel(
      nav({ phase: 'in_transit', destHubId: 'hub_b', remainingS: 60, flameout: true }),
      systems(),
      status()
    );
    expect(flamed.flameout).toBe(true);
    expect(flamed.canDistress).toBe(true);
  });

  it('degrades gracefully without snapshots', () => {
    const vm = navViewModel(null, null, null);
    expect(vm.phase).toBe('unknown');
    expect(vm.etaS).toBe(0);
    expect(vm.canPlot).toBe(false);
  });
});
