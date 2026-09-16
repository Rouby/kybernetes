/** @vitest-environment node */
import { describe, expect, it, vi } from 'vitest';
import {
  triggerDecayingOsc,
  triggerFilteredOsc,
  triggerNoiseBurst,
  triggerShapedOsc,
} from './audioHelpers';

function mockParam() {
  return {
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
}

function mockGain() {
  return { gain: mockParam(), connect: vi.fn(), disconnect: vi.fn() };
}

function mockSource() {
  return {
    buffer: null as unknown,
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    onended: null as (() => void) | null,
  };
}

function mockFilter() {
  return {
    type: '' as BiquadFilterType,
    frequency: mockParam(),
    Q: mockParam(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
}

function mockCtx(gain: unknown, source: unknown, filter: unknown) {
  return {
    currentTime: 0,
    createGain: vi.fn(() => gain),
    createOscillator: vi.fn(() => ({ ...(source as object), frequency: mockParam(), type: '' })),
    createBufferSource: vi.fn(() => source),
    createBiquadFilter: vi.fn(() => filter),
  };
}

function fireEnded(source: { onended: (() => void) | null }): void {
  source.onended?.();
}

describe('transient node cleanup', () => {
  it('disconnects decaying osc chains on ended', () => {
    const gain = mockGain();
    const osc = {
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null as (() => void) | null,
      frequency: mockParam(),
      type: '',
    };
    const ctx = { currentTime: 0, createGain: vi.fn(() => gain) };
    triggerDecayingOsc(
      ctx as unknown as AudioContext,
      osc as unknown as OscillatorNode,
      {} as AudioNode,
      0,
      0.2
    );
    fireEnded(osc);
    expect(gain.disconnect).toHaveBeenCalledTimes(1);
  });

  it('disconnects noise bursts and their filters on ended', () => {
    const gain = mockGain();
    const source = mockSource();
    const filter = mockFilter();
    const ctx = mockCtx(gain, source, filter);
    triggerNoiseBurst(ctx as unknown as AudioContext, {} as AudioBuffer, {} as AudioNode, 0, {
      duration: 0.2,
      peak: 0.5,
      type: 'lowpass',
    });
    fireEnded(source);
    expect(gain.disconnect).toHaveBeenCalledTimes(1);
    expect(filter.disconnect).toHaveBeenCalledTimes(1);
  });

  it('disconnects unfiltered noise bursts on ended', () => {
    const gain = mockGain();
    const source = mockSource();
    const ctx = mockCtx(gain, source, mockFilter());
    triggerNoiseBurst(ctx as unknown as AudioContext, {} as AudioBuffer, {} as AudioNode, 0, {
      duration: 0.2,
      peak: 0.5,
      type: 'none',
    });
    fireEnded(source);
    expect(gain.disconnect).toHaveBeenCalledTimes(1);
  });

  it('disconnects shaped osc chains on ended', () => {
    const gain = mockGain();
    const osc = {
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null as (() => void) | null,
      frequency: mockParam(),
      type: '',
    };
    const ctx = { currentTime: 0, createGain: vi.fn(() => gain) };
    triggerShapedOsc(
      ctx as unknown as AudioContext,
      osc as unknown as OscillatorNode,
      {} as AudioNode,
      0,
      { duration: 0.2, peak: 0.5 }
    );
    fireEnded(osc);
    expect(gain.disconnect).toHaveBeenCalledTimes(1);
  });

  it('disconnects filtered osc chains and filters on ended', () => {
    const gain = mockGain();
    const filter = mockFilter();
    const osc = {
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null as (() => void) | null,
      frequency: mockParam(),
      type: '',
    };
    const ctx = { currentTime: 0, createGain: vi.fn(() => gain) };
    triggerFilteredOsc(
      ctx as unknown as AudioContext,
      osc as unknown as OscillatorNode,
      filter as unknown as BiquadFilterNode,
      {} as AudioNode,
      0,
      0.2
    );
    fireEnded(osc);
    expect(gain.disconnect).toHaveBeenCalledTimes(1);
    expect(filter.disconnect).toHaveBeenCalledTimes(1);
  });
});
