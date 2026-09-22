/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import {
  cargoConsoleIntent,
  confirmPlotIntent,
  engineConsoleIntent,
  findUiButton,
  GL_UI_BLOCKER_ID,
  hexToRgb,
  marketConsoleIntent,
  navConsoleIntent,
  reactorConsoleIntent,
  selectSessionOverlayId,
  splashStarCount,
  splashStarField,
  uiOverlayButtonIds,
  uiTextHex,
} from './UiPass';
import type { UiScreenLayout } from './UiScreens';

function layout(): UiScreenLayout {
  return {
    panel: { x: 100, y: 80, w: 400, h: 300 },
    texts: [],
    buttons: [
      { id: 'resume', label: 'RESUME', rect: { x: 120, y: 200, w: 360, h: 44 }, primary: true },
      { id: 'quit', label: 'QUIT', rect: { x: 120, y: 254, w: 360, h: 44 }, primary: false },
    ],
  };
}

describe('uiTextHex', () => {
  it('maps terminal colors to hex', () => {
    expect(uiTextHex('cyan')).toBe('#00e5ff');
    expect(uiTextHex('dim')).toBe('#008899');
    expect(uiTextHex('danger')).toBe('#ff2244');
    expect(uiTextHex('warning')).toBe('#ffd166');
    expect(uiTextHex('good')).toBe('#7ee787');
    expect(uiTextHex('primary')).toBe('#e0e8f5');
    expect(uiTextHex('muted')).toBe('#8a9bb5');
  });
});

describe('uiOverlayButtonIds', () => {
  it('preserves button order for zones and e2e', () => {
    expect(uiOverlayButtonIds(layout())).toEqual(['resume', 'quit']);
    expect(GL_UI_BLOCKER_ID).toBe('ui_overlay_block');
  });
});

describe('findUiButton', () => {
  it('hits buttons and misses elsewhere', () => {
    expect(findUiButton(layout(), 130, 210)?.id).toBe('resume');
    expect(findUiButton(layout(), 130, 260)?.id).toBe('quit');
    expect(findUiButton(layout(), 10, 10)).toBeNull();
  });

  it('is edge-inclusive', () => {
    expect(findUiButton(layout(), 120, 200)?.id).toBe('resume');
    expect(findUiButton(layout(), 480, 244)?.id).toBe('resume');
    expect(findUiButton(layout(), 481, 244)).toBeNull();
  });
});

