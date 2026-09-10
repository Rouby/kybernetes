/**
 * UiScreens: pure layout for WebGL2 game screens (Phase 2).
 * No DOM, no WebGL, no React. GL passes paint from these rects.
 * Dynamic strings are ellipsized to panel width (AGENTS.md budget).
 * Panels derive from uiVisorMargins/uiCenteredPanel, never fixed y.
 */
import type {
  DeathCause,
  NavStateBroadcast,
  ShipStatusBroadcast,
  ShipSystemsBroadcast,
} from '@kybernetes/protocol';
import { PAWN_TRIMS, THRUSTER_TINTS } from '@kybernetes/protocol';
import { deathHint, deathTitle } from '../../harbor/deathNotice';
import type { MarketScreenModel } from '../../harbor/marketModel';
import { navViewModel } from '../../harbor/navConsoleModel';
import { engineViewModel, reactorViewModel } from '../../harbor/shipConsoleModel';
import {
  GAME_OVER_BODY,
  GAME_OVER_TITLE,
  SOLO_INTRO_STEPS,
  SOLO_INTRO_TITLE,
} from '../../harbor/soloShipCopy';
import {
  layoutTerminalMenu,
  navigateMenu,
  type TerminalLayout,
  type TerminalMenuState,
} from '../../harbor/terminalLayout';
import {
  type UiButton,
  type UiField,
  type UiRect,
  type UiSwatch,
  type UiText,
  uiButtonColumn,
  uiCenteredPanel,
  uiEllipsize,
  uiVisorMargins,
} from './UiToolkit';

export type UiScreenId =
  | 'menu'
  | 'customize'
  | 'intro'
  | 'reactor'
  | 'engine'
  | 'nav'
  | 'cargo'
  | 'market'
  | 'pause'
  | 'death'
  | 'gameover'
  | 'settings';

export interface CargoScreenModel {
  readonly carryingLabel: string;
  readonly floorLabel: string;
  readonly securedLabel: string;
  readonly hint: string;
  readonly canUnpack: boolean;
  readonly handsFull: boolean;
  readonly seal: readonly { readonly goodId: string; readonly qty: number }[];
}

export interface UiScreenLayout {
  readonly panel: UiRect;
  readonly texts: readonly UiText[];
  readonly buttons: readonly UiButton[];
  readonly swatches?: readonly UiSwatch[];
  readonly fields?: readonly UiField[];
}

const PAD = 24;
const GAP = 10;
const BTN_H = 44;
const KICKER_SIZE = 11;
const TITLE_SIZE = 24;
const BODY_SIZE = 13;
const LINE_H = 20;

function centerPanelFor(w: number, h: number, pw: number, ph: number): UiRect {
  const cw = Math.min(pw, Math.max(320, w - 48));
  return uiCenteredPanel(w, h, cw, ph);
}

function visorPanelFor(w: number, h: number, pw: number, ph: number): UiRect {
  const m = uiVisorMargins(w, h);
  const cw = Math.min(pw, Math.max(320, w - m.marginX * 2));
  return { x: Math.round((w - cw) / 2), y: m.topClearance, w: Math.round(cw), h: ph };
}

function textAt(text: string, x: number, y: number, size: number, color: UiText['color']): UiText {
  return { text, x, y, size, color };
}

function columnFor(
  panel: UiRect,
  top: number,
  ids: readonly string[],
  labels: Readonly<Record<string, string>>,
  primaryId?: string
): UiButton[] {
  const innerX = panel.x + PAD;
  const innerW = panel.w - PAD * 2;
  return uiButtonColumn(innerX, top, innerW, ids, labels, BTN_H, GAP, primaryId);
}

function menuPanelFor(layout: TerminalLayout): UiRect {
  const p = layout.panel;
  return { x: p.x, y: p.y, w: p.w, h: p.h };
}

