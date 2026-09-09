import type { FixtureKind } from '@kybernetes/protocol';
import type { RenderContext } from './StationModels';

/** Living fixture view in world coords (HarborViewport applies the ship offset). */
export interface LivingView {
  readonly id: string;
  readonly kind: FixtureKind;
  readonly x: number;
  readonly y: number;
  readonly integrity: number;
  readonly online: boolean;
  readonly claimedBy?: string;
  readonly progressPct?: number;
  readonly levelPct?: number;
}

function setColor(ctx: RenderContext, r: number, g: number, b: number, a = 1.0): void {
  ctx.gl.uniform4f(ctx.gl.getUniformLocation(ctx.flatProg, 'u_color'), r, g, b, a);
}

function drawProgressBar(ctx: RenderContext, x: number, y: number, w: number, pct: number): void {
  const clamped = Math.min(100, Math.max(0, pct));
  setColor(ctx, 0.06, 0.08, 0.12, 0.9);
  ctx.drawQuad(x, y, w, 4);
  setColor(ctx, 0.1, 0.9, 0.5, 0.95);
  ctx.drawQuad(x + 1, y + 1, ((w - 2) * clamped) / 100, 2);
}

function drawOfflineOverlay(
  ctx: RenderContext,
  view: LivingView,
  w: number,
  h: number,
  time: number
): void {
  if (view.integrity >= 100 && view.online) return;
  setColor(ctx, 0.02, 0.02, 0.04, view.integrity <= 0 ? 0.72 : 0.35);
  ctx.drawQuad(view.x - w / 2, view.y - h / 2, w, h);
  if (view.integrity <= 0) return;
  const spark = Math.sin(time * 17.0 + view.x) > 0.4;
  setColor(ctx, 1.0, spark ? 0.75 : 0.25, 0.1, 0.95);
  ctx.drawCircle(view.x + 8, view.y - 6, 2, 6);
}

function claimColor(claimedBy: string | undefined): [number, number, number] {
  if (claimedBy === undefined) return [0.35, 0.45, 0.6];
  let hash = 0;
  for (let i = 0; i < claimedBy.length; i += 1) hash = (hash * 31 + claimedBy.charCodeAt(i)) >>> 0;
  const palette: Array<[number, number, number]> = [
    [0.95, 0.55, 0.2],
    [0.2, 0.8, 0.6],
    [0.6, 0.45, 0.95],
    [0.95, 0.85, 0.3],
  ];
  return palette[hash % palette.length] ?? [0.35, 0.45, 0.6];
}

function renderBarCounter(ctx: RenderContext, view: LivingView, isNear: boolean): void {
  setColor(ctx, 0.23, 0.15, 0.1);
  ctx.drawQuad(view.x - 24, view.y - 10, 48, 20);
  setColor(ctx, 0.95, 0.7, 0.25, isNear ? 0.95 : 0.55);
  ctx.drawQuad(view.x - 24, view.y - 10, 48, 3);
  setColor(ctx, 0.0, 0.85, 1.0, 0.8);
  ctx.drawCircle(view.x - 12, view.y + 2, 2, 8);
  ctx.drawCircle(view.x, view.y + 2, 2, 8);
  ctx.drawCircle(view.x + 12, view.y + 2, 2, 8);
}

function renderStool(ctx: RenderContext, view: LivingView): void {
  setColor(ctx, 0.3, 0.22, 0.16);
  ctx.drawCircle(view.x, view.y, 6, 12);
  setColor(ctx, 0.5, 0.55, 0.62);
  ctx.drawQuad(view.x - 1, view.y + 6, 2, 6);
}

