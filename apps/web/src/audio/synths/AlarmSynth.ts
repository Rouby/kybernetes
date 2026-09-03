import { triggerFilteredOsc } from '../audioHelpers';

export class AlarmSynth {
  private ctx: AudioContext;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
  }

  public playRedAlertKlaxon(destination: AudioNode, volume = 0.75): void {
    const t = this.ctx.currentTime;
    const dur = 0.9;

    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(540, t);
    osc.frequency.linearRampToValueAtTime(880, t + dur * 0.45);
    osc.frequency.linearRampToValueAtTime(540, t + dur);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1600, t);

    triggerFilteredOsc(this.ctx, osc, filter, destination, t, dur, 0.4 * volume, 0.001);
  }

  public playCautionChime(destination: AudioNode, volume = 0.5): void {
    const t = this.ctx.currentTime;
    const notes = [660, 880];

    for (let i = 0; i < notes.length; i++) {
      const noteTime = t + i * 0.12;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(notes[i], noteTime);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.3 * volume, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.25);

      osc.connect(gain);
      gain.connect(destination);

      osc.start(noteTime);
      osc.stop(noteTime + 0.25);
    }
  }

  // fallow-ignore-next-line unused-class-member
  public playGeigerClick(destination: AudioNode, volume = 0.4): void {
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1200, t);
    osc.frequency.exponentialRampToValueAtTime(100, t + 0.005);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.25 * volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.006);

    osc.connect(gain);
    gain.connect(destination);

    osc.start(t);
    osc.stop(t + 0.006);
  }
}
