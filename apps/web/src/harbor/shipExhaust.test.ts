import type { NavStateBroadcast, ShipSystemsBroadcast } from '@kybernetes/protocol';
import { describe, expect, it } from 'vitest';
import {
  brakingFor,
  COAST_PX_S,
  directExhaustFor,
  engineLitFor,
  flightSpeed01,
  isRcsPhase,
  isTranslatingPhase,
  legProgressFor,
  mapShipExhaust,
  normalizeExhaustPhase,
  nozzleForVector,
  RCS_PULSE_WIDTH_S,
  rcsLane,
  rcsPulseOn,
  rollTargetForAccel,
  STAR_FORWARD,
  STAR_ROLL_GAIN_RAD_PER_PX_S2,
  STAR_ROLL_MAX_RAD,
  starScrollRateFor,
  starSpeedPxS,
  stepStarRoll,
  stepStarScroll,
} from './shipExhaust.js';

function nav(over: Partial<NavStateBroadcast> = {}): NavStateBroadcast {
  return {
    type: 'NAV_STATE',
    v: 2,
    tick: 1,
    serverTimeMs: 1,
    vesselId: 'v1',
    phase: 'in_transit',
    destHubId: 'hub_b',
    remainingS: 40,
    legId: 1,
    portHubId: 'hub_a',
    flameout: false,
    hailS: 0,
    stops: ['hub_b'],
    legIndex: 0,
    thrust01: 1,
    ...over,
  } as NavStateBroadcast;
}

function yOf(rate: { x: number; y: number } | null): number {
  if (rate === null) throw new Error('expected a scroll rate');
  return rate.y;
}

function sys(over: Partial<ShipSystemsBroadcast> = {}): ShipSystemsBroadcast {
  return {
    type: 'SHIP_SYSTEMS',
    v: 2,
    tick: 1,
    serverTimeMs: 1,
    vesselId: 'v1',
    tempK: 300,
    bandLo: 0,
    bandHi: 1,
    rods: 0.5,
    coolant: 1,
    outputMW: 30,
    demandMW: 28,
    scrammed: false,
    warned: false,
    spool: 1,
    tune: 1,
    wear: 0,
    brownout: false,
    condition: 100,
    fuel: 1500,
    fuelMax: 2000,
    fuelSlots: 2,
    ...over,
  } as ShipSystemsBroadcast;
}

