/**
 * Critically-damped rendezvous guidance with exact gravity cancellation.
 * Far away it saturates into a full-torch cruise at the intercept;
 * near the target it becomes a stiff spring (Lyapunov VDOT = -kd|rdot|^2).
 * Arrival time emerges from closed-loop RK4 integration instead of being
 * imposed: no parking, no iteration, no singularities. Deterministic
 * (fixed step): same inputs, same path.
 */

import { segmentSegmentDistance } from '../spatial/collision.js';
import {
  type AstroVec,
  bodyPosAt,
  bodyVelAt,
  clearFracFor,
  gravityAt,
  SYSTEM_BODIES,
  systemBodyOrDefault,
} from './system.js';

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

/** Lateral sidestep past a body well (fractions). Clears body wells plus arrival slack. */
export const BODY_GATE_FRAC = 0.08;

/** Body-avoidance context for flight routing. Omitted for star-only legacy behavior. */
export interface FlightAvoid {
  readonly epochS?: number;
  readonly ignoreIds?: readonly string[];
  /** Departure body state at absolute time (enables delayed-departure fallback). */
  readonly depart?: (tAbs: number) => { pos: AstroVec; vel: AstroVec };
  /** Cap on departure delay seconds; defaults to 15 when depart is provided. */
  readonly maxDelayS?: number;
}

/** Departure delays tried last, shortest first: waiting re-phases fast moons. */
const DEPART_DELAYS = [3, 6, 10, 15] as const;

export interface FlightSolution {
  readonly legs: readonly IntegratedLeg[];
  readonly totalS: number;
  /** Departure wait folded into totalS (0 when absent): the legs fly from epoch + wait. */
  readonly waitedS?: number;
}

/**
 * Planned flight with slingshot gates: integrate direct, route around the
 * star when the path dives inside stellar clearance, then route around
 * third-body wells (moving bodies at epoch time, departure/arrival
 * excluded). Gates are tangential sidesteps: energy preserved, no stops.
 * When gates cannot clear a well (fast moon conjunctions the torch cannot
 * out-turn), fall back to a delayed departure that re-phases the geometry;
 * the wait is folded into the total. Time-free legs chain by arrival
 * state, so totals are emergent sums. Without avoidance context the legacy
 * star-only behavior is preserved.
 */
export function solveFlight(
  r0: AstroVec,
  v0: AstroVec,
  target: (t: number) => { pos: AstroVec; vel: AstroVec },
  gains: GuidanceGains,
  timeoutS: number,
  avoid?: FlightAvoid
): FlightSolution | null {
  const direct = integrateLeg(r0, v0, target, { timeoutS, gains });
  if (direct === null) return null;
  const routed = routeAroundStar(direct, r0, v0, target, gains, timeoutS);
  const epoch = avoid?.epochS;
  if (epoch === undefined || avoid === undefined) return routed;
  if (flightBodiesClear(routed.legs, epoch, avoid.ignoreIds)) return routed;
  const gated =
    routeAroundBodies(routed, r0, v0, target, gains, timeoutS, epoch, avoid.ignoreIds) ?? routed;
  if (flightBodiesClear(gated.legs, epoch, avoid.ignoreIds)) return gated;
  return tryDepartDelays(target, gains, timeoutS, avoid, epoch) ?? gated;
}

function tryDepartDelays(
  target: (t: number) => { pos: AstroVec; vel: AstroVec },
  gains: GuidanceGains,
  timeoutS: number,
  avoid: FlightAvoid,
  epochS: number
): FlightSolution | null {
  const depart = avoid.depart;
  if (depart === undefined) return null;
  const cap = avoid.maxDelayS ?? 15;
  for (const delay of DEPART_DELAYS) {
    if (delay > cap || delay >= timeoutS) continue;
    const at = depart(epochS + delay);
    const solved = solveNoDelay(at.pos, at.vel, (t) => target(delay + t), gains, timeoutS - delay, {
      epochS: epochS + delay,
      ignoreIds: avoid.ignoreIds,
    });
    if (solved === null) continue;
    if (!flightClear(solved.legs)) continue;
    if (!flightBodiesClear(solved.legs, epochS + delay, avoid.ignoreIds)) continue;
    return { legs: solved.legs, totalS: delay + solved.totalS, waitedS: delay };
  }
  return null;
}

