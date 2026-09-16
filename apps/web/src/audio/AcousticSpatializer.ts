import type { DoorState, WallSegment } from '@kybernetes/protocol';
import {
  type AcousticConfig,
  calculateSpatialAcoustics,
  DEFAULT_ACOUSTIC_CONFIG,
  HESPERIA_WALLS,
  type SpatialAudioMathParams,
} from '@kybernetes/sim-core';

export interface SpatialNodeChannel {
  filter: BiquadFilterNode;
  panner: StereoPannerNode;
  gain: GainNode;
  input: AudioNode;
  output: AudioNode;
}

interface PooledSpatialVoice extends SpatialNodeChannel {
  busyUntil: number;
  lastGain: number;
}

/** Fixed voice count: combat never allocates nodes beyond these chains. */
export const SPATIAL_VOICE_POOL_SIZE = 8;
/** Steal fade so a reclaimed voice never clicks. */
const STEAL_RAMP_S = 0.005;

export class AcousticSpatializer {
  private ctx: AudioContext;
  private config: Required<AcousticConfig>;
  private pool: PooledSpatialVoice[] = [];

  constructor(ctx: AudioContext, config?: AcousticConfig) {
    this.ctx = ctx;
    this.config = { ...DEFAULT_ACOUSTIC_CONFIG, ...config };
  }

  public calculate(
    listenerX: number,
    listenerY: number,
    emitterX: number,
    emitterY: number,
    doors?: DoorState[],
    walls: WallSegment[] = HESPERIA_WALLS
  ): SpatialAudioMathParams {
    return calculateSpatialAcoustics(
      listenerX,
      listenerY,
      emitterX,
      emitterY,
      doors,
      walls,
      this.config
    );
  }

  public createSpatialChannel(destination: AudioNode): SpatialNodeChannel {
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(20000, this.ctx.currentTime);
    filter.Q.setValueAtTime(1.0, this.ctx.currentTime);

    const panner = this.ctx.createStereoPanner();
    panner.pan.setValueAtTime(0, this.ctx.currentTime);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(1.0, this.ctx.currentTime);

    // Route: input -> filter -> panner -> gain -> destination
    filter.connect(panner);
    panner.connect(gain);
    gain.connect(destination);

    return {
      filter,
      panner,
      gain,
      input: filter,
      output: gain,
    };
  }

  public applySpatialParams(
    channel: SpatialNodeChannel,
    params: SpatialAudioMathParams,
    rampTime = 0.05
  ): void {
    const t = this.ctx.currentTime;
    channel.filter.frequency.setTargetAtTime(params.filterCutoffHz, t, rampTime);
    channel.panner.pan.setTargetAtTime(params.pan, t, rampTime);
    channel.gain.gain.setTargetAtTime(params.gain, t, rampTime);
    const voice = this.pool.find((entry) => entry === channel);
    if (voice !== undefined) voice.lastGain = params.gain;
  }

  /**
   * Pooled voice: reuses one of 8 permanently wired chains, stealing the
   * quietest when all are busy. holdSeconds bounds the reservation; call
   * releaseChannel early when the exact envelope end is known.
   */
  public acquireChannel(destination: AudioNode, holdSeconds = 0.5): SpatialNodeChannel {
    this.ensurePool(destination);
    const now = this.ctx.currentTime;
    const free = this.pool.find((voice) => voice.busyUntil <= now);
    const voice = free ?? this.stealChannel(now);
    voice.busyUntil = now + Math.max(0, holdSeconds);
    return voice;
  }

  /** Return a voice to the pool before its hold expires. */
  public releaseChannel(channel: SpatialNodeChannel): void {
    const voice = this.pool.find((entry) => entry === channel);
    if (voice !== undefined) voice.busyUntil = 0;
  }

  private ensurePool(destination: AudioNode): void {
    if (this.pool.length > 0) return;
    for (let i = 0; i < SPATIAL_VOICE_POOL_SIZE; i += 1) {
      const channel = this.createSpatialChannel(destination);
      this.pool.push({ ...channel, busyUntil: 0, lastGain: 0 });
    }
  }

  private stealChannel(now: number): PooledSpatialVoice {
    let victim = this.pool[0] as PooledSpatialVoice;
    for (const voice of this.pool) {
      if (voice.lastGain < victim.lastGain) victim = voice;
    }
    victim.gain.gain.setTargetAtTime(0, now, STEAL_RAMP_S);
    return victim;
  }
}
