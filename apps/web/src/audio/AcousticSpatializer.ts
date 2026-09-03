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

export class AcousticSpatializer {
  private ctx: AudioContext;
  private config: Required<AcousticConfig>;

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
  }
}
