/**
 * Client bullet prediction: locally fired rounds fly immediately instead of
 * waiting a snapshot round-trip for the server. The server stays
 * authoritative: predictions that match an authoritative projectile are
 * dropped in its favour, refused shots are cleared on the FIRE_* notice,
 * and anything unconfirmed expires past projectile life. Pure helpers plus
 * the viewport-owned live list; unit-tested.
 */

import { FIXED_DT, PROJECTILE_LIFE_TICKS, PROJECTILE_SPEED } from '@kybernetes/sim-core';

export interface PredictedShot {
  readonly id: number;
  readonly frameId: string;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly bornMs: number;
  readonly weapon: string;
}

export interface ServerShotView {
  readonly frameId: string;
  readonly x: number;
  readonly y: number;
}

/** Server muzzle sits at pawn radius (12) plus 4px along the aim. */
const MUZZLE_OFFSET = 16;
/** A prediction inside this radius of authority was confirmed: drop it. */
const CONFIRM_PX = 48;
/** Life plus one snapshot period of grace for slow confirmations. */
const LIFE_GRACE_MS = 150;

export function shotLifeMs(): number {
  return PROJECTILE_LIFE_TICKS * FIXED_DT * 1000 + LIFE_GRACE_MS;
}

export function spawnPredictedShot(
  id: number,
  frameId: string,
  fromX: number,
  fromY: number,
  angle: number,
  weapon: string,
  nowMs: number
): PredictedShot {
  return {
    id,
    frameId,
    x: fromX + Math.cos(angle) * MUZZLE_OFFSET,
    y: fromY + Math.sin(angle) * MUZZLE_OFFSET,
    vx: Math.cos(angle) * PROJECTILE_SPEED,
    vy: Math.sin(angle) * PROJECTILE_SPEED,
    bornMs: nowMs,
    weapon,
  };
}

export function advanceShots(
  shots: readonly PredictedShot[],
  nowMs: number,
  dtSeconds: number
): PredictedShot[] {
  const life = shotLifeMs();
  const live: PredictedShot[] = [];
  for (const shot of shots) {
    if (nowMs - shot.bornMs > life) continue;
    live.push({ ...shot, x: shot.x + shot.vx * dtSeconds, y: shot.y + shot.vy * dtSeconds });
  }
  return live;
}

export function confirmShots(
  predicted: readonly PredictedShot[],
  server: readonly ServerShotView[]
): PredictedShot[] {
  return predicted.filter((shot) => !confirmedBy(shot, server));
}

function confirmedBy(shot: PredictedShot, server: readonly ServerShotView[]): boolean {
  for (const live of server) {
    if (live.frameId !== shot.frameId) continue;
    if (Math.hypot(live.x - shot.x, live.y - shot.y) <= CONFIRM_PX) return true;
  }
  return false;
}

export function dropYoungShots(
  shots: readonly PredictedShot[],
  nowMs: number,
  maxAgeMs: number
): PredictedShot[] {
  return shots.filter((shot) => nowMs - shot.bornMs > maxAgeMs);
}
