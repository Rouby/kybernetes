import { describe, expect, it } from 'vitest';
import {
  blurTextField,
  createTextField,
  deleteBackward,
  deleteForward,
  focusTextField,
  getDisplayValue,
  handleTextKey,
  insertText,
  isCallsignValid,
  moveCaret,
  moveCaretTo,
  sanitizeCallsignField,
} from './TextFieldModel';

describe('createTextField', () => {
  it('places caret at end and starts blurred', () => {
    const state = createTextField('Rook');
    expect(state.value).toBe('Rook');
    expect(state.caret).toBe(4);
    expect(state.focused).toBe(false);
    expect(state.maxLength).toBe(24);
  });

  it('clamps initial to maxLength with caret at cap', () => {
    const state = createTextField('x'.repeat(40));
    expect(state.value.length).toBe(24);
    expect(state.caret).toBe(24);
  });

  it('honors a custom maxLength', () => {
    const state = createTextField('abcdef', 3);
    expect(state.value).toBe('abc');
    expect(state.caret).toBe(3);
  });
});

describe('insertText', () => {
  it('inserts at caret and moves caret', () => {
    const base = moveCaretTo(createTextField('ac'), 1);
    const next = insertText(base, 'b');
    expect(next.value).toBe('abc');
    expect(next.caret).toBe(2);
  });

  it('drops newlines', () => {
    const next = insertText(createTextField('ab'), 'x\ny\rz');
    expect(next.value).toBe('abxyz');
  });

  it('clamps to maxLength', () => {
    const base = createTextField('ab', 4);
    const next = insertText(base, 'cdef');
    expect(next.value).toBe('abcd');
    expect(next.caret).toBe(4);
  });

  it('is a noop when full or text is only newlines', () => {
    const full = createTextField('ab', 2);
    expect(insertText(full, 'z')).toBe(full);
    const base = createTextField('ab');
    expect(insertText(base, '\n')).toBe(base);
  });
});

describe('delete and caret clamp', () => {
  it('deleteBackward removes char before caret', () => {
    const next = deleteBackward(createTextField('abc'));
    expect(next.value).toBe('ab');
    expect(next.caret).toBe(2);
  });

  it('deleteBackward at start is a noop', () => {
    const base = moveCaretTo(createTextField('abc'), 0);
    expect(deleteBackward(base)).toBe(base);
  });

  it('deleteForward removes char at caret', () => {
    const base = moveCaretTo(createTextField('abc'), 1);
    const next = deleteForward(base);
    expect(next.value).toBe('ac');
    expect(next.caret).toBe(1);
  });

  it('deleteForward at end is a noop', () => {
    const base = createTextField('abc');
    expect(deleteForward(base)).toBe(base);
  });

  it('moveCaret clamps to 0..length', () => {
    const base = createTextField('abc');
    expect(moveCaret(base, -99).caret).toBe(0);
    expect(moveCaret(base, 99).caret).toBe(3);
    expect(moveCaretTo(base, -5).caret).toBe(0);
    expect(moveCaretTo(base, 99).caret).toBe(3);
  });

  it('focus and blur toggle focused', () => {
    const base = createTextField('ab');
    expect(focusTextField(base).focused).toBe(true);
    expect(blurTextField(focusTextField(base)).focused).toBe(false);
  });
});

describe('handleTextKey', () => {
  it('inserts single printable chars', () => {
    const next = handleTextKey(createTextField('ab'), 'c');
    expect(next.value).toBe('abc');
  });

  it('handles Backspace and Delete', () => {
    expect(handleTextKey(createTextField('abc'), 'Backspace').value).toBe('ab');
    const base = moveCaretTo(createTextField('abc'), 0);
    expect(handleTextKey(base, 'Delete').value).toBe('bc');
  });

  it('handles arrows, Home, and End', () => {
    const base = createTextField('abc');
    expect(handleTextKey(base, 'ArrowLeft').caret).toBe(2);
    expect(handleTextKey(base, 'ArrowRight').caret).toBe(3);
    expect(handleTextKey(base, 'Home').caret).toBe(0);
    const atStart = moveCaretTo(base, 0);
    expect(handleTextKey(atStart, 'End').caret).toBe(3);
  });

  it('leaves Enter, Escape, and Tab unchanged', () => {
    const base = createTextField('abc');
    expect(handleTextKey(base, 'Enter')).toBe(base);
    expect(handleTextKey(base, 'Escape')).toBe(base);
    expect(handleTextKey(base, 'Tab')).toBe(base);
  });

  it('ignores other multi-char keys', () => {
    const base = createTextField('abc');
    expect(handleTextKey(base, 'Shift')).toBe(base);
    expect(handleTextKey(base, 'F1')).toBe(base);
  });
});

describe('getDisplayValue', () => {
  it('shows block caret at blink-on phase', () => {
    const state = createTextField('ab');
    expect(getDisplayValue(state, true, 0)).toBe('ab\u2588');
    expect(getDisplayValue(state, true, 529)).toBe('ab\u2588');
  });

  it('hides caret at blink-off phase', () => {
    const state = createTextField('ab');
    expect(getDisplayValue(state, true, 530)).toBe('ab');
    expect(getDisplayValue(state, true, 1059)).toBe('ab');
  });

  it('inserts caret mid-string when focused', () => {
    const state = moveCaretTo(createTextField('ab'), 1);
    expect(getDisplayValue(state, true, 0)).toBe('a\u2588b');
  });

  it('returns value unchanged when blurred', () => {
    const state = createTextField('ab');
    expect(getDisplayValue(state, false, 0)).toBe('ab');
  });
});

describe('sanitize delegation', () => {
  it('falls back to Rook for empty input', () => {
    expect(sanitizeCallsignField('')).toBe('Rook');
    expect(sanitizeCallsignField('   ')).toBe('Rook');
  });

  it('trims and caps at 24 chars', () => {
    expect(sanitizeCallsignField('  Nova-9  ')).toBe('Nova-9');
    expect(sanitizeCallsignField('x'.repeat(40)).length).toBe(24);
  });

  it('isCallsignValid pins the Rook-fallback contract', () => {
    expect(isCallsignValid('')).toBe(true);
    expect(isCallsignValid('Nova')).toBe(true);
  });
});
