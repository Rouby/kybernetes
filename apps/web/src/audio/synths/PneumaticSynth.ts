import { createDistortionCurve, createNoiseBuffer } from '../audioHelpers';

export class PneumaticSynth {
  private ctx: AudioContext;
  private noiseBuffer: AudioBuffer;
  private distortionCurve: Float32Array<ArrayBuffer>;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.noiseBuffer = createNoiseBuffer(ctx, 1.5, 'white');
    this.distortionCurve = createDistortionCurve(15);
  }

  public playDoorCycle(destination: AudioNode, isOpen: boolean, volume = 0.8): void {
    const t = this.ctx.currentTime;
    const dur = 0.45;

    // 1. Pneumatic Air Bleed
    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.setValueAtTime(3.5, t);

    if (isOpen) {
      filter.frequency.setValueAtTime(3200, t);
      filter.frequency.exponentialRampToValueAtTime(600, t + dur);
    } else {
      filter.frequency.setValueAtTime(800, t);
      filter.frequency.exponentialRampToValueAtTime(2800, t + dur);
    }

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.3 * volume, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    noiseSource.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(destination);

    // 2. Heavy locking solenoid / latch thump
    const solenoidOsc = this.ctx.createOscillator();
    solenoidOsc.type = 'sine';
    solenoidOsc.frequency.setValueAtTime(75, t);
    solenoidOsc.frequency.exponentialRampToValueAtTime(35, t + 0.12);

    const shaper = this.ctx.createWaveShaper();
    shaper.curve = this.distortionCurve;

    const solenoidGain = this.ctx.createGain();
    solenoidGain.gain.setValueAtTime(0.5 * volume, t);
    solenoidGain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

    solenoidOsc.connect(shaper);
    shaper.connect(solenoidGain);
    solenoidGain.connect(destination);

    noiseSource.start(t);
    noiseSource.stop(t + dur);
    solenoidOsc.start(t);
    solenoidOsc.stop(t + 0.15);
  }

  // fallow-ignore-next-line unused-class-member
  public playVentingBurst(destination: AudioNode, durationSeconds = 1.0, volume = 0.7): void {
    const t = this.ctx.currentTime;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    noise.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1400, t);
    filter.Q.setValueAtTime(2.0, t);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.35 * volume, t + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, t + durationSeconds);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(destination);

    noise.start(t);
    noise.stop(t + durationSeconds);
  }
}
