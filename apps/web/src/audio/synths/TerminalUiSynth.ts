import { createNoiseBuffer, triggerDecayingOsc } from '../audioHelpers';

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

  /** Trade register: two ascending blips for an incoming sale. */
  public playCashRegister(destination: AudioNode, volume = 0.6): void {
    const t = this.ctx.currentTime;
    for (const [offset, freq] of [
      [0, 880],
      [0.09, 1318.5],
    ] as const) {
      const osc = this.ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, t + offset);
      triggerDecayingOsc(this.ctx, osc, destination, t + offset, 0.07, 0.12 * volume);
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
