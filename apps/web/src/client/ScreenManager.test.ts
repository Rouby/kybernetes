/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { reduceShellPhase, ScreenManager } from './ScreenManager';

function storage(): Map<string, string> & {
  getItem: (k: string) => string | null;
  setItem: (k: string, v: string) => void;
} {
  const backing = new Map<string, string>();
  return Object.assign(backing, {
    getItem: (key: string): string | null => backing.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      backing.set(key, value);
    },
  });
}

describe('reduceShellPhase', () => {
  it('walks menu, customize, intro, game, and gameover', () => {
    expect(reduceShellPhase('menu', 'customize')).toBe('customize');
    expect(reduceShellPhase('menu', 'embark')).toBe('intro');
    expect(reduceShellPhase('customize', 'embark')).toBe('intro');
    expect(reduceShellPhase('customize', 'back')).toBe('menu');
    expect(reduceShellPhase('intro', 'embark')).toBe('game');
    expect(reduceShellPhase('game', 'shipLost')).toBe('gameover');
    expect(reduceShellPhase('game', 'quit')).toBe('menu');
    expect(reduceShellPhase('gameover', 'restart')).toBe('game');
  });

  it('ignores events outside the current phase', () => {
    expect(reduceShellPhase('menu', 'quit')).toBe('menu');
    expect(reduceShellPhase('game', 'embark')).toBe('game');
    expect(reduceShellPhase('intro', 'back')).toBe('intro');
    expect(reduceShellPhase('gameover', 'embark')).toBe('gameover');
    expect(reduceShellPhase('customize', 'restart')).toBe('customize');
  });
});

describe('ScreenManager identity', () => {
  it('loads stored identity with callsign override', () => {
    const store = storage();
    const root = {} as unknown as HTMLElement;
    const manager = new ScreenManager({
      root,
      storage: store,
      beacon: 'HESP01',
      callsign: 'Boot',
      debug: false,
    });
    expect(manager.getPhase()).toBe('menu');
    manager.dispose();
  });
});
