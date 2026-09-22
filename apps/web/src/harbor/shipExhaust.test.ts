import type { NavStateBroadcast, ShipSystemsBroadcast } from '@kybernetes/protocol';
import { describe, expect, it } from 'vitest';
import {
  brakingFor,
  COAST_PX_S,
  directExhaustFor,
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
  scrollVectorFor,
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

  it('burns a maneuver plume on harbor inbound without nav', () => {
    const view = mapShipExhaust(null, sys({ spool: 1 }), 'cyan', 0, 'inbound');
    expect(view.phase).toBe('inbound');
    expect(view.params.intensity01).toBeGreaterThan(0.1);
    expect(view.params.intensity01).toBeLessThan(0.8);
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

  it('ramps cruise scroll speed to the flip and holds it parked', () => {
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
    const leg = nav({ phase: 'in_transit', remainingS: 75, legTotalS: 100 });
    const rate = scrollVectorFor(leg, { velX: 340, velY: 0 }, 680);
    expect(rate?.x).toBeCloseTo(480.8, 0);
    expect(rate?.y).toBe(0);
    expect(scrollVectorFor(nav({ phase: 'docked' }), { velX: 340, velY: 0 }, 680)).toBeNull();
    expect(scrollVectorFor(leg, { velX: 1, velY: 0 }, 680)).toBeNull();
    expect(scrollVectorFor(leg, null, 680)).toBeNull();
    expect(stepStarScroll({ x: 1, y: 2 }, { x: 100, y: 0 }, 50)).toEqual({ x: 6, y: 2 });
    expect(stepStarScroll({ x: 1, y: 2 }, null, 50)).toEqual({ x: 1, y: 2 });
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