describe('mapShipExhaust', () => {
  it('reads cold docked without broadcasts', () => {
    const view = mapShipExhaust(null, null, undefined);
    expect(view.phase).toBe('docked');
    expect(view.params.ratePerSecPerBell).toBe(6);
    expect(view.tintName).toBe('cyan');
  });

  it('burns full in transit and honors owner tint', () => {
    const view = mapShipExhaust(nav(), sys(), 'amber');
    expect(view.tintName).toBe('amber');
    expect(view.tint[0]).toBeGreaterThan(0.9);
    expect(view.params.intensity01).toBeGreaterThan(0.6);
  });

  it('falls back to cyan on bogus tint', () => {
    expect(mapShipExhaust(nav(), sys(), 'bogus').tintName).toBe('cyan');
  });

  it('cuts on flameout', () => {
    const view = mapShipExhaust(nav({ flameout: true }), sys(), 'violet');
    expect(view.params.intensity01).toBe(0);
  });

  it('holds idle bells with RCS on harbor inbound without nav', () => {
    const view = mapShipExhaust(null, sys({ spool: 1 }), 'cyan', 0, 'inbound');
    expect(view.phase).toBe('inbound');
    expect(view.engineLit).toBe(false);
    expect(view.maneuvering).toBe(true);
    expect(view.params.ratePerSecPerBell).toBe(6);
  });

  it('lets a committed nav phase win over the harbor phase', () => {
    const view = mapShipExhaust(nav({ phase: 'in_transit' }), sys(), 'cyan', 0, 'departing');
    expect(view.phase).toBe('in_transit');
  });

  it('directs the burn along hull motion and coasts at rest', () => {
    const base = mapShipExhaust(null, null, undefined);
    expect(base.coast).toBe(true);
    expect(base.thrustVec).toBeNull();
    const still = directExhaustFor(base, { velX: 1, velY: 1 });
    expect(still?.coast).toBe(true);
    expect(still?.thrustVec).toBeNull();
    expect(still).toBe(base);
    const moving = directExhaustFor(base, { velX: 0, velY: COAST_PX_S + 100 });
    expect(moving?.coast).toBe(false);
    expect(moving?.thrustVec).toMatchObject({ x: 0, y: 1 });
    expect(moving?.thrustSpeed).toBeCloseTo(COAST_PX_S + 100, 6);
    expect(directExhaustFor(null, { velX: 300, velY: 0 })).toBeNull();
    expect(directExhaustFor(undefined, { velX: 300, velY: 0 })).toBeUndefined();
  });

  it('flags braking past the mid-leg flip', () => {
    expect(brakingFor(null)).toBe(false);
    expect(brakingFor(nav({ phase: 'docked' }))).toBe(false);
    expect(brakingFor(nav({ phase: 'in_transit', remainingS: 80, legTotalS: 100 }))).toBe(false);
    expect(brakingFor(nav({ phase: 'in_transit', remainingS: 50, legTotalS: 100 }))).toBe(true);
    expect(brakingFor(nav({ phase: 'in_transit', remainingS: 5, legTotalS: 100 }))).toBe(true);
    expect(brakingFor(nav({ phase: 'in_transit', remainingS: 5 }))).toBe(false);
    expect(
      mapShipExhaust(nav({ phase: 'in_transit', remainingS: 5, legTotalS: 100 }), null, undefined)
        .braking
    ).toBe(true);
  });

  it('picks thrust-opposing nozzles for a motion vector', () => {
    const nozzles = [
      { dx: -1, dy: 0 },
      { dx: 1, dy: 0 },
      { dx: 0, dy: 1 },
    ];
    expect(nozzleForVector({ x: 1, y: 0 }, nozzles)).toBe(0);
    expect(nozzleForVector({ x: -1, y: 0 }, nozzles)).toBe(1);
    expect(nozzleForVector({ x: 0, y: -1 }, nozzles)).toBe(2);
    expect(nozzleForVector(null, nozzles)).toBe(-1);
    expect(nozzleForVector({ x: 0, y: 0 }, nozzles)).toBe(-1);
    expect(nozzleForVector({ x: 1, y: 0 }, [])).toBe(-1);
  });

  it('clocks leg progress through the torch profile', () => {
    expect(legProgressFor(null)).toBeNull();
    expect(legProgressFor(nav({ phase: 'docked' }))).toBeNull();
    expect(legProgressFor(nav({ phase: 'in_transit', remainingS: 100, legTotalS: 100 }))).toBe(0);
    expect(legProgressFor(nav({ phase: 'in_transit', remainingS: 50, legTotalS: 100 }))).toBe(0.5);
    expect(legProgressFor(nav({ phase: 'in_transit', remainingS: 0, legTotalS: 100 }))).toBe(1);
    expect(flightSpeed01(null)).toBe(0);
    expect(flightSpeed01(0)).toBe(0);
    expect(flightSpeed01(0.5)).toBeCloseTo(1, 6);
    expect(flightSpeed01(1)).toBeCloseTo(0, 6);
    expect(flightSpeed01(0.25)).toBeGreaterThan(flightSpeed01(0.1));
  });

  it('streams against the vessel on departure and docking burns', () => {
    // Undocking east streams west, against the vessel, at burn plus profile.
    const leg = nav({ phase: 'in_transit', remainingS: 95, legTotalS: 100 });
    const away = starScrollRateFor(leg, { velX: 340, velY: 0 }, 680);
    expect(away?.x).toBeCloseTo(-446.4, 0);
    expect(away?.y).toBeCloseTo(0, 6);
    // Docking glide west streams east, against the vessel.
    const dock = starScrollRateFor(nav({ phase: 'docking' }), { velX: -340, velY: 0 }, 680);
    expect(dock?.x).toBeCloseTo(340, 0);
    expect(dock?.y).toBeCloseTo(0, 6);
  });

  it('streams fore-aft and flips hard at the mid-leg turn', () => {
    // Holding hull streams top-to-bottom through the accelerating half.
    const cruise = nav({ phase: 'in_transit', remainingS: 75, legTotalS: 100 });
    const held = starScrollRateFor(cruise, null, 680);
    expect(held?.x).toBe(0);
    expect(held?.y).toBeCloseTo(-STAR_FORWARD.y * 480.8, 0);
    // Mid-leg flip: same speed, sudden reversal to bottom-to-top.
    const before = starScrollRateFor(
      nav({ phase: 'in_transit', remainingS: 51, legTotalS: 100 }),
      null,
      680
    );
    const after = starScrollRateFor(
      nav({ phase: 'in_transit', remainingS: 50, legTotalS: 100 }),
      null,
      680
    );
    expect(yOf(before)).toBeGreaterThan(0);
    expect(yOf(after)).toBeLessThan(0);
    expect(Math.abs(yOf(after) + yOf(before))).toBeLessThan(30);
  });

  it('eases the braking stream to a stop and parks null', () => {
    const leg = nav({ phase: 'in_transit', remainingS: 95, legTotalS: 100 });
    const brake = nav({ phase: 'in_transit', remainingS: 25, legTotalS: 100 });
    const eased = starScrollRateFor(brake, null, 680);
    expect(eased?.x).toBe(0);
    expect(eased?.y).toBeCloseTo(STAR_FORWARD.y * 480.8, 0);
    expect(starScrollRateFor(nav({ phase: 'docked' }), { velX: 340, velY: 0 }, 680)).toBeNull();
    expect(starScrollRateFor({ ...leg, flameout: true }, null, 680)).toBeNull();
    expect(
      starScrollRateFor(nav({ phase: 'in_transit', remainingS: 100, legTotalS: 100 }), null, 680)
    ).toBeNull();
    expect(stepStarScroll({ x: 1, y: 2 }, { x: 100, y: 0 }, 50)).toEqual({ x: 6, y: 2 });
    expect(stepStarScroll({ x: 1, y: 2 }, null, 50)).toEqual({ x: 1, y: 2 });
  });

  it('lights the torch clear of the dock and cuts it ahead of the glide', () => {
    expect(engineLitFor(null)).toBe(false);
    expect(engineLitFor(nav({ phase: 'docked' }))).toBe(false);
    expect(engineLitFor(nav({ phase: 'docking' }))).toBe(false);
    expect(engineLitFor(nav({ phase: 'in_transit', remainingS: 50, legTotalS: 100 }))).toBe(true);
    expect(engineLitFor(nav({ phase: 'in_transit', remainingS: 98, legTotalS: 100 }))).toBe(false);
    expect(engineLitFor(nav({ phase: 'in_transit', remainingS: 5, legTotalS: 100 }))).toBe(false);
    expect(
      engineLitFor({
        ...nav({ phase: 'in_transit', remainingS: 50, legTotalS: 100 }),
        flameout: true,
      })
    ).toBe(false);
    expect(engineLitFor(nav({ phase: 'in_transit', remainingS: 50 }))).toBe(true);
    const early = mapShipExhaust(
      nav({ phase: 'in_transit', remainingS: 98, legTotalS: 100 }),
      null,
      undefined
    );
    expect(early.engineLit).toBe(false);
    expect(early.maneuvering).toBe(true);
    expect(early.params.ratePerSecPerBell).toBeLessThan(20);
    const cruise = mapShipExhaust(
      nav({ phase: 'in_transit', remainingS: 50, legTotalS: 100 }),
      null,
      undefined
    );
    expect(cruise.engineLit).toBe(true);
    expect(cruise.maneuvering).toBe(false);
    expect(cruise.params.ratePerSecPerBell).toBeGreaterThan(100);
    const docking = mapShipExhaust(nav({ phase: 'docking' }), null, undefined);
    expect(docking.engineLit).toBe(false);
    expect(docking.maneuvering).toBe(true);
  });

  it('sums hull and cruise speed, freezing the profile on flameout', () => {
    const leg = nav({ phase: 'in_transit', remainingS: 50, legTotalS: 100 });
    expect(starSpeedPxS({ velX: 340, velY: 0 }, leg, 680)).toBeCloseTo(1020, 0);
    expect(starSpeedPxS(null, leg, 680)).toBeCloseTo(680, 0);
    expect(starSpeedPxS({ velX: 0, velY: -340 }, nav({ phase: 'docked' }), 680)).toBe(340);
    expect(starSpeedPxS({ velX: 340, velY: 0 }, { ...leg, flameout: true }, 680)).toBe(340);
    expect(starSpeedPxS(null, nav({ phase: 'docked' }), 680)).toBe(0);
    expect(starSpeedPxS(null, leg, -10)).toBe(0);
    expect(starSpeedPxS(null, null, 680)).toBe(0);
  });

  it('leans the roll cue with acceleration and against braking', () => {
    expect(rollTargetForAccel(200)).toBeCloseTo(200 * STAR_ROLL_GAIN_RAD_PER_PX_S2, 6);
    expect(rollTargetForAccel(-200)).toBeCloseTo(-200 * STAR_ROLL_GAIN_RAD_PER_PX_S2, 6);
    expect(rollTargetForAccel(0)).toBe(0);
    expect(rollTargetForAccel(Number.NaN)).toBe(0);
    expect(rollTargetForAccel(1e9)).toBe(STAR_ROLL_MAX_RAD);
    expect(rollTargetForAccel(-1e9)).toBe(-STAR_ROLL_MAX_RAD);
    expect(stepStarRoll(0, 200)).toBeCloseTo(200 * STAR_ROLL_GAIN_RAD_PER_PX_S2 * 0.12, 6);
    expect(stepStarRoll(STAR_ROLL_MAX_RAD, 1e9)).toBe(STAR_ROLL_MAX_RAD);
    expect(stepStarRoll(Number.NaN, 200)).toBeCloseTo(200 * STAR_ROLL_GAIN_RAD_PER_PX_S2 * 0.12, 6);
  });

  it('binds camera and scroll to translating hulls only', () => {
    expect(isTranslatingPhase('in_transit')).toBe(true);
    expect(isTranslatingPhase('docking')).toBe(true);
    expect(isTranslatingPhase('docked')).toBe(false);
    expect(isTranslatingPhase(null)).toBe(false);
    expect(isTranslatingPhase(undefined)).toBe(false);
  });

  it('parks unknown phases as docked', () => {
    expect(normalizeExhaustPhase('arrived')).toBe('docked');
    expect(normalizeExhaustPhase(undefined)).toBe('docked');
  });
});

