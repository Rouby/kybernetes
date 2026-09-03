import { createDistortionCurve, createNoiseBuffer } from '../audioHelpers';

export class ReactorDroneSynth {
  private ctx: AudioContext;
  private isRunning = false;

  // Reactor Oscillators
  private osc1: OscillatorNode | null = null;
  private osc2: OscillatorNode | null = null;
  private reactorGain: GainNode | null = null;
  private reactorPulse: OscillatorNode | null = null;
  private reactorPulseDepth: GainNode | null = null;

  // Ventilation Air Loop
  private ventSource: AudioBufferSourceNode | null = null;
  private ventFilter: BiquadFilterNode | null = null;
  private ventGain: GainNode | null = null;

  // Bridge CRT Whine
  private crtOsc: OscillatorNode | null = null;
  private crtGain: GainNode | null = null;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
  }

  public start(ambienceBus: AudioNode): void {
    if (this.isRunning) return;
    this.isRunning = true;
    const t = this.ctx.currentTime;

    // 1. Dual Detuned Hull/Reactor Oscillators
    this.osc1 = this.ctx.createOscillator();
    this.osc2 = this.ctx.createOscillator();
    this.reactorGain = this.ctx.createGain();
    this.reactorPulse = this.ctx.createOscillator();
    this.reactorPulseDepth = this.ctx.createGain();

    this.osc1.type = 'triangle';
    this.osc2.type = 'triangle';
    this.osc1.frequency.setValueAtTime(48.0, t);
    this.osc2.frequency.setValueAtTime(49.5, t); // 1.5 Hz binaural pulse

    const shaper = this.ctx.createWaveShaper();
    shaper.curve = createDistortionCurve(10);

    const lowpass = this.ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(220, t);

    this.reactorGain.gain.setValueAtTime(0.35, t);
    this.reactorPulse.type = 'sine';
    this.reactorPulse.frequency.setValueAtTime(0.18, t);
    this.reactorPulseDepth.gain.setValueAtTime(0.045, t);

    this.osc1.connect(shaper);
    this.osc2.connect(shaper);
    shaper.connect(lowpass);
    lowpass.connect(this.reactorGain);
    this.reactorGain.connect(ambienceBus);
    this.reactorPulse.connect(this.reactorPulseDepth);
    this.reactorPulseDepth.connect(this.reactorGain.gain);

    this.osc1.start(t);
    this.osc2.start(t);
    this.reactorPulse.start(t);

    // 2. Ventilation Air Circulation Hiss
    const pinkNoise = createNoiseBuffer(this.ctx, 2.0, 'pink');
    this.ventSource = this.ctx.createBufferSource();
    this.ventSource.buffer = pinkNoise;
    this.ventSource.loop = true;

    this.ventFilter = this.ctx.createBiquadFilter();
    this.ventFilter.type = 'bandpass';
    this.ventFilter.frequency.setValueAtTime(420, t);
    this.ventFilter.Q.setValueAtTime(1.5, t);

    this.ventGain = this.ctx.createGain();
    this.ventGain.gain.setValueAtTime(0.18, t);

    this.ventSource.connect(this.ventFilter);
    this.ventFilter.connect(this.ventGain);
    this.ventGain.connect(ambienceBus);
    this.ventSource.start(t);

    // 3. Bridge CRT 15.6 kHz Flyback Whine
    this.crtOsc = this.ctx.createOscillator();
    this.crtGain = this.ctx.createGain();
    this.crtOsc.type = 'sine';
    this.crtOsc.frequency.setValueAtTime(15625, t);
    this.crtGain.gain.setValueAtTime(0.015, t); // Very subtle presence

    this.crtOsc.connect(this.crtGain);
    this.crtGain.connect(ambienceBus);
    this.crtOsc.start(t);
  }

  // fallow-ignore-next-line complexity
  public updateTelemetry(reactorLoadPct: number, o2Pct: number, isOnBridge: boolean): void {
    if (!this.isRunning || !this.osc1 || !this.osc2 || !this.ventFilter || !this.crtGain) return;
    const t = this.ctx.currentTime;

    // Pitch scales with reactor load: 48Hz at idle -> 72Hz at max load
    const clampedLoad = Math.max(0, Math.min(100, reactorLoadPct));
    const targetBaseFreq = 48.0 + (clampedLoad / 100) * 24.0;
    this.osc1.frequency.setTargetAtTime(targetBaseFreq, t, 0.2);
    this.osc2.frequency.setTargetAtTime(targetBaseFreq + 1.5, t, 0.2);

    // Ventilation rolls off if oxygen drops below 40%
    const o2Ratio = Math.max(0, Math.min(1, o2Pct / 100));
    const ventFreq = Math.max(100, 420 * o2Ratio);
    this.ventFilter.frequency.setTargetAtTime(ventFreq, t, 0.3);

    // CRT whine only active on Command Bridge
    const targetCrt = isOnBridge ? 0.02 : 0.0;
    this.crtGain.gain.setTargetAtTime(targetCrt, t, 0.1);
  }

  // fallow-ignore-next-line unused-class-member
  public stop(): void {
    if (!this.isRunning) return;
    try {
      this.osc1?.stop();
      this.osc2?.stop();
      this.reactorPulse?.stop();
      this.ventSource?.stop();
      this.crtOsc?.stop();
    } catch {
      // ignore
    }
    this.isRunning = false;
  }
}
