/**
 * UiScreens: pure layout for WebGL2 game screens (Phase 2).
 * No DOM, no WebGL, no React. GL passes paint from these rects.
 * Dynamic strings are ellipsized to panel width (AGENTS.md budget).
 * Panels derive from uiVisorMargins/uiCenteredPanel, never fixed y.
 */
import type {
  ChartStateBroadcast,
  DeathCause,
  NavStateBroadcast,
  ShipStatusBroadcast,
  ShipSystemsBroadcast,
} from '@kybernetes/protocol';
import { PAWN_TRIMS, THRUSTER_TINTS } from '@kybernetes/protocol';
import { FIXED_DT } from '@kybernetes/sim-core';
import {
  type ChartMapView,
  type ChartPreview,
  type ClockInput,
  chartMapView,
  type FlightSnapshot,
  previewCourse,
  type SmoothClock,
} from '../../harbor/chartModel';
import { deathHint, deathTitle } from '../../harbor/deathNotice';
import {
  type MarketScreenModel,
  type MarketTableCell,
  type SellScreenModel,
  type TradeReceiptModel,
  wrapRumor,
} from '../../harbor/marketModel';
import {
  formatFuel,
  hubLabel,
  type NavViewModel,
  navViewModel,
} from '../../harbor/navConsoleModel';
import { type AboardGood, cargoDemandFor } from '../../harbor/navTradeHints';
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
  packLayoutFor,
  type UiButton,
  type UiField,
  type UiRect,
  type UiSwatch,
  type UiText,
  uiButtonColumn,
  uiCenteredPanel,
  uiCharWidth,
  uiEllipsize,
  uiSplitRow,
  uiTextWidth,
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
  | 'sell'
  | 'pack'
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
  /** Optional second card (nav pre-flight checklist); painted with panel styling. */
  readonly sidePanel?: UiRect;
  readonly texts: readonly UiText[];
  readonly buttons: readonly UiButton[];
  readonly swatches?: readonly UiSwatch[];
  readonly fields?: readonly UiField[];
  /** Skip the fullscreen dim: the screen paints its own backdrop (star chart). */
  readonly bare?: boolean;
  /** Departure snapshot for the live leg; nav screen only. */
  readonly liveLeg?: FlightSnapshot | null;
  /** Smoothing state for broadcast clocks; nav screen only. */
  readonly clock?: SmoothClock | null;
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
    textAt(
      uiEllipsize(vm.fuelLabel, BODY_SIZE, innerW),
      tx,
      y0 + KICKER_SIZE + 8 + LINE_H * 3,
      BODY_SIZE,
      'primary'
    ),
  ];
  if (vm.brownout)
    rows.push(textAt('BROWNOUT', tx, y0 + KICKER_SIZE + 8 + LINE_H * 3, BODY_SIZE, 'danger'));
  return rows;
}

