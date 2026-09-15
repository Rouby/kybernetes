/**
 * Critically-damped rendezvous guidance with exact gravity cancellation.
 * Far away it saturates into a full-torch cruise at the intercept;
 * near the target it becomes a stiff spring (Lyapunov VDOT = -kd|rdot|^2).
 * Arrival time emerges from closed-loop RK4 integration instead of being
 * imposed: no parking, no iteration, no singularities. Deterministic
 * (fixed step): same inputs, same path.
 */

import { type AstroVec, bodyPosAt, bodyVelAt, gravityAt, systemBodyOrDefault } from './system.js';

export interface IntegratedLeg {
  readonly points: readonly AstroVec[];
  readonly vels: readonly AstroVec[];
  readonly burns: readonly AstroVec[];
  readonly dt: number;
  readonly totalS: number;
}

export interface GuidanceGains {
  readonly kp: number;
  readonly kd: number;
  readonly accelMax: number;
}

export const DEFAULT_GAINS: GuidanceGains = { kp: 2.0, kd: 3.0, accelMax: 0.02 };

/** Torch band: full-thrust acceleration in fractions/s^2. Throttle scales it linearly. */
export const TORCH_A_MAX = 0.02;

/** Engine tiers widen the torch band; higher tiers fly the same legs faster. */
export const TIER_THRUST_MULT: Readonly<Record<0 | 1 | 2, number>> = { 0: 1, 1: 1.5, 2: 2.25 };

/** Effective torch acceleration for a tier and throttle setting. */
export function torchAccel(tier: 0 | 1 | 2, thrust01: number): number {
  const clamped = Number.isFinite(thrust01) ? Math.min(1, Math.max(0.1, thrust01)) : 1;
  return TORCH_A_MAX * (TIER_THRUST_MULT[tier] ?? 1) * clamped;
}

/** PD rendezvous law with exact gravity cancellation. */
export function guideThrust(
  r: AstroVec,
  v: AstroVec,
  rT: AstroVec,
  vT: AstroVec,
  gains: GuidanceGains
): AstroVec {
  const rhoX = r.x - rT.x;
  const rhoY = r.y - rT.y;
  const rhoVX = v.x - vT.x;
  const rhoVY = v.y - vT.y;
  const g = gravityAt(r);
  const gT = gravityAt(rT);
  const ux = -(g.x - gT.x) - gains.kp * rhoX - gains.kd * rhoVX;
  const uy = -(g.y - gT.y) - gains.kp * rhoY - gains.kd * rhoVY;
  const mag = Math.hypot(ux, uy);
  if (mag <= gains.accelMax) return { x: ux, y: uy };
  return { x: (ux / mag) * gains.accelMax, y: (uy / mag) * gains.accelMax };
}

export interface IntegrateOpts {
  readonly dt?: number;
  readonly gains?: GuidanceGains;
  readonly arrivePos?: number;
  readonly arriveVel?: number;
}

/** Closed-loop integration until arrival thresholds or timeout. */
export function integrateLeg(
  r0: AstroVec,
  v0: AstroVec,
  target: (t: number) => { pos: AstroVec; vel: AstroVec },
  opts: IntegrateOpts & { timeoutS: number }
): IntegratedLeg | null {
  const dt = opts.dt ?? 0.5;
  const gains = opts.gains ?? DEFAULT_GAINS;
  const arrivePos = opts.arrivePos ?? 0.005;
  const arriveVel = opts.arriveVel ?? 0.01;
  const points: AstroVec[] = [{ x: r0.x, y: r0.y }];
  const vels: AstroVec[] = [{ x: v0.x, y: v0.y }];
  const burns: AstroVec[] = [];
  let r = { x: r0.x, y: r0.y };
  let v = { x: v0.x, y: v0.y };
  let t = 0;
  let guard = 0;
  for (;;) {
    guard += 1;
    if (guard > 100000) return null;
    const aim = target(t);
    const rho = Math.hypot(r.x - aim.pos.x, r.y - aim.pos.y);
    const rhov = Math.hypot(v.x - aim.vel.x, v.y - aim.vel.y);
    if (rho <= arrivePos && rhov <= arriveVel && t > 1) break;
    if (t >= opts.timeoutS) return null;
    const h = Math.min(dt, opts.timeoutS - t);
    const u = guideThrust(r, v, aim.pos, aim.vel, gains);
    burns.push(u);
    const next = rk4Step(r, v, target, t, gains, h);
    r = next.r;
    v = next.v;
    t += h;
    points.push({ x: r.x, y: r.y });
    vels.push({ x: v.x, y: v.y });
  }
  return { points, vels, burns, dt, totalS: t };
}

/** Stellar exclusion radius for waypoint routing (fractions). */
export const STAR_CLEAR_FRAC = 0.075;

/** Gate radius for slingshot waypoints (fractions). */
export const GATE_FRAC = 0.12;

export interface FlightSolution {
  readonly legs: readonly IntegratedLeg[];
  readonly totalS: number;
}

/**
 * Planned flight with slingshot gates: integrate direct, and if the path
 * dives inside stellar clearance, route through a tangential gate at the
 * dip (periapsis-style, energy preserved, no stops). Time-free legs chain
 * by arrival state, so totals are emergent sums.
 */
