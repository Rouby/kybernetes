import { describe, expect, it, vi } from 'vitest';
import { ShipAudioEngine } from './ShipAudioEngine';

function foleyHarness(gain: number) {
  const engine = new ShipAudioEngine();
  const foleyGain = {} as AudioNode;
  const channelInput = {} as AudioNode;
  engine.busManager = { foleyGain } as unknown as ShipAudioEngine['busManager'];
  engine.spatializer = {
    calculate: vi.fn(() => ({ gain })),
    createSpatialChannel: vi.fn(() => ({ input: channelInput })),
    applySpatialParams: vi.fn(),
  } as unknown as ShipAudioEngine['spatializer'];
  return { engine, foleyGain, channelInput };
}

describe('ShipAudioEngine spatial foley', () => {
  it('plays impact through the shared spatial channel when audible', () => {
    const { engine, channelInput } = foleyHarness(0.5);
    const playImpact = vi.fn();
    engine.ballisticsSynth = { playImpact } as unknown as ShipAudioEngine['ballisticsSynth'];

    engine.playImpact(10, 20, 'kinetic');

    expect(engine.spatializer?.calculate).toHaveBeenCalledWith(0, 0, 10, 20, []);
    expect(playImpact).toHaveBeenCalledWith(channelInput, 'kinetic', 0.65);
  });

  it('culls impact voices below the gain floor', () => {
    const { engine } = foleyHarness(0.01);
    const playImpact = vi.fn();
    engine.ballisticsSynth = { playImpact } as unknown as ShipAudioEngine['ballisticsSynth'];

    engine.playImpact(10, 20, 'laser');

    expect(playImpact).not.toHaveBeenCalled();
  });

  it('plays door toggles through the shared spatial channel', () => {
    const { engine, channelInput } = foleyHarness(0.5);
    const playDoorCycle = vi.fn();
    engine.pneumaticSynth = { playDoorCycle } as unknown as ShipAudioEngine['pneumaticSynth'];

    engine.playDoorToggle(4, 6, true);

    expect(playDoorCycle).toHaveBeenCalledWith(channelInput, true, 0.85);
  });

  it('routes remote weapon fire spatially but keeps local fire dry', () => {
    const { engine, foleyGain, channelInput } = foleyHarness(0.5);
    const playWeaponFire = vi.fn();
    engine.ballisticsSynth = { playWeaponFire } as unknown as ShipAudioEngine['ballisticsSynth'];

    engine.playWeaponFire(1, 2, 'kinetic_carbine', 1, true);
    expect(playWeaponFire).toHaveBeenCalledWith(foleyGain, 'kinetic_carbine', 1, 1.0);

    playWeaponFire.mockClear();
    engine.playWeaponFire(1, 2, 'kinetic_carbine', 0.5, false);
    expect(playWeaponFire).toHaveBeenCalledWith(channelInput, 'kinetic_carbine', 0.5, 0.85);
  });

  it('culls remote footsteps below their higher gain floor', () => {
    const { engine } = foleyHarness(0.04);
    const playFootstep = vi.fn();
    engine.metalSynth = { playFootstep } as unknown as ShipAudioEngine['metalSynth'];

    engine.playRemoteFootstep(3, 4, 'steel');

    expect(playFootstep).not.toHaveBeenCalled();
  });

  it('plays remote footsteps when audible', () => {
    const { engine, channelInput } = foleyHarness(0.9);
    const playFootstep = vi.fn();
    engine.metalSynth = { playFootstep } as unknown as ShipAudioEngine['metalSynth'];

    engine.playRemoteFootstep(3, 4, 'steel');

    expect(playFootstep).toHaveBeenCalledWith(channelInput, 'steel', 0.6);
  });
});
