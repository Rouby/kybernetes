/**
 * Diegetic terminal layout: pure geometry for the canvas menu. Panel and
 * buttons derive from canvas size with monospace metrics (0.6em per char
 * per the HUD text budget), so Vitest pins centering, containment, and
 * keyboard navigation without touching a canvas.
 */

export type TerminalButtonId = 'embark' | 'customize' | 'audio' | 'voldn' | 'volup' | 'mute';

export interface TermRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface TermButton {
  readonly id: TerminalButtonId;
  readonly label: string;
  readonly rect: TermRect;
  readonly primary: boolean;
}

export interface TerminalText {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly color: TerminalColor;
}

export type TerminalColor = 'dim' | 'cyan' | 'primary' | 'muted' | 'danger';

export interface TerminalLayout {
  readonly panel: TermRect;
  readonly kicker: TerminalText;
  readonly title: TerminalText;
  readonly lines: readonly TerminalText[];
  readonly buttons: readonly TermButton[];
  readonly footer: readonly TerminalText[];
}

export interface TerminalMenuState {
  readonly width: number;
  readonly height: number;
  readonly callsign: string;
  readonly audioReady: boolean;
  readonly muted: boolean;
  readonly masterPct: number;
}

const PAD = 24;
const ROW_GAP = 10;
const BUTTON_H = 44;
const MINI_H = 36;

export function menuButtonIds(audioReady: boolean): readonly TerminalButtonId[] {
  if (!audioReady) return ['embark', 'customize', 'audio'];
  return ['embark', 'customize', 'voldn', 'volup', 'mute'];
}

export function buttonLabel(
  id: TerminalButtonId,
  audio: { readonly muted: boolean; readonly masterPct: number }
): string {
  if (id === 'embark') return 'EMBARK >';
  if (id === 'customize') return 'CUSTOMIZE CHARACTER';
  if (id === 'audio') return 'ENABLE AUDIO';
  if (id === 'voldn') return 'VOL -';
  if (id === 'volup') return 'VOL +';
  return audio.muted ? 'MUTED' : `VOL ${audio.masterPct}%`;
}

const KICKER_SIZE = 11;
const TITLE_SIZE = 30;
const BODY_SIZE = 14;
const FOOT_SIZE = 11;
const BODY_LH = 20;
const FOOT_LH = 15;

function headerHeight(): number {
  return KICKER_SIZE + 8 + TITLE_SIZE + 8 + BODY_LH * 2 + 16;
}

function buttonsHeight(audioReady: boolean): number {
  const big = audioReady ? 2 : 3;
  const mini = audioReady ? 1 : 0;
  return big * (BUTTON_H + ROW_GAP) + mini * (MINI_H + ROW_GAP);
}

function footerHeight(): number {
  return 12 + FOOT_LH * 2;
}

export function layoutTerminalMenu(state: TerminalMenuState): TerminalLayout {
  const width = Math.max(320, state.width);
  const height = Math.max(320, state.height);
  const ids = menuButtonIds(state.audioReady);
  const panelW = Math.min(560, Math.max(340, width - 48));
  const panelH = PAD * 2 + headerHeight() + buttonsHeight(state.audioReady) + footerHeight();
  const panel: TermRect = {
    x: Math.round((width - panelW) / 2),
    y: Math.round((height - panelH) / 2),
    w: Math.round(panelW),
    h: Math.round(panelH),
  };
  const tx = panel.x + PAD;
  let y = panel.y + PAD;
  const kicker: TerminalText = {
    text: 'HESPERIA // HARBOR CONTROL',
    x: tx,
    y,
    size: KICKER_SIZE,
    color: 'dim',
  };
  y += KICKER_SIZE + 8;
  const title: TerminalText = { text: 'KYBERNETES', x: tx, y, size: TITLE_SIZE, color: 'cyan' };
  y += TITLE_SIZE + 8;
  const lines: TerminalText[] = [
    { text: `Signed in as ${state.callsign}.`, x: tx, y, size: BODY_SIZE, color: 'primary' },
    { text: 'The harbor waits.', x: tx, y: y + BODY_LH, size: BODY_SIZE, color: 'muted' },
  ];
  y += BODY_LH * 2 + 16;
  const buttons = placeButtons(tx, y, panel.w - PAD * 2, ids, state);
  y += buttonsHeight(state.audioReady);
  const footer: TerminalText[] = [
    { text: 'E embark · C customize · M mute', x: tx, y: y + 12, size: FOOT_SIZE, color: 'muted' },
    {
      text: 'WASD move · F fire · E use · H talk',
      x: tx,
      y: y + 12 + FOOT_LH,
      size: FOOT_SIZE,
      color: 'muted',
    },
  ];
  return { panel, kicker, title, lines, buttons, footer };
}

function placeButtons(
  innerX: number,
  top: number,
  innerW: number,
  ids: readonly TerminalButtonId[],
  state: TerminalMenuState
): TermButton[] {
  let y = top;
  const buttons: TermButton[] = [];
  for (const id of ids) {
    if (id === 'voldn') {
      const third = Math.floor((innerW - ROW_GAP * 2) / 3);
      buttons.push(makeButton('voldn', state, innerX, y, third, MINI_H, false));
      buttons.push(makeButton('volup', state, innerX + third + ROW_GAP, y, third, MINI_H, false));
      buttons.push(
        makeButton(
          'mute',
          state,
          innerX + (third + ROW_GAP) * 2,
          y,
          innerW - (third + ROW_GAP) * 2,
          MINI_H,
          false
        )
      );
      y += MINI_H + ROW_GAP;
    } else if (id === 'volup' || id === 'mute') {
    } else {
      buttons.push(makeButton(id, state, innerX, y, innerW, BUTTON_H, id === 'embark'));
      y += BUTTON_H + ROW_GAP;
    }
  }
  return buttons;
}

function makeButton(
  id: TerminalButtonId,
  state: TerminalMenuState,
  x: number,
  y: number,
  w: number,
  h: number,
  primary: boolean
): TermButton {
  return {
    id,
    label: buttonLabel(id, state),
    rect: { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) },
    primary,
  };
}

export function navigateMenu(current: number, key: string, count: number): number {
  if (count <= 0) return 0;
  const at = ((current % count) + count) % count;
  if (key === 'ArrowDown' || key === 's' || key === 'S') return (at + 1) % count;
  if (key === 'ArrowUp' || key === 'w' || key === 'W') return (at - 1 + count) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return at;
}

export interface TerminalZone {
  readonly id: TerminalButtonId;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export function publishZones(
  sink: { __terminalMenuZones?: TerminalZone[] },
  buttons: readonly TermButton[]
): void {
  sink.__terminalMenuZones = buttons.map((button) => ({
    id: button.id,
    x: button.rect.x,
    y: button.rect.y,
    w: button.rect.w,
    h: button.rect.h,
  }));
}
