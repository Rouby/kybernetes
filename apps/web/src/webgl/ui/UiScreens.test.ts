import type {
  NavStateBroadcast,
  ShipStatusBroadcast,
  ShipSystemsBroadcast,
} from '@kybernetes/protocol';
import { describe, expect, it } from 'vitest';
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
  layoutSettingsScreen,
  navigateUi,
  uiScreenButtonIds,
} from './UiScreens';
import { type UiButton, type UiRect, uiOverlaps, uiVisorMargins } from './UiToolkit';

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

  it('nav respects topClearance and keeps plot always present', () => {
    const m = uiVisorMargins(W, H);
    const sys = makeSystems();
    const docked = layoutNavScreen(W, H, makeNav({ phase: 'docked' }), sys, makeStatus());
    expect(docked.panel.y).toBeGreaterThanOrEqual(m.topClearance);
    expect(docked.buttons.map((b) => b.id)).toContain('close');
    expectContained(docked.panel, docked.buttons);
    const cruise = layoutNavScreen(W, H, makeNav({ phase: 'in_transit' }), sys, makeStatus());
    expect(cruise.buttons.map((b) => b.id)).toContain('plot');
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

  it('market respects topClearance with buy and sell-all rows', () => {
    const m = uiVisorMargins(W, H);
    const layout = layoutMarketScreen(W, H, {
      hubId: 'hub_a',
      hubLabel: 'NEW ANCHORAGE',
      creditsLabel: 'Credits: 25cr',
      listingLines: ['scrap 10/9 (50)', 'meds 15/13 (0)'],
      buys: [
        { goodId: 'scrap', qty: 2, cost: 20, label: 'BUY SCRAP x2 20cr', buttonId: 'buy:scrap' },
      ],
      sellLabel: 'SELL ALL BAY (1) +18cr',
      sellIds: ['c1'],
      hasSell: true,
      hint: 'Buy low',
    });
    expect(layout.panel.y).toBeGreaterThanOrEqual(m.topClearance);
    expect(layout.buttons.map((b) => b.id)).toContain('close');
    expect(layout.buttons.map((b) => b.id)).toContain('buy:scrap');
    expect(layout.buttons.map((b) => b.id)).toContain('sellAll');
    expectContained(layout.panel, layout.buttons);
    expectNoOverlap(layout.buttons);
  });

  it('pack keeps the canvas clear with palette and strip rows', () => {
    const layout = layoutPackScreen(W, H, {
      title: 'PACK // BUY — HUB_A',
      budgetLabel: 'Credits: 25cr',
      palette: [{ buttonId: 'add:scrap', label: '+ SCRAP (1)' }],
      sealLabel: 'SEAL',
      sealReady: false,
      hint: 'Drag them in',
    });
    const ids = layout.buttons.map((b) => b.id);
    expect(ids).toContain('add:scrap');
    expect(ids).toContain('seal');
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
    expect(nav.buttons.map((b) => b.id)).toEqual([...uiScreenButtonIds('nav')]);
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
