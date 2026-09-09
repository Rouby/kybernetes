import { describe, expect, it } from 'vitest';
import { buildSnapshot, buildVitals, snapshotPawnsOf } from './channels.js';
import { deathCauseFor, isDead, restartRun } from './death.js';
import { defaultVitals } from './survival.js';
import { createEmptyWorld, type PawnBody, type World } from './types.js';

function mkPawn(over: Partial<PawnBody> = {}): PawnBody {
  return {
    id: 'p1',
    owner: 'p1',
    frameId: 'station',
    roomHint: 'station.r1',
    pos: { x: 10, y: 10 },
    vel: { x: 5, y: 0 },
    facing: 1,
    radius: 12,
    speed: 200,
    health: { hp: 100, maxHp: 100, suitSealed: false, incapacitated: false },
    color: '#ffd166',
    say: '',
    sayUntilTick: 0,
    ...over,
  };
}

function mkWorld(pawn: PawnBody, vitalsOver = {}): World {
  return {
    ...createEmptyWorld(0),
    pawns: { [pawn.id]: pawn },
    vitals: { [pawn.id]: { ...defaultVitals(false), ...vitalsOver } },
  };
}

describe('authoritative death', () => {
  it('treats hp <= 0 as dead and hp > 0 as alive', () => {
    const alive = mkWorld(mkPawn());
    expect(isDead(alive, 'p1')).toBe(false);
    expect(deathCauseFor(alive, 'p1')).toBeUndefined();
    const dead = mkWorld(
      mkPawn({ health: { hp: 0, maxHp: 100, suitSealed: false, incapacitated: true } })
    );
    expect(isDead(dead, 'p1')).toBe(true);
    expect(deathCauseFor(dead, 'p1')).toBe('combat');
    expect(isDead(dead, 'ghost')).toBe(false);
  });

  it('prioritizes bleedout, hypoxia, vacuum, thermal, hunger, thirst', () => {
    const base = mkPawn({
      health: { hp: 0, maxHp: 100, suitSealed: false, incapacitated: true },
    });
    expect(deathCauseFor(mkWorld(base, { bleedoutS: 5 }), 'p1')).toBe('bleedout');
    expect(deathCauseFor(mkWorld(base, { hypoxia: 100 }), 'p1')).toBe('hypoxia');
    const vacuum: World = {
      ...mkWorld(base),
      atmos: {
        'station.r1': {
          roomId: 'station.r1',
          pressureKpa: 0,
          tempCelsius: 20,
          o2Percent: 0,
          co2Ppm: 0,
          repressurizing: false,
        },
      },
    };
    expect(deathCauseFor(vacuum, 'p1')).toBe('vacuum');
    expect(deathCauseFor(mkWorld(base, { bodyTempC: 30 }), 'p1')).toBe('thermal');
    expect(deathCauseFor(mkWorld(base, { hunger: 0 }), 'p1')).toBe('starvation');
    expect(deathCauseFor(mkWorld(base, { thirst: 0 }), 'p1')).toBe('dehydration');
  });

  it('exposes dead in snapshots and vitals without breaking old readers', () => {
    const dead = mkWorld(
      mkPawn({
        health: { hp: 0, maxHp: 100, suitSealed: false, incapacitated: true },
        trim: 'ion',
        thruster: 'amber',
      })
    );
    const pawns = snapshotPawnsOf(dead);
    expect(pawns[0]?.dead).toBe(true);
    expect(pawns[0]?.trim).toBe('ion');
    const vitals = buildVitals(dead, 1000, 'p1', 0, 1);
    expect(vitals.vitals.dead).toBe(true);
    expect(vitals.vitals.deathCause).toBe('combat');
    expect(JSON.parse(JSON.stringify(vitals)).vitals.dead).toBe(true);
    const snap = buildSnapshot(dead, 1000);
    expect(JSON.parse(JSON.stringify(snap)).pawns[0].dead).toBe(true);
    const alive = mkWorld(mkPawn());
    expect(snapshotPawnsOf(alive)[0]?.dead).toBeUndefined();
    expect(buildVitals(alive, 1000, 'p1', 0, 1).vitals.dead).toBe(false);
  });

  it('restarts a run at the spawn with fresh vitals and cleared crew', () => {
    const tired = mkPawn({
      frameId: 'ship',
      roomHint: 'ship.r9',
      health: { hp: 0, maxHp: 100, suitSealed: false, incapacitated: true },
      trim: 'ion',
    });
    let world: World = {
      ...mkWorld(tired, { hunger: 0, bleedoutS: 10 }),
      crew: {
        p1: { pawnId: 'p1', role: 'engineer', credits: 50, clearance: 2, xp: 9 },
      },
      spread: { p1: 0.2 },
      memory: { p1: ['ship.r9'] },
    };
    world = restartRun(world, 'p1', { frameId: 'station', roomId: 'station.r1', x: 1, y: 2 });
    expect(isDead(world, 'p1')).toBe(false);
    expect(world.pawns.p1?.pos).toEqual({ x: 1, y: 2 });
    expect(world.pawns.p1?.frameId).toBe('station');
    expect(world.pawns.p1?.health.hp).toBe(100);
    expect(world.vitals.p1?.hunger).toBe(100);
    expect(world.crew.p1).toBeUndefined();
    expect(world.spread.p1).toBeUndefined();
    expect(world.memory.p1).toBeUndefined();
    expect(world.pawns.p1?.trim).toBe('ion');
    expect(world.pawns.p1?.color).toBe('#ffd166');
    expect(restartRun(world, 'ghost', { frameId: 's', roomId: 's.r', x: 0, y: 0 })).toBe(world);
  });
});
