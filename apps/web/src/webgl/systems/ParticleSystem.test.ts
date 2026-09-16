import { describe, expect, it } from 'vitest';
import { createMockGl } from '../hud/HudTestUtils';
import {
  EXHAUST_MAX_PARTICLES,
  IMPACT_MAX_PARTICLES,
  PARTICLE_MAX_INSTANCES,
  ParticleSystem,
} from './ParticleSystem';

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
    expect(particleCount(system)).toBeLessThanOrEqual(IMPACT_MAX_PARTICLES);
  });

  it('streams layered plume particles with tint mix', () => {
    const system = new ParticleSystem();
    system.emitMainPlume(
      100,
      100,
      0,
      1,
      { speedMin: 220, speedMax: 370, spreadRad: 0.1, coreMix: 0.4, alpha: 0.9, sourceWidth: 148 },
      { r: 1, g: 0.65, b: 0.15 },
      12
    );
    expect(system.exhaustCount()).toBe(12);
    system.updateParticles(0.016);
    expect(system.exhaustCount()).toBe(12);
    expect(system.fxCount()).toBeGreaterThanOrEqual(12);
  });

  it('caps the exhaust pool near 900 under full torch', () => {
    const system = new ParticleSystem();
    const plume = {
      speedMin: 220,
      speedMax: 370,
      spreadRad: 0.1,
      coreMix: 0.4,
      alpha: 0.9,
      sourceWidth: 148,
    };
    for (let i = 0; i < 300; i += 1) {
      system.emitMainPlume(100, 100, 0, 1, plume, { r: 0, g: 0.95, b: 1 }, 12);
    }
    expect(system.exhaustCount()).toBeLessThanOrEqual(EXHAUST_MAX_PARTICLES);
  });

  it('puffs RCS laterally for docking', () => {
    const system = new ParticleSystem();
    system.emitRcsPuff(50, 50, 1, 0, 0.8, { r: 0, g: 0.95, b: 1 });
    expect(system.exhaustCount()).toBeGreaterThanOrEqual(4);
    system.emitRcsPuff(50, 50, 1, 0, 0, { r: 0, g: 0.95, b: 1 });
    expect(system.exhaustCount()).toBeGreaterThanOrEqual(4);
  });
});

describe('instanced particle batching', () => {
  it('renders hundreds of venting effects in one instanced draw', () => {
    const { gl, calls } = createMockGl();
    const system = new ParticleSystem();
    for (let i = 0; i < 120; i += 1) system.emitAirflow(100, 100, 200, 0, 1.0);
    for (let i = 0; i < 10; i += 1) system.addImpact(100, 100, 'kinetic');
    system.updateParticles(0.016);
    system.renderFx(gl, new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]), 1.0);
    expect(calls.drawArraysCalls).toBe(0);
    expect(calls.drawArraysInstancedCalls).toBe(1);
    const drawn = calls.drawArraysInstancedArgs[0]?.primcount ?? 0;
    expect(drawn).toBeGreaterThan(400);
    expect(drawn).toBe(system.fxCount());
    expect(drawn).toBeLessThanOrEqual(PARTICLE_MAX_INSTANCES);
  });

  it('renders the persistent dust motes in one instanced draw', () => {
    const { gl, calls } = createMockGl();
    const system = new ParticleSystem();
    system.updateParticles(0.016);
    system.renderMotes(gl, new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]), 1.0);
    expect(calls.drawArraysCalls).toBe(0);
    expect(calls.drawArraysInstancedCalls).toBe(1);
    expect(calls.drawArraysInstancedArgs[0]?.primcount).toBe(40);
  });

  it('releases particle GL objects on dispose', () => {
    const { gl, calls } = createMockGl();
    const system = new ParticleSystem();
    system.renderMotes(gl, new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]), 0);
    system.disposeGl(gl);
    expect(calls.deletedPrograms).toHaveLength(1);
    expect(calls.deletedVaos).toHaveLength(1);
    expect(calls.deletedBuffers).toHaveLength(2);
    system.disposeGl(gl);
  });
});
