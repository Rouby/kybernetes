/**
 * TextFieldModel: pure GL text-input model for the customize callsign field.
 * No DOM, no React, no WebGL. The GL pass paints from this model and syncs
 * a hidden offscreen <input> only for OS keyboard/IME (overlay lives in Phase 3).
 */

import { sanitizeCallsign } from '../../harbor/identity';

export interface TextFieldState {
  readonly value: string;
  readonly caret: number;
  readonly focused: boolean;
  readonly maxLength: number;
}

export function createTextField(initial: string, maxLength?: number): TextFieldState {
  const cap = maxLength ?? 24;
  const value = initial.slice(0, cap);
  return { value, caret: value.length, focused: false, maxLength: cap };
}

export function focusTextField(state: TextFieldState): TextFieldState {
  return { ...state, focused: true };
}

export function blurTextField(state: TextFieldState): TextFieldState {
  return { ...state, focused: false };
}

export function insertText(state: TextFieldState, text: string): TextFieldState {
  const clean = text.replace(/\r|\n/g, '');
  if (clean.length === 0) return state;
  const room = state.maxLength - state.value.length;
  if (room <= 0) return state;
  const chunk = clean.slice(0, room);
  const head = state.value.slice(0, state.caret);
  const tail = state.value.slice(state.caret);
  return { ...state, value: head + chunk + tail, caret: state.caret + chunk.length };
}

export function deleteBackward(state: TextFieldState): TextFieldState {
  if (state.caret <= 0) return state;
  const head = state.value.slice(0, state.caret - 1);
  const tail = state.value.slice(state.caret);
  return { ...state, value: head + tail, caret: state.caret - 1 };
}

export function deleteForward(state: TextFieldState): TextFieldState {
  if (state.caret >= state.value.length) return state;
  const head = state.value.slice(0, state.caret);
  const tail = state.value.slice(state.caret + 1);
  return { ...state, value: head + tail, caret: state.caret };
}

export function moveCaret(state: TextFieldState, delta: number): TextFieldState {
  return moveCaretTo(state, state.caret + delta);
}

export function moveCaretTo(state: TextFieldState, index: number): TextFieldState {
  const next = Math.max(0, Math.min(state.value.length, index));
  return { ...state, caret: next };
}

export function handleTextKey(state: TextFieldState, key: string): TextFieldState {
  if (key === 'Backspace') return deleteBackward(state);
  if (key === 'Delete') return deleteForward(state);
  if (key === 'ArrowLeft') return moveCaret(state, -1);
  if (key === 'ArrowRight') return moveCaret(state, 1);
  if (key === 'Home') return moveCaretTo(state, 0);
  if (key === 'End') return moveCaretTo(state, state.value.length);
  if (key === 'Enter' || key === 'Escape' || key === 'Tab') return state;
  if (key.length === 1) return insertText(state, key);
  return state;
}

export function getDisplayValue(state: TextFieldState, focused: boolean, nowMs: number): string {
  if (!focused) return state.value;
  if (Math.floor(nowMs / 530) % 2 !== 0) return state.value;
  const head = state.value.slice(0, state.caret);
  const tail = state.value.slice(state.caret);
  return `${head}\u2588${tail}`;
}

export function sanitizeCallsignField(raw: string): string {
  return sanitizeCallsign(raw);
}

export function isCallsignValid(value: string): boolean {
  return sanitizeCallsignField(value).length > 0;
}
