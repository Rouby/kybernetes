import { describe, expect, it, vi } from 'vitest';
import { chartSceneViewOf, chevronVerts, circlePolyline, renderChartScene } from './ChartScene';
import type { RenderContext } from './StationModels';

function mockCtx() {
  return {
    gl: { uniform4f: vi.fn(), getUniformLocation: () => ({}) },
    flatProg: {},
    drawQuad: vi.fn(),
    drawCircle: vi.fn(),
    addThickSegment: vi.fn(),
    bufferAndDraw: vi.fn(),
  } as unknown as RenderContext;
}

function view() {
  return chartSceneViewOf({
    rect: { x: 70, y: 108, w: 824, h: 572 },
    center: { x: 482, y: 394 },
    starR: 16,
    rings: [50, 130],
    moonOrbits: [{ x: 400, y: 394, r: 24 }],
    route: [
      { x: 400, y: 394 },
      { x: 560, y: 300 },
    ],
    ticks: [{ x: 480, y: 350 }],
    previewRoute: [],
    flips: [{ x: 480, y: 350 }],
    flipIndices: [1],
    wells: [{ x: 482, y: 394, r: 37 }],
    intercept: [],
    adrift: false,
    burns: [
      { x: 400, y: 394, angle: 0, kind: 'pro', size: 9 },
      { x: 560, y: 300, angle: 0, kind: 'retro', size: 9 },
    ],
    nodes: [
      { x: 400, y: 394, r: 11, fill: [0.1, 0.3, 0.5] as const, ring: [0, 0.9, 1] as const },
      { x: 560, y: 300, r: 8, fill: [0.45, 0.3, 0.1] as const, ring: [0.4, 0.44, 0.5] as const },
    ],
    ship: { x: 400, y: 394 },
  });
}

describe('circlePolyline', () => {
  it('closes the loop with finite segments', () => {
    const lines = circlePolyline(10, 20, 5, 8);
    expect(lines).toHaveLength(8);
    const first = lines[0];
    const last = lines[lines.length - 1];
    if (first === undefined || last === undefined) throw new Error('segment missing');
    expect(first[0]).toBeCloseTo(15, 5);
    expect(last[2]).toBeCloseTo(15, 5);
    for (const [x1, y1, x2, y2] of lines) {
      for (const v of [x1, y1, x2, y2]) expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('floors degenerate segment counts', () => {
    expect(circlePolyline(0, 0, 5, 0)).toHaveLength(8);
  });
});

describe('chartSceneViewOf', () => {
  it('derives status rings from marker radii', () => {
    const scene = view();
    expect(scene.nodes[0]).toMatchObject({ dotR: 11, ringR: 18 });
    expect(scene.nodes[1]).toMatchObject({ dotR: 8, ringR: 15 });
    expect(scene.route).toHaveLength(2);
  });
});

describe('renderChartScene', () => {
  it('paints star, rings, route, nodes, and ship', () => {
    const ctx = mockCtx();
    renderChartScene(ctx, view());
    const circles = vi.mocked(ctx.drawCircle).mock.calls;
    // star x2 + well disc x1 + tick x1 + node dots x2 + ship dot x1
    expect(circles.length).toBe(7);
    const segments = vi.mocked(ctx.addThickSegment).mock.calls.length;
    // rings 2x48 + moon orbit 48 + route 1 + node rings 2x32 + ship ring 24 + well rim 40
    expect(segments).toBe(96 + 48 + 1 + 64 + 24 + 40);
    const colors = vi.mocked(ctx.gl.uniform4f).mock.calls;
    expect(colors.some((args) => args[1] === 1 && args[2] === 0.88 && args[3] === 0.66)).toBe(true);
    expect(colors.some((args) => args[1] === 1 && args[2] === 0.72 && args[3] === 0.3)).toBe(true);
  });

  it('splits boost and braking runs at flips', () => {
    const ctx = mockCtx();
    const scene = view();
    const route = [0, 1, 2, 3].map((i) => ({ x: i * 10, y: 0 }));
    renderChartScene(ctx, { ...scene, route, flipIndices: [2] });
    const colors = vi.mocked(ctx.gl.uniform4f).mock.calls;
    const has = (r: number, g: number, b: number) =>
      colors.some((args) => args[1] === r && args[2] === g && args[3] === b);
    expect(has(0, 0.9, 1)).toBe(true);
    expect(has(1, 0.72, 0.3)).toBe(true);
  });

  it('dims the committed route adrift with an amber intercept', () => {
    const ctx = mockCtx();
    const scene = view();
    renderChartScene(ctx, {
      ...scene,
      adrift: true,
      intercept: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
    });
    const colors = vi.mocked(ctx.gl.uniform4f).mock.calls;
    expect(colors.some((args) => args[1] === 0.35 && args[2] === 0.42 && args[3] === 0.5)).toBe(
      true
    );
    expect(colors.some((args) => args[4] === 0.8)).toBe(true);
  });

  it('aims chevrons along travel and flips retroburns', () => {
    const pro = chevronVerts(0, 0, 0, 10, 1);
    expect(pro[0]).toBeGreaterThan(0);
    const retro = chevronVerts(0, 0, 0, 10, -1);
    expect(retro[0]).toBeLessThan(0);
    for (const v of [...pro, ...retro]) expect(Number.isFinite(v)).toBe(true);
  });

  it('skips the route line without a chain', () => {
    const ctx = mockCtx();
    const scene = view();
    renderChartScene(ctx, { ...scene, route: [scene.route[0]!], ticks: [], burns: [] });
    const circles = vi.mocked(ctx.drawCircle).mock.calls;
    // star x2 + well disc x1 + node dots x2 + ship dot x1 (no route dots)
    expect(circles.length).toBe(6);
  });

  it('dashes the drafted ghost under the committed route', () => {
    const ctx = mockCtx();
    const scene = view();
    const ghost = Array.from({ length: 8 }, (_, i) => ({ x: i * 10, y: i * 5 }));
    renderChartScene(ctx, { ...scene, route: [], ticks: [], burns: [], previewRoute: ghost });
    const colors = vi.mocked(ctx.gl.uniform4f).mock.calls;
    expect(colors.some((args) => args[4] === 0.35)).toBe(true);
    // 8 ghost points draft 7 segments, dashed down to 4 draw calls.
    const before = vi.mocked(ctx.addThickSegment).mock.calls.length;
    expect(before).toBe(96 + 48 + 64 + 24 + 40 + 4);
  });

  it('guards degenerate rects', () => {
    const ctx = mockCtx();
    const scene = view();
    renderChartScene(ctx, { ...scene, rect: { x: 0, y: 0, w: 0, h: 0 } });
    expect(vi.mocked(ctx.drawCircle)).not.toHaveBeenCalled();
    renderChartScene(ctx, { ...scene, rect: { x: 0, y: 0, w: Number.NaN, h: 10 } });
    expect(vi.mocked(ctx.drawCircle)).not.toHaveBeenCalled();
  });
});