export function solveFlight(
  r0: AstroVec,
  v0: AstroVec,
  target: (t: number) => { pos: AstroVec; vel: AstroVec },
  gains: GuidanceGains,
  timeoutS: number
): FlightSolution | null {
  const direct = integrateLeg(r0, v0, target, { timeoutS, gains });
  if (direct === null) return null;
  const dip = deepestDip(direct.points, direct.vels, direct.dt);
  if (dip === null) return { legs: [direct], totalS: direct.totalS };
  if (dip.t < 2 || dip.t > direct.totalS - 2) return { legs: [direct], totalS: direct.totalS };
  for (const side of [1, -1] as const) {
    const gate = gateState(dip, side);
    const gateTarget = { pos: gate.pos, vel: gate.vel };
    const first = integrateLeg(r0, v0, () => gateTarget, {
      timeoutS,
      gains,
      dt: 0.25,
      arrivePos: 0.03,
      arriveVel: 0.08,
    });
    if (first === null) continue;
    const ar = first.points[first.points.length - 1];
    const av = first.vels[first.vels.length - 1];
    if (ar === undefined || av === undefined) continue;
    const second = integrateLeg(ar, av, (t) => target(first.totalS + t), { timeoutS, gains });
    if (second === null) continue;
    if (flightClear([first, second])) {
      return { legs: [first, second], totalS: first.totalS + second.totalS };
    }
  }
  return { legs: [direct], totalS: direct.totalS };
}

function deepestDip(
  points: readonly AstroVec[],
  vels: readonly AstroVec[],
  dt: number
): { pos: AstroVec; vel: AstroVec; t: number } | null {
  let worst = STAR_CLEAR_FRAC;
  let found: { pos: AstroVec; vel: AstroVec; t: number } | null = null;
  for (let i = 2; i < points.length - 2; i += 1) {
    const p = points[i];
    if (p === undefined) continue;
    const d = Math.hypot(p.x, p.y);
    if (d < worst) {
      worst = d;
      const v = vels[i] ?? { x: 0, y: 0 };
      found = { pos: { x: p.x, y: p.y }, vel: { x: v.x, y: v.y }, t: i * dt };
    }
  }
  return found;
}

/** Lateral sidestep gate past the dip: offset perpendicular to dive motion. */
function gateState(
  dip: { pos: AstroVec; vel: AstroVec; t: number },
  side: 1 | -1
): { pos: AstroVec; vel: AstroVec } {
  const vl = Math.max(1e-9, Math.hypot(dip.vel.x, dip.vel.y));
  const off = 0.12;
  const pos = {
    x: dip.pos.x + (-dip.vel.y / vl) * off * side,
    y: dip.pos.y + (dip.vel.x / vl) * off * side,
  };
  return { pos, vel: { x: dip.vel.x, y: dip.vel.y } };
}

function flightClear(legs: readonly IntegratedLeg[]): boolean {
  for (const leg of legs) {
    for (const p of leg.points) {
      if (Math.hypot(p.x, p.y) <= STAR_CLEAR_FRAC) return false;
    }
  }
  return true;
}

/** Predict a leg duration by flying it. Null when guidance cannot arrive. */
export function planTripLeg(
  fromId: string,
  toId: string,
  accel: number,
  epochS: number,
  timeoutS = 3000
): { totalS: number } | null {
  const from = systemBodyOrDefault(fromId);
  const to = systemBodyOrDefault(toId);
  const gains = { kp: 2.0, kd: 3.0, accelMax: Math.max(1e-6, accel) };
  const solved = solveFlight(
    bodyPosAt(from, epochS),
    bodyVelAt(from, epochS),
    (t) => ({
      pos: bodyPosAt(to, epochS + t),
      vel: bodyVelAt(to, epochS + t),
    }),
    gains,
    timeoutS
  );
  if (solved === null) return null;
  return { totalS: Math.max(1, Math.round(solved.totalS)) };
}

function rk4Step(
  r: AstroVec,
  v: AstroVec,
  target: (t: number) => { pos: AstroVec; vel: AstroVec },
  tElapsed: number,
  gains: GuidanceGains,
  h: number
): { r: AstroVec; v: AstroVec } {
  const aim1 = target(tElapsed);
  const a1 = guideThrust(r, v, aim1.pos, aim1.vel, gains);
  const r2 = { x: r.x + v.x * (h / 2), y: r.y + v.y * (h / 2) };
  const v2 = { x: v.x + a1.x * (h / 2), y: v.y + a1.y * (h / 2) };
  const aim2 = target(tElapsed + h / 2);
  const a2 = guideThrust(r2, v2, aim2.pos, aim2.vel, gains);
  const r3 = { x: r.x + v2.x * (h / 2), y: r.y + v2.y * (h / 2) };
  const v3 = { x: v.x + a2.x * (h / 2), y: v.y + a2.y * (h / 2) };
  const a3 = guideThrust(r3, v3, aim2.pos, aim2.vel, gains);
  const r4 = { x: r.x + v3.x * h, y: r.y + v3.y * h };
  const v4 = { x: v.x + a3.x * h, y: v.y + a3.y * h };
  const aim4 = target(tElapsed + h);
  const a4 = guideThrust(r4, v4, aim4.pos, aim4.vel, gains);
  return {
    r: {
      x: r.x + ((v.x + 2 * v2.x + 2 * v3.x + v4.x) * h) / 6,
      y: r.y + ((v.y + 2 * v2.y + 2 * v3.y + v4.y) * h) / 6,
    },
    v: {
      x: v.x + ((a1.x + 2 * a2.x + 2 * a3.x + a4.x) * h) / 6,
      y: v.y + ((a1.y + 2 * a2.y + 2 * a3.y + a4.y) * h) / 6,
    },
  };
}
