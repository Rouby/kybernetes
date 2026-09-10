import { createNoiseBuffer, triggerDecayingOsc, triggerNoiseBurst } from '../audioHelpers';

/**
 * Bronze cup-gong partials as [ratio, level, decaySeconds].
 * The 1.0 / 1.012 pair beats at ~38 Hz for the shimmering phase
 * interference of closely spaced bell modes; the stack reaches
 * ~13.7 kHz so brilliance extends into the 12-16 kHz band.
 */
const CASH_BELL_PARTIALS: ReadonlyArray<readonly [number, number, number]> = [
  [1.0, 0.32, 2.4],
  [1.012, 0.24, 2.1],
  [1.483, 0.15, 1.6],
  [2.086, 0.11, 1.25],
  [2.553, 0.085, 1.0],
  [3.423, 0.055, 0.75],
  [4.345, 0.035, 0.55],
];

export class TerminalUiSynth {
  private ctx: AudioContext;
  private noiseBuffer: AudioBuffer;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.noiseBuffer = createNoiseBuffer(ctx, 0.2, 'white');
  }

  public playClick(destination: AudioNode, volume = 0.5): void {
    const t = this.ctx.currentTime;
    const dur = 0.015;

    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1400, t);
    osc.frequency.exponentialRampToValueAtTime(320, t + dur);

    triggerDecayingOsc(this.ctx, osc, destination, t, dur, 0.3 * volume);
  }

  public playPromptChirp(destination: AudioNode, volume = 0.4): void {
    const t = this.ctx.currentTime;
    const dur = 0.05;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(1320, t + dur);

    triggerDecayingOsc(this.ctx, osc, destination, t, dur, 0.2 * volume);
  }

  public playTelemetrySquelch(destination: AudioNode, volume = 0.4): void {
    const t = this.ctx.currentTime;
    const dur = 0.04;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2400, t);
    filter.Q.setValueAtTime(3.0, t);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.25 * volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(destination);

    noise.start(t);
    noise.stop(t + dur);
  }

  /**
   * Cash register "Ca-sching": an unpitched latch/drawer-slide friction
   * burst (300 Hz-2.5 kHz, sub-5 ms attack, 30-60 ms decay) followed ~75 ms
   * later by a tuned bronze bell strike (fundamental 2-4.5 kHz with
   * high-Q inharmonic overtones to ~14 kHz, 1.5-3 s ring-down).
   */
  public playCashRegister(destination: AudioNode, volume = 0.6): void {
    const t = this.ctx.currentTime;
    const variation = 0.98 + Math.random() * 0.04;
    this.playLatchBurst(destination, t, volume);
    this.playBellStrike(destination, t + 0.075, volume, variation);
  }

  /** Phase 1 "Ca-": latch release, ratchet ticks and drawer-slide sheen. */
  private playLatchBurst(destination: AudioNode, t: number, volume: number): void {
    const ctx = this.ctx;
    const buf = this.noiseBuffer;
    const main: Parameters<typeof triggerNoiseBurst>[4] = {
      duration: 0.05,
      peak: 0.5 * volume,
      type: 'bandpass',
      frequency: 1400,
      q: 1.1,
      attackTime: 0.003,
    };
    triggerNoiseBurst(ctx, buf, destination, t, main);
    triggerNoiseBurst(ctx, buf, destination, t + 0.012, {
      duration: 0.03,
      peak: 0.28 * volume,
      type: 'bandpass',
      frequency: 900,
      q: 3.0,
      attackTime: 0.002,
    });
    triggerNoiseBurst(ctx, buf, destination, t + 0.026, {
      duration: 0.025,
      peak: 0.2 * volume,
      type: 'bandpass',
      frequency: 2100,
      q: 3.5,
      attackTime: 0.0015,
    });
    triggerNoiseBurst(ctx, buf, destination, t, {
      duration: 0.06,
      peak: 0.16 * volume,
      type: 'bandpass',
      frequency: 800,
      frequencyEnd: 2300,
      q: 1.0,
      attackTime: 0.004,
    });
  }

  /** Phase 2 "-sching": hammer impulse plus sustained cup-gong modes. */
  private playBellStrike(
    destination: AudioNode,
    t: number,
    volume: number,
    variation: number
  ): void {
    triggerNoiseBurst(this.ctx, this.noiseBuffer, destination, t, {
      duration: 0.02,
      peak: 0.25 * volume,
      type: 'highpass',
      frequency: 6000,
      attackTime: 0.0008,
    });
    this.playBellPartials(destination, t, volume, variation);
  }

  /** High-Q non-harmonic bell modes with exponential ring-down. */
  private playBellPartials(
    destination: AudioNode,
    t: number,
    volume: number,
    variation: number
  ): void {
    const fundamental = 3160 * variation;
    for (const [ratio, level, decay] of CASH_BELL_PARTIALS) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(fundamental * ratio, t);
      triggerDecayingOsc(this.ctx, osc, destination, t, decay, level * volume);
    }
  }

  public playDebriefStamp(destination: AudioNode, volume = 0.9): void {
    const t = this.ctx.currentTime;
    const dur = 0.35;

    // 1. Heavy pneumatic impact thump
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(85, t);
    osc.frequency.exponentialRampToValueAtTime(28, t + dur);

    const oscGain = this.ctx.createGain();
    oscGain.gain.setValueAtTime(0.85 * volume, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    osc.connect(oscGain);
    oscGain.connect(destination);

    // 2. Metallic mechanical rim slap
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1800, t);
    filter.Q.setValueAtTime(4.0, t);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.5 * volume, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(destination);

    osc.start(t);
    osc.stop(t + dur);
    noise.start(t);
    noise.stop(t + 0.08);
  }
}
