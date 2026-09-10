/**
 * splashKeys: framework-free splash keyboard nav (Phase 3 Round 13).
 * Moved out of GlSplash so the vanilla SplashMount shares it verbatim.
 * Text-entry targets stay untouched so hidden IME inputs keep their keys.
 */

import { isNavKey, navigateMenu } from '../harbor/terminalLayout';

function isTextEntry(target: EventTarget | null): boolean {
  if (typeof HTMLInputElement !== 'undefined' && target instanceof HTMLInputElement) return true;
  if (typeof HTMLTextAreaElement !== 'undefined' && target instanceof HTMLTextAreaElement) {
    return true;
  }
  return false;
}

export function handleSplashKey(
  event: KeyboardEvent,
  buttonsRef: { current: readonly { id: string }[] },
  focusRef: { current: number },
  keyModeRef: { current: boolean },
  actionRef: { current: (id: string) => void }
): void {
  if (isTextEntry(event.target)) return;
  const buttons = buttonsRef.current;
  if (buttons.length === 0) return;
  if (isNavKey(event.key)) {
    focusSplashEntry(event, buttons, focusRef, keyModeRef);
    return;
  }
  if (event.key === 'Enter' || event.key === ' ') {
    activateSplashEntry(event, buttons, focusRef.current, actionRef.current);
  }
}

export function focusSplashEntry(
  event: KeyboardEvent,
  buttons: readonly { id: string }[],
  focusRef: { current: number },
  keyModeRef: { current: boolean }
): void {
  focusRef.current = navigateMenu(focusRef.current, event.key, buttons.length);
  keyModeRef.current = true;
  event.preventDefault();
}

export function activateSplashEntry(
  event: KeyboardEvent,
  buttons: readonly { id: string }[],
  focusIdx: number,
  onActivate: (id: string) => void
): void {
  if (!event.repeat) {
    const at = buttons[Math.min(focusIdx, buttons.length - 1)];
    if (at !== undefined) onActivate(at.id);
  }
  event.preventDefault();
}
