/** @vitest-environment node */
import { describe, expect, it, vi } from 'vitest';
import { TerminalUiSynth } from './TerminalUiSynth';

interface ParamCall {
  op: 'set' | 'linear' | 'exponential';
  value: number;
  time: number;
}

interface FilterRec {
  type: string;
  freqCalls: ParamCall[];
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
    currentTime: 10,
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
      const rec: FilterRec = { type: '', freqCalls: [] };
      filters.push(rec);
      return {
        get type() {
          return rec.type;
        },
        set type(v: string) {
          rec.type = v;
        },
        frequency: makeParam(rec.freqCalls),
        Q: makeParam([]),
        connect: vi.fn(),
      };
    },
    createGain() {
      const rec: GainRec = { calls: [] };
      gains.push(rec);
      return { gain: makeParam(rec.calls), connect: vi.fn() };
    },
  };
  const synth = new TerminalUiSynth(ctx as unknown as AudioContext);
  return { filters, gains, oscs, sources, synth };
}

function paramTime(calls: ParamCall[], op: ParamCall['op']): number {
  return calls.find((c) => c.op === op)?.time ?? NaN;
}

function paramValue(calls: ParamCall[], op: ParamCall['op']): number {
  return calls.find((c) => c.op === op)?.value ?? NaN;
}

describe('TerminalUiSynth cash register', () => {
  it('opens with an unpitched latch burst in the 300 Hz-2.5 kHz band', () => {
    const { synth, filters, gains, sources } = rig();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    try {
      synth.playCashRegister({} as AudioNode, 0.6);
    } finally {
      vi.restoreAllMocks();
    }
    // Latch (4 staggered bursts) + hammer transient = 5 noise voices.
    expect(sources.length).toBe(5);
    const latchFilters = filters.slice(0, 4);
    for (const filter of latchFilters) {
      expect(filter.type).toBe('bandpass');
      const freq = paramValue(filter.freqCalls, 'set');
      expect(freq).toBeGreaterThanOrEqual(300);
      expect(freq).toBeLessThanOrEqual(2500);
    }
    // Sub-5 ms attack and 30-60 ms-class decay on every latch burst.
    const latchGains = gains.slice(0, 4);
    for (const gain of latchGains) {
      expect(paramTime(gain.calls, 'linear') - paramTime(gain.calls, 'set')).toBeLessThanOrEqual(
        0.005
      );
      expect(
        paramTime(gain.calls, 'exponential') - paramTime(gain.calls, 'set')
      ).toBeLessThanOrEqual(0.065);
    }
    // Staggered micro-impacts: ticks land within ~30 ms of the latch onset.
    const onsets = sources.slice(0, 4).map((s) => s.start ?? 0);
    expect(Math.max(...onsets) - Math.min(...onsets)).toBeGreaterThan(0);
    expect(Math.max(...onsets) - Math.min(...onsets)).toBeLessThanOrEqual(0.031);
  });

  it('rings a tuned bell with beating modes and a multi-second decay', () => {
    const { synth, filters, gains, oscs, sources } = rig();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    try {
      synth.playCashRegister({} as AudioNode, 0.6);
    } finally {
      vi.restoreAllMocks();
    }
    // Hammer impulse: sub-millisecond highpassed strike transient.
    expect(filters[4].type).toBe('highpass');
    expect(paramValue(filters[4].freqCalls, 'set')).toBeGreaterThanOrEqual(5000);
    expect(
      paramTime(gains[4].calls, 'linear') - paramTime(gains[4].calls, 'set')
    ).toBeLessThanOrEqual(0.001);
    // Seven cup-gong partials follow the strike.
    expect(oscs.length).toBe(7);
    const freqs = oscs.map((o) => paramValue(o.freqCalls, 'set'));
    expect(Math.min(...freqs)).toBeGreaterThanOrEqual(2000);
    expect(Math.min(...freqs)).toBeLessThanOrEqual(4500);
    expect(Math.max(...freqs)).toBeGreaterThanOrEqual(12000);
    expect(Math.max(...freqs)).toBeLessThanOrEqual(16000);
    // Beating pair: the two lowest modes sit ~38 Hz apart for shimmer.
    const sorted = [...freqs].sort((a, b) => a - b);
    expect(sorted[1] - sorted[0]).toBeGreaterThan(15);
    expect(sorted[1] - sorted[0]).toBeLessThan(70);
    // Sustain: the longest partial rings for 1.5-3 s.
    const bellGains = gains.slice(5, 12);
    const decays = bellGains.map(
      (g) => paramTime(g.calls, 'exponential') - paramTime(g.calls, 'set')
    );
    expect(Math.max(...decays)).toBeGreaterThanOrEqual(1.5);
    expect(Math.max(...decays)).toBeLessThanOrEqual(3.0);
    // Biphase timing: the bell starts ~75 ms after the latch.
    const bellStart = oscs[0].start ?? 0;
    const latchStart = sources[0].start ?? 0;
    expect(bellStart - latchStart).toBeGreaterThan(0.05);
    expect(bellStart - latchStart).toBeLessThan(0.12);
  });
});
