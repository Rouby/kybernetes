import { describe, expect, it, vi } from 'vitest';
import {
  type Camera,
  cameraFor,
  nearestPawn,
  paintDecals,
  paintImpacts,
  paintRoomLabel,
  paintShipMarker,
  toScreen,
} from './debugPaint';
import type { DebugPawn, DebugRoom } from './debugWorld';

function stubCtx(): CanvasRenderingContext2D {
  return {
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    fillText: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

const canvas = { width: 800, height: 600 } as HTMLCanvasElement;
const camera: Camera = { x: 0, y: 0, scale: 1 };

function room(over: Partial<DebugRoom> = {}): DebugRoom {
  return {
    id: 'station.habitat',
    frameId: 'station',
    x: 0,
    y: 0,
    w: 320,
    h: 200,
    pressureKpa: 101.3,
    tempCelsius: 21,
    o2Percent: 20.9,
    co2Ppm: 400,
    repressurizing: false,
    venting: false,
    ...over,
  };
}

describe('toScreen', () => {
  it('centers the camera on the canvas', () => {
    expect(toScreen(canvas, camera, 0, 0)).toEqual({ x: 400, y: 300 });
  });
});

describe('cameraFor', () => {
  it('follows the watched pawn', () => {
    const pawns: DebugPawn[] = [
      { id: 'p1', x: 10, y: 20, facing: 0, color: '#fff', roomHint: 'r', isOwn: true },
    ];
    expect(cameraFor(canvas, [], pawns, 'p1')).toMatchObject({ x: 10, y: 20 });
  });

  it('falls back to origin without rooms', () => {
    expect(cameraFor(canvas, [], [], null)).toMatchObject({ x: 0, y: 0 });
  });
});

describe('nearestPawn', () => {
  const pawns: DebugPawn[] = [
    { id: 'p1', x: 100, y: 100, facing: 0, color: '#fff', roomHint: 'r', isOwn: true },
    { id: 'p2', x: 500, y: 500, facing: 0, color: '#fff', roomHint: 'r', isOwn: false },
  ];
  const at = (pawn: DebugPawn): { x: number; y: number } => ({ x: pawn.x, y: pawn.y });

  it('returns null without pawns in radius', () => {
    expect(nearestPawn([], at, 100, 100)).toBeNull();
    expect(nearestPawn(pawns, at, 300, 300)).toBeNull();
  });

  it('picks the closest pawn in radius', () => {
    expect(nearestPawn(pawns, at, 110, 105)).toBe('p1');
    expect(nearestPawn(pawns, at, 505, 495)).toBe('p2');
  });
});

describe('paintImpacts', () => {
  it('draws nothing without a snapshot', () => {
    const ctx = stubCtx();
    paintImpacts(ctx, canvas, camera, null);
    expect(vi.mocked(ctx.stroke)).not.toHaveBeenCalled();
  });

  it('skips misses and draws kinetic hits', () => {
    const ctx = stubCtx();
    paintImpacts(ctx, canvas, camera, {
      impacts: [
        { frameId: 'ship', x: 1, y: 1, kind: 'miss' },
        { frameId: 'ship', x: 10, y: 20, kind: 'pawn', weapon: 'kinetic_carbine' },
      ],
    } as never);
    expect(vi.mocked(ctx.stroke)).toHaveBeenCalled();
    expect(vi.mocked(ctx.arc)).toHaveBeenCalled();
  });
});

describe('paintDecals', () => {
  it('draws nothing without decals', () => {
    const ctx = stubCtx();
    paintDecals(ctx, canvas, camera, null);
    paintDecals(ctx, canvas, camera, { decals: undefined } as never);
    expect(vi.mocked(ctx.fill)).not.toHaveBeenCalled();
  });

  it('paints scorch rings for decals', () => {
    const ctx = stubCtx();
    paintDecals(ctx, canvas, camera, {
      decals: [{ frameId: 'ship', x: 5, y: 5, radius: 4 }],
    } as never);
    expect(vi.mocked(ctx.fill)).toHaveBeenCalled();
    expect(vi.mocked(ctx.stroke)).toHaveBeenCalled();
  });
});

describe('paintRoomLabel', () => {
  it('labels wide rooms and skips slivers', () => {
    const ctx = stubCtx();
    paintRoomLabel(ctx, room(), 0, 0, 320);
    expect(vi.mocked(ctx.fillText)).toHaveBeenCalled();
    const narrow = stubCtx();
    paintRoomLabel(narrow, room(), 0, 0, 4);
    expect(vi.mocked(narrow.fillText)).not.toHaveBeenCalled();
  });
});

describe('paintShipMarker', () => {
  it('stays quiet while following or without a bearing', () => {
    const ctx = stubCtx();
    paintShipMarker(ctx, canvas, [room()], 'p1');
    paintShipMarker(ctx, canvas, [], null);
    expect(vi.mocked(ctx.fillText)).not.toHaveBeenCalled();
  });
});