function solveNoDelay(
  r0: AstroVec,
  v0: AstroVec,
  target: (t: number) => { pos: AstroVec; vel: AstroVec },
  gains: GuidanceGains,
  timeoutS: number,
  avoid: FlightAvoid
): FlightSolution | null {
  const direct = integrateLeg(r0, v0, target, { timeoutS, gains });
  if (direct === null) return null;
  const routed = routeAroundStar(direct, r0, v0, target, gains, timeoutS);
  const epoch = avoid.epochS;
  if (epoch === undefined) return routed;
  if (flightBodiesClear(routed.legs, epoch, avoid.ignoreIds)) return routed;
  return (
    routeAroundBodies(routed, r0, v0, target, gains, timeoutS, epoch, avoid.ignoreIds) ?? routed
  );
}

function routeAroundStar(
  direct: IntegratedLeg,
  r0: AstroVec,
  v0: AstroVec,
  target: (t: number) => { pos: AstroVec; vel: AstroVec },
  gains: GuidanceGains,
  timeoutS: number
): FlightSolution {
  const dip = deepestDip(direct.points, direct.vels, direct.dt);
  if (dip === null) return { legs: [direct], totalS: direct.totalS };
  if (dip.t < 2 || dip.t > direct.totalS - 2) return { legs: [direct], totalS: direct.totalS };
  return (
    tryStarGates(dip, r0, v0, target, gains, timeoutS) ?? { legs: [direct], totalS: direct.totalS }
  );
}

function tryStarGates(
  dip: { pos: AstroVec; vel: AstroVec; t: number },
  r0: AstroVec,
  v0: AstroVec,
  target: (t: number) => { pos: AstroVec; vel: AstroVec },
  gains: GuidanceGains,
  timeoutS: number
): FlightSolution | null {
  for (const side of [1, -1] as const) {
    const gate = gateState(dip, side);
    const gated = chainThroughGate(r0, v0, gate, target, gains, timeoutS);
    if (gated !== null && flightClear(gated.legs)) return gated;
  }
  return null;
}

function routeAroundBodies(
  candidate: FlightSolution,
  r0: AstroVec,
  v0: AstroVec,
  target: (t: number) => { pos: AstroVec; vel: AstroVec },
  gains: GuidanceGains,
  timeoutS: number,
  epochS: number,
  ignoreIds: readonly string[] | undefined
): FlightSolution | null {
  const near = closestBodyApproach(candidate.legs, epochS, ignoreIds);
  if (near === null) return candidate;
  if (near.t < 2 || near.t > candidate.totalS - 2) return null;
  return tryBodyGates(near, candidate, r0, v0, target, gains, timeoutS, epochS, ignoreIds);
}

/** Body-gate sidesteps tried first, smallest (least disruptive) first. */
const BODY_GATE_OFFSETS = [0.05, BODY_GATE_FRAC, GATE_FRAC] as const;

/** Gate arrival slacks tried first: tight (energy-preserving) then relaxed. */
const BODY_GATE_ARRIVALS = [
  { pos: 0.03, vel: 0.08 },
  { pos: 0.05, vel: 0.2 },
] as const;

/** Gate anchor offsets around the hit time (seconds): on-time first. */
const BODY_GATE_ANCHORS = [0, -4, 4, -8, 8] as const;

