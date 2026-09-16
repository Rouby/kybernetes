import type {
  NavStateBroadcast,
  ShipStatusBroadcast,
  ShipSystemsBroadcast,
} from '@kybernetes/protocol';
import { FIXED_DT, planVoyage } from '@kybernetes/sim-core';
import { describe, expect, it } from 'vitest';
import { chartMapView } from '../../harbor/chartModel';
import {
  customizeOptionCounts,
  defaultCustomizeSelection,
  layoutCargoScreen,
  layoutCustomizeField,
  layoutCustomizeScreen,
  layoutDeathScreen,
  layoutEngineScreen,
  layoutGameOverScreen,
  layoutIntroScreen,
  layoutMarketScreen,
  layoutMenuScreen,
  layoutNavScreen,
  layoutPackScreen,
  layoutPauseScreen,
  layoutReactorScreen,
  layoutSellScreen,
  layoutSettingsScreen,
  layoutTradeReceiptScreen,
  navigateUi,
  uiScreenButtonIds,
} from './UiScreens';
import { type UiButton, type UiRect, uiOverlaps, uiTextWidth, uiVisorMargins } from './UiToolkit';

const W = 1280;
const H = 720;

function makeSystems(over: Partial<ShipSystemsBroadcast> = {}): ShipSystemsBroadcast {
  return {
    type: 'SHIP_SYSTEMS',
    v: 2 as const,
    tick: 1,
    serverTimeMs: 1000,
    vesselId: 'skiff-1',
    tempK: 620,
    bandLo: 500,
    bandHi: 800,
    rods: 0.5,
    coolant: 0.5,
    outputMW: 4,
    demandMW: 3,
    scrammed: false,
    warned: false,
    spool: 0.2,
    tune: 0.5,
    wear: 0.1,
    brownout: false,
    condition: 100,
    fuel: 1500,
    fuelMax: 2000,
    fuelSlots: 2,
    ...over,
  };
}

function makeNav(over: Partial<NavStateBroadcast> = {}): NavStateBroadcast {
  return {
    type: 'NAV_STATE',
    v: 2 as const,
    tick: 1,
    serverTimeMs: 1000,
    vesselId: 'skiff-1',
    phase: 'docked',
    destHubId: 'hub_b',
    remainingS: 60,
    legId: 1,
    portHubId: 'hub_a',
    flameout: false,
    hailS: 0,
    stops: [],
    legIndex: 0,
    ...over,
  };
}

function makeStatus(): ShipStatusBroadcast {
  return {
    type: 'SHIP_STATUS',
    v: 2 as const,
    tick: 1,
    serverTimeMs: 1000,
    shipId: 'skiff-1',
    hullId: 'skiff',
    reactorTier: 0,
    engineTier: 0,
    credits: 0,
    condition: 100,
    locationHubId: 'hub_a',
    alive: true,
    stores: { rations: 1, waterL: 1, o2Cells: 1, fuelCells: 3 },
    engineFuel: 1500,
  };
}

function expectContained(panel: UiRect, buttons: readonly UiButton[]): void {
  for (const b of buttons) {
    expect(b.rect.x).toBeGreaterThanOrEqual(panel.x);
    expect(b.rect.y).toBeGreaterThanOrEqual(panel.y);
    expect(b.rect.x + b.rect.w).toBeLessThanOrEqual(panel.x + panel.w);
    expect(b.rect.y + b.rect.h).toBeLessThanOrEqual(panel.y + panel.h);
  }
}

function expectNoOverlap(buttons: readonly UiButton[]): void {
  for (let i = 0; i < buttons.length; i++) {
    for (let j = i + 1; j < buttons.length; j++) {
      expect(uiOverlaps(buttons[i].rect, buttons[j].rect)).toBe(false);
    }
  }
}

function expectCentered(panel: UiRect, w: number, h: number): void {
  expect(panel.x).toBe(Math.round((w - panel.w) / 2));
  expect(panel.y).toBe(Math.round((h - panel.h) / 2));
}

describe('layoutMenuScreen', () => {
  it('keeps every button inside the panel without overlap', () => {
    const layout = layoutMenuScreen({
      width: W,
      height: H,
      callsign: 'Rook',
      audioReady: true,
      muted: false,
      masterPct: 80,
    });
    expect(layout.buttons.length).toBeGreaterThan(0);
    expect(layout.texts.length).toBeGreaterThan(0);
    expectContained(layout.panel, layout.buttons);
    expectNoOverlap(layout.buttons);
  });

  it('shows volume row when ready and enable row when not', () => {
    const ready = layoutMenuScreen({
      width: W,
      height: H,
      callsign: 'Rook',
      audioReady: true,
      muted: false,
      masterPct: 80,
    });
    expect(ready.buttons.map((b) => b.id)).toContain('voldn');
    const cold = layoutMenuScreen({
      width: W,
      height: H,
      callsign: 'Rook',
      audioReady: false,
      muted: false,
      masterPct: 80,
    });
    expect(cold.buttons.map((b) => b.id)).toContain('audio');
  });
});