function menuTextsFor(layout: TerminalLayout): readonly UiText[] {
  const all = [layout.kicker, layout.title, ...layout.lines, ...layout.footer];
  return all.map((t) => textAt(t.text, t.x, t.y, t.size, t.color));
}

function menuButtonsFor(layout: TerminalLayout): readonly UiButton[] {
  return layout.buttons.map((b) => ({
    id: b.id,
    label: b.label,
    rect: { x: b.rect.x, y: b.rect.y, w: b.rect.w, h: b.rect.h },
    primary: b.primary,
  }));
}

export function layoutMenuScreen(state: TerminalMenuState): UiScreenLayout {
  const layout = layoutTerminalMenu(state);
  const panel = menuPanelFor(layout);
  return { panel, texts: menuTextsFor(layout), buttons: menuButtonsFor(layout) };
}

function introPanelFor(w: number, h: number): UiRect {
  return centerPanelFor(w, h, 520, 380);
}

function introTextsFor(panel: UiRect, shipId: string): readonly UiText[] {
  const tx = panel.x + PAD;
  const innerW = panel.w - PAD * 2;
  const kick = uiEllipsize(`SOLO COMMISSION // ${shipId}`, KICKER_SIZE, innerW);
  const ky = panel.y + PAD;
  const ty = ky + KICKER_SIZE + 8;
  const sy = ty + TITLE_SIZE + 12;
  const steps = SOLO_INTRO_STEPS.map((s, i) =>
    textAt(
      uiEllipsize(`${s.title}: ${s.body}`, BODY_SIZE, innerW),
      tx,
      sy + i * LINE_H,
      BODY_SIZE,
      'primary'
    )
  );
  return [
    textAt(kick, tx, ky, KICKER_SIZE, 'dim'),
    textAt(SOLO_INTRO_TITLE, tx, ty, TITLE_SIZE, 'cyan'),
    ...steps,
  ];
}

function introButtonsFor(panel: UiRect): readonly UiButton[] {
  const top = panel.y + panel.h - PAD - BTN_H;
  return columnFor(panel, top, ['embark'], { embark: 'EMBARK' }, 'embark');
}

export function layoutIntroScreen(w: number, h: number, shipId: string): UiScreenLayout {
  const panel = introPanelFor(w, h);
  return { panel, texts: introTextsFor(panel, shipId), buttons: introButtonsFor(panel) };
}

function gameOverPanelFor(w: number, h: number): UiRect {
  return centerPanelFor(w, h, 520, 300);
}

function gameOverTextsFor(panel: UiRect, shipId: string): readonly UiText[] {
  const tx = panel.x + PAD;
  const innerW = panel.w - PAD * 2;
  const kick = uiEllipsize(`HULL LOSS // ${shipId}`, KICKER_SIZE, innerW);
  const ky = panel.y + PAD;
  const ty = ky + KICKER_SIZE + 8;
  const by = ty + TITLE_SIZE + 12;
  const body = uiEllipsize(GAME_OVER_BODY, BODY_SIZE, innerW);
  return [
    textAt(kick, tx, ky, KICKER_SIZE, 'dim'),
    textAt(GAME_OVER_TITLE, tx, ty, TITLE_SIZE, 'cyan'),
    textAt(body, tx, by, BODY_SIZE, 'primary'),
  ];
}

function gameOverButtonsFor(panel: UiRect): readonly UiButton[] {
  const top = panel.y + panel.h - PAD - BTN_H;
  const labels = { restart: 'RESTART WITH STARTER SKIFF' };
  return columnFor(panel, top, ['restart'], labels, 'restart');
}

export function layoutGameOverScreen(w: number, h: number, shipId: string): UiScreenLayout {
  const panel = gameOverPanelFor(w, h);
  return { panel, texts: gameOverTextsFor(panel, shipId), buttons: gameOverButtonsFor(panel) };
}

function pausePanelFor(w: number, h: number): UiRect {
  return centerPanelFor(w, h, 400, 374);
}

