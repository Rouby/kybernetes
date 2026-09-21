import { describe, expect, it } from 'vitest';
import { guideThrust, integrateLeg, planTripLeg, solveFlight, torchAccel } from './guidance.js';
import {
  bodyPeriodS,
  bodyPosAt,
  bodyVelAt,
  gravityAt,
  STAR_MU,
  SYSTEM_BODIES,
  type SystemBody,
} from './system.js';

function checkMoonMotion(body: SystemBody): void {
  if (body.moonOf === undefined) throw new Error('not a moon');
  const host = SYSTEM_BODIES.find((other) => other.id === body.moonOf);
  if (host === undefined) throw new Error(`moon host missing for ${body.id}`);
  expect(bodyPeriodS(body)).toBeGreaterThan(0);
  for (const t of [0, 7, 23]) {
    const offset = {
      x: bodyPosAt(body, t).x - bodyPosAt(host, t).x,
      y: bodyPosAt(body, t).y - bodyPosAt(host, t).y,
    };
    expect(Math.hypot(offset.x, offset.y)).toBeCloseTo(body.radiusFrac, 8);
    const rel = {
      x: bodyVelAt(body, t).x - bodyVelAt(host, t).x,
      y: bodyVelAt(body, t).y - bodyVelAt(host, t).y,
    };
    const speed = ((Math.PI * 2) / Math.max(1, bodyPeriodS(body))) * body.radiusFrac;
    expect(Math.hypot(rel.x, rel.y)).toBeCloseTo(speed, 8);
    expect(offset.x * rel.x + offset.y * rel.y).toBeCloseTo(0, 8);
  }
}

describe('system', () => {
  it('fits hub_a to exactly 150s', () => {
    const hubA = SYSTEM_BODIES.find((b) => b.id === 'hub_a');
    if (hubA === undefined) throw new Error('hub_a missing');
    const period = (2 * Math.PI * Math.sqrt(hubA.radiusFrac ** 3)) / Math.sqrt(STAR_MU);
    expect(period).toBeCloseTo(150, 6);
    expect(STAR_MU).toBeGreaterThan(0);
  });

  it('keeps circular velocity consistent with positions', () => {
    for (const body of SYSTEM_BODIES) {
      if (body.moonOf !== undefined) {
        checkMoonMotion(body);
        continue;
      }
      const p0 = bodyPosAt(body, 0);
      const v0 = bodyVelAt(body, 0);
      const period = (2 * Math.PI * body.radiusFrac) / Math.hypot(v0.x, v0.y);
      expect(period).toBeGreaterThan(0);
      const p1 = bodyPosAt(body, 0.1);
      const moved = Math.hypot(p1.x - p0.x, p1.y - p0.y);
      expect(moved).toBeCloseTo(Math.hypot(v0.x, v0.y) * 0.1, 6);
      const g = gravityAt(p0);
      expect(Math.hypot(g.x, g.y)).toBeCloseTo(STAR_MU / body.radiusFrac ** 2, 8);
      expect(g.x * p0.x + g.y * p0.y).toBeLessThan(0);
    }
  });
});

function checkRoutedLeg(
  toId: string,
  t0: number
): { minD: number; gated: boolean; legs: number; totalS: number } {
  const from = SYSTEM_BODIES.find((b) => b.id === 'hub_a');
  const to = SYSTEM_BODIES.find((b) => b.id === toId);
  if (from === undefined || to === undefined) throw new Error('bodies missing');
  const solved = solveFlight(
    bodyPosAt(from, t0),
    bodyVelAt(from, t0),
    (t) => ({ pos: bodyPosAt(to, t0 + t), vel: bodyVelAt(to, t0 + t) }),
    { kp: 2.0, kd: 3.0, accelMax: 0.02 },
    2000
  );
  if (solved === null) throw new Error(`no solution for ${toId} t0=${t0}`);
  let minD = Number.POSITIVE_INFINITY;
  for (const leg of solved.legs) {
    for (const pp of leg.points) minD = Math.min(minD, Math.hypot(pp.x, pp.y));
  }
  expect(minD).toBeGreaterThan(0.07);
  const last = solved.legs[solved.legs.length - 1];
  const end = last?.points[(last?.points.length ?? 1) - 1];
  const want = bodyPosAt(to, t0 + solved.totalS);
  if (end === undefined) throw new Error('empty');
  expect(Math.hypot(end.x - want.x, end.y - want.y)).toBeLessThan(0.007);
  return {
    minD,
    gated: solved.legs.length > 1,
    legs: solved.legs.length,
    totalS: Math.round(solved.totalS),
  };
}

