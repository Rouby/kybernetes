/** @vitest-environment node */
import { describe, expect, it, vi } from 'vitest';
import { BallisticsSynth } from './BallisticsSynth';

interface ParamCall {
  op: 'set' | 'linear' | 'exponential';
  value: number;
  time: number;
}

interface FilterRec {
  type: string;
  freqCalls: ParamCall[];
  qCalls: ParamCall[];
}

interface GainRec {
  calls: ParamCall[];
}

interface OscRec {
  type: string;
  freqCalls: ParamCall[];
  start: number | null;
  stop: number | null;
}

interface SourceRec {
  start: number | null;
  stop: number | null;
}

function makeParam(calls: ParamCall[]) {
  return {
    setValueAtTime(v: number, t: number): void {
      calls.push({ op: 'set', value: v, time: t });
    },
    linearRampToValueAtTime(v: number, t: number): void {
      calls.push({ op: 'linear', value: v, time: t });
    },
    exponentialRampToValueAtTime(v: number, t: number): void {
      calls.push({ op: 'exponential', value: v, time: t });
    },
  };
}

function rig() {
  const filters: FilterRec[] = [];
  const gains: GainRec[] = [];
  const oscs: OscRec[] = [];
  const sources: SourceRec[] = [];
  const ctx = {
    currentTime: 20,
    sampleRate: 48000,
    createBuffer(_ch: number, len: number, _sr: number) {
      return { getChannelData: (_i: number) => new Float32Array(len) };
    },
    createOscillator() {
      const rec: OscRec = { type: '', freqCalls: [], start: null, stop: null };
      oscs.push(rec);
      return {
        get type() {
          return rec.type;
        },
        set type(v: string) {
          rec.type = v;
        },
        frequency: makeParam(rec.freqCalls),
        connect: vi.fn(),
        start: vi.fn((t: number) => {
          rec.start = t;
        }),
        stop: vi.fn((t: number) => {
          rec.stop = t;
        }),
      };
    },
    createBufferSource() {
      const rec: SourceRec = { start: null, stop: null };
      sources.push(rec);
      return {
        buffer: null,
        connect: vi.fn(),
        start: vi.fn((t: number) => {
          rec.start = t;
        }),
        stop: vi.fn((t: number) => {
          rec.stop = t;
        }),
      };
    },
    createBiquadFilter() {
      const rec: FilterRec = { type: '', freqCalls: [], qCalls: [] };
      filters.push(rec);
      return {
        get type() {
          return rec.type;
        },
        set type(v: string) {
          rec.type = v;
        },
        frequency: makeParam(rec.freqCalls),
        Q: makeParam(rec.qCalls),
        connect: vi.fn(),
      };
    },
    createGain() {
      const rec: GainRec = { calls: [] };
      gains.push(rec);
      return { gain: makeParam(rec.calls), connect: vi.fn() };
    },
    createWaveShaper() {
      return { curve: null, connect: vi.fn() };
    },
  };
  const synth = new BallisticsSynth(ctx as unknown as AudioContext);
  return { filters, gains, oscs, sources, synth };
}

function first(calls: ParamCall[], op: ParamCall['op']): ParamCall {
  const found = calls.find((c) => c.op === op);
  if (!found) throw new Error('missing param call: ' + op);
  return found;
}

describe('BallisticsSynth kinetic metal impact', () => {
  it('opens with a sub-millisecond broadband shock plus low punch', () => {
    const { synth, gains, oscs } = rig();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    try {
      synth.playImpact({} as AudioNode, 'kinetic', 0.7);
    } finally {
      vi.restoreAllMocks();
    }
    const shock = gains[0];
    expect(first(shock.calls, 'linear').time - first(shock.calls, 'set').time).toBeLessThanOrEqual(
      0.001
    );
    expect(first(shock.calls, 'linear').value).toBeGreaterThan(0.5);
    const punch = oscs[0];
    const punchStart = first(punch.freqCalls, 'set').value;
    const punchEnd = first(punch.freqCalls, 'exponential').value;
    expect(punchStart).toBeGreaterThanOrEqual(80);
    expect(punchStart).toBeLessThanOrEqual(250);
    expect(punchEnd).toBeLessThan(punchStart);
  });

  it('sweeps a dispersive plate chirp down into a 1.5-8 kHz modal cluster', () => {
    const { synth, filters, oscs } = rig();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    try {
      synth.playImpact({} as AudioNode, 'kinetic', 0.7);
    } finally {
      vi.restoreAllMocks();
    }
    const chirp = oscs[1];
    expect(first(chirp.freqCalls, 'set').value).toBeGreaterThan(4000);
    expect(first(chirp.freqCalls, 'exponential').value).toBeLessThan(1200);
    const chirpFilter = filters.find((f) => first(f.qCalls, 'set').value >= 9);
    expect(chirpFilter).toBeDefined();
    const modes = oscs.slice(2, 8);
    expect(modes.length).toBeGreaterThanOrEqual(5);
    for (const mode of modes) {
      const freq = first(mode.freqCalls, 'set').value;
      expect(freq).toBeGreaterThanOrEqual(1500);
      expect(freq).toBeLessThanOrEqual(8000);
    }
  });

  it('closes with a pitch-dropping ricochet whistle carrying flutter', () => {
    const { synth, oscs } = rig();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    try {
      synth.playImpact({} as AudioNode, 'kinetic', 0.7);
    } finally {
      vi.restoreAllMocks();
    }
    const whine = oscs[oscs.length - 2];
    expect(first(whine.freqCalls, 'set').value).toBeGreaterThanOrEqual(2000);
    expect(first(whine.freqCalls, 'set').value).toBeLessThanOrEqual(3200);
    expect(first(whine.freqCalls, 'exponential').value).toBeGreaterThanOrEqual(700);
    expect(first(whine.freqCalls, 'exponential').value).toBeLessThanOrEqual(1200);
    const flutter = oscs[oscs.length - 1];
    expect((whine.stop ?? 0) - (whine.start ?? 0)).toBeGreaterThan(0.3);
    expect(flutter.start).toEqual(whine.start);
  });

  it('keeps laser and welder impacts short and non-modal', () => {
    const { synth, oscs } = rig();
    synth.playImpact({} as AudioNode, 'laser', 0.7);
    synth.playImpact({} as AudioNode, 'welder', 0.7);
    expect(oscs.length).toBe(2);
    for (const osc of oscs) {
      expect((osc.stop ?? 0) - (osc.start ?? 0)).toBeLessThanOrEqual(0.1);
    }
  });
});