describe('selectSessionOverlayId', () => {
  it('prefers death over pause and rests otherwise', () => {
    expect(selectSessionOverlayId({ paused: false, dead: false })).toBeNull();
    expect(selectSessionOverlayId({ paused: true, dead: false })).toBe('pause');
    expect(selectSessionOverlayId({ paused: false, dead: true })).toBe('death');
    expect(selectSessionOverlayId({ paused: true, dead: true })).toBe('death');
  });

  it('raises the pack bench above consoles but below death', () => {
    expect(selectSessionOverlayId({ paused: false, dead: false, console: 'pack' })).toBe('pack');
    expect(selectSessionOverlayId({ paused: false, dead: false, console: 'cargo' })).toBe('cargo');
    expect(selectSessionOverlayId({ paused: false, dead: true, console: 'pack' })).toBe('death');
  });

  it('raises the trade receipt above consoles but below death', () => {
    expect(selectSessionOverlayId({ paused: false, dead: false, receiptOpen: true })).toBe(
      'receipt'
    );
    expect(
      selectSessionOverlayId({ paused: false, dead: false, console: 'sell', receiptOpen: true })
    ).toBe('receipt');
    expect(selectSessionOverlayId({ paused: false, dead: true, receiptOpen: true })).toBe('death');
  });

  it('opens the audio subscreen while paused', () => {
    expect(selectSessionOverlayId({ paused: true, dead: false, settingsOpen: true })).toBe(
      'settings'
    );
    expect(selectSessionOverlayId({ paused: false, dead: false, settingsOpen: true })).toBeNull();
    expect(selectSessionOverlayId({ paused: true, dead: true, settingsOpen: true })).toBe('death');
  });
});
describe('console intents', () => {
  const nav = { portHubId: 'hub_a' } as import('@kybernetes/protocol').NavStateBroadcast;

  it('builds reactor restart and rejects retired steps', () => {
    expect(reactorConsoleIntent('restart')).toEqual({ type: 'REACTOR_RESTART', seq: 0 });
    expect(reactorConsoleIntent('rodsDown')).toBeNull();
    expect(reactorConsoleIntent('rodsUp')).toBeNull();
    expect(reactorConsoleIntent('coolantDown')).toBeNull();
    expect(reactorConsoleIntent('coolantUp')).toBeNull();
    expect(reactorConsoleIntent('close')).toBeNull();
    expect(reactorConsoleIntent('bogus')).toBeNull();
  });

  it('loads fuel and rejects retired spool and tune steps', () => {
    expect(engineConsoleIntent('loadFuel')).toEqual({
      type: 'ENGINE_FUEL',
      seq: 0,
      op: 'load',
    });
    expect(engineConsoleIntent('unloadFuel')).toEqual({
      type: 'ENGINE_FUEL',
      seq: 0,
      op: 'unload',
    });
    expect(engineConsoleIntent('spool')).toBeNull();
    expect(engineConsoleIntent('tuneUp')).toBeNull();
    expect(engineConsoleIntent('tuneDown')).toBeNull();
    expect(engineConsoleIntent('close')).toBeNull();
  });

  it('drops, stows, and seals cargo from the hold panel', () => {
    const stock = { unpackIds: ['c1', 'c2'], seal: { scrap: 5 } };
    expect(cargoConsoleIntent('drop', stock)).toEqual({ type: 'CARGO_DROP', seq: 0 });
    expect(cargoConsoleIntent('unpackAll', stock)).toEqual({
      type: 'CARGO_UNPACK',
      seq: 0,
      crateIds: ['c1', 'c2'],
    });
    expect(cargoConsoleIntent('seal:scrap', stock)).toEqual({
      type: 'CARGO_REPACK',
      seq: 0,
      items: [{ goodId: 'scrap', qty: 5 }],
    });
    expect(cargoConsoleIntent('unpackAll', { unpackIds: [], seal: {} })).toBeNull();
    expect(cargoConsoleIntent('seal:meds', stock)).toBeNull();
    expect(cargoConsoleIntent('close', stock)).toBeNull();
  });

  it('sells single crates and all from the sell panel', () => {
    const stock = { hubId: 'hub_a', sellIds: ['c1', 'c2'] };
    expect(marketConsoleIntent('sell:c1', stock)).toEqual({
      type: 'MARKET_SELL',
      seq: 0,
      hubId: 'hub_a',
      crateIds: ['c1'],
    });
    expect(marketConsoleIntent('sellAll', stock)).toEqual({
      type: 'MARKET_SELL',
      seq: 0,
      hubId: 'hub_a',
      crateIds: ['c1', 'c2'],
    });
    expect(marketConsoleIntent('sell:c9', stock)).toBeNull();
    expect(marketConsoleIntent('sellAll', { hubId: 'hub_a', sellIds: [] })).toBeNull();
    expect(marketConsoleIntent('close', stock)).toBeNull();
  });

  it('plots the far hub and passes cancel and distress', () => {
    expect(navConsoleIntent('plot:hub_b', nav)).toEqual({
      type: 'NAV_PLOT',
      seq: 0,
      destHubId: 'hub_b',
      waypointIds: [],
    });
    expect(navConsoleIntent('plot:', nav)).toBeNull();
    expect(navConsoleIntent('via:poi_kestrel', nav)).toEqual({
      type: 'NAV_PLOT',
      seq: 0,
      destHubId: 'poi_kestrel',
      waypointIds: [],
    });
    expect(navConsoleIntent('via:nowhere', nav)).toBeNull();
    expect(navConsoleIntent('via:', nav)).toBeNull();
    expect(navConsoleIntent('cancel', nav)).toBeNull();
    expect(navConsoleIntent('spool', nav)).toBeNull();
    expect(navConsoleIntent('distress', nav)).toEqual({
      type: 'DISTRESS',
      seq: 0,
    });
    expect(navConsoleIntent('hail', nav)).toEqual({ type: 'HAIL', seq: 0 });
    expect(navConsoleIntent('loadFuel', nav)).toEqual({ type: 'ENGINE_FUEL', seq: 0, op: 'load' });
    expect(navConsoleIntent('close', nav)).toBeNull();
    expect(confirmPlotIntent(['poi_kestrel', 'hub_b'])).toEqual({
      type: 'NAV_PLOT',
      seq: 0,
      destHubId: 'hub_b',
      waypointIds: ['poi_kestrel'],
    });
    expect(confirmPlotIntent(['hub_b'])).toEqual({
      type: 'NAV_PLOT',
      seq: 0,
      destHubId: 'hub_b',
      waypointIds: [],
    });
    expect(confirmPlotIntent(['hub_b'], 50)).toEqual({
      type: 'NAV_PLOT',
      seq: 0,
      destHubId: 'hub_b',
      waypointIds: [],
      thrust01: 0.5,
    });
    expect(confirmPlotIntent(['hub_b'], 100)).not.toHaveProperty('thrust01');
    expect(confirmPlotIntent(null)).toBeNull();
    expect(confirmPlotIntent([])).toBeNull();
  });
});

