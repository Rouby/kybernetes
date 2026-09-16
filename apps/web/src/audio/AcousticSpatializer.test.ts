/** @vitest-environment node */
import { describe, expect, it, vi } from 'vitest';
import { AcousticSpatializer, SPATIAL_VOICE_POOL_SIZE } from './AcousticSpatializer';

function mockParam() {
  return {
    setValueAtTime: vi.fn(),
    setTargetAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    value: 0,
  };
}

function mockNode() {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    gain: mockParam(),
    frequency: mockParam(),
    Q: mockParam(),
    pan: mockParam(),
    type: '',
  };
}

function mockCtx() {
  return {
    currentTime: 0,
    createBiquadFilter: vi.fn(mockNode),
    createStereoPanner: vi.fn(mockNode),
    createGain: vi.fn(mockNode),
  };
}

describe('AcousticSpatializer voice pool', () => {
  it('caps node allocation at eight voices under combat load', () => {
    const ctx = mockCtx();
    const spatializer = new AcousticSpatializer(ctx as unknown as AudioContext);
    const destination = {} as AudioNode;
    for (let i = 0; i < 20; i += 1) spatializer.acquireChannel(destination, 100);
    expect(ctx.createGain).toHaveBeenCalledTimes(SPATIAL_VOICE_POOL_SIZE);
    expect(ctx.createBiquadFilter).toHaveBeenCalledTimes(SPATIAL_VOICE_POOL_SIZE);
    expect(ctx.createStereoPanner).toHaveBeenCalledTimes(SPATIAL_VOICE_POOL_SIZE);
  });

  it('steals the quietest voice with a click-free ramp when saturated', () => {
    const ctx = mockCtx();
    const spatializer = new AcousticSpatializer(ctx as unknown as AudioContext);
    const destination = {} as AudioNode;
    const voices = [];
    for (let i = 0; i < SPATIAL_VOICE_POOL_SIZE; i += 1) {
      const voice = spatializer.acquireChannel(destination, 100);
      spatializer.applySpatialParams(voice, { gain: i + 1 } as never);
      voices.push(voice);
    }
    const stolen = spatializer.acquireChannel(destination, 100);
    expect(voices).toContain(stolen);
    expect(ctx.createGain).toHaveBeenCalledTimes(SPATIAL_VOICE_POOL_SIZE);
    const param = (
      stolen.gain as unknown as { gain: { setTargetAtTime: ReturnType<typeof vi.fn> } }
    ).gain.setTargetAtTime;
    expect(param).toHaveBeenCalledWith(0, ctx.currentTime, expect.any(Number));
  });

  it('returns released voices to the pool', () => {
    const ctx = mockCtx();
    const spatializer = new AcousticSpatializer(ctx as unknown as AudioContext);
    const destination = {} as AudioNode;
    const voices = [];
    for (let i = 0; i < SPATIAL_VOICE_POOL_SIZE; i += 1)
      voices.push(spatializer.acquireChannel(destination, 100));
    spatializer.releaseChannel(voices[3] as never);
    expect(spatializer.acquireChannel(destination, 100)).toBe(voices[3]);
    expect(ctx.createGain).toHaveBeenCalledTimes(SPATIAL_VOICE_POOL_SIZE);
  });
});
