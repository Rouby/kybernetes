import { HesperiaV2Spec, StationHubSpec } from '@kybernetes/sim-core';
import { describe, expect, it, vi } from 'vitest';
import {
  type ClutterRoom,
  clutterBitsFor,
  POSTER_H,
  POSTER_W,
  renderClutter,
  VENT_H,
  VENT_W,
} from './Clutter';
import type { RenderContext } from './StationModels';

function rooms(): ClutterRoom[] {
  return [...StationHubSpec.rooms, ...HesperiaV2Spec.rooms].map((room) => ({
    id: room.id,
    x: room.rect.x,
    y: room.rect.y,
    w: room.rect.w,
    h: room.rect.h,
  }));
}

function boundsOf(
  room: ClutterRoom,
  index: number
): { x: number; y: number; w: number; h: number } {
  const bits = clutterBitsFor(room);
  const bit = bits[index];
  if (bit === undefined) throw new Error('missing bit');
  if (bit.kind === 'pipe') {
    return {
      x: Math.min(bit.x1, bit.x2),
      y: Math.min(bit.y1, bit.y2),
      w: Math.abs(bit.x2 - bit.x1),
      h: Math.abs(bit.y2 - bit.y1),
    };
  }
  if (bit.kind === 'crate') return { x: bit.x, y: bit.y, w: bit.s, h: bit.s };
  if (bit.kind === 'poster') return { x: bit.x, y: bit.y, w: POSTER_W, h: POSTER_H };
  return { x: bit.x, y: bit.y, w: VENT_W, h: VENT_H };
}

describe('clutterBitsFor', () => {
  it('keeps every bit inside its room rect', () => {
    for (const room of rooms()) {
      const bits = clutterBitsFor(room);
      expect(bits.length).toBeGreaterThan(0);
      for (let i = 0; i < bits.length; i += 1) {
        const b = boundsOf(room, i);
        expect(b.x).toBeGreaterThanOrEqual(room.x);
        expect(b.y).toBeGreaterThanOrEqual(room.y);
        expect(b.x + b.w).toBeLessThanOrEqual(room.x + room.w);
        expect(b.y + b.h).toBeLessThanOrEqual(room.y + room.h);
      }
    }
  });

  it('is deterministic per room', () => {
    for (const room of rooms()) {
      expect(clutterBitsFor(room)).toEqual(clutterBitsFor(room));
    }
  });

  it('keeps crates out of walkways', () => {
    for (const room of rooms()) {
      const crates = clutterBitsFor(room).filter((bit) => bit.kind === 'crate');
      if (room.id.includes('korridor') || room.id.includes('andock') || room.id.includes('tube')) {
        expect(crates).toEqual([]);
      }
    }
    const hall = rooms().find((room) => room.id === 'frachthalle');
    if (hall === undefined) throw new Error('missing frachthalle');
    expect(clutterBitsFor(hall).some((bit) => bit.kind === 'crate')).toBe(true);
  });
});

describe('renderClutter', () => {
  it('draws without live GL', () => {
    const quads = vi.fn();
    const ctx = {
      gl: { uniform4f: vi.fn(), getUniformLocation: vi.fn().mockReturnValue(null) },
      flatProg: {},
      drawQuad: quads,
      drawCircle: vi.fn(),
      addThickSegment: vi.fn(),
      bufferAndDraw: vi.fn(),
    } as unknown as RenderContext;
    renderClutter(ctx, rooms(), 1.5);
    expect(quads.mock.calls.length).toBeGreaterThan(rooms().length);
  });
});
