import { createNoiseBuffer, triggerFilteredOsc } from '../audioHelpers';

export type DeckSurfaceType = 'steel' | 'grate' | 'linoleum';

export class MetallicPlateSynth {
  private ctx: AudioContext;
  private noiseBuffer: AudioBuffer;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.noiseBuffer = createNoiseBuffer(ctx, 0.5, 'pink');
  }

  // fallow-ignore-next-line complexity
  public playFootstep(
    destination: AudioNode,
    surface: DeckSurfaceType = 'steel',
    volume = 1.0
  ): void {
    const t = this.ctx.currentTime;
    const dur = surface === 'grate' ? 0.045 : surface === 'steel' ? 0.035 : 0.025;
    const variation = 0.92 + Math.random() * 0.16;

    // 1. Noise transient for sole impact
    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = this.noiseBuffer;

    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = surface === 'grate' ? 'bandpass' : 'lowpass';
    noiseFilter.frequency.setValueAtTime(surface === 'grate' ? 2200 : 1200, t);
    noiseFilter.Q.setValueAtTime(surface === 'grate' ? 4.0 : 1.0, t);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.35 * volume * variation, t);
    noiseGain.gain.linearRampToValueAtTime(0.35 * volume * variation, t + 0.002);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(destination);

    // 2. Resonant body thud (steel deck modal resonance)
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();

    const baseFreq = surface === 'grate' ? 340 : surface === 'steel' ? 140 : 90;
    const startFreq = baseFreq * variation;
    osc.type = surface === 'grate' ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(startFreq, t);
    osc.frequency.exponentialRampToValueAtTime(startFreq * 0.5, t + dur * 1.5);

    oscGain.gain.setValueAtTime(0.001, t);
    oscGain.gain.linearRampToValueAtTime(0.4 * volume * variation, t + 0.002);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + dur * 1.5);

    osc.connect(oscGain);
    oscGain.connect(destination);

    noiseSource.start(t);
    noiseSource.stop(t + dur);
    osc.start(t);
    osc.stop(t + dur * 1.5);
  }

  public playHullGroan(destination: AudioNode, intensity = 0.5): void {
    const t = this.ctx.currentTime;
    const dur = 1.8 + Math.random() * 1.2;

    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.setValueAtTime(8.0, t);

    const startF = 180 + Math.random() * 60;
    const peakF = startF + 120 + Math.random() * 80;
    filter.frequency.setValueAtTime(startF, t);
    filter.frequency.linearRampToValueAtTime(peakF, t + dur * 0.4);
    filter.frequency.linearRampToValueAtTime(startF * 0.8, t + dur);

    const gain = triggerFilteredOsc(this.ctx, osc, filter, destination, t, dur, 0.001, 0.001);
    gain.gain.linearRampToValueAtTime(0.25 * intensity, t + dur * 0.3);
  }
}
