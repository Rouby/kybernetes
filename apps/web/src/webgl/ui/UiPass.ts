/**
 * UiPass: pure helpers for painting UiScreenLayouts through HudRenderer.
 * No DOM, no WebGL, no React. Hex palette, hit zones, overlay selection,
 * console intents, and the splash star field live here so Vitest covers
 * them without a canvas; the GL calls stay in HudRenderer.
 */

import type { ClientIntent, NavStateBroadcast, ShipSystemsBroadcast } from '@kybernetes/protocol';
import {
  DETOUR_BUTTON_PREFIX,
  navDetourOptions,
  PLOT_BUTTON_PREFIX,
} from '../../harbor/navConsoleModel';
import type { ConsoleKind } from '../../harbor/sessionActions';
import type { UiScreenLayout } from './UiScreens';
import { type UiButton, type UiText, uiContains } from './UiToolkit';

/** Full-screen click eater so modal overlays never leak clicks to fire. */
export const GL_UI_BLOCKER_ID = 'ui_overlay_block';

const UI_TEXT_HEX: Readonly<Record<UiText['color'], string>> = {
  dim: '#008899',
  cyan: '#00e5ff',
  primary: '#e0e8f5',
  muted: '#8a9bb5',
  danger: '#ff2244',
  warning: '#ffd166',
  good: '#7ee787',
};

export function uiTextHex(color: UiText['color']): string {
  return UI_TEXT_HEX[color] ?? '#e0e8f5';
}

export function uiOverlayButtonIds(layout: UiScreenLayout): readonly string[] {
  return layout.buttons.map((button) => button.id);
}

/** Top-most button under a screen-space point (reverse order wins). */
export function findUiButton(layout: UiScreenLayout, x: number, y: number): UiButton | null {
  for (let i = layout.buttons.length - 1; i >= 0; i -= 1) {
    const button = layout.buttons[i];
    if (button !== undefined && uiContains(button.rect, x, y)) return button;
  }
  return null;
}

export type SessionOverlayId = 'death' | 'pause' | 'settings' | 'receipt' | ConsoleKind;

export interface SessionOverlayRequest {
  readonly paused: boolean;
  readonly dead: boolean;
  readonly settingsOpen?: boolean;
  readonly console?: ConsoleKind | null;
  readonly receiptOpen?: boolean;
}

/** Modal priority: death, receipt, pack bench, ship console, audio, pause. */
export function selectSessionOverlayId(request: SessionOverlayRequest): SessionOverlayId | null {
  if (request.dead) return 'death';
  if (request.receiptOpen === true) return 'receipt';
  if (request.console === 'pack') return 'pack';
  if (request.console !== undefined && request.console !== null) return request.console;
  if (request.paused && request.settingsOpen) return 'settings';
  if (request.paused) return 'pause';
  return null;
}
export interface GlAudioState {
  readonly ready: boolean;
  readonly muted: boolean;
  readonly masterPct: number;
}
export type { ConsoleKind };

const REACTOR_STEPS: Record<string, { readonly rodsDelta: number; readonly coolantDelta: number }> =
  {
    rodsDown: { rodsDelta: -0.1, coolantDelta: 0 },
    rodsUp: { rodsDelta: 0.1, coolantDelta: 0 },
    coolantDown: { rodsDelta: 0, coolantDelta: -0.1 },
    coolantUp: { rodsDelta: 0, coolantDelta: 0.1 },
  };

/** Mirror of ReactorConsole tune/restart (ShipConsolePanel). Null = unknown id. */
export function reactorConsoleIntent(id: string): ClientIntent | null {
  if (id === 'restart') return { type: 'REACTOR_RESTART', seq: 0 };
  const step = REACTOR_STEPS[id];
  if (step === undefined) return null;
  return {
    type: 'REACTOR_TUNE',
    seq: 0,
    rodsDelta: step.rodsDelta,
    coolantDelta: step.coolantDelta,
  };
}

/** Mirror of EngineConsole spool/tune (ShipConsolePanel). Null = unknown id. */
export function engineConsoleIntent(
  id: string,
  systems: ShipSystemsBroadcast
): ClientIntent | null {
  if (id === 'spool') return { type: 'ENGINE_TUNE', seq: 0, spoolCmd: systems.spool > 0.5 ? 0 : 1 };
  if (id === 'tuneDown' || id === 'tuneUp') return engineTuneIntent(id, systems);
  if (id === 'loadFuel') return { type: 'ENGINE_FUEL', seq: 0, op: 'load' };
  if (id === 'unloadFuel') return { type: 'ENGINE_FUEL', seq: 0, op: 'unload' };
  return null;
}

function engineTuneIntent(id: string, systems: ShipSystemsBroadcast): ClientIntent {
  const delta = id === 'tuneDown' ? -0.1 : 0.1;
  const tuneSet = Math.min(1, Math.max(0, Math.round((systems.tune + delta) * 10) / 10));
  return { type: 'ENGINE_TUNE', seq: 0, spoolCmd: systems.spool > 0.5 ? 1 : 0, tuneSet };
}

export interface CargoConsoleStock {
  readonly unpackIds: readonly string[];
  readonly seal: Readonly<Record<string, number>>;
}

