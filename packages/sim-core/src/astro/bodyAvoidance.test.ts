import { describe, expect, it } from 'vitest';
import { flightBodiesClear, solveFlight } from './guidance.js';
import { BODY_CLEAR_FRAC, bodyPosAt, bodyVelAt, SYSTEM_BODIES } from './system.js';

const GAINS = { kp: 2.0, kd: 3.0, accelMax: 0.02 };
const LANES: ReadonlyArray<readonly [string, string]> = [
  ['hub_a', 'hub_b'],
  ['hub_a', 'hub_c'],
  ['hub_a', 'hub_d'],
  ['hub_b', 'hub_c'],
  ['hub_b', 'hub_d'],
  ['hub_c', 'hub_d'],
  ['hub_b', 'hub_a'],
  ['hub_a', 'poi_vigil'],
  ['poi_kestrel', 'hub_b'],
  ['poi_kestrel', 'poi_vigil'],
  ['poi_vigil', 'hub_a'],
  ['poi_lumen', 'hub_a'],
  ['poi_nadir', 'hub_c'],
  ['hub_d', 'poi_vigil'],
  ['moon_wisp', 'hub_a'],
  ['hub_a', 'moon_moth'],
  ['moon_rill', 'hub_c'],
  ['hub_d', 'moon_tarn'],
];

function solveLane(fromId: string, toId: string, t0: number) {
  const from = SYSTEM_BODIES.find((b) => b.id === fromId);
  const to = SYSTEM_BODIES.find((b) => b.id === toId);
  if (from === undefined || to === undefined) throw new Error('bodies missing');
  const solved = solveFlight(
    bodyPosAt(from, t0),
    bodyVelAt(from, t0),
    (t) => ({ pos: bodyPosAt(to, t0 + t), vel: bodyVelAt(to, t0 + t) }),
    GAINS,
    2000,
    {
      epochS: t0,
      ignoreIds: [fromId, toId],
      depart: (t) => ({ pos: bodyPosAt(from, t), vel: bodyVelAt(from, t) }),
    }
  );
  if (solved === null) throw new Error(`no solution for ${fromId}->${toId} t0=${t0}`);
  return { solved, to };
}

describe('body avoidance', () => {
  it('routes torch arcs around third-body wells', { timeout: 20000 }, () => {
    expect(BODY_CLEAR_FRAC).toBeGreaterThan(0);
    for (let t0 = 0; t0 < 300; t0 += 20) {
      for (const [fromId, toId] of LANES) {
        const { solved, to } = solveLane(fromId, toId, t0);
        const flownAt = t0 + (solved.waitedS ?? 0);
        expect(flightBodiesClear(solved.legs, flownAt, [fromId, toId])).toBe(true);
        const last = solved.legs[solved.legs.length - 1];
        const end = last?.points[(last?.points.length ?? 1) - 1];
        const want = bodyPosAt(to, t0 + solved.totalS);
        if (end === undefined) throw new Error('empty leg');
        expect(Math.hypot(end.x - want.x, end.y - want.y)).toBeLessThan(0.007);
        // Star clearance stays owned by astro.test.ts (its lanes); a deep
        // pre-existing vigil->hub_a star graze also exists without avoidance.
      }
    }
  });
});