describe('centered screens', () => {
  it('intro panel is centered with embark contained', () => {
    const layout = layoutIntroScreen(W, H, 'skiff-1');
    expectCentered(layout.panel, W, H);
    expect(layout.buttons.map((b) => b.id)).toEqual(['embark']);
    expectContained(layout.panel, layout.buttons);
    expect(layout.texts[0].text).toContain('SOLO COMMISSION');
  });

  it('gameover panel is centered with restart contained', () => {
    const layout = layoutGameOverScreen(W, H, 'skiff-1');
    expectCentered(layout.panel, W, H);
    expect(layout.buttons.map((b) => b.id)).toEqual(['restart']);
    expectContained(layout.panel, layout.buttons);
    expect(layout.texts[0].text).toContain('HULL LOSS');
  });

  it('pause panel is centered with resume primary', () => {
    const layout = layoutPauseScreen(W, H);
    expectCentered(layout.panel, W, H);
    expect(layout.buttons.map((b) => b.id)).toEqual(['resume', 'restart', 'quit', 'audio']);
    expectContained(layout.panel, layout.buttons);
    expectNoOverlap(layout.buttons);
    expect(layout.buttons.find((b) => b.id === 'resume')?.primary).toBe(true);
  });

  it('death panel is centered with restart primary', () => {
    const layout = layoutDeathScreen(W, H, 'vacuum');
    expectCentered(layout.panel, W, H);
    expect(layout.buttons.map((b) => b.id)).toEqual(['restart', 'quit']);
    expectContained(layout.panel, layout.buttons);
    expect(layout.texts[1].text).toContain('SIGNAL LOST');
  });
});

describe('customize screen', () => {
  it('field is contained in the panel', () => {
    const layout = layoutCustomizeScreen(W, H, 'Rook');
    const field = layoutCustomizeField(W, H);
    expect(field.x).toBeGreaterThanOrEqual(layout.panel.x);
    expect(field.y).toBeGreaterThanOrEqual(layout.panel.y);
    expect(field.x + field.w).toBeLessThanOrEqual(layout.panel.x + layout.panel.w);
    expect(field.y + field.h).toBeLessThanOrEqual(layout.panel.y + layout.panel.h);
    expect(layout.buttons.map((b) => b.id)).toEqual(['back', 'embark']);
    expectContained(layout.panel, layout.buttons);
  });

  it('exposes swatch counts from protocol constants', () => {
    expect(customizeOptionCounts()).toEqual({ colors: 8, trims: 4, thrusters: 4 });
  });
});

