import type { RoomAtmosphereSummary } from '@kybernetes/protocol';
import { describe, expect, it } from 'vitest';
import {
  ARROW_MIN_WIND,
  buildOverlayVertices,
  getRoomColor,
  overlayRoomRects,
} from './atmosOverlayGeometry';

function summary(over: Partial<RoomAtmosphereSummary> = {}): RoomAtmosphereSummary {
  return {
    roomId: 'engineering',
    pressureKpa: 101.3,
    o2Percent: 20.9,
    co2Ppm: 400,
    tempCelsius: 21.0,
    toxicSmokePercent: 0,
    isVenting: false,
    activeFires: 0,
    activeBreaches: 0,
    windX: 0,
    windY: 0,
    ...over,
  };
}

describe('atmos overlay geometry', () => {
  it('covers ship rooms, corridor thirds, and station rooms without a corridor parent', () => {
    const ids = overlayRoomRects().map((r) => r.id);
    expect(ids).toContain('bridge');
    expect(ids).toContain('corridor_fwd');
    expect(ids).toContain('corridor_mid');
    expect(ids).toContain('corridor_aft');
    expect(ids).toContain('station_lobby');
    expect(ids).toContain('station_bay');
    expect(ids).toContain('gauntlet');
    expect(ids).not.toContain('corridor');
  });

  it('emits one quad per room and no arrows in calm air', () => {
    const rects = overlayRoomRects();
    const summaries = Object.fromEntries(rects.map((r) => [r.id, summary({ roomId: r.id })]));
    const verts = buildOverlayVertices(rects, summaries, 'o2', 1.0);
    expect(verts.length / 6).toBe(rects.length * 6);
  });

  it('emits a drag arrow pointing along room wind', () => {
    const rects = overlayRoomRects();
    const summaries = Object.fromEntries(rects.map((r) => [r.id, summary({ roomId: r.id })]));
    summaries.engineering = summary({ roomId: 'engineering', windX: 100, windY: 0 });
    const verts = buildOverlayVertices(rects, summaries, 'pressure', 1.0);
    // One extra shaft quad (6) plus head triangle (3) for the windy room.
    expect(verts.length / 6).toBe(rects.length * 6 + 9);

    const eng = rects.find((r) => r.id === 'engineering') ?? { x: 0, w: 0 };
    const cx = eng.x + eng.w / 2;
    const arrowTipX = cx + Math.min(70, Math.max(14, 100 * 0.35)) / 2;
    let maxArrowX = -Infinity;
    for (let i = 0; i < verts.length; i += 6) {
      const [x, _y, r, g, b] = [verts[i], verts[i + 1], verts[i + 2], verts[i + 3], verts[i + 4]];
      void _y;
      if (Math.abs(r - 0.75) < 1e-9 && Math.abs(g - 0.97) < 1e-9 && Math.abs(b - 1.0) < 1e-9) {
        maxArrowX = Math.max(maxArrowX, x);
      }
    }
    expect(maxArrowX).toBeCloseTo(arrowTipX, 6);
    expect(maxArrowX).toBeGreaterThan(cx);
  });

  it('emits no arrow below the wind threshold', () => {
    const rects = overlayRoomRects();
    const summaries = Object.fromEntries(rects.map((r) => [r.id, summary({ roomId: r.id })]));
    summaries.cargo = summary({ roomId: 'cargo', windX: ARROW_MIN_WIND - 1, windY: 0 });
    const verts = buildOverlayVertices(rects, summaries, 'o2', 1.0);
    expect(verts.length / 6).toBe(rects.length * 6);
  });

  it('offsets ship rooms with the hull while station rooms stay fixed', () => {
    const rects = overlayRoomRects();
    const summaries = Object.fromEntries(rects.map((r) => [r.id, summary({ roomId: r.id })]));
    const plain = buildOverlayVertices(rects, summaries, 'o2', 1.0);
    const shifted = buildOverlayVertices(rects, summaries, 'o2', 1.0, -1400);
    // First quad belongs to the first rect (bridge, ship-side): x shifts by shipDx.
    expect(shifted[0]).toBeCloseTo(plain[0] - 1400, 6);
    // Station lobby quad keeps world coordinates: find its quad start.
    const lobbyIndex = rects.findIndex((r) => r.id === 'station_lobby');
    const lobbyPlainX = plain[lobbyIndex * 36];
    const lobbyShiftedX = shifted[lobbyIndex * 36];
    expect(lobbyShiftedX).toBeCloseTo(lobbyPlainX, 6);
    expect(lobbyPlainX).toBeCloseTo(120.5, 6);
  });

  it('returns transparent color when the overlay is off', () => {
    expect(getRoomColor('off', summary())).toEqual([0, 0, 0, 0]);
  });
});
