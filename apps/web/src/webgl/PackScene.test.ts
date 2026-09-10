import { describe, expect, it, vi } from 'vitest';
import { backPanelFor, renderPackScene, screenOrthoMatrix } from './PackScene';
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

describe('screenOrthoMatrix', () => {
  it('maps screen pixels to NDC with y down', () => {
    const m = screenOrthoMatrix(800, 600);
    const apply = (x: number, y: number): [number, number] => [
      m[0]! * x + m[3]! * y + m[6]!,
      m[1]! * x + m[4]! * y + m[7]!,
    ];
    expect(apply(0, 0)[0]).toBeCloseTo(-1, 5);
    expect(apply(0, 0)[1]).toBeCloseTo(1, 5);
    expect(apply(800, 600)[0]).toBeCloseTo(1, 5);
    expect(apply(800, 600)[1]).toBeCloseTo(-1, 5);
    expect(apply(400, 300)[0]).toBeCloseTo(0, 5);
    expect(apply(400, 300)[1]).toBeCloseTo(0, 5);
  });

  it('guards degenerate sizes', () => {
    const m = screenOrthoMatrix(0, 0);
    for (const v of m) expect(Number.isFinite(v)).toBe(true);
  });
});

describe('backPanelFor', () => {
  it('spans post tops to floor top', () => {
    const panel = backPanelFor({ x: 204, y: 190, w: 120, h: 80 }, [
      { x: 186, y: 270, w: 156, h: 18 },
      { x: 186, y: 142, w: 18, h: 128 },
      { x: 306, y: 142, w: 18, h: 128 },
    ]);
    expect(panel).toEqual({ x: 204, y: 142, w: 120, h: 128 });
  });

  it('falls back to the crate rect without walls', () => {
    expect(backPanelFor({ x: 1, y: 2, w: 3, h: 4 }, [])).toEqual({ x: 1, y: 2, w: 3, h: 4 });
  });
});

describe('renderPackScene', () => {
  const scene = {
    rect: { x: 0, y: 0, w: 480, h: 360 },
    walls: [{ x: 180, y: 190, w: 168, h: 24 }],
    crate: { x: 204, y: 190, w: 120, h: 80 },
    sealReady: false,
  };

  it('paints the interior planks under settled bodies', () => {
    const ctx = mockCtx();
    renderPackScene(ctx, {
      ...scene,
      bodies: [
        {
          id: 1,
          goodId: 'scrap',
          x: 240,
          y: 250,
          angle: 0,
          w: 50,
          h: 40,
          held: false,
          inside: true,
          settled: true,
        },
      ],
    });
    expect(ctx.drawQuad).toHaveBeenCalled();
    expect(ctx.bufferAndDraw).toHaveBeenCalled();
  });

  it('outlines settled bodies left outside the crate', () => {
    const plain = mockCtx();
    renderPackScene(plain, {
      ...scene,
      bodies: [
        {
          id: 1,
          goodId: 'scrap',
          x: 240,
          y: 250,
          angle: 0,
          w: 50,
          h: 40,
          held: false,
          inside: true,
          settled: true,
        },
      ],
    });
    const stray = mockCtx();
    renderPackScene(stray, {
      ...scene,
      bodies: [
        {
          id: 2,
          goodId: 'scrap',
          x: 420,
          y: 300,
          angle: 0,
          w: 50,
          h: 40,
          held: false,
          inside: false,
          settled: true,
        },
      ],
    });
    const plainSegments = (plain.addThickSegment as ReturnType<typeof vi.fn>).mock.calls.length;
    const straySegments = (stray.addThickSegment as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(straySegments).toBeGreaterThan(plainSegments);
    const strayColor = (stray.gl.uniform4f as ReturnType<typeof vi.fn>).mock.calls;
    expect(strayColor.some((args) => args[1] === 1.0 && args[2] === 0.22 && args[3] === 0.28)).toBe(
      true
    );
  });

  it('leaves the resting lid unmarked', () => {
    const plain = mockCtx();
    renderPackScene(plain, {
      ...scene,
      bodies: [
        {
          id: 1,
          goodId: 'scrap',
          x: 240,
          y: 250,
          angle: 0,
          w: 50,
          h: 40,
          held: false,
          inside: true,
          settled: true,
        },
      ],
    });
    const lidCtx = mockCtx();
    renderPackScene(lidCtx, {
      ...scene,
      bodies: [
        {
          id: 3,
          goodId: 'lid',
          x: 420,
          y: 300,
          angle: 0,
          w: 150,
          h: 14,
          held: false,
          inside: false,
          settled: true,
        },
      ],
    });
    const plainSegments = (plain.addThickSegment as ReturnType<typeof vi.fn>).mock.calls.length;
    const lidSegments = (lidCtx.addThickSegment as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(lidSegments).toBe(plainSegments);
  });
});