describe('console screens', () => {
  it('reactor respects topClearance and includes close', () => {
    const m = uiVisorMargins(W, H);
    const layout = layoutReactorScreen(W, H, makeSystems());
    expect(layout.panel.y).toBeGreaterThanOrEqual(m.topClearance);
    expect(layout.buttons.map((b) => b.id)).toContain('close');
    expectContained(layout.panel, layout.buttons);
    expectNoOverlap(layout.buttons);
  });

  it('engine respects topClearance and flags brownout', () => {
    const m = uiVisorMargins(W, H);
    const layout = layoutEngineScreen(W, H, makeSystems({ brownout: true }));
    expect(layout.panel.y).toBeGreaterThanOrEqual(m.topClearance);
    expect(layout.buttons.map((b) => b.id)).toContain('close');
    expectContained(layout.panel, layout.buttons);
    expect(layout.texts.map((t) => t.text)).toContain('BROWNOUT');
  });

  function nodeButtons(layout: { buttons: readonly { id: string }[] }): string[] {
    return layout.buttons.map((b) => b.id).filter((id) => id.includes(':'));
  }

  function expectInsideCanvas(rect: { x: number; y: number; w: number; h: number }): void {
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.w).toBeLessThanOrEqual(W);
    expect(rect.y + rect.h).toBeLessThanOrEqual(H);
  }

  it('nav respects topClearance with a legend card and map nodes', () => {
    const m = uiVisorMargins(W, H);
    const sys = makeSystems();
    const docked = layoutNavScreen(W, H, makeNav({ phase: 'docked' }), sys, makeStatus());
    expect(docked.panel.y).toBeGreaterThanOrEqual(m.topClearance);
    expect(docked.panel.x).toBeGreaterThan(W / 2);
    expect(docked.buttons.map((b) => b.id)).toContain('close');
    expectInsideCanvas(docked.panel);
    for (const button of docked.buttons) expectInsideCanvas(button.rect);
    const cruise = layoutNavScreen(W, H, makeNav({ phase: 'in_transit' }), sys, makeStatus());
    expect(cruise.buttons.map((b) => b.id)).toContain('distress');
  });

  it('nav surfaces a heat soft warning without hiding plot', () => {
    const cold = makeSystems({ tune: 0.2, wear: 0 });
    const layout = layoutNavScreen(W, H, makeNav({ phase: 'docked' }), cold, makeStatus());
    expect(layout.texts.map((t) => t.text)).toContain('HEAT RISK: TUNE LOW');
    expect(layout.buttons.map((b) => b.id)).toContain('plot:hub_b');
    expect(nodeButtons(layout)).toContain('via:poi_kestrel');
  });

  it('nav shows the live hop on multi-stop chains only', () => {
    const sys = makeSystems();
    const chain = makeNav({
      phase: 'in_transit',
      destHubId: 'hub_b',
      stops: ['poi_kestrel', 'hub_b'],
      legIndex: 0,
    });
    const layout = layoutNavScreen(W, H, chain, sys, makeStatus());
    expect(layout.texts.map((t) => t.text)).toContain('HOP DERELICT "KESTREL" 1/2');
    expectContained(layout.panel, layout.buttons);
    const single = layoutNavScreen(W, H, makeNav({ phase: 'in_transit' }), sys, makeStatus());
    expect(single.texts.map((t) => t.text).some((text) => text.startsWith('HOP '))).toBe(false);
  });

  it('nav plots hubs and detours from map nodes while docked', () => {
    const sys = makeSystems();
    const docked = layoutNavScreen(W, H, makeNav({ phase: 'docked' }), sys, makeStatus());
    expect(docked.buttons.map((b) => b.id)).toEqual([
      'spool',
      'plot:hub_b',
      'via:poi_kestrel',
      'via:poi_vigil',
      'close',
    ]);
    expect(docked.buttons.map((b) => b.label)).toEqual([
      'SPOOL',
      'KEPLER',
      '??',
      '??',
      'CLOSE [E]',
    ]);
    const known = mockChart();
    const surveyedChart = {
      ...known,
      nodes: known.nodes.map((node) => ({ ...node, known: true })),
    };
    const surveyed = layoutNavScreen(
      W,
      H,
      makeNav({ phase: 'docked' }),
      sys,
      makeStatus(),
      surveyedChart
    );
    expect(surveyed.buttons.map((b) => b.label)).toContain('KESTREL');
    const map = chartMapView(makeNav({ phase: 'docked' }), null, makeStatus(), W, H, 0);
    for (const button of docked.buttons) {
      const node = map.nodes.find((entry) => entry.buttonId === button.id);
      if (node !== undefined) {
        expect(button.rect).toEqual(node.chip);
        expect(button.label).toBe(node.label);
      } else if (button.id === 'loadFuel' || button.id === 'spool') {
        expectContained(docked.sidePanel ?? docked.panel, [button]);
      } else {
        expectContained(docked.panel, [button]);
      }
    }
    const cruise = layoutNavScreen(W, H, makeNav({ phase: 'in_transit' }), sys, makeStatus());
    expect(cruise.buttons.map((b) => b.id)).toEqual(['distress', 'close']);
    expect(nodeButtons(cruise)).toEqual([]);
  });

  function mockChart(): import('@kybernetes/protocol').ChartStateBroadcast {
    return {
      type: 'CHART_STATE',
      v: 2 as const,
      tick: 1,
      serverTimeMs: 1000,
      vesselId: 'skiff-1',
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
    };
  }

  it('nav renders the docked manifest and the chain lane', () => {
    const sys = makeSystems();
    const docked = layoutNavScreen(
      W,
      H,
      makeNav({ phase: 'docked' }),
      sys,
      makeStatus(),
      mockChart()
    );
    const texts = docked.texts.map((t) => t.text);
    expect(texts).toContain('?? Distress echo.');
    expect(texts.some((text) => text.startsWith('HAUL '))).toBe(false);
    expect(texts).toContain('PRE-FLIGHT //');
    expect(texts).toContain('[✓] REACTOR: ONLINE');
    expect(texts.some((text) => text.startsWith('BUNKER: '))).toBe(true);
    expect(texts).toContain('ENGINE: IDLE');
    for (const button of docked.buttons) {
      if (nodeButtons({ buttons: docked.buttons }).includes(button.id))
        expectInsideCanvas(button.rect);
      else if (button.id === 'loadFuel' || button.id === 'spool')
        expectContained(docked.sidePanel ?? docked.panel, [button]);
      else expectContained(docked.panel, [button]);
    }
    const chain = layoutNavScreen(
      W,
      H,
      makeNav({
        phase: 'in_transit',
        destHubId: 'hub_b',
        stops: ['poi_kestrel', 'hub_b'],
        legIndex: 0,
      }),
      sys,
      makeStatus(),
      mockChart()
    );
    expect(chain.texts.map((t) => t.text)).toContain('LANE ANCHORAGE>??>KEPLER');
    expect(chain.texts.map((t) => t.text).some((text) => /^BURN \d+S RETRO \d+S$/.test(text))).toBe(
      true
    );
    const plain = layoutNavScreen(W, H, makeNav({ phase: 'docked' }), sys, makeStatus());
    const plainTexts = plain.texts.map((t) => t.text);
    expect(plainTexts.some((text) => text.startsWith('LANE '))).toBe(false);
    expect(plainTexts.some((text) => text.startsWith('??'))).toBe(false);
  });

  it('nav swaps to hail controls with a drone countdown while stranded', () => {
    const sys = makeSystems();
    const stranded = layoutNavScreen(
      W,
      H,
      makeNav({
        phase: 'in_transit',
        destHubId: 'hub_b',
        remainingS: 60,
        flameout: true,
        hailS: 0,
      }),
      sys,
      makeStatus()
    );
    expect(stranded.buttons.map((b) => b.id)).toEqual(['hail', 'distress', 'close']);
    expectContained(stranded.panel, stranded.buttons);
    expectNoOverlap(stranded.buttons);
    const waiting = layoutNavScreen(
      W,
      H,
      makeNav({
        phase: 'in_transit',
        destHubId: 'hub_b',
        remainingS: 60,
        flameout: true,
        hailS: 44.2,
      }),
      sys,
      makeStatus()
    );
    expect(waiting.texts.map((t) => t.text)).toContain('DRONE IN 45S');
    const cruise = layoutNavScreen(W, H, makeNav({ phase: 'in_transit' }), sys, makeStatus());
    expect(cruise.buttons.map((b) => b.id)).toEqual(['distress', 'close']);
  });

  it('nav charts bare without a fullscreen dim', () => {
    const layout = layoutNavScreen(W, H, makeNav({ phase: 'docked' }), makeSystems(), makeStatus());
    expect(layout.bare).toBe(true);
  });

  it('nav previews the drafted course before commit', () => {
    const sys = makeSystems();
    const draft = ['poi_kestrel', 'hub_b'];
    const layout = layoutNavScreen(
      W,
      H,
      makeNav({ phase: 'docked' }),
      sys,
      makeStatus(),
      mockChart(),
      0,
      draft
    );
    const texts = layout.texts.map((t) => t.text);
    expect(texts).toContain('PLAN ??>KEPLER');
    const quoted = planVoyage({
      fromId: 'hub_a',
      stops: [...draft],
      tier: 0,
      tune: 1,
      wear: 0,
      thrust01: 1,
      atSeconds: 1 * FIXED_DT,
    });
    if (!('plan' in quoted)) throw new Error('quote should succeed');
    expect(texts).toContain(`TIME ${quoted.plan.totalS}S FUEL ${quoted.plan.fuelNeeded}/1500`);
    expect(texts).toContain('THRUST 100%');
    expect(texts).toContain('TRIP COST -2 RATION -2 WATER -2 O2');
    expect(texts.some((text) => text.startsWith('LOW STORES:'))).toBe(true);
    expect(layout.buttons.map((b) => b.id)).toEqual([
      'spool',
      'plot:hub_b',
      'via:poi_kestrel',
      'via:poi_vigil',
      'confirm',
      'thrustDown',
      'thrustUp',
      'clear',
      'close',
    ]);
    const throttled = layoutNavScreen(
      W,
      H,
      makeNav({ phase: 'docked' }),
      sys,
      makeStatus(),
      mockChart(),
      0,
      draft,
      50
    );
    const throttledTexts = throttled.texts.map((t) => t.text);
    expect(throttledTexts).toContain('THRUST 50%');
    const half = planVoyage({
      fromId: 'hub_a',
      stops: [...draft],
      tier: 0,
      tune: 1,
      wear: 0,
      thrust01: 0.5,
      atSeconds: 1 * FIXED_DT,
    });
    if (!('plan' in half)) throw new Error('half quote should succeed');
    expect(throttledTexts).toContain(`TIME ${half.plan.totalS}S FUEL ${half.plan.fuelNeeded}/1500`);
    const plain = layoutNavScreen(
      W,
      H,
      makeNav({ phase: 'docked' }),
      sys,
      makeStatus(),
      mockChart()
    );
    expect(plain.buttons.map((b) => b.id)).not.toContain('confirm');
    expect(plain.texts.map((t) => t.text).some((text) => text.startsWith('PLAN '))).toBe(false);
    const visit = layoutNavScreen(
      W,
      H,
      makeNav({ phase: 'docked' }),
      sys,
      makeStatus(),
      mockChart(),
      0,
      ['poi_kestrel']
    );
    expect(visit.texts.map((t) => t.text)).toContain('PLAN ??');
    expect(visit.buttons.map((b) => b.id)).toContain('confirm');
    expect(visit.texts.map((t) => t.text)).toContain('COURSE //');
  });

  it('nav surfaces a low-fuel soft warning without hiding plot', () => {
    const sys = makeSystems({ fuel: 0, fuelMax: 2000 });
    const empty = { rations: 1, waterL: 1, o2Cells: 1, fuelCells: 0 };
    const status = { ...makeStatus(), stores: empty, engineFuel: 0 };
    const layout = layoutNavScreen(W, H, makeNav({ phase: 'docked' }), sys, status);
    const single = planVoyage({
      fromId: 'hub_a',
      stops: ['hub_b'],
      tier: 0,
      tune: sys.tune,
      wear: sys.wear,
    });
    const need = single !== null && 'plan' in single ? single.plan.fuelNeeded : 215;
    expect(layout.texts.map((t) => t.text)).toContain(`LOW FUEL ${need}/0 LOAD CELLS`);
    expect(layout.buttons.map((b) => b.id)).toContain('plot:hub_b');
    expectContained(
      layout.panel,
      layout.buttons.filter((b) => !b.id.includes(':'))
    );
  });

  it('nav offers bridge load and spool actions when docked and needy', () => {
    const needy = layoutNavScreen(
      W,
      H,
      makeNav({ phase: 'docked' }),
      makeSystems({ spool: 0, fuel: 0, fuelMax: 2000 }),
      {
        ...makeStatus(),
        stores: { rations: 2, waterL: 4, o2Cells: 2, fuelCells: 1 },
        engineFuel: 0,
      }
    );
    expect(needy.buttons.map((b) => b.id)).toContain('loadFuel');
    expect(needy.buttons.map((b) => b.id)).not.toContain('spool');
    expect(needy.texts.map((t) => t.text)).toContain('[✓] REACTOR: ONLINE');
    expect(needy.texts.map((t) => t.text)).toContain('ENGINE: IDLE');
    expect(needy.sidePanel).toBeDefined();
    expectContained(
      needy.panel,
      needy.buttons.filter((b) => b.id === 'close')
    );
    const preButtons = needy.buttons.filter((b) => b.id === 'loadFuel' || b.id === 'spool');
    expectContained(needy.sidePanel ?? needy.panel, preButtons);
    expectNoOverlap(preButtons);
    const ready = layoutNavScreen(W, H, makeNav({ phase: 'docked' }), makeSystems(), makeStatus());
    expect(ready.buttons.map((b) => b.id)).not.toContain('loadFuel');
    expect(ready.buttons.map((b) => b.id)).toContain('spool');
    const spooled = layoutNavScreen(
      W,
      H,
      makeNav({ phase: 'docked' }),
      makeSystems({ spool: 1 }),
      makeStatus()
    );
    expect(spooled.texts.map((t) => t.text)).toContain('ENGINE: SPOOLED');
    expect(spooled.buttons.map((b) => b.id)).not.toContain('spool');
  });

  it('nav docks the pre-flight checklist in a top-left side panel', () => {
    const m = uiVisorMargins(W, H);
    const docked = layoutNavScreen(W, H, makeNav({ phase: 'docked' }), makeSystems(), makeStatus());
    const side = docked.sidePanel;
    if (side === undefined) throw new Error('missing side panel');
    expect(side.x).toBe(m.marginX);
    expect(side.y).toBe(m.topClearance);
    expectInsideCanvas(side);
  });

  it('nav keeps checklist texts and actions inside the side panel', () => {
    const docked = layoutNavScreen(W, H, makeNav({ phase: 'docked' }), makeSystems(), makeStatus());
    const side = docked.sidePanel;
    if (side === undefined) throw new Error('missing side panel');
    expect(docked.texts.map((t) => t.text)).toContain('PRE-FLIGHT //');
    expectContained(
      side,
      docked.buttons.filter((b) => b.id === 'loadFuel' || b.id === 'spool')
    );
  });

  it('nav hides the pre-flight panel while underway', () => {
    const cruise = layoutNavScreen(
      W,
      H,
      makeNav({ phase: 'in_transit' }),
      makeSystems(),
      makeStatus()
    );
    expect(cruise.sidePanel).toBeUndefined();
    expect(cruise.texts.map((t) => t.text)).not.toContain('PRE-FLIGHT //');
  });

  it('nav lists trip costs and leftover stores on the draft', () => {
    const rich = {
      ...makeStatus(),
      stores: { rations: 5, waterL: 5, o2Cells: 5, fuelCells: 3 },
    };
    const layout = layoutNavScreen(
      W,
      H,
      makeNav({ phase: 'docked' }),
      makeSystems(),
      rich,
      undefined,
      0,
      ['hub_b']
    );
    const texts = layout.texts.map((t) => t.text);
    expect(texts).toContain('TRIP COST -1 RATION -1 WATER -1 O2');
    expect(texts).toContain('LEFT 4 RATION 4 WATER 4 O2');
  });

  it('nav shows the target demand table for goods aboard the draft', () => {
    const sys = makeSystems();
    const layout = layoutNavScreen(
      W,
      H,
      makeNav({ phase: 'docked' }),
      sys,
      makeStatus(),
      undefined,
      0,
      ['hub_b'],
      100,
      null,
      null,
      [{ goodId: 'scrap', qty: 2 }]
    );
    const texts = layout.texts.map((t) => t.text);
    expect(texts).toContain('CARGO @ KEPLER YARD');
    expect(texts).toContain('scrap x2 13cr 26cr');
    const empty = layoutNavScreen(
      W,
      H,
      makeNav({ phase: 'docked' }),
      sys,
      makeStatus(),
      undefined,
      0,
      ['hub_b'],
      100,
      null,
      null,
      []
    );
    expect(empty.texts.map((t) => t.text)).toContain('CARGO: None aboard');
    const plain = layoutNavScreen(W, H, makeNav({ phase: 'docked' }), sys, makeStatus());
    expect(plain.texts.map((t) => t.text).some((text) => text.startsWith('CARGO'))).toBe(false);
  });
});