describe('guidance', () => {
  it('scales the torch band by tier and throttle', () => {
    expect(torchAccel(0, 1)).toBeCloseTo(0.02, 8);
    expect(torchAccel(1, 1)).toBeCloseTo(0.03, 8);
    expect(torchAccel(2, 0.5)).toBeCloseTo(0.0225, 8);
    expect(torchAccel(0, 0)).toBeCloseTo(0.002, 8);
  });

  it('predicts sane durations that beat lane-table slack', () => {
    const hub = planTripLeg('hub_a', 'hub_b', 0.02, 0);
    if (hub === null) throw new Error('no trip');
    expect(hub.totalS).toBeGreaterThan(5);
    expect(hub.totalS).toBeLessThan(150);
    const slow = planTripLeg('hub_a', 'hub_b', 0.006, 0);
    if (slow !== null) expect(slow.totalS).toBeGreaterThan(hub.totalS);
  });

  it('returns null when thrust cannot arrive', () => {
    expect(planTripLeg('hub_a', 'hub_b', 1e-6, 0, 100)).toBeNull();
  });

  it('holds still at the target', () => {
    const u = guideThrust(
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { kp: 2, kd: 3, accelMax: 1 }
    );
    expect(Math.hypot(u.x, u.y)).toBeLessThan(1e-9);
  });

  it('routes slingshot gates around the star', () => {
    const from = SYSTEM_BODIES.find((b) => b.id === 'hub_a');
    const to = SYSTEM_BODIES.find((b) => b.id === 'poi_vigil');
    if (from === undefined || to === undefined) throw new Error('bodies missing');
    const solved = solveFlight(
      bodyPosAt(from, 150),
      bodyVelAt(from, 150),
      (t) => ({
        pos: bodyPosAt(to, 150 + t),
        vel: bodyVelAt(to, 150 + t),
      }),
      { kp: 2.0, kd: 3.0, accelMax: 0.02 },
      2000
    );
    if (solved === null) throw new Error('no solution');
    let minD = Number.POSITIVE_INFINITY;
    for (const leg of solved.legs) {
      for (const pp of leg.points) minD = Math.min(minD, Math.hypot(pp.x, pp.y));
    }
    const last = solved.legs[solved.legs.length - 1];
    const end = last?.points[(last?.points.length ?? 1) - 1];
    const want = bodyPosAt(to, 150 + solved.totalS);
    if (end === undefined) throw new Error('empty');
    console.log(
      'GATE: legs=' +
        solved.legs.length +
        ' T=' +
        Math.round(solved.totalS) +
        ' minD=' +
        minD.toFixed(3) +
        ' pe=' +
        Math.hypot(end.x - want.x, end.y - want.y).toFixed(4)
    );
    expect(solved.legs.length).toBe(2);
    expect(minD).toBeGreaterThan(0.075);
    expect(Math.hypot(end.x - want.x, end.y - want.y)).toBeLessThan(0.007);
  });

  it('clears the star on routed flights across phases', () => {
    const lanes = ['hub_b', 'poi_kestrel', 'poi_vigil'];
    let worst = 999;
    let worstAt = '';
    let gated = 0;
    let total = 0;
    for (let t0 = 0; t0 < 300; t0 += 15) {
      for (const toId of lanes) {
        const stats = checkRoutedLeg(toId, t0);
        total += 1;
        if (stats.gated) gated += 1;
        if (stats.minD < worst) {
          worst = stats.minD;
          worstAt = `${toId} t0=${t0} legs=${stats.legs} T=${stats.totalS}`;
        }
      }
    }
    console.log(`ROUTED: worst=${worst.toFixed(3)} at ${worstAt} gated=${gated}/${total}`);
  });

  it('arrives across lanes and phases', () => {
    const lanes = ['hub_b', 'poi_kestrel', 'poi_vigil'];
    const lines: string[] = [];
    const amaxs = [0.006, 0.01, 0.015, 0.02];
    for (const amax of amaxs) {
      for (const t0 of [0, 90]) {
        for (const toId of lanes) {
          const line = flyLane(toId, t0, amax);
          if (line !== null) lines.push(line);
        }
      }
    }
    console.log('ARRIVE-RESULT:', lines.join('|'));
  });
});

function flyLane(toId: string, t0: number, amax: number): string | null {
  const from = SYSTEM_BODIES.find((b) => b.id === 'hub_a');
  const to = SYSTEM_BODIES.find((b) => b.id === toId);
  if (from === undefined || to === undefined) throw new Error('bodies missing');
  const leg = integrateLeg(
    bodyPosAt(from, t0),
    bodyVelAt(from, t0),
    (t) => ({ pos: bodyPosAt(to, t0 + t), vel: bodyVelAt(to, t0 + t) }),
    { timeoutS: 2000, gains: { kp: 2.0, kd: 3.0, accelMax: amax } }
  );
  if (leg === null) return `FAIL a=${amax} ${toId} t0=${t0}`;
  const end = leg.points[leg.points.length - 1];
  const vend = leg.vels[leg.vels.length - 1];
  if (end === undefined || vend === undefined) throw new Error('empty leg');
  const want = bodyPosAt(to, t0 + leg.totalS);
  const wvel = bodyVelAt(to, t0 + leg.totalS);
  const pe = Math.hypot(end.x - want.x, end.y - want.y);
  const ve = Math.hypot(vend.x - wvel.x, vend.y - wvel.y);
  expect(pe).toBeLessThan(0.007);
  expect(ve).toBeLessThan(0.01);
  let minV = Number.POSITIVE_INFINITY;
  for (const vv of leg.vels) minV = Math.min(minV, Math.hypot(vv.x, vv.y));
  let minD = Number.POSITIVE_INFINITY;
  for (const pp of leg.points) minD = Math.min(minD, Math.hypot(pp.x, pp.y));
  const u0 = leg.burns[0];
  let deg = -1;
  if (u0 !== undefined) {
    const r0 = bodyPosAt(from, t0);
    const rl = Math.max(1e-9, Math.hypot(r0.x, r0.y));
    const ul = Math.max(1e-9, Math.hypot(u0.x, u0.y));
    const dot = (u0.x / ul) * (-r0.y / rl) + (u0.y / ul) * (r0.x / rl);
    deg = Math.round((Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI);
  }
  return (
    toId +
    ' t0=' +
    t0 +
    ' T=' +
    Math.round(leg.totalS) +
    ' depDeg=' +
    deg +
    ' minV=' +
    minV.toFixed(4) +
    ' minD=' +
    minD.toFixed(3) +
    ' a=' +
    amax
  );
}