function pauseTextsFor(panel: UiRect): readonly UiText[] {
  const tx = panel.x + PAD;
  const ky = panel.y + PAD;
  const ty = ky + KICKER_SIZE + 8;
  const sy = ty + TITLE_SIZE + 12;
  return [
    textAt('HOLDING // WORLD LIVE', tx, ky, KICKER_SIZE, 'dim'),
    textAt('PAUSED', tx, ty, TITLE_SIZE, 'cyan'),
    textAt('Input held. The harbor keeps ticking.', tx, sy, BODY_SIZE, 'muted'),
  ];
}

function pauseButtonsFor(panel: UiRect): readonly UiButton[] {
  const top = panel.y + panel.h - PAD - (4 * BTN_H + 3 * GAP);
  const labels = { resume: 'RESUME', restart: 'RESTART RUN', quit: 'QUIT TO MENU', audio: 'AUDIO' };
  return columnFor(panel, top, ['resume', 'restart', 'quit', 'audio'], labels, 'resume');
}

export function layoutPauseScreen(w: number, h: number): UiScreenLayout {
  const panel = pausePanelFor(w, h);
  return { panel, texts: pauseTextsFor(panel), buttons: pauseButtonsFor(panel) };
}

function deathPanelFor(w: number, h: number): UiRect {
  return centerPanelFor(w, h, 520, 300);
}

function deathTextsFor(panel: UiRect, cause: DeathCause | undefined): readonly UiText[] {
  const tx = panel.x + PAD;
  const innerW = panel.w - PAD * 2;
  const title = uiEllipsize(deathTitle(cause), TITLE_SIZE, innerW);
  const hint = uiEllipsize(deathHint(cause), BODY_SIZE, innerW);
  const ky = panel.y + PAD;
  const ty = ky + KICKER_SIZE + 8;
  const hy = ty + TITLE_SIZE + 12;
  return [
    textAt('FLATLINE // AUTHORITATIVE', tx, ky, KICKER_SIZE, 'dim'),
    textAt(title, tx, ty, TITLE_SIZE, 'danger'),
    textAt(hint, tx, hy, BODY_SIZE, 'muted'),
  ];
}

function deathButtonsFor(panel: UiRect): readonly UiButton[] {
  const top = panel.y + panel.h - PAD - (2 * BTN_H + GAP);
  const labels = { restart: 'RESTART RUN', quit: 'QUIT TO MENU' };
  return columnFor(panel, top, ['restart', 'quit'], labels, 'restart');
}

export function layoutDeathScreen(
  w: number,
  h: number,
  cause: DeathCause | undefined
): UiScreenLayout {
  const panel = deathPanelFor(w, h);
  return { panel, texts: deathTextsFor(panel, cause), buttons: deathButtonsFor(panel) };
}

function customizePanelFor(w: number, h: number): UiRect {
  return centerPanelFor(w, h, 560, 480);
}

function customizeFieldFor(panel: UiRect): UiRect {
  return { x: panel.x + PAD, y: panel.y + 98, w: panel.w - PAD * 2, h: 36 };
}

function customizeTextsFor(panel: UiRect, callsign: string): readonly UiText[] {
  const tx = panel.x + PAD;
  const innerW = panel.w - PAD * 2;
  const call = uiEllipsize(`CALLSIGN ${callsign}`, KICKER_SIZE, innerW);
  const ky = panel.y + PAD;
  const ty = ky + KICKER_SIZE + 8;
  const ly = ty + TITLE_SIZE + 12;
  const btnTop = panel.y + panel.h - PAD - (2 * BTN_H + GAP);
  const ry = btnTop - KICKER_SIZE - 12;
  return [
    textAt('HARBOR CONTROL // IDENTITY', tx, ky, KICKER_SIZE, 'dim'),
    textAt('CUSTOMIZE', tx, ty, TITLE_SIZE, 'cyan'),
    textAt(call, tx, ly, KICKER_SIZE, 'muted'),
    textAt('PAWN TINT', tx, panel.y + 146, KICKER_SIZE, 'muted'),
    textAt('HULL TRIM', tx, panel.y + 202, KICKER_SIZE, 'muted'),
    textAt('THRUSTER DRIVE', tx, panel.y + 254, KICKER_SIZE, 'muted'),
    textAt('READY', tx, ry, KICKER_SIZE, 'muted'),
  ];
}