describe('settings screen', () => {
  it('toggles enable vs volume rows', () => {
    const off = layoutSettingsScreen(W, H, 80, false, false);
    expect(off.buttons.map((b) => b.id)).toContain('enable');
    const on = layoutSettingsScreen(W, H, 80, false, true);
    expect(on.buttons.map((b) => b.id)).toEqual(['voldn', 'volup', 'mute', 'close']);
    const muted = layoutSettingsScreen(W, H, 80, true, true);
    expect(muted.buttons.find((b) => b.id === 'mute')?.label).toBe('MUTED');
  });
});

describe('navigateUi', () => {
  it('wraps around menu bounds', () => {
    expect(navigateUi(2, 'ArrowDown', 3)).toBe(0);
    expect(navigateUi(0, 'ArrowUp', 3)).toBe(2);
    expect(navigateUi(1, 'Home', 3)).toBe(0);
    expect(navigateUi(1, 'End', 3)).toBe(2);
  });
});

describe('uiScreenButtonIds', () => {
  it('matches actual layout button ids', () => {
    const sys = makeSystems();
    const menu = layoutMenuScreen({
      width: W,
      height: H,
      callsign: 'Rook',
      audioReady: true,
      muted: false,
      masterPct: 80,
    });
    expect(menu.buttons.map((b) => b.id)).toEqual([...uiScreenButtonIds('menu')]);
    expect(layoutIntroScreen(W, H, 's').buttons.map((b) => b.id)).toEqual([
      ...uiScreenButtonIds('intro'),
    ]);
    expect(layoutGameOverScreen(W, H, 's').buttons.map((b) => b.id)).toEqual([
      ...uiScreenButtonIds('gameover'),
    ]);
    expect(layoutPauseScreen(W, H).buttons.map((b) => b.id)).toEqual([
      ...uiScreenButtonIds('pause'),
    ]);
    expect(layoutDeathScreen(W, H, undefined).buttons.map((b) => b.id)).toEqual([
      ...uiScreenButtonIds('death'),
    ]);
    expect(layoutCustomizeScreen(W, H, 'Rook').buttons.map((b) => b.id)).toEqual([
      ...uiScreenButtonIds('customize'),
    ]);
    expect(layoutReactorScreen(W, H, sys).buttons.map((b) => b.id)).toEqual([
      ...uiScreenButtonIds('reactor'),
    ]);
    expect(layoutEngineScreen(W, H, sys).buttons.map((b) => b.id)).toEqual([
      ...uiScreenButtonIds('engine'),
    ]);
  });

  it('cargo respects topClearance and seals secured goods', () => {
    const m = uiVisorMargins(W, H);
    const layout = layoutCargoScreen(W, H, {
      carryingLabel: 'Hands: empty',
      floorLabel: 'Floor: scrap x3',
      securedLabel: 'Hold: scrap x5',
      hint: 'E picks up',
      canUnpack: true,
      handsFull: false,
      seal: [{ goodId: 'scrap', qty: 5 }],
    });
    expect(layout.panel.y).toBeGreaterThanOrEqual(m.topClearance);
    expect(layout.buttons.map((b) => b.id)).toContain('close');
    expect(layout.buttons.map((b) => b.id)).toContain('seal:scrap');
    expectContained(layout.panel, layout.buttons);
    expectNoOverlap(layout.buttons);
  });

  it('market respects topClearance with buy and sell entries', () => {
    const m = uiVisorMargins(W, H);
    const layout = layoutMarketScreen(W, H, {
      hubId: 'hub_a',
      hubLabel: 'NEW ANCHORAGE',
      creditsLabel: 'Credits: 25cr',
      left: [{ name: 'scrap', stock: 50, buy: 10, sell: 9 }],
      right: [{ name: 'meds', stock: 0, buy: 15, sell: 13 }],
      rumors: ['Kepler Yard structural shortage - paying premium on Scrap (+3cr/unit).'],
    });
    expect(layout.panel.y).toBeGreaterThanOrEqual(m.topClearance);
    expect(layout.buttons.map((b) => b.id)).toEqual(['buy', 'sell', 'close']);
    const words = layout.texts.map((t) => t.text);
    expect(words).toContain('50x scrap');
    expect(words).toContain('-10cr');
    expect(words).toContain('+13cr');
    expect(words.some((t) => t.includes('RUMORS // TRADE INTEL'))).toBe(true);
    expect(words.some((t) => t.includes('Scrap'))).toBe(true);
    expect(words.some((t) => t.includes('packs') || t.includes('lists'))).toBe(false);
    expectContained(layout.panel, layout.buttons);
    expectNoOverlap(layout.buttons);
  });

  it('market rumors respect panel bounds and wrap within width', () => {
    const layout = layoutMarketScreen(W, H, {
      hubId: 'hub_a',
      hubLabel: 'NEW ANCHORAGE',
      creditsLabel: 'Credits: 25cr',
      left: [{ name: 'scrap', stock: 50, buy: 10, sell: 9 }],
      right: [{ name: 'meds', stock: 0, buy: 15, sell: 13 }],
      rumors: [
        'Kepler Yard structural shortage - paying premium on Scrap (+3cr/unit).',
        'Engine bunkers burn 1000 fuel per transit leg. Ensure adequate fuel stores.',
      ],
    });
    for (const text of layout.texts) {
      expect(text.x).toBeGreaterThanOrEqual(layout.panel.x);
      expect(text.x).toBeLessThanOrEqual(layout.panel.x + layout.panel.w);
      expect(text.y).toBeGreaterThanOrEqual(layout.panel.y);
      expect(text.y).toBeLessThanOrEqual(layout.panel.y + layout.panel.h);
    }
    const rumorLines = layout.texts.filter((t) => t.color === 'muted');
    expect(rumorLines.length).toBeGreaterThan(0);
    expect(rumorLines.length).toBeLessThanOrEqual(6);
  });

  it('sell lists each bay crate with green values', () => {
    const m = uiVisorMargins(W, H);
    const layout = layoutSellScreen(W, H, {
      hubId: 'hub_a',
      hubLabel: 'NEW ANCHORAGE',
      rows: [{ crateId: 'c1', label: 'scrap x2', value: 18, buttonId: 'sell:c1' }],
      totalLabel: 'Bay total +18cr',
      sellIds: ['c1'],
      hint: 'Take it all',
    });
    expect(layout.panel.y).toBeGreaterThanOrEqual(m.topClearance);
    const byId = new Map(layout.buttons.map((b) => [b.id, b]));
    expect(byId.get('sell:c1')?.detail).toEqual({ text: '+18cr', color: 'good' });
    expect(byId.has('sellAll')).toBe(true);
    expect(byId.has('close')).toBe(true);
    expectContained(layout.panel, layout.buttons);
    expectNoOverlap(layout.buttons);
  });

  it('receipt settles the sale with goods, total, and balance', () => {
    const layout = layoutTradeReceiptScreen(W, H, {
      hubId: 'hub_b',
      hubLabel: 'KEPLER YARD',
      itemsSold: [{ goodId: 'scrap', qty: 2, revenue: 26 }],
      totalRevenue: 26,
      newBalance: 65,
      timestampMs: 4242,
    });
    const texts = layout.texts.map((t) => t.text);
    expect(texts).toContain('TRADE TRANSACTION SETTLED');
    expect(texts).toContain('PORT: KEPLER YARD');
    expect(texts).toContain('2x SCRAP');
    expect(texts).toContain('+26cr');
    expect(texts).toContain('TOTAL');
    expect(texts).toContain('BALANCE');
    expect(texts).toContain('39cr + 26cr = 65cr');
    const amounts = layout.texts.filter((t) => t.text === '+26cr');
    expect(amounts.length).toBe(2);
    for (const amount of amounts) {
      expect(amount.x + uiTextWidth(amount.text, 13)).toBe(layout.panel.x + layout.panel.w - 24);
    }
    expect(layout.buttons.map((b) => b.id)).toEqual(['continue']);
    expect(layout.buttons[0]?.label).toBe('CONTINUE [E]');
    expectContained(layout.panel, layout.buttons);
    expectNoOverlap(layout.buttons);
  });

  it('pack keeps the canvas clear with palette and strip rows', () => {
    const layout = layoutPackScreen(W, H, {
      title: 'PACK // BUY — HUB_A',
      budgetLabel: 'Credits: 25cr',
      palette: [{ buttonId: 'add:scrap', label: '+ SCRAP (1)', unitPrice: 10 }],
      sealLabel: 'SEAL',
      sealReady: false,
      sealDetail: '-10cr',
      hint: 'Drag them in',
    });
    const ids = layout.buttons.map((b) => b.id);
    expect(ids).toContain('add:scrap');
    expect(layout.buttons.find((b) => b.id === 'add:scrap')?.detail).toEqual({
      text: '-10cr',
      color: 'danger',
    });
    expect(ids).toContain('seal');
    expect(layout.buttons.find((b) => b.id === 'seal')?.detail).toEqual({
      text: '-10cr',
      color: 'danger',
    });
    expect(ids).toContain('auto');
    expect(ids).toContain('clear');
    expect(ids).toContain('close');
    expectContained(
      layout.panel,
      layout.buttons.filter((b) => b.id.startsWith('add:'))
    );
    expectNoOverlap(layout.buttons);
  });

  it('matches nav and settings ready layouts', () => {
    const sys = makeSystems();
    const nav = layoutNavScreen(W, H, makeNav(), sys, makeStatus());
    for (const id of nav.buttons.map((b) => b.id)) {
      expect(uiScreenButtonIds('nav')).toContain(id);
    }
    expect(uiScreenButtonIds('nav')).toEqual(
      expect.arrayContaining(['plot:hub_b', 'loadFuel', 'spool', 'close'])
    );
    const audio = layoutSettingsScreen(W, H, 80, false, true);
    expect(audio.buttons.map((b) => b.id)).toEqual([...uiScreenButtonIds('settings')]);
  });
});
describe('customize swatches and field', () => {
  const selection = { color: '#00e5ff', trim: 'ion', thruster: 'amber', caret: 2, focused: true };

  it('exposes one swatch per preset with single selection per group', () => {
    const layout = layoutCustomizeScreen(W, H, 'Rook', selection);
    expect(layout.swatches).toHaveLength(8 + 4 + 4);
    const selected = (layout.swatches ?? []).filter((swatch) => swatch.selected);
    expect(selected.map((swatch) => swatch.id).sort()).toEqual(
      ['tint:#00e5ff', 'thruster:amber', 'trim:ion'].sort()
    );
  });

  it('keeps swatches and the field inside the panel', () => {
    const layout = layoutCustomizeScreen(W, H, 'Rook', selection);
    for (const swatch of layout.swatches ?? []) {
      expect(swatch.rect.x).toBeGreaterThanOrEqual(layout.panel.x);
      expect(swatch.rect.y).toBeGreaterThanOrEqual(layout.panel.y);
      expect(swatch.rect.x + swatch.rect.w).toBeLessThanOrEqual(layout.panel.x + layout.panel.w);
      expect(swatch.rect.y + swatch.rect.h).toBeLessThanOrEqual(layout.panel.y + layout.panel.h);
    }
    const field = layout.fields?.[0];
    expect(field?.id).toBe('callsign');
    expect(field?.rect).toEqual(layoutCustomizeField(W, H));
    expect(field?.caret).toBe(2);
    expect(field?.focused).toBe(true);
  });

  it('clamps the caret into the callsign', () => {
    const layout = layoutCustomizeScreen(W, H, 'Rook', { ...selection, caret: 99 });
    expect(layout.fields?.[0]?.caret).toBe(4);
  });

  it('defaults selection for legacy callers', () => {
    expect(defaultCustomizeSelection()).toMatchObject({ focused: false, caret: 0 });
    const layout = layoutCustomizeScreen(W, H, 'Rook');
    expect(layout.swatches).toHaveLength(16);
    expect(layout.fields?.[0]).toMatchObject({ id: 'callsign', value: 'Rook', focused: false });
  });
});
