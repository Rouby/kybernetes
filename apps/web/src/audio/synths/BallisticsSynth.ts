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
  private crackBuffer: AudioBuffer;
  private distortionCurve: Float32Array<ArrayBuffer>;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.noiseBuffer = createNoiseBuffer(ctx, 0.5, 'pink');
    this.crackBuffer = createNoiseBuffer(ctx, 0.25, 'white');
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
    } else if (weaponType === 'railgun_pistol') {
      this.playRailgunPistol(destination, volume);
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
    const dur = 0.18;
    const variation = 0.94 + Math.random() * 0.12;

    // Sharp muzzle crack
    const crack = this.ctx.createBufferSource();
    crack.buffer = this.crackBuffer;

    const crackFilter = this.ctx.createBiquadFilter();
    crackFilter.type = 'highpass';
    crackFilter.frequency.setValueAtTime(2400, t);

    const crackGain = this.ctx.createGain();
    crackGain.gain.setValueAtTime(0.001, t);
    crackGain.gain.linearRampToValueAtTime(0.85 * volume * variation, t + 0.001);
    crackGain.gain.exponentialRampToValueAtTime(0.001, t + 0.055);

    crack.connect(crackFilter);
    crackFilter.connect(crackGain);
    crackGain.connect(destination);

    // Low-frequency receiver and recoil body
    const body = this.ctx.createOscillator();
    body.type = 'triangle';
    body.frequency.setValueAtTime(105 * variation, t);
    body.frequency.exponentialRampToValueAtTime(38, t + dur);

    const bodyFilter = this.ctx.createBiquadFilter();
    bodyFilter.type = 'lowpass';
    bodyFilter.frequency.setValueAtTime(260, t);
    bodyFilter.Q.setValueAtTime(1.4, t);

    const bodyGain = this.ctx.createGain();
    bodyGain.gain.setValueAtTime(0.001, t);
    bodyGain.gain.linearRampToValueAtTime(1.05 * volume * variation, t + 0.003);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    body.connect(bodyFilter);
    bodyFilter.connect(bodyGain);
    bodyGain.connect(destination);

    // A brief sub hit provides the physical low-end impulse missing from a dry synth tone.
    const sub = this.ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(68 * variation, t);
    sub.frequency.exponentialRampToValueAtTime(38, t + 0.11);
    const subGain = this.ctx.createGain();
    subGain.gain.setValueAtTime(0.001, t);
    subGain.gain.linearRampToValueAtTime(0.7 * volume * variation, t + 0.002);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    sub.connect(subGain);
    subGain.connect(destination);

    // Mechanical action snap gives the shot a distinct weapon signature.
    const action = this.ctx.createOscillator();
    action.type = 'square';
    action.frequency.setValueAtTime(920 * variation, t + 0.012);
    action.frequency.exponentialRampToValueAtTime(240, t + 0.045);
    const actionFilter = this.ctx.createBiquadFilter();
    actionFilter.type = 'bandpass';
    actionFilter.frequency.setValueAtTime(1100, t + 0.012);
    actionFilter.Q.setValueAtTime(2.5, t);
    const actionGain = this.ctx.createGain();
    actionGain.gain.setValueAtTime(0.001, t);
    actionGain.gain.linearRampToValueAtTime(0.28 * volume * variation, t + 0.014);
    actionGain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    action.connect(actionFilter);
    actionFilter.connect(actionGain);
    actionGain.connect(destination);

    // Short smoky recoil tail fills out the impulse without masking the crack.
    const tail = this.ctx.createBufferSource();
    tail.buffer = this.noiseBuffer;
    const tailFilter = this.ctx.createBiquadFilter();
    tailFilter.type = 'bandpass';
    tailFilter.frequency.setValueAtTime(520, t + 0.018);
    tailFilter.Q.setValueAtTime(0.8, t);
    const tailGain = this.ctx.createGain();
    tailGain.gain.setValueAtTime(0.001, t);
    tailGain.gain.linearRampToValueAtTime(0.42 * volume * variation, t + 0.012);
    tailGain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    tail.connect(tailFilter);
    tailFilter.connect(tailGain);
    tailGain.connect(destination);

    crack.start(t);
    crack.stop(t + 0.055);
    body.start(t);
    body.stop(t + dur);
    sub.start(t);
    sub.stop(t + 0.12);
    action.start(t + 0.012);
    action.stop(t + 0.07);
    tail.start(t);
    tail.stop(t + 0.16);
  }

  // fallow-ignore-next-line complexity
  private playRailgunPistol(destination: AudioNode, volume: number): void {
    const t = this.ctx.currentTime;
    const dur = 0.26;
    const variation = 0.96 + Math.random() * 0.08;

    const crack = this.ctx.createBufferSource();
    crack.buffer = this.crackBuffer;
    const crackFilter = this.ctx.createBiquadFilter();
    crackFilter.type = 'highpass';
    crackFilter.frequency.setValueAtTime(3200, t);
    const crackGain = this.ctx.createGain();
    crackGain.gain.setValueAtTime(0.001, t);
    crackGain.gain.linearRampToValueAtTime(1.1 * volume * variation, t + 0.001);
    crackGain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    crack.connect(crackFilter);
    crackFilter.connect(crackGain);
    crackGain.connect(destination);

    const sub = this.ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(85 * variation, t);
    sub.frequency.exponentialRampToValueAtTime(28, t + dur);
    const subGain = this.ctx.createGain();
    subGain.gain.setValueAtTime(0.001, t);
    subGain.gain.linearRampToValueAtTime(1.2 * volume * variation, t + 0.002);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    sub.connect(subGain);
    subGain.connect(destination);

    crack.start(t);
    crack.stop(t + 0.04);
    sub.start(t);
    sub.stop(t + dur);
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