describe('rcs pulse train', () => {
  it('opens crisp 100ms windows every 600ms', () => {
    expect(rcsPulseOn(0, 0)).toBe(true);
    expect(rcsPulseOn(0.05, 0)).toBe(true);
    expect(rcsPulseOn(0.2, 0)).toBe(false);
    expect(rcsPulseOn(0.6, 0)).toBe(true);
    expect(rcsPulseOn(0.3, 0.3)).toBe(true);
    expect(rcsPulseOn(RCS_PULSE_WIDTH_S - 0.01, 0)).toBe(true);
    expect(rcsPulseOn(RCS_PULSE_WIDTH_S + 0.01, 0)).toBe(false);
  });

  it('walks nozzle lanes per window', () => {
    expect(rcsLane(0, 4)).toBe(0);
    expect(rcsLane(0.7, 4)).toBe(1);
    expect(rcsLane(2.5, 4)).toBe(0);
  });

  it('fires rcs on docking and harbor transits only', () => {
    expect(isRcsPhase('docking')).toBe(true);
    expect(isRcsPhase('inbound')).toBe(true);
    expect(isRcsPhase('departing')).toBe(true);
    expect(isRcsPhase('in_transit')).toBe(false);
    expect(isRcsPhase('docked')).toBe(false);
  });
});