function customizeButtonsFor(panel: UiRect): readonly UiButton[] {
  const top = panel.y + panel.h - PAD - (2 * BTN_H + GAP);
  return columnFor(
    panel,
    top,
    ['back', 'embark'],
    { back: 'BACK', embark: 'SAVE & EMBARK' },
    'embark'
  );
}

export interface CustomizeSelection {
  readonly color: string;
  readonly trim: string;
  readonly thruster: string;
  readonly caret: number;
  readonly focused: boolean;
}

const TINT_PRESETS: readonly string[] = [
  '#ffd166',
  '#00e5ff',
  '#00ff66',
  '#ff2244',
  '#ff8800',
  '#b388ff',
  '#e0e8f5',
  '#ff5da2',
];

export function defaultCustomizeSelection(): CustomizeSelection {
  return {
    color: TINT_PRESETS[0] ?? '#ffd166',
    trim: PAWN_TRIMS[0] ?? 'ember',
    thruster: THRUSTER_TINTS[0] ?? 'cyan',
    caret: 0,
    focused: false,
  };
}

export function layoutCustomizeScreen(
  w: number,
  h: number,
  callsign: string,
  selection: CustomizeSelection = defaultCustomizeSelection()
): UiScreenLayout {
  const panel = customizePanelFor(w, h);
  return {
    panel,
    texts: customizeTextsFor(panel, callsign),
    buttons: customizeButtonsFor(panel),
    swatches: customizeSwatchesFor(panel, selection),
    fields: [customizeFieldEntry(panel, callsign, selection)],
  };
}

function customizeFieldEntry(
  panel: UiRect,
  callsign: string,
  selection: CustomizeSelection
): UiField {
  return {
    id: 'callsign',
    rect: customizeFieldFor(panel),
    value: callsign,
    caret: Math.max(0, Math.min(callsign.length, selection.caret)),
    focused: selection.focused,
  };
}

function customizeSwatchesFor(panel: UiRect, selection: CustomizeSelection): UiSwatch[] {
  return [
    ...tintSwatches(panel, selection.color),
    ...optionSwatches(panel, 'trim', PAWN_TRIMS, selection.trim, 218),
    ...optionSwatches(panel, 'thruster', THRUSTER_TINTS, selection.thruster, 270),
  ];
}

function tintSwatches(panel: UiRect, active: string): UiSwatch[] {
  const tx = panel.x + PAD;
  return TINT_PRESETS.map((color, i) => ({
    id: `tint:${color}`,
    rect: { x: tx + i * 38, y: panel.y + 162, w: 30, h: 30 },
    color,
    selected: color === active,
  }));
}

function optionSwatches(
  panel: UiRect,
  group: 'trim' | 'thruster',
  options: readonly string[],
  active: string,
  rowY: number
): UiSwatch[] {
  const tx = panel.x + PAD;
  return options.map((option, i) => ({
    id: `${group}:${option}`,
    rect: { x: tx + i * 112, y: panel.y + rowY, w: 104, h: 28 },
    color: '#0f141d',
    selected: option === active,
    label: uiEllipsize(option, 11, 92),
  }));
}

export function layoutCustomizeField(w: number, h: number): UiRect {
  return customizeFieldFor(customizePanelFor(w, h));
}

export function customizeOptionCounts(): { colors: number; trims: number; thrusters: number } {
  return { colors: 8, trims: PAWN_TRIMS.length, thrusters: THRUSTER_TINTS.length };
}

