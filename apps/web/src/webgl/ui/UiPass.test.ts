/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import {
  cargoConsoleIntent,
  engineConsoleIntent,
  findUiButton,
  GL_UI_BLOCKER_ID,
  hexToRgb,
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

  it('opens the audio subscreen while paused', () => {
    expect(selectSessionOverlayId({ paused: true, dead: false, settingsOpen: true })).toBe(
      'settings'
    );
    expect(selectSessionOverlayId({ paused: false, dead: false, settingsOpen: true })).toBeNull();
    expect(selectSessionOverlayId({ paused: true, dead: true, settingsOpen: true })).toBe('death');
  });
});
describe('console intents', () => {
  const systems = { spool: 0.2, tune: 0.5 } as import('@kybernetes/protocol').ShipSystemsBroadcast;
  const nav = { portHubId: 'hub_a' } as import('@kybernetes/protocol').NavStateBroadcast;
  const status = {
    engineTier: 0,
    stores: { fuelCells: 3 },
  } as unknown as import('@kybernetes/protocol').ShipStatusBroadcast;

  it('builds reactor tune steps and restart', () => {
    expect(reactorConsoleIntent('rodsDown')).toEqual({
      type: 'REACTOR_TUNE',
      seq: 0,
      rodsDelta: -0.1,
      coolantDelta: 0,
    });
    expect(reactorConsoleIntent('rodsUp')).toEqual({
      type: 'REACTOR_TUNE',
      seq: 0,
      rodsDelta: 0.1,
      coolantDelta: 0,
    });
    expect(reactorConsoleIntent('coolantDown')).toEqual({
      type: 'REACTOR_TUNE',
      seq: 0,
      rodsDelta: 0,
      coolantDelta: -0.1,
    });
    expect(reactorConsoleIntent('coolantUp')).toEqual({
      type: 'REACTOR_TUNE',
      seq: 0,
      rodsDelta: 0,
      coolantDelta: 0.1,
    });
    expect(reactorConsoleIntent('restart')).toEqual({ type: 'REACTOR_RESTART', seq: 0 });
    expect(reactorConsoleIntent('close')).toBeNull();
    expect(reactorConsoleIntent('bogus')).toBeNull();
  });

  it('toggles spool and clamps tune steps', () => {
    expect(engineConsoleIntent('spool', systems)).toEqual({
      type: 'ENGINE_TUNE',
      seq: 0,
      spoolCmd: 1,
    });
    const hot = { spool: 0.9, tune: 0.5 } as import('@kybernetes/protocol').ShipSystemsBroadcast;
    expect(engineConsoleIntent('spool', hot)).toEqual({ type: 'ENGINE_TUNE', seq: 0, spoolCmd: 0 });
    expect(engineConsoleIntent('tuneUp', systems)).toEqual({
      type: 'ENGINE_TUNE',
      seq: 0,
      spoolCmd: 0,
      tuneSet: 0.6,
    });
    const capped = { spool: 1, tune: 0.95 } as import('@kybernetes/protocol').ShipSystemsBroadcast;
    expect(engineConsoleIntent('tuneUp', capped)).toEqual({
      type: 'ENGINE_TUNE',
      seq: 0,
      spoolCmd: 1,
      tuneSet: 1,
    });
    const floored = { spool: 0, tune: 0.05 } as import('@kybernetes/protocol').ShipSystemsBroadcast;
    expect(engineConsoleIntent('tuneDown', floored)).toEqual({
      type: 'ENGINE_TUNE',
      seq: 0,
      spoolCmd: 0,
      tuneSet: 0,
    });
    expect(engineConsoleIntent('close', systems)).toBeNull();
  });

  it('drops, unpacks, and seals cargo from the hold panel', () => {
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
      goodId: 'scrap',
      qty: 5,
    });
    expect(cargoConsoleIntent('unpackAll', { unpackIds: [], seal: {} })).toBeNull();
    expect(cargoConsoleIntent('seal:meds', stock)).toBeNull();
    expect(cargoConsoleIntent('close', stock)).toBeNull();
  });

  it('plots the far hub and passes cancel and distress', () => {
    expect(navConsoleIntent('plot', nav, systems, status)).toEqual({
      type: 'NAV_PLOT',
      seq: 0,
      destHubId: 'hub_b',
    });
    expect(navConsoleIntent('cancel', nav, systems, status)).toEqual({
      type: 'NAV_CANCEL',
      seq: 0,
    });
    expect(navConsoleIntent('distress', nav, systems, status)).toEqual({
      type: 'DISTRESS',
      seq: 0,
    });
    expect(navConsoleIntent('close', nav, systems, status)).toBeNull();
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
