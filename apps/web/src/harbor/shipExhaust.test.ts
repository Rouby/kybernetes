import type { NavStateBroadcast, ShipSystemsBroadcast } from '@kybernetes/protocol';
import { describe, expect, it } from 'vitest';
import {
  isRcsPhase,
  mapShipExhaust,
  normalizeExhaustPhase,
  RCS_PULSE_WIDTH_S,
  rcsLane,
  rcsPulseOn,
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
