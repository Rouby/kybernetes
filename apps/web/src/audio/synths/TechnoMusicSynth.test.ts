/** @vitest-environment node */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TechnoMusicSynth } from './TechnoMusicSynth';
import { RAVE_99_TRACK } from './technoTracks';

function mockParam() {
  return {
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    setTargetAtTime: vi.fn(),
  };
}

function mockCtx() {
  const oscs: Array<{ type: string; start: unknown; stop: unknown }> = [];
  const ctx = {
    currentTime: 100,
    sampleRate: 44100,
    createBuffer: vi.fn((_ch: number, size: number) => ({
      getChannelData: () => new Float32Array(size),
    })),
    createGain: vi.fn(() => ({ gain: mockParam(), connect: vi.fn(), disconnect: vi.fn() })),
    createOscillator: vi.fn(() => {
      const osc = {
        type: '',
        frequency: mockParam(),
        detune: mockParam(),
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      oscs.push(osc);
      return osc;
    }),
    createBufferSource: vi.fn(() => ({
      buffer: null as unknown,
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    })),
    createBiquadFilter: vi.fn(() => ({
      type: '' as BiquadFilterType,
      frequency: mockParam(),
      Q: mockParam(),
      connect: vi.fn(),
      disconnect: vi.fn(),
    })),
    createDelay: vi.fn(() => ({
      delayTime: mockParam(),
      connect: vi.fn(),
      disconnect: vi.fn(),
    })),
    createWaveShaper: vi.fn(() => ({
      curve: null as Float32Array | null,
      connect: vi.fn(),
      disconnect: vi.fn(),
    })),
  };
  return { ctx, oscs };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('TechnoMusicSynth scheduler', () => {
  it('starts and stops the loop without double-starting', () => {
    const { ctx } = mockCtx();
    const synth = new TechnoMusicSynth(ctx as unknown as AudioContext);
    expect(synth.isPlaying()).toBe(false);
    synth.start({} as AudioNode, { intensity: 0.8, freak: 0.8 });
    expect(synth.isPlaying()).toBe(true);
    synth.start({} as AudioNode);
    expect(synth.isPlaying()).toBe(true);
    synth.stop();
    expect(synth.isPlaying()).toBe(false);
  });

  it('opens the downbeat with a pitch-dropping distorted kick', () => {
    const { ctx, oscs } = mockCtx();
    const synth = new TechnoMusicSynth(ctx as unknown as AudioContext);
    synth.start({} as AudioNode);
    const before = oscs.length;
    synth.scheduleStep(0, 100, 0);
    const kick = oscs[before] as unknown as {
      type: string;
      frequency: {
        setValueAtTime: ReturnType<typeof vi.fn>;
        exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
      };
    };
    expect(kick.type).toBe('sine');
    expect(kick.frequency.setValueAtTime).toHaveBeenCalledWith(160, 100);
    expect(kick.frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(42, 100.11);
    synth.stop();
  });

  it('strips to kick+clap at zero intensity and goes full freak when open', () => {
    const low = mockCtx();
    const lowSynth = new TechnoMusicSynth(low.ctx as unknown as AudioContext);
    lowSynth.start({} as AudioNode, { intensity: 0, freak: 0 });
    lowSynth.scheduleStep(16, 100, 1);
    const lowOscs = low.oscs.length;
    lowSynth.stop();

    const high = mockCtx();
    const highSynth = new TechnoMusicSynth(high.ctx as unknown as AudioContext);
    highSynth.start({} as AudioNode, { intensity: 1, freak: 1 });
    highSynth.scheduleStep(16, 100, 1);
    expect(high.oscs.length).toBeGreaterThan(lowOscs);
    highSynth.stop();
  });

  it('chops the vocal hook on bar 1 when the groove is full', () => {
    const stripped = mockCtx();
    const thin = new TechnoMusicSynth(stripped.ctx as unknown as AudioContext);
    thin.start({} as AudioNode, { intensity: 0, freak: 0 });
    thin.scheduleStep(8, 100, 0);
    const thinOscs = stripped.oscs.length;
    thin.stop();

    const full = mockCtx();
    const fat = new TechnoMusicSynth(full.ctx as unknown as AudioContext);
    fat.start({} as AudioNode, { intensity: 1, freak: 1 });
    fat.scheduleStep(8, 100, 0);
    expect(full.oscs.length).toBeGreaterThan(thinOscs);
    const chop = full.oscs[full.oscs.length - 1] as unknown as { type: string };
    expect(chop.type).toBe('sawtooth');
    fat.stop();
  });

  it('grinds a detuned saw unison on every loop', () => {
    const { ctx, oscs } = mockCtx();
    const synth = new TechnoMusicSynth(ctx as unknown as AudioContext);
    synth.start({} as AudioNode, { intensity: 1, freak: 1 });
    synth.scheduleStep(17, 100, 0);
    const restCount = oscs.length;
    synth.scheduleStep(18, 100, 0);
    expect(oscs.length).toBeGreaterThan(restCount);
    synth.scheduleStep(18, 100, 1);
    expect(oscs.length).toBeGreaterThan(restCount + 2);
    const pair = oscs.slice(-2) as unknown as Array<{ type: string }>;
    expect(pair.map((osc) => osc.type)).toEqual(['sawtooth', 'sawtooth']);
    synth.stop();
  });

  it('layers the new drums and synths at full intensity', () => {
    const { ctx, oscs } = mockCtx();
    const synth = new TechnoMusicSynth(ctx as unknown as AudioContext);
    synth.start({} as AudioNode, { intensity: 1, freak: 1 });
    synth.scheduleStep(0, 100, 0);
    const full = oscs.length;
    expect(full).toBeGreaterThan(0);
    for (const voice of ['ride', 'crash', 'knock', 'toms', 'acid'] as const) {
      synth.setVoiceMuted(voice, true);
    }
    synth.scheduleStep(0, 200, 0);
    expect(oscs.length - full).toBeLessThan(full);
    synth.stop();
  });

  it('rolls the tom fill at the end of odd loops', () => {
    const { ctx, oscs } = mockCtx();
    const synth = new TechnoMusicSynth(ctx as unknown as AudioContext);
    synth.start({} as AudioNode, { intensity: 1, freak: 1 });
    synth.scheduleStep(28, 100, 0);
    const even = oscs.length;
    synth.scheduleStep(28, 100, 1);
    expect(oscs.length).toBeGreaterThan(even);
    synth.stop();
  });

  it('squelches acid on its accents', () => {
    const { ctx, oscs } = mockCtx();
    const synth = new TechnoMusicSynth(ctx as unknown as AudioContext);
    synth.start({} as AudioNode, { intensity: 1, freak: 1 });
    synth.scheduleStep(5, 100, 0);
    const plain = oscs.length;
    synth.scheduleStep(6, 100, 0);
    expect(oscs.length).toBeGreaterThan(plain);
    synth.stop();
  });

  it('loads tracks with their default energy', () => {
    const { ctx } = mockCtx();
    const synth = new TechnoMusicSynth(ctx as unknown as AudioContext);
    expect(synth.currentTrack.id).toBe('freaky-main');
    synth.loadTrack(RAVE_99_TRACK);
    expect(synth.currentTrack.id).toBe('rave-99');
    expect(synth.getSnapshot().intensity).toBe(0.75);
  });

  it('fires roll and impact without a running loop', () => {
    const { ctx } = mockCtx();
    const synth = new TechnoMusicSynth(ctx as unknown as AudioContext);
    expect(() => {
      synth.playRoll(-1);
      synth.playImpact();
    }).not.toThrow();
    synth.start({} as AudioNode);
    expect(() => {
      synth.playRoll(3);
      synth.playImpact();
    }).not.toThrow();
    expect(synth.getSnapshot().playing).toBe(true);
    synth.stop();
  });

  it('mutes a single voice without touching the rest', () => {
    const { ctx, oscs } = mockCtx();
    const synth = new TechnoMusicSynth(ctx as unknown as AudioContext);
    synth.start({} as AudioNode, { intensity: 1, freak: 1 });
    synth.scheduleStep(2, 100, 0);
    const full = oscs.length;
    expect(full).toBeGreaterThan(0);
    expect(synth.isVoiceMuted('bass')).toBe(false);
    synth.setVoiceMuted('bass', true);
    expect(synth.isVoiceMuted('bass')).toBe(true);
    synth.scheduleStep(2, 200, 0);
    expect(oscs.length - full).toBeLessThan(full);
    synth.setVoiceMuted('bass', false);
    synth.stop();
  });

  it('solos one voice down to itself', () => {
    const { ctx, oscs } = mockCtx();
    const synth = new TechnoMusicSynth(ctx as unknown as AudioContext);
    synth.start({} as AudioNode, { intensity: 1, freak: 1 });
    synth.setSoloVoice('kick');
    synth.scheduleStep(0, 100, 0);
    expect(oscs.length).toBe(1);
    expect(synth.getSnapshot().solo).toBe('kick');
    synth.setSoloVoice(null);
    synth.stop();
  });

  it('snapshots mixer state and the sounding step', () => {
    const { ctx } = mockCtx();
    const synth = new TechnoMusicSynth(ctx as unknown as AudioContext);
    const snap = synth.getSnapshot();
    expect(snap.playing).toBe(false);
    expect(snap.muted).toEqual([]);
    expect(snap.solo).toBeNull();
    expect(snap.lastHit.kick).toEqual({ step: -1, loop: -1, at: -1 });
    expect(synth.soundingStep()).toBe(0);
  });

  it('highpasses the bass out for blends', () => {
    const { ctx } = mockCtx();
    const synth = new TechnoMusicSynth(ctx as unknown as AudioContext);
    synth.start({} as AudioNode);
    const filters = ctx.createBiquadFilter.mock.results.map(
      (result) =>
        result.value as {
          type: string;
          frequency: {
            setValueAtTime: ReturnType<typeof vi.fn>;
            setTargetAtTime: ReturnType<typeof vi.fn>;
          };
        }
    );
    const bass = filters.find((filter) => filter.type === 'highpass');
    expect(bass).toBeDefined();
    expect(bass?.frequency.setValueAtTime).toHaveBeenCalledWith(20, 100);
    synth.setBassCut(1);
    expect(bass?.frequency.setTargetAtTime).toHaveBeenCalledWith(400, 100, 0.1);
    synth.setBassCut(0);
    expect(bass?.frequency.setTargetAtTime).toHaveBeenCalledWith(20, 100, 0.1);
    synth.stop();
  });
});
