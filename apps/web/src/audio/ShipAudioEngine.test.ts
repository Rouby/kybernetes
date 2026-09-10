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

describe('ShipAudioEngine pack and trade sounds', () => {
  function rig() {
    const engine = new ShipAudioEngine();
    const uiGain = {} as AudioNode;
    const foleyGain = {} as AudioNode;
    engine.busManager = { uiGain, foleyGain } as unknown as ShipAudioEngine['busManager'];
    const ui = {
      playPromptChirp: vi.fn(),
      playDebriefStamp: vi.fn(),
      playCashRegister: vi.fn(),
      playTelemetrySquelch: vi.fn(),
    };
    const metal = { playCrateThunk: vi.fn() };
    const alarm = { playGeigerClick: vi.fn() };
    engine.uiSynth = ui as unknown as ShipAudioEngine['uiSynth'];
    engine.metalSynth = metal as unknown as ShipAudioEngine['metalSynth'];
    engine.alarmSynth = alarm as unknown as ShipAudioEngine['alarmSynth'];
    return { engine, ui, metal, alarm, uiGain, foleyGain };
  }

  it('chirps grabs, thunks drops and landings, ratchets rotates', () => {
    const { engine, ui, metal, alarm, uiGain, foleyGain } = rig();
    engine.playPackGrab();
    expect(ui.playPromptChirp).toHaveBeenCalledWith(uiGain, 0.35);
    engine.playPackDrop();
    expect(metal.playCrateThunk).toHaveBeenCalledWith(foleyGain, 0.5);
    engine.playPackLand();
    expect(metal.playCrateThunk).toHaveBeenCalledWith(foleyGain, 0.3);
    engine.playPackRotate();
    expect(alarm.playGeigerClick).toHaveBeenCalledWith(uiGain, 0.35);
    engine.playLidSeat();
    expect(metal.playCrateThunk).toHaveBeenCalledWith(foleyGain, 0.85);
  });

  it('stamps seals, rings registers, squelches rejects', () => {
    const { engine, ui, uiGain } = rig();
    engine.playSealStamp();
    expect(ui.playDebriefStamp).toHaveBeenCalledWith(uiGain, 0.9);
    engine.playCashRegister();
    expect(ui.playCashRegister).toHaveBeenCalledWith(uiGain, 0.6);
    engine.playPackReject();
    expect(ui.playTelemetrySquelch).toHaveBeenCalledWith(uiGain, 0.5);
  });

  it('stays silent without an audio bus', () => {
    const engine = new ShipAudioEngine();
    expect(() => {
      engine.playPackGrab();
      engine.playPackDrop();
      engine.playPackLand();
      engine.playPackRotate();
      engine.playLidSeat();
      engine.playSealStamp();
      engine.playCashRegister();
      engine.playPackReject();
    }).not.toThrow();
  });
});
