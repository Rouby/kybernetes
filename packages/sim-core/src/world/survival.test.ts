import { describe, expect, it } from 'vitest';
import {
  applyConsume,
  BLEEDOUT_S,
  defaultVitals,
  ensureVitals,
  setSleeping,
  setSuitSealed,
  startBleeding,
  startReload,
  tickSurvival,
} from './survival.js';
import { createEmptyWorld, type PawnBody, type World } from './types.js';

function mkPawn(id: string, room: string): PawnBody {
  return {
    id,
    owner: id,
    frameId: 'box',
    roomHint: room,
    pos: { x: 5, y: 5 },
    vel: { x: 0, y: 0 },
    facing: 0,
    radius: 12,
    speed: 200,
    health: { hp: 100, maxHp: 100, suitSealed: false, incapacitated: false },
    color: '#fff',
    say: '',
    sayUntilTick: 0,
  };
}

function boxWorld(): World {
  return {
    ...createEmptyWorld(0),
    rooms: { r1: { id: 'r1', frameId: 'box', rect: { x: 0, y: 0, w: 10, h: 10 }, volumeM3: 10 } },
    pawns: { p1: mkPawn('p1', 'r1') },
  };
}

function vacuumWorld(): World {
  const world = boxWorld();
  return {
    ...world,
    atmos: {
      r1: {
        roomId: 'r1',
        pressureKpa: 0,
        tempCelsius: 20,
        o2Percent: 0,
        co2Ppm: 0,
        repressurizing: false,
      },
    },
  };
}

function drive(world: World, seconds: number): World {
  let current = world;
  const ticks = Math.round(seconds / 0.05);
  for (let i = 0; i < ticks; i += 1) current = tickSurvival(current, 0.05);
  return current;
}

describe('survival vitals', () => {
  it('defaults fresh pawns to healthy vitals mirroring the suit', () => {
    const world = boxWorld();
    expect(ensureVitals(world, 'p1')).toEqual(defaultVitals(false));
    expect(ensureVitals(world, 'ghost')).toEqual(defaultVitals(false));
  });

  it('keeps airless worlds nominal so legacy tests stay healthy', () => {
    const world = drive(boxWorld(), 120);
    expect(world.pawns.p1?.health.hp).toBe(100);
    expect(world.vitals.p1?.hypoxia).toBe(0);
    expect(world.vitals.p1?.hunger ?? 100).toBeLessThan(100);
  });

  it('raises hypoxia in vacuum when unsealed and recovers sealed', () => {
    const gasping = drive(vacuumWorld(), 3);
    expect(gasping.vitals.p1?.hypoxia ?? 0).toBeGreaterThan(5);
    expect(gasping.pawns.p1?.health.hp ?? 100).toBeLessThan(100);
    const sealed = drive(setSuitSealed(vacuumWorld(), 'p1', true), 6);
    expect(sealed.vitals.p1?.suitO2 ?? 0).toBeLessThan(600);
    expect(sealed.pawns.p1?.health.hp).toBe(100);
  });

  it('drains suit oxygen until hypoxia resumes', () => {
    let world = setSuitSealed(vacuumWorld(), 'p1', true);
    world = drive(world, 605);
    expect(world.vitals.p1?.suitO2).toBe(0);
    const choking = drive(world, 3);
    expect(choking.vitals.p1?.hypoxia ?? 0).toBeGreaterThan(0);
  });

  it('bleeds out, incapacitates, then revives after stabilizing', () => {
    const wounded: World = {
      ...boxWorld(),
      pawns: {
        p1: {
          ...mkPawn('p1', 'r1'),
          health: { hp: 30, maxHp: 100, suitSealed: false, incapacitated: false },
        },
      },
    };
    let world = startBleeding(wounded, 'p1', BLEEDOUT_S);
    expect(world.vitals.p1?.bleedoutS).toBe(BLEEDOUT_S);
    world = drive(world, 50);
    expect(world.pawns.p1?.health.incapacitated).toBe(true);
    const revived = drive(world, 60);
    expect(revived.pawns.p1?.health.incapacitated).toBe(false);
    expect(revived.pawns.p1?.health.hp ?? 0).toBeGreaterThanOrEqual(30);
  });

  it('regulates body heat with suit battery gating', () => {
    const cold: World = {
      ...boxWorld(),
      atmos: {
        r1: {
          roomId: 'r1',
          pressureKpa: 101,
          tempCelsius: -20,
          o2Percent: 20,
          co2Ppm: 600,
          repressurizing: false,
        },
      },
    };
    const frozen = drive(cold, 60);
    expect(frozen.vitals.p1?.bodyTempC ?? 37).toBeLessThan(36);
    expect(frozen.pawns.p1?.health.hp ?? 100).toBeLessThan(100);
    const suited = drive(setSuitSealed(cold, 'p1', true), 60);
    expect(suited.vitals.p1?.bodyTempC ?? 0).toBeGreaterThan(36);
    expect(suited.vitals.p1?.suitBattery ?? 100).toBeLessThan(100);
  });

  it('consumes rations and sleeps off fatigue', () => {
    let world = applyConsume(boxWorld(), 'p1');
    expect(world.vitals.p1?.hunger).toBe(100);
    world = {
      ...world,
      vitals: { ...world.vitals, p1: { ...ensureVitals(world, 'p1'), hunger: 10, fatigue: 80 } },
    };
    world = applyConsume(world, 'p1');
    expect(world.vitals.p1?.hunger).toBe(30);
    world = setSleeping(world, 'p1', true);
    world = drive(world, 30);
    expect(world.vitals.p1?.fatigue ?? 80).toBeLessThan(80);
    expect(setSleeping(world, 'ghost', true)).toBe(world);
  });

  it('reloads by swapping in the fullest spare and retaining partials', () => {
    let world = boxWorld();
    expect(startReload(world, 'p1').result).toBe('full');
    world = {
      ...world,
      vitals: { ...world.vitals, p1: { ...ensureVitals(world, 'p1'), mags: [10, 30, 5] } },
    };
    const started = startReload(world, 'p1');
    expect(started.result).toBe('ok');
    world = started.world;
    expect(startReload(world, 'p1').result).toBe('busy');
    world = drive(world, 1);
    expect(world.vitals.p1?.mags?.[0]).toBe(10);
    expect(world.vitals.p1?.reloadingS ?? 0).toBeGreaterThan(0);
    world = drive(world, 2);
    expect(world.vitals.p1?.mags).toEqual([30, 5, 10]);
    expect(world.vitals.p1?.reloadingS).toBe(0);
    expect(startReload(world, 'p1').result).toBe('full');
  });

  it('discards dry mags and refuses reloads with no spares', () => {
    let world = boxWorld();
    world = {
      ...world,
      vitals: { ...world.vitals, p1: { ...ensureVitals(world, 'p1'), mags: [0, 12] } },
    };
    const started = startReload(world, 'p1');
    expect(started.result).toBe('ok');
    expect(drive(started.world, 3).vitals.p1?.mags).toEqual([12]);
    let solo = boxWorld();
    solo = {
      ...solo,
      vitals: { ...solo.vitals, p1: { ...ensureVitals(solo, 'p1'), mags: [5] } },
    };
    expect(startReload(solo, 'p1').result).toBe('none');
    expect(startReload(solo, 'ghost').result).toBe('none');
  });

  it('ignores zero dt and unknown pawns safely', () => {
    const world = boxWorld();
    expect(tickSurvival(world, 0)).toBe(world);
    expect(setSuitSealed(world, 'ghost', true)).toBe(world);
    expect(applyConsume(world, 'ghost')).toBe(world);
  });
});
