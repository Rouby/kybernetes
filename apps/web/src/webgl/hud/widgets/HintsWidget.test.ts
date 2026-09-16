import { describe, expect, it, vi } from 'vitest';
import { uiTextWidth, uiVisorMargins } from '../../ui/UiToolkit';
import type { WidgetHost } from '../WidgetHost';
import { HintsWidget, layoutHintsStrip } from './HintsWidget';

const HINTS = [
  { key: '[G]', label: 'Drop crate', alert: false },
  { key: '[T]', label: 'Seal suit', alert: true },
];

function host(): { calls: { kind: string; text?: string; color?: string }[]; api: WidgetHost } {
  const calls: { kind: string; text?: string; color?: string }[] = [];
  const api = {
    addCurvedPanel: vi.fn(() => calls.push({ kind: 'panel' })),
    addText: vi.fn((text: string, _x: number, _y: number, opts?: { color?: string }) =>
      calls.push({ kind: 'text', text, color: opts?.color })
    ),
  } as unknown as WidgetHost;
  return { calls, api };
}

describe('layoutHintsStrip', () => {
  it('returns null with no hints', () => {
    expect(layoutHintsStrip(1280, 720, [])).toBeNull();
  });

  it('centers the strip above the bottom margin with bounded runs', () => {
    const strip = layoutHintsStrip(1280, 720, HINTS);
    if (strip === null) throw new Error('missing strip');
    const margins = uiVisorMargins(1280, 720);
    expect(strip.x).toBe(Math.round((1280 - strip.w) / 2));
    expect(strip.y).toBe(720 - margins.marginY - strip.h - 10);
    for (const run of strip.runs) {
      expect(run.x).toBeGreaterThanOrEqual(strip.x);
      expect(run.x + uiTextWidth(run.text, 15)).toBeLessThanOrEqual(strip.x + strip.w);
    }
  });
});

describe('HintsWidget', () => {
  it('paints accent keys and red alerts', () => {
    const fake = host();
    new HintsWidget().render(fake.api, { actionHints: HINTS } as never, 1280, 720);
    const texts = fake.calls.filter((call) => call.kind === 'text');
    expect(texts.map((call) => call.text)).toContain('[G]');
    expect(texts.find((call) => call.text === '[T]')?.color).toBe('#ff2244');
    expect(texts.find((call) => call.text === '[G]')?.color).toBe('#00e5ff');
  });

  it('renders nothing without hints', () => {
    const fake = host();
    new HintsWidget().render(fake.api, {} as never, 1280, 720);
    expect(fake.calls).toEqual([]);
  });
});