/** Mirror of the cargo hold panel. Null = unknown id or nothing to seal. */
export function cargoConsoleIntent(id: string, stock: CargoConsoleStock): ClientIntent | null {
  if (id === 'drop') return { type: 'CARGO_DROP', seq: 0 };
  if (id === 'unpackAll') {
    if (stock.unpackIds.length === 0) return null;
    return { type: 'CARGO_UNPACK', seq: 0, crateIds: [...stock.unpackIds] };
  }
  if (id.startsWith('seal:')) {
    const goodId = id.slice('seal:'.length);
    const have = stock.seal[goodId] ?? 0;
    if (goodId.length === 0 || !(have >= 1)) return null;
    return {
      type: 'CARGO_REPACK',
      seq: 0,
      items: [{ goodId, qty: Math.min(10, Math.floor(have)) }],
    };
  }
  return null;
}

export interface MarketConsoleStock {
  readonly hubId: string;
  readonly sellIds: readonly string[];
}

/** Mirror of the sell panel. Null = unknown id or an empty bay. */
export function marketConsoleIntent(id: string, stock: MarketConsoleStock): ClientIntent | null {
  if (id === 'sellAll') {
    if (stock.sellIds.length === 0) return null;
    return { type: 'MARKET_SELL', seq: 0, hubId: stock.hubId, crateIds: [...stock.sellIds] };
  }
  if (id.startsWith('sell:')) {
    const crateId = id.slice('sell:'.length);
    if (crateId.length === 0 || !stock.sellIds.includes(crateId)) return null;
    return { type: 'MARKET_SELL', seq: 0, hubId: stock.hubId, crateIds: [crateId] };
  }
  return null;
}

/** Mirror of NavConsole plot/cancel/distress plus bridge pre-flight. Null = unknown id. */
export function navConsoleIntent(id: string, _nav: NavStateBroadcast | null): ClientIntent | null {
  if (id === 'loadFuel') return { type: 'ENGINE_FUEL', seq: 0, op: 'load' };
  if (id === 'spool') return { type: 'ENGINE_TUNE', seq: 0, spoolCmd: 1 };
  if (id.startsWith(PLOT_BUTTON_PREFIX) || id.startsWith(DETOUR_BUTTON_PREFIX)) {
    return plotIntent(id);
  }
  if (id === 'cancel') return { type: 'NAV_CANCEL', seq: 0 };
  if (id === 'distress') return { type: 'DISTRESS', seq: 0 };
  if (id === 'hail') return { type: 'HAIL', seq: 0 };
  return null;
}

/** Commit a drafted course: last stop is the destination, the rest are waypoints. */
export function confirmPlotIntent(
  selection: readonly string[] | null,
  thrustPct: number | null = null
): ClientIntent | null {
  if (selection === null || selection.length === 0) return null;
  const destHubId = selection[selection.length - 1];
  if (destHubId === undefined) return null;
  return {
    type: 'NAV_PLOT',
    seq: 0,
    destHubId,
    waypointIds: [...selection.slice(0, -1)],
    ...(thrustPct === null || thrustPct >= 100 ? {} : { thrust01: thrustPct / 100 }),
  };
}

function plotIntent(id: string): ClientIntent | null {
  if (id.startsWith(PLOT_BUTTON_PREFIX)) {
    const hubId = id.slice(PLOT_BUTTON_PREFIX.length);
    if (hubId.length === 0) return null;
    return { type: 'NAV_PLOT', seq: 0, destHubId: hubId, waypointIds: [] };
  }
  const poiId = id.slice(DETOUR_BUTTON_PREFIX.length);
  if (!navDetourOptions().includes(poiId)) return null;
  return { type: 'NAV_PLOT', seq: 0, destHubId: poiId, waypointIds: [] };
}
export interface SplashStar {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly brightness: number;
}

/** Menu star count mirrors TerminalCanvas density (area/9000), capped. */
export function splashStarCount(width: number, height: number): number {
  return Math.min(220, Math.round((Math.max(320, width) * Math.max(320, height)) / 9000));
}

function hash01(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Deterministic drift + twinkle field; same inputs paint the same sky. */
export function splashStarField(
  count: number,
  width: number,
  height: number,
  timeSec: number
): SplashStar[] {
  const stars: SplashStar[] = [];
  for (let i = 0; i < count; i += 1) stars.push(splashStar(i, width, height, timeSec));
  return stars;
}

function splashStar(i: number, width: number, height: number, timeSec: number): SplashStar {
  const spanW = Math.max(320, width);
  const spanH = Math.max(320, height);
  const layer = i % 3;
  const speed = 4 + layer * 5;
  const x = (hash01(i * 2 + 1) * spanW + timeSec * speed) % spanW;
  const y = hash01(i * 2 + 2) * spanH;
  const twinkle = 0.55 + 0.45 * Math.sin(timeSec * 2 + hash01(i + 0.5) * 6.28);
  return { x, y, size: layer === 2 ? 2 : 1, brightness: (0.55 + layer * 0.2) * twinkle };
}
/** Parse #rgb/#rrggbb into 0..1 triples; garbage yields white. */
export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.startsWith('#') ? hex.slice(1) : hex;
  const full =
    clean.length === 3 ? clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2] : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return [1, 1, 1];
  return [
    Number.parseInt(full.slice(0, 2), 16) / 255,
    Number.parseInt(full.slice(2, 4), 16) / 255,
    Number.parseInt(full.slice(4, 6), 16) / 255,
  ];
}
