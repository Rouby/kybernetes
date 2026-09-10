/**
 * UiToolkit: pure geometry for WebGL2 game screens (Phase 2).
 * Centralizes the AGENTS.md HUD invariants (dynamic visor margins,
 * monospace text budgeting) so every GL screen shares one implementation.
 * No DOM, no WebGL, no React: Vitest pins all math without a canvas.
 */

export interface UiRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface UiButton {
  readonly id: string;
  readonly label: string;
  readonly rect: UiRect;
  readonly primary: boolean;
}

export interface UiText {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly color: 'dim' | 'cyan' | 'primary' | 'muted' | 'danger' | 'warning' | 'good';
}

/** Paintable option chip (tint swatch, trim, thruster). Label is optional. */
export interface UiSwatch {
  readonly id: string;
  readonly rect: UiRect;
  readonly color: string;
  readonly selected: boolean;
  readonly label?: string;
}

/** Editable text field painted from a TextFieldModel state. */
export interface UiField {
  readonly id: string;
  readonly rect: UiRect;
  readonly value: string;
  readonly caret: number;
  readonly focused: boolean;
}

export interface UiMargins {
  readonly marginX: number;
  readonly marginY: number;
  /** Clearance below the 54px top visor header (14px gap). */
  readonly topClearance: number;
}

/** Dynamic visor margins (AGENTS.md: never fixed y like 80). */
export function uiVisorMargins(width: number, height: number): UiMargins {
  const w = Math.max(320, Math.floor(width));
  const h = Math.max(320, Math.floor(height));
  const marginX = Math.max(38, Math.round(w * 0.055));
  const marginY = Math.max(38, Math.round(h * 0.055));
  return { marginX, marginY, topClearance: marginY + 68 };
}

/** Monospace advance: approx 7.2px per char at 12px (0.6em per char). */
export function uiCharWidth(fontSize: number): number {
  return Math.max(1, fontSize * 0.6);
}

export function uiTextWidth(text: string, fontSize: number): number {
  return text.length * uiCharWidth(fontSize);
}

/** True when the string fits the panel budget (2x padding reserved). */
export function uiFitsText(text: string, fontSize: number, maxWidth: number, pad = 0): boolean {
  return uiTextWidth(text, fontSize) <= Math.max(0, maxWidth - pad * 2);
}

/** Truncate with ellipsis so the result fits the budget. */
export function uiEllipsize(text: string, fontSize: number, maxWidth: number, pad = 0): string {
  const budget = Math.max(0, maxWidth - pad * 2);
  if (uiTextWidth(text, fontSize) <= budget) return text;
  const charW = uiCharWidth(fontSize);
  const keep = Math.max(0, Math.floor((budget - charW) / charW));
  if (keep <= 0) return '\u2026';
  return `${text.slice(0, keep)}\u2026`;
}

export function uiCenteredPanel(
  width: number,
  height: number,
  panelW: number,
  panelH: number
): UiRect {
  const w = Math.max(320, width);
  const h = Math.max(320, height);
  return {
    x: Math.round((w - panelW) / 2),
    y: Math.round((h - panelH) / 2),
    w: Math.round(panelW),
    h: Math.round(panelH),
  };
}

export function uiContains(rect: UiRect, x: number, y: number): boolean {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

export function uiOverlaps(a: UiRect, b: UiRect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function uiClamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/** Vertical button stack inside a panel body. */
export function uiButtonColumn(
  innerX: number,
  top: number,
  innerW: number,
  ids: readonly string[],
  labels: Readonly<Record<string, string>>,
  buttonH: number,
  gap: number,
  primaryId?: string
): UiButton[] {
  let y = top;
  const buttons: UiButton[] = [];
  for (const id of ids) {
    const rect: UiRect = {
      x: Math.round(innerX),
      y: Math.round(y),
      w: Math.round(innerW),
      h: buttonH,
    };
    buttons.push({ id, label: labels[id] ?? id, rect, primary: id === primaryId });
    y += buttonH + gap;
  }
  return buttons;
}

/** Expose hit zones for Playwright (mirrors publishZones in terminalLayout). */
export function publishUiZones(
  sink: { __uiZones?: { id: string; x: number; y: number; w: number; h: number }[] },
  buttons: readonly { id: string; rect: UiRect }[]
): void {
  sink.__uiZones = buttons.map((button) => ({
    id: button.id,
    x: button.rect.x,
    y: button.rect.y,
    w: button.rect.w,
    h: button.rect.h,
  }));
}
