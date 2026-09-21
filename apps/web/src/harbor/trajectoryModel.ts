/**
 * Torch-drive rendezvous solver (pure display math, no sim).
 * Continuous-thrust fixed-time rendezvous in the heliocentric frame:
 * constant burn u1, flip at mid-leg, constant burn u2. With no gravity
 * term (solar gravity perturbs a 1g brachistochrone by under a percent
 * here, and our display orbits share no single mu), the two burn vectors
 * solve in closed form per axis and the path is analytic quadratics.
 * Thrust lives in the solution: higher thrust (shorter sim leg time)
 * reshapes the same math, no separate code path.
 */

export interface TrajVec {
  readonly x: number;
  readonly y: number;
}

export interface BodyOrbit {
  /** Radius in px. */
  readonly radius: number;
  /** Period in seconds. */
  readonly periodS: number;
  /** Phase in radians. */
  readonly phase: number;
}

export interface SolvedLeg {
  readonly u1: TrajVec;
  readonly u2: TrajVec;
  /** Flip time in seconds from departure. */
  readonly flipT: number;
  /** Total flight time in seconds. */
  readonly totalT: number;
}

function add(a: TrajVec, b: TrajVec): TrajVec {
  return { x: a.x + b.x, y: a.y + b.y };
}

function scale(v: TrajVec, k: number): TrajVec {
  return { x: v.x * k, y: v.y * k };
}

/** Heliocentric position on a circular orbit at absolute time t. */
export function bodyPosAt(orbit: BodyOrbit, center: TrajVec, t: number): TrajVec {
  const angle = orbit.phase + (Math.PI * 2 * t) / Math.max(1, orbit.periodS);
  return {
    x: center.x + Math.cos(angle) * orbit.radius,
    y: center.y + Math.sin(angle) * orbit.radius,
  };
}

/** Circular-orbit velocity (prograde, exact); center-independent. */
export function bodyVelAt(orbit: BodyOrbit, t: number): TrajVec {
  const angle = orbit.phase + (Math.PI * 2 * t) / Math.max(1, orbit.periodS);
  const speed = ((Math.PI * 2) / Math.max(1, orbit.periodS)) * orbit.radius;
  return { x: -Math.sin(angle) * speed, y: Math.cos(angle) * speed };
}

/**
 * Solve the fixed-time rendezvous: depart (r0, v0) now, meet the target
 * body (position and velocity) exactly totalT later. Returns null for
 * degenerate flight times.
 */
export function solveLeg(
  r0: TrajVec,
  v0: TrajVec,
  target: BodyOrbit,
  center: TrajVec,
  tNow: number,
  totalT: number,
  flipFrac = 0.5
): SolvedLeg | null {
  if (!Number.isFinite(totalT) || totalT <= 0) return null;
  if (!Number.isFinite(flipFrac) || flipFrac <= 0 || flipFrac >= 1) return null;
  const tEnd = tNow + totalT;
  return solveLegToState(
    r0,
    v0,
    bodyPosAt(target, center, tEnd),
    bodyVelAt(target, tEnd),
    totalT,
    flipFrac
  );
}

/**
 * Fixed-time rendezvous to an explicit end state. Moons ride their hosts,
 * so chart legs flying moons meet a computed state instead of a static
 * orbit. Planets keep using solveLeg; results are identical either way.
 */
export function solveLegToState(
  r0: TrajVec,
  v0: TrajVec,
  r2: TrajVec,
  v2: TrajVec,
  totalT: number,
  flipFrac = 0.5
): SolvedLeg | null {
  if (!Number.isFinite(totalT) || totalT <= 0) return null;
  if (!Number.isFinite(flipFrac) || flipFrac <= 0 || flipFrac >= 1) return null;
  const flipT = totalT * flipFrac;
  const u1 = solveAxis(r0.x, v0.x, r2.x, v2.x, totalT, flipT);
  const u2 = solveAxis(r0.y, v0.y, r2.y, v2.y, totalT, flipT);
  if (u1 === null || u2 === null) return null;
  return {
    u1: { x: u1[0], y: u2[0] },
    u2: { x: u1[1], y: u2[1] },
    flipT,
    totalT,
  };
}

/**
 * One-axis burn pair: u1*f + u2*(T-f) = dv and
 * u1*(f^2/2 + f*(T-f)) + u2*(T-f)^2/2 = dr - v0*T.
 * Exported for unit tests; prefer solveLeg for flight paths.
 */
export function solveAxis(
  r0: number,
  v0: number,
  r2: number,
  v2: number,
  totalT: number,
  flipT: number
): [number, number] | null {
  const coast = totalT - flipT;
  const det = flipT * coast * totalT * -0.5;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-9) return null;
  const dv = v2 - v0;
  const dr = r2 - r0 - v0 * totalT;
  const a11 = flipT;
  const a12 = coast;
  const a21 = (flipT * flipT) / 2 + flipT * coast;
  const a22 = (coast * coast) / 2;
  const u1 = (dv * a22 - a12 * dr) / det;
  const u2 = (a11 * dr - dv * a21) / det;
  if (!Number.isFinite(u1) || !Number.isFinite(u2)) return null;
  return [u1, u2];
}

/** Position along a solved leg at elapsed seconds (clamped). */
export function legPointAt(leg: SolvedLeg, r0: TrajVec, v0: TrajVec, elapsed: number): TrajVec {
  const t = Math.min(Math.max(0, elapsed), leg.totalT);
  if (t <= leg.flipT) {
    return add(r0, add(scale(v0, t), scale(leg.u1, (t * t) / 2)));
  }
  const s = t - leg.flipT;
  const rFlip = add(r0, add(scale(v0, leg.flipT), scale(leg.u1, (leg.flipT * leg.flipT) / 2)));
  const vFlip = add(v0, scale(leg.u1, leg.flipT));
  return add(rFlip, add(scale(vFlip, s), scale(leg.u2, (s * s) / 2)));
}

/** Velocity along a solved leg at elapsed seconds (clamped). */
export function legVelAt(leg: SolvedLeg, v0: TrajVec, elapsed: number): TrajVec {
  const t = Math.min(Math.max(0, elapsed), leg.totalT);
  if (t <= leg.flipT) return add(v0, scale(leg.u1, t));
  return add(add(v0, scale(leg.u1, leg.flipT)), scale(leg.u2, t - leg.flipT));
}
