import type { AtmosOverlayMode, RoomAtmosphereSummary } from '@kybernetes/protocol';
import { HESPERIA_ROOMS } from '@kybernetes/sim-core';

export interface OverlayRoomRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  side: 'ship' | 'station';
}

const STATION_RECT_IDS = new Set(['gauntlet', 'lobby', 'bay']);

function rectSide(id: string): 'ship' | 'station' {
  return STATION_RECT_IDS.has(id) ? 'station' : 'ship';
}

export function overlayRoomRects(): OverlayRoomRect[] {
  const rects: OverlayRoomRect[] = [];
  for (const r of HESPERIA_ROOMS) {
    if (r.id === 'corridor') {
      rects.push({ id: 'corridor_fwd', x: 100, y: 320, w: 260, h: 80, side: 'ship' });
      rects.push({ id: 'corridor_mid', x: 360, y: 320, w: 260, h: 80, side: 'ship' });
      rects.push({ id: 'corridor_aft', x: 620, y: 320, w: 260, h: 80, side: 'ship' });
      continue;
    }
    rects.push({ id: r.id, x: r.x, y: r.y, w: r.width, h: r.height, side: rectSide(r.id) });
  }
  return rects;
}

function getO2Color(o2: number): [number, number, number, number] {
  if (o2 < 1.0) return [0.35, 0.05, 0.45, 0.55];
  if (o2 < 15.0) return [0.95, 0.15, 0.2, 0.5];
  if (o2 < 19.5) return [0.95, 0.7, 0.1, 0.38];
  return [0.0, 0.85, 0.7, 0.28];
}

export function getRoomColor(
  mode: AtmosOverlayMode,
  summary: RoomAtmosphereSummary | undefined
): [number, number, number, number] {
  if (mode === 'o2') return getO2Color(summary?.o2Percent ?? 20.9);
  // The renderer has no pressure/temp tint: those modes stay transparent.
  return [0, 0, 0, 0];
}

function pushVertex(
  out: number[],
  x: number,
  y: number,
  color: [number, number, number, number]
): void {
  out.push(x, y, color[0], color[1], color[2], color[3]);
}

export function buildOverlayVertices(
  rects: OverlayRoomRect[],
  summaries: Record<string, RoomAtmosphereSummary> | undefined,
  mode: AtmosOverlayMode,
  pulse: number,
  shipDx = 0
): number[] {
  const out: number[] = [];
  for (const rect of rects) {
    const summary = summaries?.[rect.id];
    const [r, g, b, a] = getRoomColor(mode, summary);
    const dx = rect.side === 'ship' ? shipDx : 0;
    if (a > 0) {
      const x1 = rect.x + dx + 0.5;
      const y1 = rect.y + 0.5;
      const x2 = rect.x + dx + rect.w - 0.5;
      const y2 = rect.y + rect.h - 0.5;
      const ventShimmer = summary?.isVenting === true ? 0.1 * pulse : 0;
      const color: [number, number, number, number] = [
        r,
        g,
        b,
        Math.min(0.85, a * pulse + ventShimmer),
      ];
      pushVertex(out, x1, y1, color);
      pushVertex(out, x2, y1, color);
      pushVertex(out, x1, y2, color);
      pushVertex(out, x1, y2, color);
      pushVertex(out, x2, y1, color);
      pushVertex(out, x2, y2, color);
    }
  }
  return out;
}