function reactorPanelFor(w: number, h: number): UiRect {
  return visorPanelFor(w, h, 440, 480);
}

function reactorTextsFor(panel: UiRect, systems: ShipSystemsBroadcast): readonly UiText[] {
  const vm = reactorViewModel(systems);
  const tx = panel.x + PAD;
  const innerW = panel.w - PAD * 2;
  const kick = uiEllipsize(`REACTOR // ${vm.status.toUpperCase()}`, KICKER_SIZE, innerW);
  const temp = uiEllipsize(`TEMP ${vm.tempK} K`, BODY_SIZE, innerW);
  const band = uiEllipsize(`BAND ${vm.bandLo}-${vm.bandHi}`, BODY_SIZE, innerW);
  const load = uiEllipsize(`OUT ${vm.outputMW} MW / LOAD ${vm.demandMW} MW`, BODY_SIZE, innerW);
  const y0 = panel.y + PAD;
  return [
    textAt(kick, tx, y0, KICKER_SIZE, 'dim'),
    textAt(temp, tx, y0 + KICKER_SIZE + 8, BODY_SIZE, 'primary'),
    textAt(band, tx, y0 + KICKER_SIZE + 8 + LINE_H, BODY_SIZE, 'primary'),
    textAt(load, tx, y0 + KICKER_SIZE + 8 + LINE_H * 2, BODY_SIZE, 'muted'),
  ];
}

function reactorButtonsFor(panel: UiRect, systems: ShipSystemsBroadcast): readonly UiButton[] {
  const vm = reactorViewModel(systems);
  const top = panel.y + panel.h - PAD - (6 * BTN_H + 5 * GAP);
  const labels = {
    rodsDown: 'RODS -',
    rodsUp: 'RODS +',
    coolantDown: 'COOL -',
    coolantUp: 'COOL +',
    restart: vm.restartLabel,
    close: 'CLOSE [E]',
  };
  const ids = ['rodsDown', 'rodsUp', 'coolantDown', 'coolantUp', 'restart', 'close'];
  return columnFor(panel, top, ids, labels, 'restart');
}

export function layoutReactorScreen(
  w: number,
  h: number,
  systems: ShipSystemsBroadcast
): UiScreenLayout {
  const panel = reactorPanelFor(w, h);
  return {
    panel,
    texts: reactorTextsFor(panel, systems),
    buttons: reactorButtonsFor(panel, systems),
  };
}

function enginePanelFor(w: number, h: number): UiRect {
  return visorPanelFor(w, h, 440, 400);
}

function engineTextsFor(panel: UiRect, systems: ShipSystemsBroadcast): readonly UiText[] {
  const vm = engineViewModel(systems);
  const tx = panel.x + PAD;
  const innerW = panel.w - PAD * 2;
  const kick = uiEllipsize(`ENGINE // ${vm.spoolLabel}`, KICKER_SIZE, innerW);
  const y0 = panel.y + PAD;
  const rows = [
    textAt(kick, tx, y0, KICKER_SIZE, 'dim'),
    textAt(`SPOOL ${vm.spoolPct}%`, tx, y0 + KICKER_SIZE + 8, BODY_SIZE, 'primary'),
    textAt(`TUNE ${vm.tunePct}%`, tx, y0 + KICKER_SIZE + 8 + LINE_H, BODY_SIZE, 'primary'),
    textAt(`WEAR ${vm.wearPct}%`, tx, y0 + KICKER_SIZE + 8 + LINE_H * 2, BODY_SIZE, 'muted'),
  ];
  if (vm.brownout)
    rows.push(textAt('BROWNOUT', tx, y0 + KICKER_SIZE + 8 + LINE_H * 3, BODY_SIZE, 'danger'));
  return rows;
}

