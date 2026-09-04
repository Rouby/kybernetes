import { createNoiseBuffer } from '../audioHelpers';

export class VitalsMonitorSynth {
  private ctx: AudioContext;
  private noiseBuffer: AudioBuffer;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.noiseBuffer = createNoiseBuffer(ctx, 1.0, 'pink');
  }

  public playHeartbeat(destination: AudioNode, bpm = 75, volume = 0.8): void {
    const t = this.ctx.currentTime;
    const beatInterval = 60 / bpm;
    const lubTime = t;
    const dubTime = t + Math.min(0.18, beatInterval * 0.25);

    this.renderHeartThump(destination, lubTime, 58, 0.7 * volume);
    this.renderHeartThump(destination, dubTime, 46, 0.5 * volume);
  }

  private renderHeartThump(
    destination: AudioNode,
    startTime: number,
    freq: number,
    vol: number
  ): void {
    const dur = 0.12;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, startTime);
    osc.frequency.exponentialRampToValueAtTime(32, startTime + dur);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + dur);

    osc.connect(gain);
    gain.connect(destination);

    osc.start(startTime);
    osc.stop(startTime + dur);
  }

  public playSuffocationBreath(destination: AudioNode, isInhale: boolean, volume = 0.6): void {
    const t = this.ctx.currentTime;
    const dur = 0.65;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.setValueAtTime(2.5, t);

    if (isInhale) {
      filter.frequency.setValueAtTime(350, t);
      filter.frequency.linearRampToValueAtTime(750, t + dur);
    } else {
      filter.frequency.setValueAtTime(700, t);
      filter.frequency.linearRampToValueAtTime(280, t + dur);
    }

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.35 * volume, t + dur * 0.3);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    this.playFilteredNoise(filter, gain, destination, t, dur);
  }

  private playFilteredNoise(
    filter: BiquadFilterNode,
    gain: GainNode,
    destination: AudioNode,
    startTime: number,
    duration: number
  ): void {
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(destination);
    noise.start(startTime);
    noise.stop(startTime + duration);
  }

  public playTinnitusRing(destination: AudioNode, durationSeconds = 3.5, volume = 0.5): void {
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(3800, t);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.35 * volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + durationSeconds);

    osc.connect(gain);
    gain.connect(destination);

    osc.start(t);
    osc.stop(t + durationSeconds);
  }

  public playVisorSeal(destination: AudioNode, sealed: boolean, volume = 0.5): void {
    const t = this.ctx.currentTime;
    const dur = 0.22;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(sealed ? 900 : 500, t);
    filter.frequency.exponentialRampToValueAtTime(sealed ? 300 : 1200, t + dur);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.4 * volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    this.playFilteredNoise(filter, gain, destination, t, dur);
  }

  // fallow-ignore-next-line unused-class-member
  public playSuitO2Warning(destination: AudioNode, volume = 0.4): void {
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.setValueAtTime(1174.66, t + 0.08);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.2 * volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

    osc.connect(gain);
    gain.connect(destination);
    osc.start(t);
    osc.stop(t + 0.18);
  }
}