function renderVendingWall(ctx: RenderContext, view: LivingView, isNear: boolean): void {
  setColor(ctx, 0.14, 0.17, 0.23);
  ctx.drawQuad(view.x - 18, view.y - 14, 36, 28);
  const glow = isNear ? 0.95 : 0.6;
  setColor(ctx, 0.0, 0.9, 1.0, glow);
  ctx.drawQuad(view.x - 13, view.y - 9, 16, 4);
  setColor(ctx, 0.95, 0.7, 0.15, glow);
  ctx.drawQuad(view.x - 13, view.y - 2, 16, 4);
  setColor(ctx, 0.2, 0.95, 0.4, glow);
  ctx.drawQuad(view.x - 13, view.y + 5, 16, 4);
  setColor(ctx, 0.06, 0.08, 0.12);
  ctx.drawQuad(view.x + 7, view.y - 9, 6, 18);
}

function renderMarketStall(ctx: RenderContext, view: LivingView): void {
  setColor(ctx, 0.85, 0.6, 0.12);
  ctx.drawQuad(view.x - 22, view.y - 12, 44, 6);
  setColor(ctx, 0.35, 0.2, 0.1);
  ctx.drawQuad(view.x - 22, view.y - 6, 44, 18);
  setColor(ctx, 0.25, 0.35, 0.2);
  ctx.drawQuad(view.x - 16, view.y - 2, 12, 10);
  setColor(ctx, 0.6, 0.45, 0.25);
  ctx.drawQuad(view.x, view.y - 2, 14, 10);
}

function renderPersonalLocker(ctx: RenderContext, view: LivingView): void {
  setColor(ctx, 0.16, 0.19, 0.26);
  ctx.drawQuad(view.x - 10, view.y - 14, 20, 28);
  setColor(ctx, 0.28, 0.33, 0.42);
  ctx.drawQuad(view.x - 1, view.y - 14, 2, 28);
  const claimed = view.claimedBy !== undefined;
  setColor(ctx, claimed ? 0.2 : 0.9, claimed ? 0.95 : 0.7, 0.25, 0.9);
  ctx.drawCircle(view.x + 6, view.y - 10, 2, 8);
}

function renderStove(ctx: RenderContext, view: LivingView, isNear: boolean, time: number): void {
  setColor(ctx, 0.2, 0.22, 0.28);
  ctx.drawQuad(view.x - 18, view.y - 12, 36, 24);
  const cooking = (view.progressPct ?? 0) > 0;
  const heat = cooking ? 0.7 + 0.3 * Math.sin(time * 9.0) : 1;
  setColor(ctx, 0.9, cooking ? 0.35 * heat : 0.25, 0.12, isNear || cooking ? 0.95 : 0.5);
  ctx.drawCircle(view.x - 8, view.y, 6, 14);
  ctx.drawCircle(view.x + 8, view.y, 6, 14);
  if (cooking) drawProgressBar(ctx, view.x - 18, view.y + 15, 36, view.progressPct ?? 0);
}

function renderFreezer(ctx: RenderContext, view: LivingView): void {
  setColor(ctx, 0.55, 0.62, 0.72);
  ctx.drawQuad(view.x - 14, view.y - 14, 28, 28);
  setColor(ctx, 0.75, 0.9, 1.0, 0.85);
  ctx.drawQuad(view.x - 10, view.y - 10, 20, 8);
  const rows = Math.round(((view.levelPct ?? 0) / 100) * 4);
  setColor(ctx, 0.2, 0.5, 0.7);
  for (let i = 0; i < rows; i += 1) ctx.drawQuad(view.x - 10, view.y + 2 + i * 4, 20, 2);
}

function renderSink(ctx: RenderContext, view: LivingView, time: number): void {
  setColor(ctx, 0.6, 0.65, 0.72);
  ctx.drawQuad(view.x - 12, view.y - 8, 24, 16);
  setColor(ctx, 0.1, 0.14, 0.2);
  ctx.drawCircle(view.x, view.y + 2, 5, 12);
  const drip = (time * 2.0) % 1;
  setColor(ctx, 0.0, 0.85, 1.0, 0.8);
  ctx.drawCircle(view.x, view.y - 6 + drip * 6, 1.5, 6);
}

