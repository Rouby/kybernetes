import { describe, expect, it, vi } from 'vitest';
import { ShipAudioEngine } from './ShipAudioEngine';
import { TechnoMusicSynth } from './synths/TechnoMusicSynth';

function foleyHarness(gain: number) {
  const engine = new ShipAudioEngine();
  const foleyGain = {} as AudioNode;
  const channelInput = {} as AudioNode;
  engine.busManager = { foleyGain } as unknown as ShipAudioEngine['busManager'];
  engine.spatializer = {
    calculate: vi.fn(() => ({ gain })),
    acquireChannel: vi.fn(() => ({ input: channelInput })),
    releaseChannel: vi.fn(),
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

describe('ShipAudioEngine background music', () => {
  function musicHarness(ctxState: string, playing: boolean) {
    const engine = new ShipAudioEngine();
    const musicGain = {} as AudioNode;
    const start = vi.fn();
    const stop = vi.fn();
    engine.busManager = { musicGain } as unknown as ShipAudioEngine['busManager'];
    engine.ctx = { state: ctxState } as unknown as ShipAudioEngine['ctx'];
    engine.technoSynth = {
      start,
      stop,
      isPlaying: () => playing,
      currentTrack: { id: 'x', defaultIntensity: 0.6, defaultFreak: 0.7 },
    } as unknown as ShipAudioEngine['technoSynth'];
    return { engine, musicGain, start, stop };
  }

  it('starts the loop on the music bus once the context runs', () => {
    const { engine, musicGain, start } = musicHarness('running', false);
    engine.setMusicDesired(true);
    expect(start).toHaveBeenCalledWith(musicGain, { intensity: 0.6, freak: 0.7 });
  });

  it('defers the start while the context is suspended', () => {
    const { engine, start } = musicHarness('suspended', false);
    engine.setMusicDesired(true);
    expect(start).not.toHaveBeenCalled();
  });

  it('never double-starts a running loop', () => {
    const { engine, start } = musicHarness('running', true);
    engine.setMusicDesired(true);
    expect(start).not.toHaveBeenCalled();
  });

  it('stops the loop when music is toggled off', () => {
    const { engine, stop } = musicHarness('running', true);
    engine.setMusicDesired(false);
    expect(stop).toHaveBeenCalled();
  });

  it('previews alert transitions through the telemetry path', () => {
    const engine = new ShipAudioEngine();
    engine.ctx = {} as unknown as ShipAudioEngine['ctx'];
    engine.busManager = {} as unknown as ShipAudioEngine['busManager'];
    const spy = vi.spyOn(engine, 'updateTelemetry').mockImplementation(() => {});
    try {
      engine.previewAlert('red');
      expect(spy).toHaveBeenCalledWith({ alertLevel: 'red' }, undefined, undefined);
      engine.previewAlert('nominal');
      expect(spy).toHaveBeenCalledWith({ alertLevel: 'nominal' }, undefined, undefined);
    } finally {
      spy.mockRestore();
    }
  });

  it('routes manual techno starts through the music bus', () => {
    const { engine, musicGain, start } = musicHarness('running', false);
    engine.startTechno(0.85, 0.9);
    expect(start).toHaveBeenCalledWith(musicGain, { intensity: 0.85, freak: 0.9 });
  });
});

describe('ShipAudioEngine DJ decks', () => {
  function deckHarness() {
    const engine = new ShipAudioEngine();
    const param = () => ({
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
      setTargetAtTime: vi.fn(),
    });
    const ctx = {
      currentTime: 100,
      state: 'running',
      sampleRate: 44100,
      createBuffer: vi.fn((_ch: number, size: number) => ({
        getChannelData: () => new Float32Array(size),
      })),
      createGain: vi.fn(() => ({ gain: param(), connect: vi.fn(), disconnect: vi.fn() })),
      createOscillator: vi.fn(() => ({
        type: '',
        frequency: param(),
        detune: param(),
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      })),
      createBufferSource: vi.fn(() => ({
        buffer: null as unknown,
        loop: false,
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      })),
      createBiquadFilter: vi.fn(() => ({
        type: '' as BiquadFilterType,
        frequency: param(),
        Q: param(),
        connect: vi.fn(),
        disconnect: vi.fn(),
      })),
      createDelay: vi.fn(() => ({ delayTime: param(), connect: vi.fn(), disconnect: vi.fn() })),
      createWaveShaper: vi.fn(() => ({
        curve: null as Float32Array | null,
        connect: vi.fn(),
        disconnect: vi.fn(),
      })),
    };
    engine.ctx = ctx as unknown as ShipAudioEngine['ctx'];
    engine.busManager = { musicGain: {} } as unknown as ShipAudioEngine['busManager'];
    engine.technoSynth = new TechnoMusicSynth(ctx as unknown as AudioContext);
    return { engine };
  }

  it('hard-cuts to another track by id', () => {
    const { engine } = deckHarness();
    engine.playTrack('iron-chapel');
    expect(engine.technoSynth?.currentTrack.id).toBe('iron-chapel');
    expect(engine.technoSynth?.isPlaying()).toBe(true);
    engine.playTrack('nope');
    expect(engine.technoSynth?.currentTrack.id).toBe('freaky-main');
    engine.stopTechno();
    expect(engine.technoSynth?.isPlaying()).toBe(false);
  });

  it('crossfades decks with tempo sync, then swaps', async () => {
    const { engine } = deckHarness();
    const from = engine.technoSynth;
    engine.transitionTo('iron-chapel', 0.05);
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(engine.technoSynth?.currentTrack.id).toBe('iron-chapel');
    expect(engine.technoSynth).not.toBe(from);
    expect(from?.isPlaying()).toBe(false);
    expect(engine.technoSynth?.isPlaying()).toBe(true);
    engine.stopTechno();
  }, 10000);

  it('ignores transitions to the current track', () => {
    const { engine } = deckHarness();
    const deck = engine.technoSynth;
    engine.transitionTo('freaky-main', 0.05);
    expect(engine.technoSynth).toBe(deck);
    expect(engine.technoSynth?.isPlaying()).toBe(false);
  });

  it('cycles track order and builds into a drop', async () => {
    const { engine } = deckHarness();
    expect(engine.nextTrackId()).toBe('iron-chapel');
    engine.playTrack('iron-chapel');
    expect(engine.nextTrackId()).toBe('rave-99');
    engine.technoSynth?.setVoiceMuted('ride', true);
    const from = engine.technoSynth;
    engine.transitionDropTo('rave-99', 0.1);
    await new Promise((resolve) => setTimeout(resolve, 5000));
    expect(engine.technoSynth?.currentTrack.id).toBe('rave-99');
    expect(engine.technoSynth).not.toBe(from);
    expect(from?.isPlaying()).toBe(false);
    expect(engine.technoSynth?.isPlaying()).toBe(true);
    expect(from?.isVoiceMuted('ride')).toBe(true);
    expect(from?.isVoiceMuted('lead')).toBe(false);
    engine.stopTechno();
  }, 15000);

  it('ignores drops onto the current track', () => {
    const { engine } = deckHarness();
    const deck = engine.technoSynth;
    engine.transitionDropTo('freaky-main', 0.1);
    expect(engine.technoSynth).toBe(deck);
    expect(engine.technoSynth?.isPlaying()).toBe(false);
  });
});
