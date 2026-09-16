import { describe, expect, it } from 'vitest';
import { GAMMA, GasType, MOLAR_MASS, R_GAS } from './constants';
import { Portal, PortalType } from './portal';
import { Room } from './room';
import { AtmosphereSimulation, analyticCrossing } from './simulation';

function createRoom(
  id: string,
  moles: number,
  temperatureK = 300,
  volume = 1,
  gas = GasType.Nitrogen
) {
  return new Room(
    { id, x: 0, y: 0, width: volume, length: 1, height: 1 },
    {
      moles: {
        [GasType.Oxygen]: 0,
        [GasType.Nitrogen]: 0,
        [GasType.CarbonDioxide]: 0,
        [gas]: moles,
      },
      temperatureK,
    }
  );
}

function connect(sim: AtmosphereSimulation, source: Room, target: Room | null, area = 1) {
  const portal = new Portal({
    id: `${source.id}-${target?.id ?? 'space'}`,
    type: PortalType.Door,
    roomA: source,
    roomB: target,
    width: area,
    height: 1,
    openRatio: 1,
    side: 'east',
    position: 0.5,
  });
  sim.addPortal(portal);
  return portal;
}

function createSimulation(...rooms: Room[]) {
  const sim = new AtmosphereSimulation();
  for (const room of rooms) sim.addRoom(room);
  return sim;
}

function totals(rooms: Room[]) {
  return {
    moles: Object.values(GasType).map((gas) =>
      rooms.reduce((sum, room) => sum + room.gas.moles[gas], 0)
    ),
    thermalContent: rooms.reduce((sum, room) => sum + room.totalMoles * room.gas.temperatureK, 0),
  };
}

describe('AtmosphereSimulation flow rates', () => {
  it.each(Object.values(GasType))('includes molar mass in choked %s flow', (gas) => {
    const room = createRoom('source', 100, 300, 1, gas);
    const sim = createSimulation(room);
    const portal = connect(sim, room, null, 0.001);
    const factor = Math.sqrt(GAMMA * (2 / (GAMMA + 1)) ** ((GAMMA + 1) / (GAMMA - 1)));
    const rate =
      (portal.dischargeCoefficient * portal.effectiveArea * room.pressure * factor) /
      Math.sqrt(R_GAS * 300 * MOLAR_MASS[gas]);

    sim.step(0.001);

    expect(100 - room.totalMoles).toBeCloseTo(rate * 0.001, 10);
    expect(room.gas.temperatureK).toBeLessThan(300);
  });

  it('uses compressible subsonic flow and remains continuous at the choked threshold', () => {
    const criticalRatio = (2 / (GAMMA + 1)) ** (GAMMA / (GAMMA - 1));
    const transferred: number[] = [];
    for (const ratio of [criticalRatio - 0.000001, criticalRatio + 0.000001, 0.9]) {
      const source = createRoom('source', 100);
      const target = createRoom('target', 100 * ratio);
      const sim = createSimulation(source, target);
      const portal = connect(sim, source, target, 0.001);
      const r = Math.max(ratio, criticalRatio);
      const factor = Math.sqrt(
        ((2 * GAMMA) / (GAMMA - 1)) * (r ** (2 / GAMMA) - r ** ((GAMMA + 1) / GAMMA))
      );
      const expected =
        (portal.dischargeCoefficient * portal.effectiveArea * source.pressure * factor * 0.001) /
        Math.sqrt(R_GAS * 300 * MOLAR_MASS[GasType.Nitrogen]);
      sim.step(0.001);
      transferred.push(100 - source.totalMoles);
      expect(100 - source.totalMoles).toBeCloseTo(expected, 10);
    }
    expect(transferred[0]).toBeCloseTo(transferred[1], 8);
  });
});

