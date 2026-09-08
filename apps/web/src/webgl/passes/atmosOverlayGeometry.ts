import type { AirFlow, AtmosOverlayMode, RoomAtmosphereSummary } from '@kybernetes/protocol';
import { type BreachRenderModel, HESPERIA_ROOMS } from '@kybernetes/sim-core';

export const BREACH_ARROW_MIN_MPS = 3;

export interface OverlayRoomRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  side: 'ship' | 'station';
}

export const ARROW_MIN_WIND = 8;
const ARROW_COLOR: [number, number, number, number] = [0.75, 0.97, 1.0, 0.9];

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

function getTempColor(temp: number): [number, number, number, number] {
  if (temp < 0) return [0.1, 0.6, 1.0, 0.48];
  if (temp < 17) return [0.1, 0.8, 0.9, 0.32];
  if (temp <= 25) return [0.1, 0.85, 0.4, 0.25];
  if (temp <= 45) return [0.95, 0.65, 0.1, 0.38];
  return [1.0, 0.2, 0.1, 0.55];
}

function getPressureColor(pressure: number): [number, number, number, number] {
  if (pressure < 20) return [0.35, 0.15, 0.55, 0.5];
  if (pressure < 75) return [0.1, 0.5, 0.85, 0.38];
  if (pressure <= 105) return [0.0, 0.85, 0.7, 0.25];
  return [0.8, 0.2, 0.9, 0.45];
}

export function getRoomColor(
  mode: AtmosOverlayMode,
  summary: RoomAtmosphereSummary | undefined
): [number, number, number, number] {
  if (mode === 'o2') return getO2Color(summary?.o2Percent ?? 20.9);
  if (mode === 'temp') return getTempColor(summary?.tempCelsius ?? 21.0);
  if (mode === 'pressure') return getPressureColor(summary?.pressureKpa ?? 101.3);
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

function pushArrowHead(
  out: number[],
  tipX: number,
  tipY: number,
  dirX: number,
  dirY: number,
  color: [number, number, number, number]
): void {
  const headLen = 9;
  const headHalf = 5;
  const baseX = tipX - dirX * headLen;
  const baseY = tipY - dirY * headLen;
  pushVertex(out, tipX, tipY, color);
  pushVertex(out, baseX - dirY * headHalf, baseY + dirX * headHalf, color);
  pushVertex(out, baseX + dirY * headHalf, baseY - dirX * headHalf, color);
}

function pushDragArrow(
  out: number[],
  cx: number,
  cy: number,
  windX: number,
  windY: number,
  alpha: number
): void {
  const mag = Math.hypot(windX, windY);
  if (mag < ARROW_MIN_WIND) return;
  const dirX = windX / mag;
  const dirY = windY / mag;
  const len = Math.min(70, Math.max(14, mag * 0.35));
  const half = 2.5;
  const perpX = -dirY;
  const perpY = dirX;
  const tailX = cx - (dirX * len) / 2;
  const tailY = cy - (dirY * len) / 2;
  const tipX = cx + (dirX * len) / 2;
  const tipY = cy + (dirY * len) / 2;
  const [r, g, b, a] = ARROW_COLOR;
  const color: [number, number, number, number] = [r, g, b, a * alpha];
  pushVertex(out, tailX + perpX * half, tailY + perpY * half, color);
  pushVertex(out, tailX - perpX * half, tailY - perpY * half, color);
  pushVertex(out, tipX + perpX * half, tipY + perpY * half, color);
  pushVertex(out, tipX + perpX * half, tipY + perpY * half, color);
  pushVertex(out, tailX - perpX * half, tailY - perpY * half, color);
  pushVertex(out, tipX - perpX * half, tipY - perpY * half, color);
  pushArrowHead(out, tipX, tipY, dirX, dirY, color);
}

/** Throat arrows: one per rushing breach, drawn downstream of the gap. */
export function buildBreachArrowVertices(
  breaches: readonly BreachRenderModel[],
  flows: readonly AirFlow[] | undefined,
  pulse: number,
  shipDx = 0
): number[] {
  const table = new Map((flows ?? []).map((flow) => [flow.portalId, flow.velocityMps]));
  const out: number[] = [];
  for (const breach of breaches) {
    const velocity = table.get(breach.id) ?? 0;
    if (Math.abs(velocity) < BREACH_ARROW_MIN_MPS) continue;
    const sign = velocity >= 0 ? 1 : -1;
    const dirX = breach.nx * sign;
    const dirY = breach.ny * sign;
    const dx = breach.frameId === 'ship' ? shipDx : 0;
    pushDragArrow(
      out,
      breach.cx + dx + dirX * 16,
      breach.cy + dirY * 16,
      dirX * 60,
      dirY * 60,
      pulse
    );
  }
  return out;
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
    const windX = summary?.windX ?? 0;
    const windY = summary?.windY ?? 0;
    if (Math.hypot(windX, windY) >= ARROW_MIN_WIND) {
      pushDragArrow(out, rect.x + dx + rect.w / 2, rect.y + rect.h / 2, windX, windY, pulse);
    }
  }
  return out;
}