describe('BallisticsSynth kinetic carbine cabin shot', () => {
  function fire(volume = 0.8) {
    const harness = rig();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    try {
      harness.synth.playWeaponFire({} as AudioNode, 'kinetic_carbine', 1, volume);
    } finally {
      vi.restoreAllMocks();
    }
    return harness;
  }

  it('opens with a saturating crack and a 180->30 Hz punch', () => {
    const { filters, gains, oscs } = fire();
    expect(filters[0].type).toBe('highpass');
    expect(first(filters[0].freqCalls, 'set').value).toBe(1200);
    const shock = gains[0].calls;
    expect(first(shock, 'linear').value).toBeGreaterThan(0.5);
    expect(first(shock, 'linear').time - first(shock, 'set').time).toBeLessThanOrEqual(0.001);
    expect(first(shock, 'exponential').time - first(shock, 'set').time).toBeLessThanOrEqual(0.02);
    expect(first(oscs[0].freqCalls, 'set').value).toBeGreaterThanOrEqual(150);
    expect(first(oscs[0].freqCalls, 'set').value).toBeLessThanOrEqual(210);
    expect(first(oscs[0].freqCalls, 'exponential').value).toBeLessThanOrEqual(60);
    expect((oscs[0].stop ?? 0) - (oscs[0].start ?? 0)).toBeLessThanOrEqual(0.08);
  });

  it('excites the hull with a 150 Hz thump and a lingering hum', () => {
    const { filters, oscs } = fire();
    expect(filters[1].type).toBe('bandpass');
    expect(first(filters[1].freqCalls, 'set').value).toBe(150);
    expect(first(filters[1].qCalls, 'set').value).toBeGreaterThanOrEqual(6);
    expect(oscs[1].type).toBe('triangle');
    expect(first(oscs[1].freqCalls, 'set').value).toBeGreaterThanOrEqual(120);
    expect(first(oscs[1].freqCalls, 'set').value).toBeLessThanOrEqual(450);
    expect((oscs[1].stop ?? 0) - (oscs[1].start ?? 0)).toBeGreaterThanOrEqual(0.6);
  });

  it('schedules slide dual-clicks and erratic casing scatter', () => {
    const { filters, oscs, sources } = fire();
    expect(sources[2].start).toBeCloseTo(20.035, 3);
    expect(sources[3].start).toBeCloseTo(20.055, 3);
    expect(filters[2].type).toBe('bandpass');
    expect(filters[3].type).toBe('bandpass');
    expect(first(filters[2].freqCalls, 'set').value).toBeGreaterThanOrEqual(2500);
    expect(first(filters[3].freqCalls, 'set').value).toBeLessThanOrEqual(3500);
    for (const casing of oscs.slice(2, 6)) {
      const freq = first(casing.freqCalls, 'set').value;
      expect(freq).toBeGreaterThanOrEqual(4000);
      expect(freq).toBeLessThanOrEqual(8000);
      expect((casing.start ?? 0) - 20).toBeGreaterThan(0.1);
    }
  });

  it('closes with a slow-attack threshold-shift ring', () => {
    const { gains, oscs } = fire();
    expect(first(oscs[6].freqCalls, 'set').value).toBeGreaterThanOrEqual(3700);
    expect(first(oscs[6].freqCalls, 'set').value).toBeLessThanOrEqual(4300);
    expect((oscs[6].start ?? 0) - 20).toBeCloseTo(0.05, 3);
    const ring = gains[10].calls;
    expect(first(ring, 'linear').time - first(ring, 'set').time).toBeGreaterThanOrEqual(0.08);
  });
});
