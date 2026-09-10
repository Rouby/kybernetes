/**
 * menuActions: framework-free menu dispatch (Phase 3 Round 13).
 * Moved out of TerminalCanvas so the vanilla shell shares it verbatim.
 * No React, no DOM, no canvas.
 */

import type { TermButton, TerminalButtonId } from '../harbor/terminalLayout';

export interface MasterAudio {
  readonly ready: boolean;
  readonly muted: boolean;
  readonly masterPct: number;
  readonly enable: () => void;
  readonly setMasterPct: (pct: number) => void;
  readonly setMuted: (muted: boolean) => void;
}

export interface MenuActions {
  readonly callsign: string;
  readonly audio: MasterAudio;
  readonly onEmbark: () => void;
  readonly onCustomize: () => void;
}

export function activateTerminalButton(id: TerminalButtonId, menu: MenuActions): void {
  if (id === 'embark') menu.onEmbark();
  else if (id === 'customize') menu.onCustomize();
  else if (id === 'audio') menu.audio.enable();
  else if (!menu.audio.ready) return;
  else if (id === 'voldn') menu.audio.setMasterPct(Math.max(0, menu.audio.masterPct - 10));
  else if (id === 'volup') menu.audio.setMasterPct(Math.min(100, menu.audio.masterPct + 10));
  else menu.audio.setMuted(!menu.audio.muted);
}

export function activateTerminalIndex(
  buttons: readonly TermButton[],
  idx: number,
  menu: MenuActions
): void {
  const button = buttons[idx];
  if (button !== undefined) activateTerminalButton(button.id, menu);
}

function toggleMuteKey(menu: MenuActions): void {
  if (!menu.audio.ready) menu.audio.enable();
  else menu.audio.setMuted(!menu.audio.muted);
}

export function activateActionKey(key: string, menu: MenuActions): boolean {
  if (key === 'e' || key === 'E') menu.onEmbark();
  else if (key === 'c' || key === 'C') menu.onCustomize();
  else if (key === 'm' || key === 'M') toggleMuteKey(menu);
  else return false;
  return true;
}
