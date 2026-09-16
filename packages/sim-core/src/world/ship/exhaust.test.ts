import { describe, expect, it } from 'vitest';
import { exhaustParamsFor, isManeuverPhase, rcsStrengthFor } from './exhaust.js';

describe('exhaustParamsFor', () => {
  it('idles docked with no spool', () => {
    const p = exhaustParamsFor({ phase: 'docked', spool: 0 });
    expect(p.intensity01).toBeLessThan(0.1);
    expect(p.ratePerSecPerBell).toBe(6);
    expect(p.glow).toBeGreaterThan(0);
  });

  it('kills the plume on flameout', () => {
    const p = exhaustParamsFor({ phase: 'in_transit', thrust01: 1, spool: 1, flameout: true });
    expect(p.intensity01).toBe(0);
    expect(p.ratePerSecPerBell).toBe(0);
    expect(p.glow).toBe(0);
  });

  it('scales length and rate with throttle', () => {
    const low = exhaustParamsFor({ phase: 'in_transit', thrust01: 0.2, spool: 1, tune: 1 });
    const high = exhaustParamsFor({ phase: 'in_transit', thrust01: 1, spool: 1, tune: 1 });
    expect(high.ratePerSecPerBell).toBeGreaterThan(low.ratePerSecPerBell);
    expect(high.lengthPx).toBeGreaterThan(low.lengthPx);
    expect(high.intensity01).toBeGreaterThan(low.intensity01);
  });

  it('ramps with spool and penalizes wear', () => {
    const cold = exhaustParamsFor({ phase: 'in_transit', thrust01: 1, spool: 0.2, tune: 1 });
    const hot = exhaustParamsFor({ phase: 'in_transit', thrust01: 1, spool: 1, tune: 1 });
    expect(hot.intensity01).toBeGreaterThan(cold.intensity01);
    const worn = exhaustParamsFor({ phase: 'in_transit', thrust01: 1, spool: 1, tune: 1, wear: 1 });
    expect(worn.lengthPx).toBeLessThan(hot.lengthPx);
  });

  it('holds a maneuver burn while docking', () => {
    const p = exhaustParamsFor({ phase: 'docking', thrust01: 1, spool: 1, tune: 1 });
    expect(p.intensity01).toBeGreaterThan(0.1);
    expect(p.intensity01).toBeLessThan(0.8);
  });

  it('holds the same maneuver burn on harbor inbound and departing', () => {
    for (const phase of ['inbound', 'departing'] as const) {
      const p = exhaustParamsFor({ phase, thrust01: 1, spool: 1, tune: 1 });
      expect(p.intensity01).toBeGreaterThan(0.1);
      expect(p.intensity01).toBeLessThan(0.8);
    }
  });

  it('dims on brownout', () => {
    const ok = exhaustParamsFor({ phase: 'in_transit', thrust01: 1, spool: 1 });
    const brown = exhaustParamsFor({ phase: 'in_transit', thrust01: 1, spool: 1, brownout: true });
    expect(brown.ratePerSecPerBell).toBeLessThan(ok.ratePerSecPerBell);
  });
});

describe('helpers', () => {
  it('detects maneuver phases', () => {
    expect(isManeuverPhase('docking')).toBe(true);
    expect(isManeuverPhase('inbound')).toBe(true);
    expect(isManeuverPhase('departing')).toBe(true);
    expect(isManeuverPhase('in_transit')).toBe(false);
  });
  it('maps hull rate to RCS strength', () => {
    expect(rcsStrengthFor(0)).toBe(0);
    expect(rcsStrengthFor(60)).toBeGreaterThan(0.3);
    expect(rcsStrengthFor(500)).toBe(1);
  });
});