function engineButtonsFor(panel: UiRect, systems: ShipSystemsBroadcast): readonly UiButton[] {
  const vm = engineViewModel(systems);
  const top = panel.y + panel.h - PAD - (4 * BTN_H + 3 * GAP);
  const labels = { spool: vm.spoolLabel, tuneDown: 'TUNE -', tuneUp: 'TUNE +', close: 'CLOSE [E]' };
  return columnFor(panel, top, ['spool', 'tuneDown', 'tuneUp', 'close'], labels, 'spool');
}

export function layoutEngineScreen(
  w: number,
  h: number,
  systems: ShipSystemsBroadcast
): UiScreenLayout {
  const panel = enginePanelFor(w, h);
  return {
    panel,
    texts: engineTextsFor(panel, systems),
    buttons: engineButtonsFor(panel, systems),
  };
}

function navPanelFor(w: number, h: number): UiRect {
  return visorPanelFor(w, h, 440, 460);
}

function navTextsFor(
  panel: UiRect,
  nav: NavStateBroadcast | null,
  systems: ShipSystemsBroadcast | null,
  status: ShipStatusBroadcast | null
): readonly UiText[] {
  const vm = navViewModel(nav, systems, status);
  const tx = panel.x + PAD;
  const innerW = panel.w - PAD * 2;
  const y0 = panel.y + PAD;
  const port = uiEllipsize(`PORT ${vm.portLabel}`, BODY_SIZE, innerW);
  const dest = uiEllipsize(`DEST ${vm.destLabel}`, BODY_SIZE, innerW);
  const rows = [
    textAt(`NAV // ${vm.phase.toUpperCase()}`, tx, y0, KICKER_SIZE, 'dim'),
    textAt(port, tx, y0 + KICKER_SIZE + 8, BODY_SIZE, 'primary'),
    textAt(dest, tx, y0 + KICKER_SIZE + 8 + LINE_H, BODY_SIZE, 'primary'),
    textAt(`ETA ${vm.etaS}S`, tx, y0 + KICKER_SIZE + 8 + LINE_H * 2, BODY_SIZE, 'muted'),
    textAt(`FUEL ${vm.fuelCells}`, tx, y0 + KICKER_SIZE + 8 + LINE_H * 3, BODY_SIZE, 'muted'),
    textAt(
      `COUNTDOWN ${vm.countdownS}S`,
      tx,
      y0 + KICKER_SIZE + 8 + LINE_H * 4,
      BODY_SIZE,
      'muted'
    ),
  ];
  if (vm.flameout)
    rows.push(textAt('FLAMEOUT', tx, y0 + KICKER_SIZE + 8 + LINE_H * 5, BODY_SIZE, 'danger'));
  return rows;
}

function navButtonsFor(
  panel: UiRect,
  nav: NavStateBroadcast | null,
  systems: ShipSystemsBroadcast | null,
  status: ShipStatusBroadcast | null
): readonly UiButton[] {
  const vm = navViewModel(nav, systems, status);
  const top = panel.y + panel.h - PAD - (4 * BTN_H + 3 * GAP);
  const labels = {
    plot: 'PLOT COURSE',
    cancel: 'CANCEL',
    distress: 'DISTRESS',
    close: 'CLOSE [E]',
  };
  const ids = ['plot', 'cancel', 'distress', 'close'];
  return columnFor(panel, top, ids, labels, vm.canPlot ? 'plot' : undefined);
}

export function layoutNavScreen(
  w: number,
  h: number,
  nav: NavStateBroadcast | null,
  systems: ShipSystemsBroadcast | null,
  status: ShipStatusBroadcast | null
): UiScreenLayout {
  const panel = navPanelFor(w, h);
  const texts = navTextsFor(panel, nav, systems, status);
  return { panel, texts, buttons: navButtonsFor(panel, nav, systems, status) };
}

function cargoPanelFor(w: number, h: number): UiRect {
  return visorPanelFor(w, h, 440, 500);
}