function tryBodyGates(
  near: { pos: AstroVec; vel: AstroVec; t: number },
  candidate: FlightSolution,
  r0: AstroVec,
  v0: AstroVec,
  target: (t: number) => { pos: AstroVec; vel: AstroVec },
  gains: GuidanceGains,
  timeoutS: number,
  epochS: number,
  ignoreIds: readonly string[] | undefined
): FlightSolution | null {
  for (const dtAnchor of BODY_GATE_ANCHORS) {
    const anchor = sampleFlight(candidate.legs, near.t + dtAnchor) ?? near;
    const gated = tryBodyAnchor(anchor, r0, v0, target, gains, timeoutS, epochS, ignoreIds);
    if (gated !== null) return gated;
  }
  return null;
}

function tryBodyAnchor(
  anchor: { pos: AstroVec; vel: AstroVec; t: number },
  r0: AstroVec,
  v0: AstroVec,
  target: (t: number) => { pos: AstroVec; vel: AstroVec },
  gains: GuidanceGains,
  timeoutS: number,
  epochS: number,
  ignoreIds: readonly string[] | undefined
): FlightSolution | null {
  for (const off of BODY_GATE_OFFSETS) {
    for (const arrive of BODY_GATE_ARRIVALS) {
      for (const side of [1, -1] as const) {
        const gated = tryBodyCombo(anchor, side, off, arrive, r0, v0, target, gains, timeoutS);
        if (gated === null || !flightClear(gated.legs)) continue;
        if (!flightBodiesClear(gated.legs, epochS, ignoreIds)) continue;
        return gated;
      }
    }
  }
  return null;
}

/** Flight state at cumulative time t (lerped between samples). */
function sampleFlight(
  legs: readonly IntegratedLeg[],
  t: number
): { pos: AstroVec; vel: AstroVec; t: number } | null {
  let offset = 0;
  for (const leg of legs) {
    const local = t - offset;
    if (local < 0 || local > leg.totalS) {
      offset += leg.totalS;
      continue;
    }
    return sampleLeg(leg, offset, local);
  }
  return null;
}

function sampleLeg(
  leg: IntegratedLeg,
  offsetS: number,
  local: number
): { pos: AstroVec; vel: AstroVec; t: number } | null {
  const i = Math.floor(local / leg.dt);
  const a = leg.points[i];
  const b = leg.points[i + 1];
  if (a === undefined || b === undefined) return null;
  const f = Math.min(1, Math.max(0, (local - i * leg.dt) / leg.dt));
  const va = leg.vels[i] ?? { x: 0, y: 0 };
  const vb = leg.vels[i + 1] ?? va;
  return {
    pos: { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f },
    vel: { x: va.x + (vb.x - va.x) * f, y: va.y + (vb.y - va.y) * f },
    t: offsetS + local,
  };
}

function tryBodyCombo(
  near: { pos: AstroVec; vel: AstroVec; t: number },
  side: 1 | -1,
  off: number,
  arrive: { pos: number; vel: number },
  r0: AstroVec,
  v0: AstroVec,
  target: (t: number) => { pos: AstroVec; vel: AstroVec },
  gains: GuidanceGains,
  timeoutS: number
): FlightSolution | null {
  return chainThroughGate(r0, v0, gateState(near, side, off), target, gains, timeoutS, arrive);
}

