/** @vitest-environment node */
import { describe, expect, it, vi } from 'vitest';
import { MetallicPlateSynth } from './MetallicPlateSynth';

function mockParam() {
  return {
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
}

function mockCtx() {
  const gains: Array<ReturnType<typeof mockParam>> = [];
  return {
    gains,
    currentTime: 10,
    sampleRate: 44100,
    createBuffer: vi.fn((_channels: number, size: number) => ({
      getChannelData: () => new Float32Array(size),
    })),
    createGain: vi.fn(() => {
      const gain = mockParam();
      gains.push(gain);
      return { gain, connect: vi.fn(), disconnect: vi.fn() };
    }),
    createOscillator: vi.fn(() => ({
      type: '',
      frequency: mockParam(),
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null as (() => void) | null,
    })),
    createBufferSource: vi.fn(() => ({
      buffer: null as unknown,
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null as (() => void) | null,
    })),
    createBiquadFilter: vi.fn(() => ({
      type: '' as BiquadFilterType,
      frequency: mockParam(),
      Q: mockParam(),
      connect: vi.fn(),
      disconnect: vi.fn(),
    })),
  };
}

describe('MetallicPlateSynth crate thunk', () => {
  it('ramps from silence instead of stepping to peak', () => {
    const ctx = mockCtx();
    const synth = new MetallicPlateSynth(ctx as unknown as AudioContext);
    synth.playCrateThunk({} as AudioNode, 0.6);
    const body = ctx.gains.find((gain) =>
      gain.linearRampToValueAtTime.mock.calls.some(
        (call) => Math.abs((call[0] as number) - 0.36) < 1e-9
      )
    );
    expect(body).toBeDefined();
    const setCalls = body?.setValueAtTime.mock.calls ?? [];
    expect(setCalls[0]?.[0]).toBeCloseTo(0.001, 6);
    expect(setCalls[0]?.[1]).toBe(10);
    expect(body?.linearRampToValueAtTime).toHaveBeenCalledWith(0.36, 10.002);
  });
});
