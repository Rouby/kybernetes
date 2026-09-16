import type {
  ChartStateBroadcast,
  NavStateBroadcast,
  ShipStatusBroadcast,
  ShipSystemsBroadcast,
} from '@kybernetes/protocol';
import { describe, expect, it } from 'vitest';
import {
  detourButtonId,
  detourLabel,
  hubLabel,
  navDetourOptions,
  navViewModel,
  otherHub,
} from './navConsoleModel';

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
    hailS: 0,
    stops: [],
    legIndex: 0,
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
    fuel: 1000,
    fuelMax: 2000,
    fuelSlots: 2,
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
    engineFuel: 1000,
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
    expect(vm.fuel).toBe(1000);
    expect(vm.fuelNeeded).toBe(215);
    expect(vm.fuelWarning).toBeNull();
    expect(vm.heatWarning).toBeNull();
  });

  it('warns softly on low fuel but keeps plot enabled', () => {
    const empty = navViewModel(
      nav(),
      systems({ fuel: 0, fuelMax: 2000 }),
      status({ stores: { rations: 2, waterL: 4, o2Cells: 2, fuelCells: 0 }, engineFuel: 0 })
    );
    expect(empty.fuelNeeded).toBe(215);
    expect(empty.fuelWarning).toBe('LOW FUEL 215/0 LOAD CELLS');
    expect(empty.canPlot).toBe(true);
  });

  it('projects extra burn when tune is cold', () => {
    const cold = navViewModel(
      nav(),
      systems({ tune: 0.2, wear: 0, fuel: 0, fuelMax: 2000 }),
      status({ engineFuel: 0 })
    );
    expect(cold.fuelNeeded).toBe(515);
    expect(cold.fuelWarning).toBe('LOW FUEL 515/0 LOAD CELLS');
    expect(cold.heatWarning).toBe('HEAT RISK: TUNE LOW');
    expect(cold.canPlot).toBe(true);
  });

  it('flags heat risk on a fueled cold leg', () => {
    const cold = navViewModel(
      nav(),
      systems({ tune: 0.2, wear: 0, fuel: 2000, fuelMax: 2000 }),
      status({
        stores: { rations: 2, waterL: 4, o2Cells: 2, fuelCells: 2 },
        engineFuel: 2000,
      })
    );
    expect(cold.fuelWarning).toBeNull();
    expect(cold.heatWarning).toBe('HEAT RISK: TUNE LOW');
  });

  it('tracks the live hop on multi-stop chains', () => {
    const first = navViewModel(
      nav({
        phase: 'in_transit',
        destHubId: 'hub_b',
        remainingS: 100,
        stops: ['poi_kestrel', 'hub_b'],
        legIndex: 0,
      }),
      systems(),
      status()
    );
    expect(first.hopToId).toBe('poi_kestrel');
    expect(first.hopLabel).toBe('DERELICT "KESTREL"');
    expect(first.hopProgress).toBe('1/2');
    const second = navViewModel(
      nav({
        phase: 'in_transit',
        destHubId: 'hub_b',
        remainingS: 50,
        stops: ['poi_kestrel', 'hub_b'],
        legIndex: 1,
      }),
      systems(),
      status()
    );
    expect(second.hopToId).toBe('hub_b');
    expect(second.hopLabel).toBe('KEPLER YARD');
    expect(second.hopProgress).toBe('2/2');
  });

  it('offers POI detours with stable button ids', () => {
    expect(navDetourOptions()).toEqual(['poi_kestrel', 'poi_vigil']);
    expect(detourButtonId('poi_kestrel')).toBe('via:poi_kestrel');
    expect(detourLabel('poi_kestrel')).toBe('VIA KESTREL');
    expect(detourLabel('poi_vigil')).toBe('VIA VIGIL');
  });

  function chart(over: Partial<ChartStateBroadcast> = {}): ChartStateBroadcast {
    return {
      type: 'CHART_STATE',
      v: 2,
      tick: 1,
      serverTimeMs: 1000,
      vesselId: 'ship',
      nodes: [
        { id: 'hub_a', kind: 'hub', label: 'NEW ANCHORAGE', short: 'ANCHORAGE', known: true },
        { id: 'hub_b', kind: 'hub', label: 'KEPLER YARD', short: 'KEPLER', known: true },
        {
          id: 'poi_kestrel',
          kind: 'poi',
          label: 'DERELICT "KESTREL"',
          short: 'KESTREL',
          rumor: 'Distress echo.',
          known: false,
        },
        {
          id: 'poi_vigil',
          kind: 'poi',
          label: 'BEACON "VIGIL"',
          short: 'VIGIL',
          rumor: 'Cache pings.',
          known: false,
        },
      ],
      ...over,
    };
  }

  it('shows the docked manifest with rumor and no haul hint', () => {
    const vm = navViewModel(nav(), systems(), status(), chart());
    expect(vm.chartRow).toBe('?? Distress echo.');
    expect('haulRow' in vm).toBe(false);
    expect(vm.laneRow).toBeNull();
  });

  it('counts a fully surveyed chart and draws the chain lane', () => {
    const surveyed = chart({
      nodes: chart().nodes.map((node) => ({ ...node, known: true })),
    });
    const docked = navViewModel(nav(), systems(), status(), surveyed);
    expect(docked.chartRow).toBe('CHART 4/4 KNOWN');
    const chain = navViewModel(
      nav({
        phase: 'in_transit',
        destHubId: 'hub_b',
        stops: ['poi_kestrel', 'hub_b'],
        legIndex: 0,
      }),
      systems(),
      status(),
      chart()
    );
    expect(chain.laneRow).toBe('LANE ANCHORAGE>??>KEPLER');
    expect(chain.chartRow).toBeNull();
    const leg2 = navViewModel(
      nav({
        phase: 'in_transit',
        destHubId: 'hub_b',
        stops: ['poi_kestrel', 'hub_b'],
        legIndex: 1,
      }),
      systems(),
      status(),
      surveyed
    );
    expect(leg2.laneRow).toBe('LANE ANCHORAGE>KESTREL>KEPLER');
  });

  it('hides the manifest without a chart broadcast', () => {
    const vm = navViewModel(nav(), systems(), status());
    expect(vm.chartRow).toBeNull();
    expect(vm.laneRow).toBeNull();
  });

  it('arms hail and counts the drone while stranded', () => {
    const stranded = navViewModel(
      nav({ phase: 'in_transit', destHubId: 'hub_b', remainingS: 60, flameout: true, hailS: 0 }),
      systems(),
      status()
    );
    expect(stranded.canHail).toBe(true);
    expect(stranded.rescueS).toBe(0);
    const waiting = navViewModel(
      nav({ phase: 'in_transit', destHubId: 'hub_b', remainingS: 60, flameout: true, hailS: 44.2 }),
      systems(),
      status()
    );
    expect(waiting.canHail).toBe(true);
    expect(waiting.rescueS).toBe(45);
    const docked = navViewModel(nav(), systems(), status());
    expect(docked.canHail).toBe(false);
    expect(docked.rescueS).toBe(0);
  });

  it('hides hop progress on single-hop legs', () => {
    const vm = navViewModel(nav(), systems(), status());
    expect(vm.hopToId).toBeUndefined();
    expect(vm.hopLabel).toBe('—');
    expect(vm.hopProgress).toBeNull();
  });

  it('hides the warning once underway', () => {
    const cruise = navViewModel(
      nav({ phase: 'in_transit', destHubId: 'hub_b', remainingS: 60 }),
      systems(),
      status({ stores: { rations: 2, waterL: 4, o2Cells: 2, fuelCells: 0 } })
    );
    expect(cruise.fuelWarning).toBeNull();
    expect(cruise.heatWarning).toBeNull();
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

  it('exposes pre-flight readiness on a fueled spooled ship', () => {
    const vm = navViewModel(nav(), systems(), status());
    expect(vm.reactorOnline).toBe(true);
    expect(vm.bunkerFuel).toBe(1000);
    expect(vm.bunkerFuelNeeded).toBe(vm.fuelNeeded);
    expect(vm.storesFuelCells).toBe(1);
    expect(vm.engineSpooled).toBe(true);
    expect(vm.canLoadFuelFromBridge).toBe(true);
    expect(vm.canSpoolFromBridge).toBe(false);
  });

  it('offers bridge load and spool on an empty idle ship', () => {
    const vm = navViewModel(
      nav(),
      systems({ spool: 0, fuel: 0, fuelMax: 2000 }),
      status({ stores: { rations: 2, waterL: 4, o2Cells: 2, fuelCells: 1 }, engineFuel: 0 })
    );
    expect(vm.reactorOnline).toBe(true);
    expect(vm.engineSpooled).toBe(false);
    expect(vm.canLoadFuelFromBridge).toBe(true);
    expect(vm.canSpoolFromBridge).toBe(false);
    const fueled = navViewModel(
      nav(),
      systems({ spool: 0, fuel: 1000, fuelMax: 2000 }),
      status({ stores: { rations: 2, waterL: 4, o2Cells: 2, fuelCells: 1 }, engineFuel: 1000 })
    );
    expect(fueled.canSpoolFromBridge).toBe(true);
    expect(fueled.canLoadFuelFromBridge).toBe(true);
  });

  it('marks a cold unignited reactor offline despite healthy output', () => {
    const vm = navViewModel(
      nav(),
      systems({ tempK: 300, fuel: 1000, fuelMax: 2000, spool: 0, outputMW: 31, demandMW: 8 }),
      status()
    );
    expect(vm.reactorOnline).toBe(false);
    expect(vm.canSpoolFromBridge).toBe(false);
  });

  it('blocks bridge actions underway, offline, or without room', () => {
    const cruise = navViewModel(
      nav({ phase: 'in_transit' }),
      systems({ spool: 0, fuel: 0, fuelMax: 2000 }),
      status()
    );
    expect(cruise.canLoadFuelFromBridge).toBe(false);
    expect(cruise.canSpoolFromBridge).toBe(false);
    const dark = navViewModel(
      nav(),
      systems({ spool: 0, fuel: 1000, fuelMax: 2000, scrammed: true, outputMW: 0, demandMW: 28 }),
      status()
    );
    expect(dark.reactorOnline).toBe(false);
    expect(dark.canSpoolFromBridge).toBe(false);
    const full = navViewModel(nav(), systems({ spool: 0, fuel: 1500, fuelMax: 2000 }), status());
    expect(full.canLoadFuelFromBridge).toBe(false);
  });

  it('degrades gracefully without snapshots', () => {
    const vm = navViewModel(null, null, null);
    expect(vm.phase).toBe('unknown');
    expect(vm.etaS).toBe(0);
    expect(vm.canPlot).toBe(false);
    expect(vm.fuelWarning).toBeNull();
    expect(vm.heatWarning).toBeNull();
  });
});