function chainThroughGate(
  r0: AstroVec,
  v0: AstroVec,
  gate: { pos: AstroVec; vel: AstroVec },
  target: (t: number) => { pos: AstroVec; vel: AstroVec },
  gains: GuidanceGains,
  timeoutS: number,
  arrive = { pos: 0.03, vel: 0.08 }
): FlightSolution | null {
  const gateTarget = { pos: gate.pos, vel: gate.vel };
  const first = integrateLeg(r0, v0, () => gateTarget, {
    timeoutS,
    gains,
    dt: 0.25,
    arrivePos: arrive.pos,
    arriveVel: arrive.vel,
  });
  if (first === null) return null;
  const ar = first.points[first.points.length - 1];
  const av = first.vels[first.vels.length - 1];
  if (ar === undefined || av === undefined) return null;
  const second = integrateLeg(ar, av, (t) => target(first.totalS + t), { timeoutS, gains });
  if (second === null) return null;
  return { legs: [first, second], totalS: first.totalS + second.totalS };
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
  side: 1 | -1,
  off = GATE_FRAC
): { pos: AstroVec; vel: AstroVec } {
  const vl = Math.max(1e-9, Math.hypot(dip.vel.x, dip.vel.y));
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

/** True when no leg segment threads a third-body well at epoch time. */
export function flightBodiesClear(
  legs: readonly IntegratedLeg[],
  epochS: number,
  ignoreIds?: readonly string[]
): boolean {
  return closestBodyApproach(legs, epochS, ignoreIds) === null;
}

export interface BodyApproach {
  readonly pos: AstroVec;
  readonly vel: AstroVec;
  readonly t: number;
  readonly bodyId: string;
  readonly dist: number;
  /** Well penetration (clearance minus distance): positive means threading. */
  readonly pen: number;
}

/** Deepest third-body well approach along a flight (null when clear). */
export function closestBodyApproach(
  legs: readonly IntegratedLeg[],
  epochS: number,
  ignoreIds?: readonly string[]
): BodyApproach | null {
  const ignored = new Set(ignoreIds ?? []);
  let best: BodyApproach | null = null;
  let bestPen = 0;
  let offset = 0;
  for (const leg of legs) {
    const hit = legBodyApproach(leg, offset, epochS, ignored);
    if (hit !== null && hit.pen > bestPen) {
      bestPen = hit.pen;
      best = hit;
    }
    offset += leg.totalS;
  }
  return best;
}

function legBodyApproach(
  leg: IntegratedLeg,
  offsetS: number,
  epochS: number,
  ignored: ReadonlySet<string>
): BodyApproach | null {
  let worstPen = 0;
  let found: BodyApproach | null = null;
  const pts = leg.points;
  for (let i = 2; i < pts.length - 2; i += 1) {
    const segHit = segBodyHit(leg, pts, i, offsetS, epochS, ignored, worstPen);
    if (segHit !== null) {
      worstPen = segHit.pen;
      found = segHit;
    }
  }
  return found;
}

function segBodyHit(
  leg: IntegratedLeg,
  pts: readonly AstroVec[],
  i: number,
  offsetS: number,
  epochS: number,
  ignored: ReadonlySet<string>,
  worstPen: number
): BodyApproach | null {
  const a = pts[i];
  const b = pts[i + 1];
  if (a === undefined || b === undefined) return null;
  const near = nearestBodyToSeg(
    a,
    b,
    epochS + offsetS + i * leg.dt,
    epochS + offsetS + (i + 1) * leg.dt,
    ignored,
    worstPen
  );
  if (near === null) return null;
  const v = leg.vels[i] ?? { x: 0, y: 0 };
  const t = offsetS + i * leg.dt;
  return {
    pos: { x: a.x, y: a.y },
    vel: { x: v.x, y: v.y },
    t,
    bodyId: near.bodyId,
    dist: near.dist,
    pen: near.pen,
  };
}

function nearestBodyToSeg(
  a: AstroVec,
  b: AstroVec,
  t0: number,
  t1: number,
  ignored: ReadonlySet<string>,
  worstPen: number
): { bodyId: string; dist: number; pen: number } | null {
  let best: { bodyId: string; dist: number; pen: number } | null = null;
  let bestPen = worstPen;
  for (const body of SYSTEM_BODIES) {
    if (ignored.has(body.id)) continue;
    const d = segmentSegmentDistance(a, b, bodyPosAt(body, t0), bodyPosAt(body, t1));
    const pen = clearFracFor(body) - d;
    if (pen > bestPen) {
      bestPen = pen;
      best = { bodyId: body.id, dist: d, pen };
    }
  }
  return best;
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
    timeoutS,
    {
      epochS,
      ignoreIds: [fromId, toId],
      depart: (t) => ({ pos: bodyPosAt(from, t), vel: bodyVelAt(from, t) }),
    }
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
