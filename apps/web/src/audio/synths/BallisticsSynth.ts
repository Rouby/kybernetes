import type { WeaponType } from '@kybernetes/protocol';
import {
  createDistortionCurve,
  createNoiseBuffer,
  triggerDecayingOsc,
  triggerFilteredOsc,
} from '../audioHelpers';

export class BallisticsSynth {
  private ctx: AudioContext;
  private noiseBuffer: AudioBuffer;
  private distortionCurve: Float32Array<ArrayBuffer>;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.noiseBuffer = createNoiseBuffer(ctx, 0.5, 'pink');
    this.distortionCurve = createDistortionCurve(25);
  }

  // fallow-ignore-next-line complexity
  public playWeaponFire(
    destination: AudioNode,
    weaponType: WeaponType | 'raider_plasma',
    chargeRatio = 1.0,
    volume = 1.0
  ): void {
    if (weaponType === 'kinetic_carbine') {
      this.playKineticCarbine(destination, volume);
    } else if (weaponType === 'pulse_laser') {
      this.playPulseLaser(destination, chargeRatio, volume);
    } else if (weaponType === 'arc_welder') {
      this.playArcWelderPulse(destination, volume);
    } else if (weaponType === 'raider_plasma') {
      this.playRaiderPlasma(destination, volume);
    }
  }

  private playKineticCarbine(destination: AudioNode, volume: number): void {
    const t = this.ctx.currentTime;
    const dur = 0.12;
    const variation = 0.94 + Math.random() * 0.12;

    // Transient noise pop
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.setValueAtTime(1400, t);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.001, t);
    noiseGain.gain.linearRampToValueAtTime(0.6 * volume * variation, t + 0.001);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(destination);

    // Body resonance thump
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160 * variation, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + dur);

    const oscGain = this.ctx.createGain();
    oscGain.gain.setValueAtTime(0.001, t);
    oscGain.gain.linearRampToValueAtTime(0.7 * volume * variation, t + 0.001);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    osc.connect(oscGain);
    oscGain.connect(destination);

    noise.start(t);
    noise.stop(t + 0.04);
    osc.start(t);
    osc.stop(t + dur);
  }

  private playPulseLaser(destination: AudioNode, chargeRatio: number, volume: number): void {
    const t = this.ctx.currentTime;
    const dur = 0.09 * Math.max(0.5, chargeRatio);

    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    const startF = 1800 * Math.max(0.8, chargeRatio);
    osc.frequency.setValueAtTime(startF, t);
    osc.frequency.exponentialRampToValueAtTime(180, t + dur);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(startF * 0.8, t);
    filter.frequency.exponentialRampToValueAtTime(320, t + dur);
    filter.Q.setValueAtTime(8.0, t);

    triggerFilteredOsc(
      this.ctx,
      osc,
      filter,
      destination,
      t,
      dur,
      0.55 * volume * Math.max(0.6, chargeRatio)
    );
  }

  private playArcWelderPulse(destination: AudioNode, volume: number): void {
    const t = this.ctx.currentTime;
    const dur = 0.08;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2800 + Math.random() * 800, t);
    filter.Q.setValueAtTime(5.0, t);

    const shaper = this.ctx.createWaveShaper();
    shaper.curve = this.distortionCurve;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.4 * volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    noise.connect(filter);
    filter.connect(shaper);
    shaper.connect(gain);
    gain.connect(destination);

    noise.start(t);
    noise.stop(t + dur);
  }

  private playRaiderPlasma(destination: AudioNode, volume: number): void {
    const t = this.ctx.currentTime;
    const dur = 0.14;

    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(680, t);
    osc.frequency.exponentialRampToValueAtTime(90, t + dur);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1100, t);
    filter.frequency.exponentialRampToValueAtTime(200, t + dur);

    triggerFilteredOsc(this.ctx, osc, filter, destination, t, dur, 0.5 * volume);
  }

  public playImpact(
    destination: AudioNode,
    type: 'kinetic' | 'laser' | 'welder',
    volume = 0.7
  ): void {
    const t = this.ctx.currentTime;
    const dur = 0.07;

    const osc = this.ctx.createOscillator();
    osc.type = type === 'laser' ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(type === 'laser' ? 420 : 180, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + dur);

    triggerDecayingOsc(this.ctx, osc, destination, t, dur, 0.5 * volume);
  }
}
