import type { RoomAtmosphereSummary } from '@kybernetes/protocol';
import { describe, expect, it } from 'vitest';
import {
  ARROW_MIN_WIND,
  BREACH_ARROW_MIN_MPS,
  buildBreachArrowVertices,
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
    expect(ids).toContain('lobby');
    expect(ids).toContain('bay');
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
    // Bridge quad (ship-side) shifts by shipDx; lobby quad (station-side) does not.
    const bridgeIndex = rects.findIndex((r) => r.id === 'bridge');
    expect(bridgeIndex).toBeGreaterThanOrEqual(0);
    expect(shifted[bridgeIndex * 36]).toBeCloseTo(plain[bridgeIndex * 36] - 1400, 6);
    // Station lobby quad keeps world coordinates: find its quad start.
    const lobbyIndex = rects.findIndex((r) => r.id === 'lobby');
    const lobbyPlainX = plain[lobbyIndex * 36];
    const lobbyShiftedX = shifted[lobbyIndex * 36];
    expect(lobbyShiftedX).toBeCloseTo(lobbyPlainX, 6);
    expect(lobbyPlainX).toBeCloseTo(0.5, 6);
  });

  it('returns transparent color when the overlay is off', () => {
    expect(getRoomColor('off', summary())).toEqual([0, 0, 0, 0]);
  });

  it('boosts alpha on venting rooms so air loss shimmers', () => {
    const rects = overlayRoomRects();
    const calm = Object.fromEntries(rects.map((r) => [r.id, summary({ roomId: r.id })]));
    const venting = Object.fromEntries(
      rects.map((r) => [r.id, summary({ roomId: r.id, isVenting: true })])
    );
    const plain = buildOverlayVertices(rects, calm, 'pressure', 1.0);
    const lit = buildOverlayVertices(rects, venting, 'pressure', 1.0);
    let calmAlpha = 0;
    let litAlpha = 0;
    for (let i = 0; i < plain.length; i += 6) calmAlpha = Math.max(calmAlpha, plain[i + 5] ?? 0);
    for (let i = 0; i < lit.length; i += 6) litAlpha = Math.max(litAlpha, lit[i + 5] ?? 0);
    expect(litAlpha).toBeGreaterThan(calmAlpha);
  });

  it('draws throat arrows for rushing breaches only', () => {
    const breach = {
      id: 'breach.ship.bridge.1.0',
      frameId: 'ship',
      roomA: 'ship.bridge',
      roomB: 'space',
      areaM2: 1.2,
      bornTick: 1,
      ageTicks: 5,
      x1: 100,
      y1: 200,
      x2: 124,
      y2: 200,
      cx: 112,
      cy: 200,
      nx: 0,
      ny: -1,
      lenPx: 24,
      isHull: true,
      sizeClass: 'breach' as const,
    };
    expect(buildBreachArrowVertices([breach], [], 1.0)).toEqual([]);
    expect(
      buildBreachArrowVertices(
        [breach],
        [{ portalId: breach.id, velocityMps: BREACH_ARROW_MIN_MPS - 0.5 }],
        1.0
      )
    ).toEqual([]);
    const rushing = buildBreachArrowVertices(
      [breach],
      [{ portalId: breach.id, velocityMps: 20 }],
      1.0,
      1400
    );
    // Shaft quad (6 verts) plus head triangle (3 verts), ship-offset downstream.
    expect(rushing.length / 6).toBe(9);
    let minY = Infinity;
    for (let i = 0; i < rushing.length; i += 6) minY = Math.min(minY, rushing[i + 1] ?? 0);
    expect(minY).toBeLessThan(200);
    let maxX = -Infinity;
    for (let i = 0; i < rushing.length; i += 6) maxX = Math.max(maxX, rushing[i] ?? 0);
    expect(maxX).toBeGreaterThan(1400);
  });
});