function cargoTextsFor(panel: UiRect, model: CargoScreenModel): readonly UiText[] {
  const tx = panel.x + PAD;
  const innerW = panel.w - PAD * 2;
  const y0 = panel.y + PAD;
  return [
    textAt('CARGO // HOLD', tx, y0, KICKER_SIZE, 'dim'),
    textAt(
      uiEllipsize(model.carryingLabel, BODY_SIZE, innerW),
      tx,
      y0 + KICKER_SIZE + 8,
      BODY_SIZE,
      'primary'
    ),
    textAt(
      uiEllipsize(model.floorLabel, BODY_SIZE, innerW),
      tx,
      y0 + KICKER_SIZE + 8 + LINE_H,
      BODY_SIZE,
      'primary'
    ),
    textAt(
      uiEllipsize(model.securedLabel, BODY_SIZE, innerW),
      tx,
      y0 + KICKER_SIZE + 8 + LINE_H * 2,
      BODY_SIZE,
      'muted'
    ),
    textAt(
      uiEllipsize(model.hint, BODY_SIZE, innerW),
      tx,
      y0 + KICKER_SIZE + 8 + LINE_H * 3,
      BODY_SIZE,
      'muted'
    ),
  ];
}

function cargoButtonsFor(panel: UiRect, model: CargoScreenModel): readonly UiButton[] {
  const ids = ['unpackAll', 'drop', ...model.seal.map((line) => `seal:${line.goodId}`), 'close'];
  const labels: Record<string, string> = {
    unpackAll: 'UNPACK FLOOR',
    drop: 'SET DOWN [G]',
    close: 'CLOSE [C]',
  };
  for (const line of model.seal)
    labels[`seal:${line.goodId}`] = `SEAL ${line.goodId.toUpperCase()} x${line.qty}`;
  const top = panel.y + panel.h - PAD - (ids.length * BTN_H + (ids.length - 1) * GAP);
  return columnFor(panel, top, ids, labels, model.canUnpack ? 'unpackAll' : undefined);
}

export function layoutCargoScreen(w: number, h: number, model: CargoScreenModel): UiScreenLayout {
  const panel = cargoPanelFor(w, h);
  return { panel, texts: cargoTextsFor(panel, model), buttons: cargoButtonsFor(panel, model) };
}

function marketPanelFor(w: number, h: number): UiRect {
  return visorPanelFor(w, h, 440, 620);
}

function marketTextsFor(panel: UiRect, model: MarketScreenModel): readonly UiText[] {
  const tx = panel.x + PAD;
  const innerW = panel.w - PAD * 2;
  const y0 = panel.y + PAD;
  const rows = [
    textAt(`MARKET // ${model.hubLabel}`, tx, y0, KICKER_SIZE, 'dim'),
    textAt(
      uiEllipsize(model.creditsLabel, BODY_SIZE, innerW),
      tx,
      y0 + KICKER_SIZE + 8,
      BODY_SIZE,
      'primary'
    ),
    ...pairListingLines(model.listingLines).map((line, index) =>
      textAt(
        uiEllipsize(line, BODY_SIZE, innerW),
        tx,
        y0 + KICKER_SIZE + 8 + LINE_H * (index + 1),
        BODY_SIZE,
        'muted'
      )
    ),
  ];
  const hintY = y0 + KICKER_SIZE + 8 + LINE_H * (pairListingLines(model.listingLines).length + 1);
  rows.push(textAt(uiEllipsize(model.hint, BODY_SIZE, innerW), tx, hintY, BODY_SIZE, 'muted'));
  return rows;
}

function pairListingLines(lines: readonly string[]): string[] {
  const paired: string[] = [];
  for (let i = 0; i < lines.length; i += 2) {
    const second = lines[i + 1];
    paired.push(second === undefined ? (lines[i] ?? '') : `${lines[i]}   ${second}`);
  }
  return paired;
}

