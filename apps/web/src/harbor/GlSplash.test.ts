/** @vitest-environment node */
import { describe, expect, it, vi } from 'vitest';
import { activateSplashEntry, focusSplashEntry, handleSplashKey } from '../client/splashKeys';

function refs(ids: readonly string[]) {
  return {
    buttonsRef: { current: ids.map((id) => ({ id })) },
    focusRef: { current: 0 },
    keyModeRef: { current: false },
    actionRef: { current: vi.fn() },
  };
}

function key(key: string, repeat = false) {
  return { key, repeat, preventDefault: vi.fn() } as unknown as KeyboardEvent;
}

describe('handleSplashKey', () => {
  it('ignores keys with no buttons', () => {
    const r = refs([]);
    handleSplashKey(key('Enter'), r.buttonsRef, r.focusRef, r.keyModeRef, r.actionRef);
    expect(r.actionRef.current).not.toHaveBeenCalled();
  });

  it('moves focus on nav keys and flags keyboard mode', () => {
    const r = refs(['a', 'b', 'c']);
    const event = key('ArrowDown');
    handleSplashKey(event, r.buttonsRef, r.focusRef, r.keyModeRef, r.actionRef);
    expect(r.focusRef.current).toBe(1);
    expect(r.keyModeRef.current).toBe(true);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(r.actionRef.current).not.toHaveBeenCalled();
  });

  it('activates the focused entry on Enter', () => {
    const r = refs(['a', 'b']);
    r.focusRef.current = 1;
    handleSplashKey(key('Enter'), r.buttonsRef, r.focusRef, r.keyModeRef, r.actionRef);
    expect(r.actionRef.current).toHaveBeenCalledWith('b');
  });

  it('ignores repeat Enter and unrelated keys', () => {
    const r = refs(['a']);
    handleSplashKey(key('Enter', true), r.buttonsRef, r.focusRef, r.keyModeRef, r.actionRef);
    handleSplashKey(key('x'), r.buttonsRef, r.focusRef, r.keyModeRef, r.actionRef);
    expect(r.actionRef.current).not.toHaveBeenCalled();
  });
});

describe('focusSplashEntry', () => {
  it('wraps focus and marks keyboard mode', () => {
    const r = refs(['a', 'b']);
    const event = key('ArrowUp');
    focusSplashEntry(event, r.buttonsRef.current, r.focusRef, r.keyModeRef);
    expect(r.focusRef.current).toBe(1);
    expect(r.keyModeRef.current).toBe(true);
    expect(event.preventDefault).toHaveBeenCalled();
  });
});

describe('activateSplashEntry', () => {
  it('fires once per non-repeat press with clamped focus', () => {
    const onActivate = vi.fn();
    const buttons = [{ id: 'a' }, { id: 'b' }];
    activateSplashEntry(key(' '), buttons, 9, onActivate);
    expect(onActivate).toHaveBeenCalledWith('b');
    activateSplashEntry(key('Enter', true), buttons, 0, onActivate);
    expect(onActivate).toHaveBeenCalledTimes(1);
  });
});
