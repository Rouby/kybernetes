import type { PawnState, PlayerVitals, RoomAtmosphereSummary } from '@kybernetes/protocol';
import { describe, expect, it } from 'vitest';
import {
  computeTargetFrostIntensity,
  getPlayerAtmosphere,
  resolveSceneLayers,
  visibleDirectionalHits,
  type WebGLRenderState,
} from './WebGL2Renderer';

function summary(overrides: Partial<RoomAtmosphereSummary> = {}): RoomAtmosphereSummary {
  return {
    roomId: 'hydroponik',
    pressureKpa: 101.3,
    o2Percent: 21,
    co2Ppm: 400,
    tempCelsius: 20,
    toxicSmokePercent: 0,
    isVenting: false,
    activeFires: 0,
    activeBreaches: 0,
    ...overrides,
  };
}

function pawnAt(x: number, y: number): PawnState {
  return {
    id: 'p1',
    callsign: 'P1',
    role: 'wiper',
    x,
    y,
    vx: 0,
    vy: 0,
    facingAngle: 0,
    currentDeck: 'a',
    isOperating: false,
    isResting: false,
    color: '#fff',
  };
}

function vitalsAt(bodyTempCelsius: number): PlayerVitals {
  return {
    hunger: 100,
    thirst: 100,
    fatigue: 0,
    stamina: 100,
    maxStamina: 100,
    health: 100,
    suit: {
      isSealed: false,
      o2RemainingSeconds: 600,
      maxO2Seconds: 600,
      integrityPercent: 100,
      batteryPercent: 100,
    },
    incapacitated: { isIncapacitated: false, cause: 'combat', bleedoutSecondsRemaining: 0 },
    bodyTempCelsius,
    hypoxiaPercent: 0,
  };
}

function renderState(
  x: number,
  y: number,
  atmos: Record<string, RoomAtmosphereSummary> | undefined,
  offset = { x: 0, y: 0 },
  bodyTempCelsius = 37
): WebGLRenderState {
  return {
    pawn: pawnAt(x, y),
    telemetry:
      atmos === undefined
        ? undefined
        : ({ roomAtmospheres: atmos } as WebGLRenderState['telemetry']),
    shipOffset: offset,
    vitals: vitalsAt(bodyTempCelsius),
  } as WebGLRenderState;
}

describe('getPlayerAtmosphere', () => {
  it('returns undefined without telemetry', () => {
    expect(getPlayerAtmosphere(renderState(220, 380, undefined))).toBeUndefined();
  });

  it('returns undefined outside every room', () => {
    expect(
      getPlayerAtmosphere(renderState(99999, 99999, { hydroponik: summary() }))
    ).toBeUndefined();
  });

  it('returns the room summary for a station room', () => {
    const hydroponik = summary({ roomId: 'hydroponik' });
    expect(getPlayerAtmosphere(renderState(220, 380, { hydroponik }))).toBe(hydroponik);
  });

  it('reads the forward corridor third', () => {
    const fwd = summary({ roomId: 'corridor_fwd' });
    const corridor = summary({ roomId: 'corridor' });
    expect(getPlayerAtmosphere(renderState(30, 500, { corridor_fwd: fwd, corridor }))).toBe(fwd);
  });

  it('falls back to the shared corridor summary', () => {
    const corridor = summary({ roomId: 'corridor' });
    expect(getPlayerAtmosphere(renderState(30, 500, { corridor }))).toBe(corridor);
  });

  it('reads the mid corridor third under ship offset', () => {
    const mid = summary({ roomId: 'corridor_mid' });
    const corridor = summary({ roomId: 'corridor' });
    expect(
      getPlayerAtmosphere(renderState(530, 500, { corridor_mid: mid, corridor }, { x: 500, y: 0 }))
    ).toBe(mid);
  });

  it('reads the aft corridor third under ship offset', () => {
    const aft = summary({ roomId: 'corridor_aft' });
    const corridor = summary({ roomId: 'corridor' });
    expect(
      getPlayerAtmosphere(renderState(780, 500, { corridor_aft: aft, corridor }, { x: 750, y: 0 }))
    ).toBe(aft);
  });
});