function marketButtonsFor(panel: UiRect, model: MarketScreenModel): readonly UiButton[] {
  const ids = [...model.buys.map((row) => row.buttonId)];
  const labels: Record<string, string> = {};
  for (const row of model.buys) labels[row.buttonId] = row.label;
  if (model.hasSell) {
    ids.push('sellAll');
    labels['sellAll'] = model.sellLabel;
  }
  ids.push('close');
  labels['close'] = 'CLOSE [E]';
  const top = panel.y + panel.h - PAD - (ids.length * BTN_H + (ids.length - 1) * GAP);
  return columnFor(panel, top, ids, labels, model.buys[0]?.buttonId);
}

export function layoutMarketScreen(w: number, h: number, model: MarketScreenModel): UiScreenLayout {
  const panel = marketPanelFor(w, h);
  return { panel, texts: marketTextsFor(panel, model), buttons: marketButtonsFor(panel, model) };
}

function settingsPanelFor(w: number, h: number): UiRect {
  return centerPanelFor(w, h, 400, 320);
}

function settingsTextsFor(panel: UiRect, masterPct: number): readonly UiText[] {
  const tx = panel.x + PAD;
  const ky = panel.y + PAD;
  const ty = ky + KICKER_SIZE + 8;
  const vy = ty + TITLE_SIZE + 12;
  return [
    textAt('HARBOR CONTROL // AUDIO', tx, ky, KICKER_SIZE, 'dim'),
    textAt('SHIP AUDIO', tx, ty, TITLE_SIZE, 'cyan'),
    textAt(`VOL ${masterPct}%`, tx, vy, BODY_SIZE, 'primary'),
  ];
}

function settingsButtonsFor(
  panel: UiRect,
  masterPct: number,
  muted: boolean,
  audioReady: boolean
): readonly UiButton[] {
  if (!audioReady) {
    const top = panel.y + panel.h - PAD - (2 * BTN_H + GAP);
    return columnFor(
      panel,
      top,
      ['enable', 'close'],
      { enable: 'ENABLE AUDIO', close: 'CLOSE' },
      'enable'
    );
  }
  const muteLabel = muted ? 'MUTED' : `VOL ${masterPct}%`;
  const top = panel.y + panel.h - PAD - (4 * BTN_H + 3 * GAP);
  const labels = { voldn: 'VOL -', volup: 'VOL +', mute: muteLabel, close: 'CLOSE' };
  return columnFor(panel, top, ['voldn', 'volup', 'mute', 'close'], labels, undefined);
}

export function layoutSettingsScreen(
  w: number,
  h: number,
  masterPct: number,
  muted: boolean,
  audioReady: boolean
): UiScreenLayout {
  const panel = settingsPanelFor(w, h);
  const texts = settingsTextsFor(panel, masterPct);
  return { panel, texts, buttons: settingsButtonsFor(panel, masterPct, muted, audioReady) };
}

export function navigateUi(current: number, key: string, count: number): number {
  return navigateMenu(current, key, count);
}

const UI_BUTTON_IDS: Record<UiScreenId, readonly string[]> = {
  menu: ['embark', 'customize', 'voldn', 'volup', 'mute'],
  customize: ['back', 'embark'],
  intro: ['embark'],
  reactor: ['rodsDown', 'rodsUp', 'coolantDown', 'coolantUp', 'restart', 'close'],
  engine: ['spool', 'tuneDown', 'tuneUp', 'close'],
  nav: ['plot', 'cancel', 'distress', 'close'],
  cargo: ['unpackAll', 'drop', 'close'],
  market: ['sellAll', 'close'],
  pause: ['resume', 'restart', 'quit', 'audio'],
  death: ['restart', 'quit'],
  gameover: ['restart'],
  settings: ['voldn', 'volup', 'mute', 'close'],
};

export function uiScreenButtonIds(screen: UiScreenId): readonly string[] {
  return UI_BUTTON_IDS[screen];
}