describe('selectSessionOverlayId consoles', () => {
  it('prefers an open console over pause and settings', () => {
    expect(selectSessionOverlayId({ paused: false, dead: false, console: 'reactor_console' })).toBe(
      'reactor_console'
    );
    expect(
      selectSessionOverlayId({
        paused: true,
        dead: false,
        console: 'nav_console',
        settingsOpen: true,
      })
    ).toBe('nav_console');
    expect(selectSessionOverlayId({ paused: true, dead: true, console: 'engine_console' })).toBe(
      'death'
    );
    expect(selectSessionOverlayId({ paused: true, dead: false, console: null })).toBe('pause');
  });
});
describe('splash star field', () => {
  it('scales count with area and caps it', () => {
    expect(splashStarCount(320, 320)).toBe(Math.round((320 * 320) / 9000));
    expect(splashStarCount(1920, 1080)).toBe(220);
    expect(splashStarCount(0, 0)).toBe(splashStarCount(320, 320));
  });

  it('is deterministic, bounded, and drifts with time', () => {
    const a = splashStarField(12, 800, 600, 3);
    const b = splashStarField(12, 800, 600, 3);
    expect(a).toEqual(b);
    expect(a).toHaveLength(12);
    for (const star of a) {
      expect(star.x).toBeGreaterThanOrEqual(0);
      expect(star.x).toBeLessThan(800);
      expect(star.y).toBeGreaterThanOrEqual(0);
      expect(star.y).toBeLessThan(600);
      expect(star.brightness).toBeGreaterThan(0);
      expect(star.brightness).toBeLessThanOrEqual(1);
    }
    const later = splashStarField(12, 800, 600, 4);
    expect(later[0].x).not.toBe(a[0].x);
    expect(later[0].y).toBe(a[0].y);
  });
});
describe('hexToRgb', () => {
  it('parses long, short, and broken hex', () => {
    expect(hexToRgb('#ff8800')).toEqual([1, 136 / 255, 0]);
    expect(hexToRgb('#0f0')).toEqual([0, 1, 0]);
    expect(hexToRgb('neon')).toEqual([1, 1, 1]);
    expect(hexToRgb('#12345')).toEqual([1, 1, 1]);
  });
});