function engineButtonsFor(panel: UiRect, systems: ShipSystemsBroadcast): readonly UiButton[] {
  const vm = engineViewModel(systems);
  const top = panel.y + panel.h - PAD - (6 * BTN_H + 5 * GAP);
  const labels = {
    spool: vm.spoolLabel,
    tuneDown: 'TUNE -',
    tuneUp: 'TUNE +',
    loadFuel: 'LOAD CELL',
    unloadFuel: 'UNLOAD',
    close: 'CLOSE [E]',
  };
  return columnFor(
    panel,
    top,
    ['spool', 'tuneDown', 'tuneUp', 'loadFuel', 'unloadFuel', 'close'],
    labels,
    'spool'
  );
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

function navTextsFor(
  panel: UiRect,
  nav: NavStateBroadcast | null,
  systems: ShipSystemsBroadcast | null,
  status: ShipStatusBroadcast | null,
  chart?: ChartStateBroadcast | null,
  transfer?: { label: string } | null,
  course?: ChartPreview | null,
  aboard?: readonly AboardGood[] | null
): readonly UiText[] {
  const vm = navViewModel(nav, systems, status, chart);
  const tx = panel.x + PAD;
  const innerW = panel.w - PAD * 2;
  const y0 = panel.y + PAD;
  const port = uiEllipsize(`PORT ${vm.portLabel}`, BODY_SIZE, innerW);
  const dest = uiEllipsize(`DEST ${vm.destLabel}`, BODY_SIZE, innerW);
  const rows = [
    textAt(`NAV // ${vm.phase.toUpperCase()}`, tx, y0, KICKER_SIZE, 'dim'),
    textAt(port, tx, y0 + KICKER_SIZE + 8, BODY_SIZE, 'primary'),
    textAt(dest, tx, y0 + KICKER_SIZE + 8 + LINE_H, BODY_SIZE, 'primary'),
  ];
  let line = 2;
  if (vm.hopProgress !== null) {
    rows.push(
      textAt(
        uiEllipsize(`HOP ${vm.hopLabel} ${vm.hopProgress}`, BODY_SIZE, innerW),
        tx,
        y0 + KICKER_SIZE + 8 + LINE_H * line,
        BODY_SIZE,
        'cyan'
      )
    );
    line += 1;
  }
  rows.push(
    textAt(`ETA ${vm.etaS}S`, tx, y0 + KICKER_SIZE + 8 + LINE_H * line, BODY_SIZE, 'muted')
  );
  line += 1;
  rows.push(
    textAt(
      `FUEL ${formatFuel(vm.fuel)} CELLS ${vm.fuelCells}`,
      tx,
      y0 + KICKER_SIZE + 8 + LINE_H * line,
      BODY_SIZE,
      'muted'
    )
  );
  line += 1;
  rows.push(
    textAt(
      `COUNTDOWN ${vm.countdownS}S`,
      tx,
      y0 + KICKER_SIZE + 8 + LINE_H * line,
      BODY_SIZE,
      'muted'
    )
  );
  line += 1;
  const preview = course ?? null;
  line = pushManifestRows(rows, vm, tx, y0, innerW, line);
  line = pushTransferRow(rows, transfer ?? null, tx, y0, innerW, line);
  line = pushPreviewRows(rows, preview, tx, y0, innerW, line);
  line = pushCargoDemandRows(rows, preview, aboard, tx, y0, innerW, line);
  const alerts: string[] = [];
  if (vm.fuelWarning !== null) alerts.push(uiEllipsize(vm.fuelWarning, BODY_SIZE, innerW));
  if (vm.heatWarning !== null) alerts.push(uiEllipsize(vm.heatWarning, BODY_SIZE, innerW));
  alerts.forEach((alert, index) => {
    rows.push(
      textAt(alert, tx, y0 + KICKER_SIZE + 8 + LINE_H * (line + index), BODY_SIZE, 'warning')
    );
  });
  if (vm.flameout)
    rows.push(
      textAt(
        'FLAMEOUT',
        tx,
        y0 + KICKER_SIZE + 8 + LINE_H * (line + alerts.length),
        BODY_SIZE,
        'danger'
      )
    );
  if (vm.rescueS > 0)
    rows.push(
      textAt(
        `DRONE IN ${vm.rescueS}S`,
        tx,
        y0 + KICKER_SIZE + 8 + LINE_H * (line + alerts.length + (vm.flameout ? 1 : 0)),
        BODY_SIZE,
        'cyan'
      )
    );
  return rows;
}

/** Torch-drive plan readout for the live leg (AGENTS.md text budget). */
function pushTransferRow(
  rows: UiText[],
  transfer: { label: string } | null,
  tx: number,
  y0: number,
  innerW: number,
  line: number
): number {
  if (transfer === null) return line;
  rows.push(
    textAt(
      uiEllipsize(transfer.label, BODY_SIZE, innerW),
      tx,
      y0 + KICKER_SIZE + 8 + LINE_H * line,
      BODY_SIZE,
      'cyan'
    )
  );
  return line + 1;
}

/** Drafted-course preview block: route, time, and fuel before commit. */
const PREVIEW_FONT = 14;

/** Drafted-course decision block: kicker plus enlarged route and cost rows. */
function pushPreviewRows(
  rows: UiText[],
  course: ChartPreview | null,
  tx: number,
  y0: number,
  innerW: number,
  line: number
): number {
  if (course === null) return line;
  rows.push(textAt('COURSE //', tx, y0 + KICKER_SIZE + 8 + LINE_H * line, KICKER_SIZE, 'dim'));
  const route = `PLAN ${course.routeLabel}`;
  rows.push(
    textAt(
      uiEllipsize(route, PREVIEW_FONT, innerW),
      tx,
      y0 + KICKER_SIZE + 8 + LINE_H * (line + 1),
      PREVIEW_FONT,
      'cyan'
    )
  );
  const thrust = `THRUST ${course.thrustPct}%`;
  rows.push(
    textAt(
      uiEllipsize(thrust, BODY_SIZE, innerW),
      tx,
      y0 + KICKER_SIZE + 8 + LINE_H * (line + 2),
      BODY_SIZE,
      'muted'
    )
  );
  const fuel = `TIME ${course.totalS}S FUEL ${formatFuel(course.fuelNeeded)}/${formatFuel(course.fuelCells)}`;
  rows.push(
    textAt(
      uiEllipsize(fuel, PREVIEW_FONT, innerW),
      tx,
      y0 + KICKER_SIZE + 8 + LINE_H * (line + 3),
      PREVIEW_FONT,
      course.fuelCells < course.fuelNeeded ? 'warning' : 'primary'
    )
  );
  rows.push(previewFoodText(course, tx, y0, innerW, line + 4));
  rows.push(previewStoresText(course, tx, y0, innerW, line + 5));
  return line + 6;
}

const PREVIEW_COST_FONT = 12;

function previewFoodText(
  course: ChartPreview,
  tx: number,
  y0: number,
  innerW: number,
  line: number
): UiText {
  const legs = course.stops.length;
  return textAt(
    uiEllipsize(`TRIP COST -${legs} RATION -${legs} WATER -${legs} O2`, PREVIEW_COST_FONT, innerW),
    tx,
    y0 + KICKER_SIZE + 8 + LINE_H * line,
    PREVIEW_COST_FONT,
    'muted'
  );
}

function previewStoresText(
  course: ChartPreview,
  tx: number,
  y0: number,
  innerW: number,
  line: number
): UiText {
  if (course.lowStoresWarning !== null) {
    return textAt(
      uiEllipsize(course.lowStoresWarning, PREVIEW_COST_FONT, innerW),
      tx,
      y0 + KICKER_SIZE + 8 + LINE_H * line,
      PREVIEW_COST_FONT,
      'warning'
    );
  }
  const left = course.projectedStores;
  return textAt(
    uiEllipsize(
      `LEFT ${left.rations} RATION ${left.waterL} WATER ${left.o2Cells} O2`,
      PREVIEW_COST_FONT,
      innerW
    ),
    tx,
    y0 + KICKER_SIZE + 8 + LINE_H * line,
    PREVIEW_COST_FONT,
    'muted'
  );
}

const DEMAND_FONT = 12;
const MAX_DEMAND_ROWS = 4;

/** Target-port liquidation table for goods aboard (AGENTS.md text budget). */
function pushCargoDemandRows(
  rows: UiText[],
  course: ChartPreview | null,
  aboard: readonly AboardGood[] | null | undefined,
  tx: number,
  y0: number,
  innerW: number,
  line: number
): number {
  const target = course?.stops[course.stops.length - 1];
  if (course === null || target === undefined) return line;
  rows.push(
    textAt(
      uiEllipsize(`CARGO @ ${hubLabel(target)}`, KICKER_SIZE, innerW),
      tx,
      y0 + KICKER_SIZE + 8 + LINE_H * line,
      KICKER_SIZE,
      'dim'
    )
  );
  const demand = cargoDemandFor(target, aboard ?? []);
  if (demand.length === 0) {
    rows.push(demandEmptyText(tx, y0, innerW, line + 1));
    return line + 2;
  }
  demand.slice(0, MAX_DEMAND_ROWS).forEach((row, index) => {
    rows.push(demandRowText(row, tx, y0, innerW, line + 1 + index));
  });
  return line + 1 + Math.min(demand.length, MAX_DEMAND_ROWS);
}

function demandEmptyText(tx: number, y0: number, innerW: number, line: number): UiText {
  return textAt(
    uiEllipsize('CARGO: None aboard', DEMAND_FONT, innerW),
    tx,
    y0 + KICKER_SIZE + 8 + LINE_H * line,
    DEMAND_FONT,
    'muted'
  );
}

function demandRowText(
  row: { goodId: string; qty: number; unitPrice: number; total: number },
  tx: number,
  y0: number,
  innerW: number,
  line: number
): UiText {
  return textAt(
    uiEllipsize(`${row.goodId} x${row.qty} ${row.unitPrice}cr ${row.total}cr`, DEMAND_FONT, innerW),
    tx,
    y0 + KICKER_SIZE + 8 + LINE_H * line,
    DEMAND_FONT,
    'good'
  );
}

/** Clickable map-node chips plus the legend action column. */
function navButtonsFor(
  map: ChartMapView,
  legend: UiRect,
  vm: NavViewModel,
  course: ChartPreview | null
): readonly UiButton[] {
  return [...nodeButtons(map), ...legendActionButtons(legend, vm, course)];
}

function nodeButtons(map: ChartMapView): UiButton[] {
  const buttons: UiButton[] = [];
  for (const node of map.nodes) {
    if (node.buttonId === null) continue;
    buttons.push({ id: node.buttonId, label: node.label, rect: node.chip, primary: node.primary });
  }
  return buttons;
}

function legendActionButtons(
  legend: UiRect,
  vm: NavViewModel,
  course: ChartPreview | null
): readonly UiButton[] {
  if (vm.phase === 'docked' && course !== null) {
    return draftActionButtons(legend);
  }
  if (vm.canHail) {
    const labels = { hail: 'HAIL RESCUE', distress: 'DISTRESS', close: 'CLOSE [E]' };
    return legendColumn(legend, ['hail', 'distress', 'close'], labels, 'hail');
  }
  if (vm.phase === 'spooling') {
    return legendColumn(
      legend,
      ['cancel', 'close'],
      { cancel: 'CANCEL', close: 'CLOSE [E]' },
      undefined
    );
  }
  if (vm.phase === 'in_transit' || vm.phase === 'docking') {
    return legendColumn(
      legend,
      ['distress', 'close'],
      { distress: 'DISTRESS', close: 'CLOSE [E]' },
      undefined
    );
  }
  return legendColumn(legend, ['close'], { close: 'CLOSE [E]' }, undefined);
}

const STEP_H = 34;
const DRAFT_LABELS = { confirm: 'CONFIRM', clear: 'CLEAR', close: 'CLOSE [E]' };
const PREFLIGHT_LABELS = { loadFuel: 'LOAD FUEL', spool: 'SPOOL' };

function preflightButtonIds(vm: NavViewModel): string[] {
  const ids: string[] = [];
  if (vm.canLoadFuelFromBridge) ids.push('loadFuel');
  if (vm.canSpoolFromBridge) ids.push('spool');
  return ids;
}

/** Draft controls: confirm, thrust stepper, clear, close stacked from the bottom. */
function draftActionButtons(legend: UiRect): readonly UiButton[] {
  const bottom = legend.y + legend.h - PAD;
  const closeTop = bottom - BTN_H;
  const clearTop = closeTop - GAP - BTN_H;
  const stepTop = clearTop - GAP - STEP_H;
  const confirmTop = stepTop - GAP - BTN_H;
  return [
    ...columnFor(legend, confirmTop, ['confirm'], DRAFT_LABELS, 'confirm'),
    ...stepperRow(legend, stepTop),
    ...columnFor(legend, clearTop, ['clear', 'close'], DRAFT_LABELS, undefined),
  ];
}

function stepperRow(legend: UiRect, top: number): readonly UiButton[] {
  const innerX = legend.x + PAD;
  const innerW = legend.w - PAD * 2;
  const halfW = Math.floor((innerW - GAP) / 2);
  const button = (id: string, label: string, x: number): UiButton => ({
    id,
    label,
    rect: { x, y: Math.round(top), w: halfW, h: STEP_H },
    primary: false,
  });
  return [
    button('thrustDown', 'THRUST -', innerX),
    button('thrustUp', 'THRUST +', innerX + halfW + GAP),
  ];
}

function legendColumn(
  legend: UiRect,
  ids: readonly string[],
  labels: Readonly<Record<string, string>>,
  primaryId: string | undefined
): readonly UiButton[] {
  const top = legend.y + legend.h - PAD - (ids.length * BTN_H + (ids.length - 1) * GAP);
  return columnFor(legend, top, ids, labels, primaryId);
}

const NODE_LABEL_FONT = 14;

/** Centered labels for nodes without actions (port hub, underway markers). */
function nodeLabelTexts(map: ChartMapView): UiText[] {
  const texts: UiText[] = [];
  for (const node of map.nodes) {
    if (node.buttonId !== null) continue;
    const charW = uiCharWidth(NODE_LABEL_FONT);
    const padX = Math.max(4, Math.floor((node.chip.w - node.label.length * charW) / 2));
    const padY = Math.max(1, Math.floor((node.chip.h - NODE_LABEL_FONT) / 2) - 1);
    texts.push(
      textAt(
        node.label,
        node.chip.x + padX,
        node.chip.y + padY,
        NODE_LABEL_FONT,
        node.status === 'port' ? 'primary' : 'muted'
      )
    );
  }
  return texts;
}

export function layoutNavScreen(
  w: number,
  h: number,
  nav: NavStateBroadcast | null,
  systems: ShipSystemsBroadcast | null,
  status: ShipStatusBroadcast | null,
  chart?: ChartStateBroadcast | null,
  timeSec = 0,
  preview?: readonly string[] | null,
  thrustPct = 100,
  snapPrev?: FlightSnapshot | null,
  clockIn?: ClockInput | null,
  aboard?: readonly AboardGood[] | null
): UiScreenLayout {
  const draft = preview ?? null;
  const simSeconds = nav?.tick === undefined ? timeSec : nav.tick * FIXED_DT;
  const map = chartMapView(
    nav,
    chart ?? null,
    status,
    w,
    h,
    simSeconds,
    draft,
    thrustPct / 100,
    snapPrev ?? null,
    clockIn ?? null
  );
  const legend = map.legend;
  const vm = navViewModel(nav, systems, status, chart ?? null);
  const course = previewCourse(
    draft,
    nav,
    status,
    systems,
    chart ?? null,
    thrustPct / 100,
    simSeconds
  );
  const pre = preflightPanel(w, h, vm);
  const texts = [
    ...(pre?.texts ?? []),
    ...navTextsFor(legend, nav, systems, status, chart, map.transfer, course, aboard ?? null),
    ...nodeLabelTexts(map),
  ];
  return {
    panel: legend,
    ...(pre === null ? {} : { sidePanel: pre.panel }),
    texts,
    buttons: [...(pre?.buttons ?? []), ...navButtonsFor(map, legend, vm, course)],
    bare: true,
    liveLeg: map.liveLeg,
    clock: map.clock,
  };
}

const PREFLIGHT_PANEL_W = 240;
/** Roomier rhythm for the small card so rows and actions breathe. */
const PREFLIGHT_LINE_H = 24;
const PREFLIGHT_GAP = 16;

/** Dedicated top-left pre-flight card; null unless docked. */
function preflightPanel(
  w: number,
  h: number,
  vm: NavViewModel
): { panel: UiRect; texts: readonly UiText[]; buttons: readonly UiButton[] } | null {
  if (vm.phase !== 'docked') return null;
  const ids = preflightButtonIds(vm);
  const panel = preflightPanelFor(w, h, ids.length);
  return {
    panel,
    texts: preflightPanelTexts(panel, vm),
    buttons: preflightPanelButtons(panel, ids),
  };
}

function preflightPanelFor(w: number, h: number, buttons: number): UiRect {
  const m = uiVisorMargins(w, h);
  const btnH = buttons > 0 ? PREFLIGHT_GAP + buttons * BTN_H + (buttons - 1) * GAP : 0;
  return {
    x: m.marginX,
    y: m.topClearance,
    w: Math.max(200, Math.min(PREFLIGHT_PANEL_W, w - m.marginX * 2)),
    h: PAD + KICKER_SIZE + 8 + 3 * PREFLIGHT_LINE_H + btnH + PAD,
  };
}

function preflightPanelTexts(panel: UiRect, vm: NavViewModel): UiText[] {
  const rows: UiText[] = [];
  pushPreflightRows(rows, vm, panel.x + PAD, panel.y + PAD, panel.w - PAD * 2, 0);
  return rows;
}

function preflightPanelButtons(panel: UiRect, ids: readonly string[]): readonly UiButton[] {
  if (ids.length === 0) return [];
  const top = panel.y + panel.h - PAD - (ids.length * BTN_H + (ids.length - 1) * GAP);
  return columnFor(panel, top, ids, PREFLIGHT_LABELS, undefined);
}

/** Docked pre-flight readiness block (AGENTS.md text budget). Returns the next line. */
function pushPreflightRows(
  rows: UiText[],
  vm: NavViewModel,
  tx: number,
  y0: number,
  innerW: number,
  line: number
): number {
  if (vm.phase !== 'docked') return line;
  rows.push(
    textAt('PRE-FLIGHT //', tx, y0 + KICKER_SIZE + 8 + PREFLIGHT_LINE_H * line, KICKER_SIZE, 'dim')
  );
  rows.push(preflightReactorText(vm, tx, y0, innerW, line + 1));
  rows.push(preflightBunkerText(vm, tx, y0, innerW, line + 2));
  rows.push(preflightEngineText(vm, tx, y0, innerW, line + 3));
  return line + 4;
}

function preflightReactorText(
  vm: NavViewModel,
  tx: number,
  y0: number,
  innerW: number,
  line: number
): UiText {
  const text = vm.reactorOnline ? '[✓] REACTOR: ONLINE' : '[!] REACTOR: OFFLINE';
  return textAt(
    uiEllipsize(text, BODY_SIZE, innerW),
    tx,
    y0 + KICKER_SIZE + 8 + PREFLIGHT_LINE_H * line,
    BODY_SIZE,
    vm.reactorOnline ? 'good' : 'danger'
  );
}

function preflightBunkerText(
  vm: NavViewModel,
  tx: number,
  y0: number,
  innerW: number,
  line: number
): UiText {
  const ready = vm.bunkerFuel >= vm.bunkerFuelNeeded;
  return textAt(
    uiEllipsize(
      `BUNKER: ${formatFuel(vm.bunkerFuel)}/${formatFuel(vm.bunkerFuelNeeded)}`,
      BODY_SIZE,
      innerW
    ),
    tx,
    y0 + KICKER_SIZE + 8 + PREFLIGHT_LINE_H * line,
    BODY_SIZE,
    ready ? 'primary' : 'warning'
  );
}

function preflightEngineText(
  vm: NavViewModel,
  tx: number,
  y0: number,
  innerW: number,
  line: number
): UiText {
  const text = vm.engineSpooled ? 'ENGINE: SPOOLED' : 'ENGINE: IDLE';
  return textAt(
    uiEllipsize(text, BODY_SIZE, innerW),
    tx,
    y0 + KICKER_SIZE + 8 + PREFLIGHT_LINE_H * line,
    BODY_SIZE,
    vm.engineSpooled ? 'good' : 'muted'
  );
}

/** Docked manifest + chain lane rows (AGENTS.md text budget). Returns the next line. */
function pushManifestRows(
  rows: UiText[],
  vm: NavViewModel,
  tx: number,
  y0: number,
  innerW: number,
  line: number
): number {
  let next = line;
  if (vm.chartRow !== null) {
    rows.push(
      textAt(
        uiEllipsize(vm.chartRow, BODY_SIZE, innerW),
        tx,
        y0 + KICKER_SIZE + 8 + LINE_H * next,
        BODY_SIZE,
        'muted'
      )
    );
    next += 1;
  }
  if (vm.laneRow !== null) {
    rows.push(
      textAt(
        uiEllipsize(vm.laneRow, BODY_SIZE, innerW),
        tx,
        y0 + KICKER_SIZE + 8 + LINE_H * next,
        BODY_SIZE,
        'cyan'
      )
    );
    next += 1;
  }
  return next;
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
  const ids = [
    'unpackAll',
    'drop',
    'packHold',
    ...model.seal.map((line) => `seal:${line.goodId}`),
    'close',
  ];
  const labels: Record<string, string> = {
    unpackAll: 'UNPACK FLOOR',
    drop: 'SET DOWN [G]',
    packHold: 'PACK HOLD',
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
  const colW = innerW / 2;
  const tableTop = y0 + KICKER_SIZE + 8 + LINE_H + 4;
  const rows: UiText[] = [
    textAt(`MARKET // ${model.hubLabel}`, tx, y0, KICKER_SIZE, 'dim'),
    textAt(
      uiEllipsize(model.creditsLabel, BODY_SIZE, innerW),
      tx,
      y0 + KICKER_SIZE + 8,
      BODY_SIZE,
      'primary'
    ),
  ];
  const columns = [model.left, model.right];
  for (let col = 0; col < columns.length; col += 1) {
    const cells = columns[col] ?? [];
    const cx = tx + col * colW;
    rows.push(...marketTableHeader(cx, colW, tableTop));
    for (let row = 0; row < cells.length; row += 1) {
      const cell = cells[row];
      if (cell === undefined) continue;
      rows.push(...marketTableRow(cx, colW, tableTop + LINE_H * (row + 1), cell));
    }
  }
  rows.push(...marketRumorTexts(panel, model, rumorTopFor(model)));
  return rows;
}

const RUMOR_SIZE = 12;
const MAX_RUMOR_LINES = 6;

function rumorTopFor(model: MarketScreenModel): number {
  const rows = Math.max(model.left.length, model.right.length);
  const tableTop = KICKER_SIZE + 8 + LINE_H + 4;
  return PAD + tableTop + LINE_H * (rows + 1) + GAP;
}

function marketRumorTexts(
  panel: UiRect,
  model: MarketScreenModel,
  topOffset: number
): readonly UiText[] {
  if (model.rumors.length === 0) return [];
  const tx = panel.x + PAD;
  const innerW = panel.w - PAD * 2;
  const top = panel.y + topOffset;
  const maxChars = Math.max(10, Math.floor(innerW / uiCharWidth(RUMOR_SIZE)));
  const lines = rumorLinesFor(model.rumors, maxChars).slice(0, MAX_RUMOR_LINES);
  return [rumorKicker(tx, top, innerW), ...rumorLines(tx, top, innerW, lines)];
}

function rumorKicker(tx: number, top: number, innerW: number): UiText {
  return textAt(
    uiEllipsize('RUMORS // TRADE INTEL', KICKER_SIZE, innerW),
    tx,
    top,
    KICKER_SIZE,
    'dim'
  );
}

function rumorLines(tx: number, top: number, innerW: number, lines: readonly string[]): UiText[] {
  return lines.map((line, index) =>
    textAt(
      uiEllipsize(line, RUMOR_SIZE, innerW),
      tx,
      top + KICKER_SIZE + 8 + index * LINE_H,
      RUMOR_SIZE,
      'muted'
    )
  );
}

function rumorLinesFor(rumors: readonly string[], maxChars: number): string[] {
  const out: string[] = [];
  for (const rumor of rumors) out.push(...wrapRumor(rumor, maxChars));
  return out;
}

const TABLE_SIZE = 12;

function marketTableHeader(x: number, colW: number, y: number): readonly UiText[] {
  const slots = marketTableSlots(x, colW);
  return [
    textAt('GOOD', slots.name, y, TABLE_SIZE, 'dim'),
    textAt('BUY', slots.buy, y, TABLE_SIZE, 'dim'),
    textAt('SELL', slots.sell, y, TABLE_SIZE, 'dim'),
  ];
}

function marketTableRow(
  x: number,
  colW: number,
  y: number,
  cell: MarketTableCell
): readonly UiText[] {
  const slots = marketTableSlots(x, colW);
  return [
    textAt(
      uiEllipsize(`${cell.stock}x ${cell.name}`, TABLE_SIZE, slots.nameW),
      slots.name,
      y,
      TABLE_SIZE,
      'primary'
    ),
    textAt(`-${cell.buy}cr`, slots.buy, y, TABLE_SIZE, 'danger'),
    textAt(`+${cell.sell}cr`, slots.sell, y, TABLE_SIZE, 'good'),
  ];
}

function marketTableSlots(
  x: number,
  colW: number
): { name: number; buy: number; sell: number; nameW: number } {
  const charW = uiCharWidth(TABLE_SIZE);
  const buyX = x + colW - 11 * charW;
  const sellX = x + colW - 5 * charW;
  return { name: x, buy: buyX, sell: sellX, nameW: buyX - x };
}

function marketButtonsFor(panel: UiRect): readonly UiButton[] {
  const ids = ['buy', 'sell', 'close'];
  const labels = { buy: 'BUY', sell: 'SELL', close: 'CLOSE [E]' };
  const top = panel.y + panel.h - PAD - (ids.length * BTN_H + (ids.length - 1) * GAP);
  return columnFor(panel, top, ids, labels, 'buy');
}

function sellButtonsFor(panel: UiRect, model: SellScreenModel): readonly UiButton[] {
  const ids = [...model.rows.map((row) => row.buttonId), 'sellAll', 'close'];
  const labels: Record<string, string> = { sellAll: model.totalLabel, close: 'CLOSE [E]' };
  const details: Record<string, { text: string; color: 'good' }> = {};
  for (const row of model.rows) {
    labels[row.buttonId] = row.label;
    details[row.buttonId] = { text: `+${row.value}cr`, color: 'good' };
  }
  const top = panel.y + panel.h - PAD - (ids.length * BTN_H + (ids.length - 1) * GAP);
  return columnFor(panel, top, ids, labels, model.rows[0]?.buttonId).map((button) => {
    const detail = details[button.id];
    return detail === undefined ? button : { ...button, detail };
  });
}

export function layoutMarketScreen(w: number, h: number, model: MarketScreenModel): UiScreenLayout {
  const panel = marketPanelFor(w, h);
  return { panel, texts: marketTextsFor(panel, model), buttons: marketButtonsFor(panel) };
}

function sellPanelFor(w: number, h: number): UiRect {
  return visorPanelFor(w, h, 440, 620);
}

function sellTextsFor(panel: UiRect, model: SellScreenModel): readonly UiText[] {
  const tx = panel.x + PAD;
  const innerW = panel.w - PAD * 2;
  const y0 = panel.y + PAD;
  return [
    textAt(`SELL // ${model.hubLabel}`, tx, y0, KICKER_SIZE, 'dim'),
    textAt(
      uiEllipsize(model.totalLabel, BODY_SIZE, innerW),
      tx,
      y0 + KICKER_SIZE + 8,
      BODY_SIZE,
      'good'
    ),
    textAt(
      uiEllipsize(model.hint, BODY_SIZE, innerW),
      tx,
      y0 + KICKER_SIZE + 8 + LINE_H,
      BODY_SIZE,
      'muted'
    ),
  ];
}

export function layoutSellScreen(w: number, h: number, model: SellScreenModel): UiScreenLayout {
  const panel = sellPanelFor(w, h);
  return { panel, texts: sellTextsFor(panel, model), buttons: sellButtonsFor(panel, model) };
}

const RECEIPT_MAX_GOODS = 6;

export function layoutTradeReceiptScreen(
  w: number,
  h: number,
  model: TradeReceiptModel
): UiScreenLayout {
  const panel = receiptPanelFor(w, h, model.itemsSold.length);
  return { panel, texts: receiptTextsFor(panel, model), buttons: receiptButtonsFor(panel) };
}

function receiptPanelFor(w: number, h: number, goods: number): UiRect {
  const rows = 2 + Math.min(goods, RECEIPT_MAX_GOODS) + 2;
  return centerPanelFor(w, h, 440, PAD + KICKER_SIZE + 8 + rows * LINE_H + GAP + BTN_H + PAD);
}

function receiptTextsFor(panel: UiRect, model: TradeReceiptModel): readonly UiText[] {
  const tx = panel.x + PAD;
  const innerW = panel.w - PAD * 2;
  const right = panel.x + panel.w - PAD;
  const y0 = panel.y + PAD;
  const goods = model.itemsSold.slice(0, RECEIPT_MAX_GOODS);
  return [
    textAt('TRADE TRANSACTION SETTLED', tx, y0, KICKER_SIZE, 'dim'),
    textAt(
      uiEllipsize(`PORT: ${model.hubLabel}`, BODY_SIZE, innerW),
      tx,
      y0 + KICKER_SIZE + 8,
      BODY_SIZE,
      'primary'
    ),
    ...goods.flatMap((line, index) => receiptGoodTexts(line, tx, right, innerW, y0, index + 1)),
    ...receiptTotalTexts(model.totalRevenue, tx, right, innerW, y0, goods.length + 1),
    ...receiptBalanceTexts(model, tx, right, innerW, y0, goods.length + 2),
  ];
}

/** Right-align a money column against the panel's inner edge. */
function receiptAmountX(right: number, amount: string): number {
  return right - uiTextWidth(amount, BODY_SIZE);
}

function receiptGoodTexts(
  line: TradeReceiptModel['itemsSold'][number],
  tx: number,
  right: number,
  innerW: number,
  y0: number,
  row: number
): UiText[] {
  const amount = `+${line.revenue}cr`;
  const nameWidth = innerW - uiTextWidth(amount, BODY_SIZE) - uiCharWidth(BODY_SIZE);
  return [
    textAt(
      uiEllipsize(`${line.qty}x ${line.goodId.toUpperCase()}`, BODY_SIZE, nameWidth),
      tx,
      y0 + KICKER_SIZE + 8 + LINE_H * row,
      BODY_SIZE,
      'primary'
    ),
    textAt(
      amount,
      receiptAmountX(right, amount),
      y0 + KICKER_SIZE + 8 + LINE_H * row,
      BODY_SIZE,
      'good'
    ),
  ];
}

function receiptTotalTexts(
  total: number,
  tx: number,
  right: number,
  innerW: number,
  y0: number,
  row: number
): UiText[] {
  const amount = `+${total}cr`;
  return [
    textAt(
      uiEllipsize('TOTAL', BODY_SIZE, innerW),
      tx,
      y0 + KICKER_SIZE + 8 + LINE_H * row,
      BODY_SIZE,
      'primary'
    ),
    textAt(
      amount,
      receiptAmountX(right, amount),
      y0 + KICKER_SIZE + 8 + LINE_H * row,
      BODY_SIZE,
      'good'
    ),
  ];
}

function receiptBalanceTexts(
  model: TradeReceiptModel,
  tx: number,
  right: number,
  innerW: number,
  y0: number,
  row: number
): UiText[] {
  const equation = receiptEquation(model);
  const shown = uiEllipsize(equation, BODY_SIZE, innerW);
  return [
    textAt(
      uiEllipsize('BALANCE', BODY_SIZE, innerW),
      tx,
      y0 + KICKER_SIZE + 8 + LINE_H * row,
      BODY_SIZE,
      'muted'
    ),
    textAt(
      shown,
      right - uiTextWidth(shown, BODY_SIZE),
      y0 + KICKER_SIZE + 8 + LINE_H * row,
      BODY_SIZE,
      'primary'
    ),
  ];
}

function receiptEquation(model: TradeReceiptModel): string {
  const before = model.newBalance - model.totalRevenue;
  return `${before}cr + ${model.totalRevenue}cr = ${model.newBalance}cr`;
}

function receiptButtonsFor(panel: UiRect): readonly UiButton[] {
  const top = panel.y + panel.h - PAD - BTN_H;
  return columnFor(panel, top, ['continue'], { continue: 'CONTINUE [E]' }, 'continue');
}

function packStripButtons(
  strip: UiRect,
  sealLabel: string,
  sealReady: boolean,
  sealDetail: string
): readonly UiButton[] {
  const ids = ['seal', 'auto', 'clear', 'close'];
  const rects = uiSplitRow(strip, ids.length, GAP);
  const labels: Record<string, string> = {
    seal: sealLabel,
    auto: 'TIDY',
    clear: 'CLEAR',
    close: 'CLOSE [C]',
  };
  return ids.map((id, index) => ({
    id,
    label: labels[id] ?? id,
    rect: rects[index] ?? { ...strip },
    primary: sealReady && id === 'seal',
    ...(id === 'seal' && sealDetail !== ''
      ? { detail: { text: sealDetail, color: 'danger' as const } }
      : {}),
  }));
}

export function layoutPackScreen(
  w: number,
  h: number,
  model: import('../../pack/packModel').PackScreenModel
): UiScreenLayout {
  const geo = packLayoutFor(w, h);
  const tx = geo.panel.x + PAD;
  const innerW = geo.panel.w - PAD * 2;
  const y0 = geo.panel.y + PAD;
  const texts = [
    textAt('PACK // CRATES', tx, y0, KICKER_SIZE, 'dim'),
    textAt(
      uiEllipsize(model.title, BODY_SIZE, innerW),
      tx,
      y0 + KICKER_SIZE + 8,
      BODY_SIZE,
      'cyan'
    ),
    textAt(
      uiEllipsize(model.budgetLabel, BODY_SIZE, innerW),
      tx,
      y0 + KICKER_SIZE + 8 + LINE_H,
      BODY_SIZE,
      'primary'
    ),
    textAt(
      uiEllipsize(model.hint, BODY_SIZE, innerW),
      tx,
      y0 + KICKER_SIZE + 8 + LINE_H * 2,
      BODY_SIZE,
      'muted'
    ),
  ];
  const paletteIds = model.palette.map((entry) => entry.buttonId);
  const paletteLabels: Record<string, string> = {};
  const paletteDetails: Record<string, { text: string; color: 'danger' }> = {};
  for (const entry of model.palette) {
    paletteLabels[entry.buttonId] = entry.label;
    if (entry.unitPrice > 0)
      paletteDetails[entry.buttonId] = { text: `-${entry.unitPrice}cr`, color: 'danger' };
  }
  const paletteTop =
    geo.panel.y +
    geo.panel.h -
    PAD -
    (paletteIds.length * BTN_H + Math.max(0, paletteIds.length - 1) * GAP);
  return {
    panel: geo.panel,
    texts,
    buttons: [
      ...columnFor(geo.panel, paletteTop, paletteIds, paletteLabels, undefined).map((button) => {
        const detail = paletteDetails[button.id];
        return detail === undefined ? button : { ...button, detail };
      }),
      ...packStripButtons(geo.strip, model.sealLabel, model.sealReady, model.sealDetail),
    ],
  };
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
  engine: ['spool', 'tuneDown', 'tuneUp', 'loadFuel', 'unloadFuel', 'close'],
  nav: ['plot:hub_b', 'via:poi_kestrel', 'via:poi_vigil', 'loadFuel', 'spool', 'close'],
  cargo: ['unpackAll', 'drop', 'packHold', 'close'],
  market: ['buy', 'sell', 'close'],
  sell: ['sellAll', 'close'],
  pack: ['seal', 'auto', 'clear', 'close'],
  pause: ['resume', 'restart', 'quit', 'audio'],
  death: ['restart', 'quit'],
  gameover: ['restart'],
  settings: ['voldn', 'volup', 'mute', 'close'],
};

export function uiScreenButtonIds(screen: UiScreenId): readonly string[] {
  return UI_BUTTON_IDS[screen];
}
