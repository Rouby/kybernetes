/** @vitest-environment node */
import { describe, expect, it, vi } from 'vitest';
import { type SoundboardEngine, soundboardButtons } from './Soundboard';

function fakeEngine(): SoundboardEngine & Record<string, ReturnType<typeof vi.fn>> {
  const calls: Record<string, ReturnType<typeof vi.fn>> = {};
  const engine = new Proxy(
    {},
    {
      get: (_target, prop: string) => {
        if (calls[prop] === undefined) calls[prop] = vi.fn();
        return calls[prop];
      },
    }
  ) as unknown as SoundboardEngine & Record<string, ReturnType<typeof vi.fn>>;
  return engine;
}

describe('soundboardButtons', () => {
  it('routes every button to its engine sound', () => {
    const engine = fakeEngine();
    const buttons = soundboardButtons(engine);
    expect(buttons.length).toBeGreaterThan(15);
    const groups = new Set(buttons.map((button) => button.group));
    expect(groups).toEqual(
      new Set(['Pack bench', 'Trade', 'UI', 'Ship', 'Weapons', 'Music', 'Alert', 'Vocals'])
    );
    for (const button of buttons) button.play();
    const fired = Object.values(engine).filter((fn) => fn.mock.calls.length > 0).length;
    expect(fired).toBe(Object.keys(engine).length);
  });
});
