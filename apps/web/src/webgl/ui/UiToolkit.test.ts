/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import {
  packBenchTransform,
  packCrateRect,
  packLayoutFor,
  packPlace,
  publishUiZones,
  uiButtonColumn,
  uiCenteredPanel,
  uiCharWidth,
  uiClamp,
  uiContains,
  uiEllipsize,
  uiFitsText,
  uiOverlaps,
  uiSplitRow,
  uiTextWidth,
  uiVisorMargins,
} from './UiToolkit';

describe('uiVisorMargins', () => {
  it('derives margins from height, never fixed offsets', () => {
    expect(uiVisorMargins(854, 480)).toEqual({ marginX: 47, marginY: 38, topClearance: 106 });
    expect(uiVisorMargins(1280, 720)).toEqual({ marginX: 70, marginY: 40, topClearance: 108 });
    expect(uiVisorMargins(1920, 1080)).toEqual({ marginX: 106, marginY: 59, topClearance: 127 });
    for (const h of [480, 720, 1080]) {
      const m = uiVisorMargins(1280, h);
      expect(m.marginY).toBe(Math.max(38, Math.round(h * 0.055)));
      expect(m.topClearance).toBe(m.marginY + 68);
    }
  });
});

describe('packLayoutFor', () => {
  it('splits a left panel, right canvas, and bottom strip without overlap', () => {
    const geo = packLayoutFor(1280, 720);
    expect(geo.panel.x).toBeGreaterThan(0);
    expect(geo.canvas.x).toBeGreaterThan(geo.panel.x + geo.panel.w);
    expect(geo.canvas.w).toBeGreaterThan(300);
    expect(geo.strip.y).toBe(geo.canvas.y + geo.canvas.h + 12);
    expect(uiOverlaps(geo.panel, geo.canvas)).toBe(false);
  });

  it('pins the crate bottom above the canvas bottom with an invertible zoom', () => {
    const bench = packBenchTransform(1280, 720);
    expect(bench.scale).toBeGreaterThan(1);
    expect(bench.scale).toBeLessThanOrEqual(3);
    const box = packCrateRect(bench.rect.w, bench.rect.h);
    expect(bench.ox + (box.x + box.w / 2) * bench.scale).toBeCloseTo(
      bench.rect.x + bench.rect.w / 2,
      5
    );
    expect(bench.oy + (box.y + box.h) * bench.scale).toBeCloseTo(
      bench.rect.y + bench.rect.h - 40,
      5
    );
    const toScreen = (x: number, y: number) => ({
      x: bench.ox + x * bench.scale,
      y: bench.oy + y * bench.scale,
    });
    const back = (p: { x: number; y: number }) => ({
      x: (p.x - bench.ox) / bench.scale,
      y: (p.y - bench.oy) / bench.scale,
    });
    expect(packPlace(bench, 37, 91)).toEqual({
      x: bench.ox + 37 * bench.scale,
      y: bench.oy + 91 * bench.scale,
    });
    const round = back(toScreen(37, 91));
    expect(round.x).toBeCloseTo(37, 6);
    expect(round.y).toBeCloseTo(91, 6);
  });

  it('splits strips into equal buttons', () => {
    const rects = uiSplitRow({ x: 0, y: 0, w: 400, h: 52 }, 4, 10);
    expect(rects).toHaveLength(4);
    expect(rects[0]?.x).toBe(0);
    expect(rects[3]?.x ?? 0).toBeGreaterThan(300);
    expect(rects.every((rect) => rect.h === 52)).toBe(true);
  });
});

describe('monospace text budget', () => {
  it('budgets ~7.2px per char at 12px', () => {
    expect(uiCharWidth(12)).toBeCloseTo(7.2);
    expect(uiTextWidth('hello', 12)).toBeCloseTo(36);
  });

  it('uiFitsText reserves panel padding', () => {
    expect(uiFitsText('hi', 12, 100)).toBe(true);
    expect(uiFitsText('hello world, this is long', 12, 40)).toBe(false);
  });

  it('uiEllipsize truncates with an ellipsis', () => {
    expect(uiEllipsize('hi', 12, 100)).toBe('hi');
    const cut = uiEllipsize('hello world', 12, 40);
    expect(cut.endsWith('\u2026')).toBe(true);
    expect(uiFitsText(cut, 12, 40)).toBe(true);
    expect(uiEllipsize('hello', 12, 0)).toBe('\u2026');
  });
});

describe('panel geometry', () => {
  it('uiCenteredPanel centers the panel', () => {
    expect(uiCenteredPanel(800, 600, 200, 100)).toEqual({ x: 300, y: 250, w: 200, h: 100 });
  });

  it('uiContains is edge-inclusive', () => {
    const rect = { x: 10, y: 10, w: 100, h: 50 };
    expect(uiContains(rect, 10, 10)).toBe(true);
    expect(uiContains(rect, 110, 60)).toBe(true);
    expect(uiContains(rect, 111, 10)).toBe(false);
  });

  it('uiOverlaps rejects touching and disjoint rects', () => {
    const a = { x: 0, y: 0, w: 50, h: 50 };
    expect(uiOverlaps(a, { x: 25, y: 25, w: 50, h: 50 })).toBe(true);
    expect(uiOverlaps(a, { x: 50, y: 0, w: 50, h: 50 })).toBe(false);
    expect(uiOverlaps(a, { x: 200, y: 200, w: 10, h: 10 })).toBe(false);
  });
});

describe('uiButtonColumn', () => {
  it('stacks buttons without overlap and flags the primary', () => {
    const buttons = uiButtonColumn(
      50,
      100,
      200,
      ['a', 'b', 'c'],
      { a: 'A', b: 'B', c: 'C' },
      32,
      8,
      'b'
    );
    expect(buttons.map((b) => b.rect.y)).toEqual([100, 140, 180]);
    expect(buttons.map((b) => b.primary)).toEqual([false, true, false]);
    for (let i = 0; i < buttons.length; i += 1) {
      for (let j = i + 1; j < buttons.length; j += 1) {
        expect(uiOverlaps(buttons[i].rect, buttons[j].rect)).toBe(false);
      }
    }
  });

  it('uiClamp pins values into range', () => {
    expect(uiClamp(5, 0, 10)).toBe(5);
    expect(uiClamp(-4, 0, 10)).toBe(0);
    expect(uiClamp(99, 0, 10)).toBe(10);
  });

  it('publishUiZones mirrors button rects', () => {
    const buttons = uiButtonColumn(50, 100, 200, ['a', 'b'], { a: 'A', b: 'B' }, 32, 8);
    const sink: { __uiZones?: { id: string; x: number; y: number; w: number; h: number }[] } = {};
    publishUiZones(sink, buttons);
    expect(sink.__uiZones).toEqual(
      buttons.map((b) => ({ id: b.id, x: b.rect.x, y: b.rect.y, w: b.rect.w, h: b.rect.h }))
    );
  });
});
