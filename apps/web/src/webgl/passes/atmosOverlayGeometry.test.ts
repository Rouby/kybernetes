import type { RoomAtmosphereSummary } from '@kybernetes/protocol';
import { describe, expect, it } from 'vitest';
import { buildOverlayVertices, getRoomColor, overlayRoomRects } from './atmosOverlayGeometry';

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

  it('emits no wind arrows even for strong room wind', () => {
    const rects = overlayRoomRects();
    const summaries = Object.fromEntries(rects.map((r) => [r.id, summary({ roomId: r.id })]));
    summaries.engineering = summary({ roomId: 'engineering', windX: 100, windY: 0 });
    const verts = buildOverlayVertices(rects, summaries, 'o2', 1.0);
    expect(verts.length / 6).toBe(rects.length * 6);
  });

  it('renders pressure and temp modes transparent', () => {
    expect(getRoomColor('pressure', summary())).toEqual([0, 0, 0, 0]);
    expect(getRoomColor('temp', summary())).toEqual([0, 0, 0, 0]);
    const rects = overlayRoomRects();
    const summaries = Object.fromEntries(rects.map((r) => [r.id, summary({ roomId: r.id })]));
    expect(buildOverlayVertices(rects, summaries, 'pressure', 1.0)).toEqual([]);
    expect(buildOverlayVertices(rects, summaries, 'temp', 1.0)).toEqual([]);
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
    const plain = buildOverlayVertices(rects, calm, 'o2', 1.0);
    const lit = buildOverlayVertices(rects, venting, 'o2', 1.0);
    let calmAlpha = 0;
    let litAlpha = 0;
    for (let i = 0; i < plain.length; i += 6) calmAlpha = Math.max(calmAlpha, plain[i + 5] ?? 0);
    for (let i = 0; i < lit.length; i += 6) litAlpha = Math.max(litAlpha, lit[i + 5] ?? 0);
    expect(litAlpha).toBeGreaterThan(calmAlpha);
  });
});
