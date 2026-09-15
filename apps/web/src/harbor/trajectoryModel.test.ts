import { describe, expect, it } from 'vitest';
import { bodyPosAt, bodyVelAt, legPointAt, legVelAt, solveAxis, solveLeg } from './trajectoryModel';

const CENTER = { x: 0, y: 0 };
const INNER = { radius: 100, periodS: 70, phase: 0 };
const OUTER = { radius: 200, periodS: 150, phase: 1 };

describe('solveAxis', () => {
  it('matches the textbook rest-to-rest brachistochrone', () => {
    // D units in T seconds: u1 = 4D/T^2, u2 = -u1.
    const solved = solveAxis(0, 0, 300, 0, 100, 50);
    expect(solved?.[0]).toBeCloseTo(0.12, 8);
    expect(solved?.[1]).toBeCloseTo(-0.12, 8);
  });

  it('rejects a singular flip time', () => {
    expect(solveAxis(0, 0, 300, 0, 100, 0)).toBeNull();
    expect(solveAxis(0, 0, 300, 0, 100, 100)).toBeNull();
  });
});

describe('solveLeg', () => {
  it('matches the closed form against a frozen body', () => {
    const D = 300;
    const T = 100;
    const target = { radius: D, periodS: Number.MAX_SAFE_INTEGER, phase: 0 };
    const leg = solveLeg({ x: 0, y: 0 }, { x: 0, y: 0 }, target, CENTER, 0, T);
    if (leg === null) throw new Error('solve failed');
    expect(leg.u1.x).toBeCloseTo(0.12, 5);
    expect(leg.u1.y).toBeCloseTo(0, 5);
    expect(leg.u2.x).toBeCloseTo(-0.12, 5);
    expect(leg.u2.y).toBeCloseTo(0, 5);
    expect(leg.flipT).toBe(50);
  });

  it('meets a moving body with matched velocity', () => {
    const r0 = bodyPosAt(INNER, CENTER, 0);
    const v0 = bodyVelAt(INNER, 0);
    const T = 60;
    const leg = solveLeg(r0, v0, OUTER, CENTER, 0, T);
    if (leg === null) throw new Error('solve failed');
    const end = legPointAt(leg, r0, v0, T);
    const want = bodyPosAt(OUTER, CENTER, T);
    expect(end.x).toBeCloseTo(want.x, 5);
    expect(end.y).toBeCloseTo(want.y, 5);
    const vend = legVelAt(leg, v0, T);
    const wvel = bodyVelAt(OUTER, T);
    expect(vend.x).toBeCloseTo(wvel.x, 5);
    expect(vend.y).toBeCloseTo(wvel.y, 5);
  });

  it('meets the rendezvous at any interior flip time', () => {
    const r0 = bodyPosAt(INNER, CENTER, 0);
    const v0 = bodyVelAt(INNER, 0);
    for (const flipFrac of [0.25, 0.35, 0.65, 0.75]) {
      const leg = solveLeg(r0, v0, OUTER, CENTER, 0, 60, flipFrac);
      if (leg === null) throw new Error('solve failed');
      expect(leg.flipT).toBeCloseTo(60 * flipFrac, 8);
      const end = legPointAt(leg, r0, v0, 60);
      const want = bodyPosAt(OUTER, CENTER, 60);
      expect(end.x).toBeCloseTo(want.x, 5);
      expect(end.y).toBeCloseTo(want.y, 5);
      const vend = legVelAt(leg, v0, 60);
      const wvel = bodyVelAt(OUTER, 60);
      expect(vend.x).toBeCloseTo(wvel.x, 5);
      expect(vend.y).toBeCloseTo(wvel.y, 5);
    }
  });

  it('starts from the departure state exactly', () => {
    const r0 = bodyPosAt(INNER, CENTER, 10);
    const v0 = bodyVelAt(INNER, 10);
    const leg = solveLeg(r0, v0, OUTER, CENTER, 10, 60);
    if (leg === null) throw new Error('solve failed');
    expect(legPointAt(leg, r0, v0, 0)).toEqual(r0);
    expect(legVelAt(leg, v0, 0)).toEqual(v0);
  });

  it('stays continuous across the flip', () => {
    const r0 = bodyPosAt(INNER, CENTER, 0);
    const v0 = bodyVelAt(INNER, 0);
    const leg = solveLeg(r0, v0, OUTER, CENTER, 0, 60);
    if (leg === null) throw new Error('solve failed');
    const eps = 1e-6;
    const before = legPointAt(leg, r0, v0, leg.flipT - eps);
    const after = legPointAt(leg, r0, v0, leg.flipT + eps);
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeLessThan(1e-3);
    const vBefore = legVelAt(leg, v0, leg.flipT - eps);
    const vAfter = legVelAt(leg, v0, leg.flipT + eps);
    expect(Math.hypot(vAfter.x - vBefore.x, vAfter.y - vBefore.y)).toBeLessThan(1e-3);
  });

  it('rejects degenerate flight times', () => {
    const r0 = bodyPosAt(INNER, CENTER, 0);
    const v0 = bodyVelAt(INNER, 0);
    expect(solveLeg(r0, v0, OUTER, CENTER, 0, 0)).toBeNull();
    expect(solveLeg(r0, v0, OUTER, CENTER, 0, -5)).toBeNull();
  });
});
