/** @vitest-environment node */
import { describe, expect, it, vi } from 'vitest';
import { type ChantKind, VocalChantSynth } from './VocalChantSynth';

const KINDS: readonly ChantKind[] = ['oh4', 'aah', 'oh', 'ah', 'go', 'hey', 'yes', 'rave', 'high'];

function mockCtx() {
  return {
    currentTime: 50,
    sampleRate: 44100,
    createBuffer: vi.fn((_ch: number, size: number) => ({
      getChannelData: () => new Float32Array(size),
    })),
    createBufferSource: vi.fn(() => ({
      buffer: null as unknown,
      connect: vi.fn(),
      start: vi.fn(),
    })),
    createGain: vi.fn(() => ({
      gain: {
        setValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    })),
  };
}

describe('VocalChantSynth', () => {
  it('pre-renders every chant kind at construction', () => {
    const ctx = mockCtx();
    new VocalChantSynth(ctx as unknown as AudioContext);
    expect(ctx.createBuffer).toHaveBeenCalledTimes(KINDS.length);
  });

  it('triggers clips as one-shot buffer sources', () => {
    const ctx = mockCtx();
    const synth = new VocalChantSynth(ctx as unknown as AudioContext);
    const sources = ctx.createBufferSource;
    for (const kind of KINDS) {
      const before = sources.mock.calls.length;
      synth.playChant({} as AudioNode, kind);
      expect(sources.mock.calls.length).toBe(before + 1);
    }
  });
});