function renderMessTable(ctx: RenderContext, view: LivingView): void {
  setColor(ctx, 0.4, 0.3, 0.2);
  ctx.drawQuad(view.x - 22, view.y - 10, 44, 20);
  setColor(ctx, 0.55, 0.42, 0.28);
  ctx.drawQuad(view.x - 22, view.y - 10, 44, 4);
  setColor(ctx, 0.25, 0.28, 0.35);
  ctx.drawQuad(view.x - 18, view.y - 16, 8, 6);
  ctx.drawQuad(view.x + 10, view.y - 16, 8, 6);
  ctx.drawQuad(view.x - 18, view.y + 10, 8, 6);
  ctx.drawQuad(view.x + 10, view.y + 10, 8, 6);
}

function renderHydroTray(
  ctx: RenderContext,
  view: LivingView,
  isNear: boolean,
  time: number
): void {
  setColor(ctx, 0.12, 0.2, 0.16);
  ctx.drawQuad(view.x - 20, view.y - 12, 40, 24);
  const growth = (view.progressPct ?? view.levelPct ?? 0) / 100;
  const shimmer = 0.65 + 0.35 * Math.sin(time * 2.5);
  setColor(ctx, 0.15, 0.75 * shimmer + 0.2, 0.3, isNear ? 0.95 : 0.75);
  const rows = 1 + Math.round(growth * 3);
  for (let i = 0; i < rows; i += 1)
    ctx.drawQuad(view.x - 16 + i * 10, view.y - 8, 6, 6 + growth * 10);
}

function renderRecycler(ctx: RenderContext, view: LivingView, time: number): void {
  setColor(ctx, 0.15, 0.19, 0.25);
  ctx.drawCircle(view.x, view.y, 14, 20);
  setColor(ctx, 0.07, 0.1, 0.15);
  ctx.drawCircle(view.x, view.y, 10, 16);
  const angle = time * 5.0;
  setColor(ctx, 0.0, 0.85, 0.95, 0.85);
  const verts: number[] = [];
  for (let i = 0; i < 3; i += 1) {
    const a = angle + (i * Math.PI * 2) / 3;
    ctx.addThickSegment(
      verts,
      view.x,
      view.y,
      view.x + Math.cos(a) * 8,
      view.y + Math.sin(a) * 8,
      2.0
    );
  }
  ctx.bufferAndDraw(new Float32Array(verts));
  if ((view.progressPct ?? 0) > 0)
    drawProgressBar(ctx, view.x - 14, view.y + 17, 28, view.progressPct ?? 0);
}

function renderBreakerBox(ctx: RenderContext, view: LivingView): void {
  setColor(ctx, 0.2, 0.2, 0.24);
  ctx.drawQuad(view.x - 10, view.y - 14, 20, 28);
  setColor(ctx, 0.92, 0.75, 0.05);
  ctx.drawQuad(view.x - 10, view.y - 14, 20, 3);
  const live = view.online && view.integrity > 0;
  setColor(ctx, live ? 0.2 : 0.9, live ? 0.95 : 0.15, 0.2, 0.95);
  ctx.drawCircle(view.x, view.y - 6, 3, 10);
  setColor(ctx, 0.5, 0.55, 0.62);
  ctx.drawQuad(view.x - 2, live ? view.y - 2 : view.y + 2, 4, 8);
}

function renderAidCabinet(ctx: RenderContext, view: LivingView, isNear: boolean): void {
  setColor(ctx, 0.85, 0.88, 0.92);
  ctx.drawQuad(view.x - 12, view.y - 12, 24, 24);
  setColor(ctx, 0.9, 0.15, 0.2, isNear ? 1.0 : 0.8);
  ctx.drawQuad(view.x - 3, view.y - 8, 6, 16);
  ctx.drawQuad(view.x - 8, view.y - 3, 16, 6);
}

