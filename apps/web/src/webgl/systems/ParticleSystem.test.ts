import { describe, expect, it } from 'vitest';
import { ParticleSystem } from './ParticleSystem';

function particleCount(system: ParticleSystem): number {
  return (system as unknown as { particles: unknown[] }).particles.length;
}

describe('thruster exhaust', () => {
  it('emits cyan-hot particles streaming along the nozzle direction', () => {
    const system = new ParticleSystem();
    const before = particleCount(system);
    system.emitExhaust(100, 100, 1, 0, 1);
    const after = particleCount(system);
    expect(after - before).toBeGreaterThanOrEqual(1);
    const tail = (system as unknown as { particles: { vx: number; b: number }[] }).particles;
    const fresh = tail[tail.length - 1];
    if (fresh === undefined) throw new Error('expected exhaust');
    expect(fresh.vx).toBeGreaterThan(0);
    expect(fresh.b).toBe(1.0);
  });

  it('stays quiet at zero intensity', () => {
    const system = new ParticleSystem();
    const before = particleCount(system);
    system.emitExhaust(100, 100, 1, 0, 0);
    expect(particleCount(system)).toBe(before);
  });

  it('scales impact throw with hole size and cabin pressure', () => {
    const base = {
      x: 0,
      y: 0,
      type: 'kinetic' as const,
      angle: 0,
      weapon: 'kinetic_carbine',
      energy: 1,
    };
    const full = new ParticleSystem();
    full.addDirectionalImpact({ ...base, breachAreaM2: 1.5, pressureKpa: 101.3 });
    const fullCount = particleCount(full);
    const vacuum = new ParticleSystem();
    vacuum.addDirectionalImpact({ ...base, breachAreaM2: 0.05, pressureKpa: 0 });
    const vacuumCount = particleCount(vacuum);
    expect(fullCount).toBeGreaterThan(vacuumCount);
    expect(vacuumCount).toBeGreaterThanOrEqual(3);
  });

  it('caps the shared pool under sustained burn', () => {
    const system = new ParticleSystem();
    for (let i = 0; i < 2000; i += 1) system.emitExhaust(100, 100, 1, 0, 1);
    expect(particleCount(system)).toBeLessThanOrEqual(600);
  });
});
