/** Bottom-center contextual key-hint strip, above the visor margin. */

import type { ActionHint } from '../../../harbor/sessionHud.js';
import { uiTextWidth, uiVisorMargins } from '../../ui/UiToolkit.js';
import type { HudDrawState } from '../HudRenderer.js';
import type { WidgetHost } from '../WidgetHost.js';

export interface HintRun {
  readonly text: string;
  readonly x: number;
  readonly color: string;
  readonly bold: boolean;
}

export interface HintsStrip {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly runs: readonly HintRun[];
}

const HINT_SIZE = 15;
const STRIP_H = 34;
const STRIP_PAD_X = 16;
const HINT_GAP = 28;
const KEY_GAP = 8;
const SEPARATOR = '\u2022';
const KEY_COLOR = '#00e5ff';
const LABEL_COLOR = '#e0e8f5';
const DIM_COLOR = '#506680';
const ALERT_COLOR = '#ff2244';

/** Centered strip geometry; null when no hints are active. */
export function layoutHintsStrip(
  width: number,
  height: number,
  hints: readonly ActionHint[]
): HintsStrip | null {
  if (hints.length === 0) return null;
  const margins = uiVisorMargins(width, height);
  const runs = hintRuns(hints);
  const contentW = stripContentWidth(runs);
  const w = Math.ceil(contentW + STRIP_PAD_X * 2);
  const x = Math.round((width - w) / 2);
  const y = Math.round(height - margins.marginY - STRIP_H - 10);
  return { x, y, w, h: STRIP_H, runs: placeRuns(runs, x + STRIP_PAD_X) };
}

function hintRuns(hints: readonly ActionHint[]): { text: string; color: string; bold: boolean }[] {
  const runs: { text: string; color: string; bold: boolean }[] = [];
  hints.forEach((hint, index) => {
    if (index > 0) runs.push({ text: SEPARATOR, color: DIM_COLOR, bold: false });
    const color = hint.alert ? ALERT_COLOR : KEY_COLOR;
    runs.push({ text: hint.key, color, bold: true });
    runs.push({
      text: hint.label,
      color: hint.alert ? ALERT_COLOR : LABEL_COLOR,
      bold: false,
    });
  });
  return runs;
}

function stripContentWidth(runs: readonly { text: string; bold: boolean }[]): number {
  let total = 0;
  runs.forEach((run, index) => {
    total += uiTextWidth(run.text, HINT_SIZE);
    if (index < runs.length - 1) total += isKeyRun(run) ? KEY_GAP : HINT_GAP;
  });
  return total;
}

function placeRuns(
  runs: readonly { text: string; color: string; bold: boolean }[],
  startX: number
): HintRun[] {
  let x = startX;
  return runs.map((run) => {
    const placed: HintRun = { ...run, x: Math.round(x) };
    x += uiTextWidth(run.text, HINT_SIZE) + (isKeyRun(run) ? KEY_GAP : HINT_GAP);
    return placed;
  });
}

function isKeyRun(run: { text: string; bold: boolean }): boolean {
  return run.bold && run.text !== SEPARATOR;
}

export class HintsWidget {
  render(host: WidgetHost, state: HudDrawState, width: number, height: number): void {
    const strip = layoutHintsStrip(width, height, state.actionHints ?? []);
    if (strip === null) return;
    host.addCurvedPanel(strip.x, strip.y, strip.w, strip.h, 8, 0.03, 0.06, 0.1, 0.85);
    for (const run of strip.runs) {
      host.addText(run.text, run.x, strip.y + 10, {
        fontSize: HINT_SIZE,
        ...(run.bold ? { fontWeight: 'bold' as const } : {}),
        color: run.color,
      });
    }
  }
}