function renderClaimBunk(ctx: RenderContext, view: LivingView): void {
  setColor(ctx, 0.18, 0.2, 0.26);
  ctx.drawQuad(view.x - 22, view.y - 12, 44, 24);
  setColor(ctx, 0.72, 0.76, 0.84);
  ctx.drawQuad(view.x - 18, view.y - 9, 36, 18);
  setColor(ctx, 0.92, 0.94, 0.98);
  ctx.drawQuad(view.x - 17, view.y - 8, 8, 16);
  const [r, g, b] = claimColor(view.claimedBy);
  setColor(ctx, r, g, b);
  ctx.drawQuad(view.x - 5, view.y - 9, 23, 18);
}

// fallow-ignore-next-line complexity -- exhaustive kind dispatch, one call per branch
export function renderLivingFixtures(
  ctx: RenderContext,
  views: readonly LivingView[],
  nearestId: string | null | undefined,
  time: number
): void {
  for (const view of views) {
    if (view.kind === 'job_board') continue;
    const isNear = view.id === nearestId;
    switch (view.kind) {
      case 'bar_counter':
        renderBarCounter(ctx, view, isNear);
        break;
      case 'stool':
        renderStool(ctx, view);
        break;
      case 'vending_wall':
        renderVendingWall(ctx, view, isNear);
        break;
      case 'market_stall':
        renderMarketStall(ctx, view);
        break;
      case 'personal_locker':
        renderPersonalLocker(ctx, view);
        break;
      case 'stove':
        renderStove(ctx, view, isNear, time);
        break;
      case 'freezer':
        renderFreezer(ctx, view);
        break;
      case 'sink':
        renderSink(ctx, view, time);
        break;
      case 'mess_table':
        renderMessTable(ctx, view);
        break;
      case 'hydro_tray':
        renderHydroTray(ctx, view, isNear, time);
        break;
      case 'water_recycler':
        renderRecycler(ctx, view, time);
        break;
      case 'breaker_box':
        renderBreakerBox(ctx, view);
        break;
      case 'aid_cabinet':
        renderAidCabinet(ctx, view, isNear);
        break;
      case 'claim_bunk':
        renderClaimBunk(ctx, view);
        break;
      default:
        break;
    }
    drawOfflineOverlay(ctx, view, 40, 28, time);
  }
}

/** Outer bounds of each living fixture in frame-local coords, by room. */
export interface LivingBounds {
  readonly room: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export const LIVING_FIXTURE_BOUNDS: readonly LivingBounds[] = [
  { room: 'frachthalle', x: 336, y: 300, w: 48, h: 20 },
  { room: 'frachthalle', x: 344, y: 329, w: 12, h: 12 },
  { room: 'frachthalle', x: 364, y: 329, w: 12, h: 12 },
  { room: 'frachthalle', x: 384, y: 329, w: 12, h: 12 },
  { room: 'frachthalle', x: 482, y: 296, w: 36, h: 28 },
  { room: 'frachthalle', x: 448, y: 433, w: 44, h: 24 },
  { room: 'frachthalle', x: 305, y: 286, w: 20, h: 28 },
  { room: 'frachthalle', x: 305, y: 318, w: 20, h: 28 },
  { room: 'kajute_nord', x: 142, y: 133, w: 36, h: 31 },
  { room: 'kajute_nord', x: 192, y: 176, w: 28, h: 28 },
  { room: 'kajute_nord', x: 98, y: 134, w: 24, h: 16 },
  { room: 'kajute_nord', x: 143, y: 248, w: 44, h: 20 },
  { room: 'kajute_sued', x: 180, y: 303, w: 40, h: 24 },
  { room: 'kajute_sued', x: 186, y: 381, w: 28, h: 35 },
  { room: 'kajute_sued', x: 93, y: 400, w: 44, h: 24 },
  { room: 'kajute_sued', x: 143, y: 400, w: 44, h: 24 },
  { room: 'korridor_schiff', x: 38, y: 486, w: 20, h: 28 },
  { room: 'bruecke', x: 183, y: 13, w: 24, h: 24 },
];