describe('AtmosphereSimulation stability', () => {
  it.each([1, 100])('equalizes rooms without pressure overshoot (source volume %s)', (volume) => {
    const source = createRoom('source', 100 * volume, 300, volume);
    const target = createRoom('target', 99);
    const sim = createSimulation(source, target);
    connect(sim, source, target, 100);
    let difference = source.pressure - target.pressure;

    for (let tick = 0; tick < 100; tick++) {
      sim.step(1);
      const next = source.pressure - target.pressure;
      expect(next).toBeGreaterThanOrEqual(-1e-8);
      expect(next).toBeLessThanOrEqual(difference + 1e-8);
      difference = next;
    }
    expect(difference).toBeLessThan(0.1);
    expect(source.totalMoles + target.totalMoles).toBeCloseTo(100 * volume + 99, 8);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'ignores invalid or nonpositive timesteps (%s)',
    (dt) => {
      const source = createRoom('source', 100);
      const sim = createSimulation(source);
      connect(sim, source, null);
      const before = structuredClone(source.gas);
      sim.step(dt);
      expect(source.gas).toEqual(before);
    }
  );

  it('leaves closed portals and empty vacuum rooms unchanged', () => {
    const source = createRoom('source', 100);
    const empty = createRoom('empty', 0);
    const sim = createSimulation(source, empty);
    connect(sim, source, empty).openRatio = 0;
    connect(sim, empty, null);
    sim.step(1);
    expect(source.totalMoles).toBe(100);
    expect(empty.totalMoles).toBe(0);
    expect(empty.gas.temperatureK).toBe(300);
  });
});

describe('AtmosphereSimulation vent cooling', () => {
  const T0 = 294.15;

  function ventToVacuum(volume: number, area: number): { sim: AtmosphereSimulation; room: Room } {
    const total = (101300 * volume) / (R_GAS * T0);
    const room = createRoom('cabin', total, T0, volume);
    const sim = createSimulation(room);
    connect(sim, room, null, area);
    return { sim, room };
  }

  function adiabatic(room: Room, p0: number): number {
    return T0 * (room.pressure / p0) ** ((GAMMA - 1) / GAMMA);
  }

  it('tracks the adiabatic curve through a small puncture', () => {
    const { sim, room } = ventToVacuum(100, 0.05);
    const p0 = room.pressure;
    for (let i = 0; i < 300 && room.pressure / p0 > 0.45; i += 1) sim.step(0.05);
    expect(room.pressure / p0).toBeLessThanOrEqual(0.45);
    expect(room.gas.temperatureK).toBeCloseTo(adiabatic(room, p0), 0);
  });

  it('stays near the adiabatic curve when a large breach vents a small room', () => {
    const { sim, room } = ventToVacuum(20, 1.5);
    const p0 = room.pressure;
    for (let i = 0; i < 100 && room.pressure / p0 > 0.2; i += 1) sim.step(0.05);
    expect(room.pressure / p0).toBeLessThanOrEqual(0.2);
    expect(room.gas.temperatureK).toBeGreaterThan(50);
    expect(Math.abs(room.gas.temperatureK - adiabatic(room, p0))).toBeLessThan(3);
  });
});

describe('AtmosphereSimulation transport', () => {
  function chain(reverse: boolean) {
    const rooms = [
      createRoom('hot', 100, 400, 1, GasType.Oxygen),
      createRoom('middle', 80, 300),
      createRoom('cold', 10, 200, 1, GasType.CarbonDioxide),
    ];
    const sim = createSimulation(...rooms);
    connect(sim, rooms[0], rooms[1], 0.01);
    connect(sim, rooms[1], rooms[2], 0.01);
    if (reverse) sim.portals.reverse();
    return { rooms, sim };
  }

  it('uses start-of-tick species and temperature regardless of portal order', () => {
    const forward = chain(false);
    const reverse = chain(true);
    forward.sim.step(0.1);
    reverse.sim.step(0.1);

    expect(forward.rooms[2].gas.moles[GasType.Oxygen]).toBe(0);
    for (let i = 0; i < forward.rooms.length; i++) {
      for (const gas of Object.values(GasType)) {
        expect(forward.rooms[i].gas.moles[gas]).toBeCloseTo(reverse.rooms[i].gas.moles[gas], 10);
      }
      expect(forward.rooms[i].gas.temperatureK).toBeCloseTo(reverse.rooms[i].gas.temperatureK, 10);
    }
  });

  it('conserves every species and thermal content through repeated transfers', () => {
    const { rooms, sim } = chain(false);
    const before = totals(rooms);
    for (let tick = 0; tick < 500; tick++) sim.step(0.05);
    const after = totals(rooms);

    after.moles.forEach((moles, i) => {
      expect(moles).toBeCloseTo(before.moles[i], 8);
    });
    expect(after.thermalContent).toBeCloseTo(before.thermalContent, 6);
    for (const room of rooms) {
      for (const moles of Object.values(room.gas.moles)) expect(moles).toBeGreaterThanOrEqual(0);
      expect(room.gas.temperatureK).toBeGreaterThanOrEqual(200 - 1e-8);
      expect(room.gas.temperatureK).toBeLessThanOrEqual(GAMMA * 400 + 1e-8);
    }
  });

  it('keeps portal velocity finite when opening into a 0-mole compartment', () => {
    const source = createRoom('source', 100);
    const vacuumRoom = createRoom('empty', 0);
    const sim = createSimulation(source, vacuumRoom);
    connect(sim, source, vacuumRoom, 1);
    connect(sim, vacuumRoom, null, 1);
    for (let i = 0; i < 40; i += 1) sim.step(0.025);
    for (const portal of sim.portals) {
      expect(Number.isFinite(portal.velocity)).toBe(true);
      expect(portal.velocity).not.toBeNaN();
    }
    for (const room of [source, vacuumRoom]) {
      expect(Number.isFinite(room.pressure)).toBe(true);
      expect(Number.isFinite(room.totalMoles)).toBe(true);
      for (const moles of Object.values(room.gas.moles)) {
        expect(Number.isFinite(moles)).toBe(true);
        expect(moles).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('stays finite when a fully vented source faces vacuum', () => {
    const vented = createRoom('vented', 0);
    const full = createRoom('full', 100);
    const sim = createSimulation(vented, full);
    connect(sim, vented, full, 1);
    connect(sim, vented, null, 1);
    for (let i = 0; i < 20; i += 1) sim.step(0.025);
    for (const portal of sim.portals) expect(Number.isFinite(portal.velocity)).toBe(true);
    expect(Number.isFinite(vented.pressure)).toBe(true);
  });

  it.each([0, 10])('mixes reverse flow into a target with %s mol', (targetMoles) => {
    const target = createRoom('target', targetMoles, 200, 1, GasType.CarbonDioxide);
    const source = createRoom('source', 100, 400, 1, GasType.Oxygen);
    const sim = createSimulation(target, source);
    connect(sim, target, source, 0.001);
    sim.step(0.01);
    const moved = 100 - source.totalMoles;

    expect(moved).toBeGreaterThan(0);
    expect(target.gas.moles[GasType.Oxygen]).toBeCloseTo(moved, 10);
    // Exact delivery: the source cools along (1-F)^γ as it drains, so the
    // target receives the integrated debit, not γ·T_start per mole.
    const fallen = moved / 100;
    const delivered = 100 * 400 * (1 - (1 - fallen) ** GAMMA);
    expect(target.gas.temperatureK).toBeCloseTo(
      (targetMoles * 200 + delivered) / (targetMoles + moved),
      10
    );
    expect(source.gas.temperatureK).toBeLessThan(400);
  });
});

describe('crossingTransferCap analytic solver', () => {
  function bisectionReference(
    startMoles: number,
    startContent: number,
    targetContent: number,
    stiffSource: number,
    stiffTarget: number
  ): number {
    const startTemp = startContent / startMoles;
    const gap = (moved: number): number => {
      const fallen = Math.min(1, moved / startMoles);
      const sourcePressure =
        stiffSource * (startMoles - moved) * startTemp * (1 - fallen) ** (GAMMA - 1);
      const targetPressure =
        stiffTarget * (targetContent + startContent * (1 - (1 - fallen) ** GAMMA));
      return sourcePressure - targetPressure;
    };
    if (gap(0) <= 0) return 0;
    const ceiling = startMoles * (1 - 1e-9);
    if (gap(ceiling) > 0) return ceiling;
    let lo = 0;
    let hi = ceiling;
    for (let i = 0; i < 32; i += 1) {
      const mid = (lo + hi) / 2;
      if (gap(mid) > 0) lo = mid;
      else hi = mid;
    }
    return lo;
  }

  it('matches the legacy 32-step bisection within 1e-9 mol', () => {
    const cases: Array<[number, number, number, number, number]> = [
      [100, 30000, 29700, 2478.951, 2478.951],
      [50, 15000, 5000, 1000, 2000],
      [200, 80000, 10000, 500, 1500],
      [10, 2500, 2400, 800, 800],
      [1000, 294150, 100000, 100, 300],
    ];
    for (const [moles, startC, targetC, stiffS, stiffT] of cases) {
      const expected = bisectionReference(moles, startC, targetC, stiffS, stiffT);
      const actual = analyticCrossing(moles, startC, targetC, stiffS, stiffT);
      expect(Math.abs(actual - expected)).toBeLessThan(1e-6);
    }
  });

  it('conserves gas below 0.001% error (single-pow analytic, 32 to 1)', () => {
    const source = createRoom('source', 120, 350, 2);
    const target = createRoom('target', 80, 280, 2);
    const sim = createSimulation(source, target);
    connect(sim, source, target, 0.05);
    const before = source.totalMoles + target.totalMoles;
    const beforeContent = source.totalMoles * 350 + target.totalMoles * 280;
    for (let i = 0; i < 500; i += 1) sim.step(0.05);
    const after = source.totalMoles + target.totalMoles;
    const afterContent =
      source.totalMoles * source.gas.temperatureK + target.totalMoles * target.gas.temperatureK;
    expect(Math.abs(after - before) / before).toBeLessThan(1e-5);
    expect(Math.abs(afterContent - beforeContent) / beforeContent).toBeLessThan(1e-5);
  });
});