describe('computeTargetFrostIntensity', () => {
  it('stays clear without atmosphere or vitals signal', () => {
    expect(computeTargetFrostIntensity(renderState(220, 380, {}), undefined)).toBe(0);
  });

  it('frosts hard in vacuum cold', () => {
    const state = renderState(220, 380, {});
    expect(
      computeTargetFrostIntensity(state, summary({ pressureKpa: 0.5, tempCelsius: -60 }))
    ).toBe(0.88);
  });

  it('frosts proportionally in the chill band', () => {
    const state = renderState(220, 380, {});
    expect(computeTargetFrostIntensity(state, summary({ tempCelsius: -10 }))).toBeCloseTo(0.6, 5);
  });

  it('peaks while the room vents', () => {
    const state = renderState(220, 380, {});
    expect(computeTargetFrostIntensity(state, summary({ pressureKpa: 50, isVenting: true }))).toBe(
      0.95
    );
  });

  it('tracks hypothermia without atmosphere', () => {
    const state = renderState(220, 380, {}, { x: 0, y: 0 }, 30);
    expect(computeTargetFrostIntensity(state, undefined)).toBeCloseTo(0.6875, 5);
  });

  it('stays clear when warm and suited', () => {
    const state = renderState(220, 380, {});
    expect(computeTargetFrostIntensity(state, summary())).toBe(0);
  });
});

describe('visibleDirectionalHits', () => {
  it('maps nothing without impacts', () => {
    expect(visibleDirectionalHits(undefined, { x: 0, y: 0 }, [], { x: 0, y: 0 })).toEqual([]);
    expect(visibleDirectionalHits([], { x: 0, y: 0 }, [], { x: 0, y: 0 })).toEqual([]);
  });

  it('fills impact defaults for the particle system', () => {
    const hits = visibleDirectionalHits(
      [{ x: 220, y: 380, type: 'kinetic' }],
      { x: 220, y: 380 },
      [],
      { x: 0, y: 0 }
    );
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      x: 220,
      y: 380,
      type: 'kinetic',
      angle: 0,
      weapon: 'kinetic_carbine',
      energy: 0.5,
      breachAreaM2: 0.05,
      pressureKpa: 101.3,
    });
  });

  it('preserves explicit impact detail', () => {
    const hits = visibleDirectionalHits(
      [
        {
          x: 10,
          y: 20,
          type: 'breach',
          angle: 1.2,
          weapon: 'arc_welder',
          energy: 0.9,
          breachAreaM2: 1.5,
          pressureKpa: 12,
        },
      ],
      { x: 10, y: 20 },
      [],
      { x: 0, y: 0 }
    );
    expect(hits[0]).toMatchObject({ angle: 1.2, weapon: 'arc_welder', energy: 0.9 });
  });
});

describe('resolveSceneLayers', () => {
  it('falls back to empty layers', () => {
    const layers = resolveSceneLayers({} as WebGLRenderState);
    expect(layers).toMatchObject({
      decals: [],
      intruders: [],
      sentries: [],
      livingFixtures: [],
      nearestLivingId: null,
      nearestStationId: undefined,
    });
  });

  it('projects decal and actor state', () => {
    const layers = resolveSceneLayers({
      breaches: [{ sizeClass: 'breach' }, { sizeClass: 'puncture' }],
      decals: [{ x: 1, y: 2, angle: 0.5, radius: 4, weapon: 'kinetic_carbine', cool: 0 }],
      boarding: { intruders: [{ id: 'i1' }], sentries: [{ id: 's1' }] },
      livingFixtures: [{ id: 'f1' }],
      nearestLivingId: 'f1',
      nearestStation: { id: 'helm' },
    } as unknown as WebGLRenderState);
    expect(layers.decals).toHaveLength(1);
    expect(layers.intruders).toHaveLength(1);
    expect(layers.sentries).toHaveLength(1);
    expect(layers.livingFixtures).toHaveLength(1);
    expect(layers.nearestLivingId).toBe('f1');
    expect(layers.nearestStationId).toBe('helm');
  });
});
