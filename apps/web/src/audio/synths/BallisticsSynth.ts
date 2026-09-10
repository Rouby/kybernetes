import type { WeaponType } from '@kybernetes/protocol';
import {
  createDistortionCurve,
  createNoiseBuffer,
  triggerDecayingOsc,
  triggerFilteredOsc,
  triggerNoiseBurst,
  triggerShapedOsc,
} from '../audioHelpers';

/**
 * Thin-plate modal cluster as [frequencyHz, level, decaySeconds].
 * High-Q inharmonic peaks spanning the 1.5-8 kHz "spang" band.
 */
const PLATE_MODES: ReadonlyArray<readonly [number, number, number]> = [
  [1720, 0.12, 0.55],
  [2480, 0.1, 0.5],
  [3310, 0.085, 0.45],
  [4570, 0.07, 0.38],
  [6120, 0.05, 0.3],
  [7480, 0.04, 0.26],
];

/**
 * Spent-casing ricochets as [freqRatio, offsetSec, decaySec, peak].
 * Base 5.2 kHz keeps every ting inside the 4-8 kHz band; erratic
 * non-monotonic peaks mimic microgravity scatter off metal lockers.
 */
const CASING_TINGS: ReadonlyArray<readonly [number, number, number, number]> = [
  [1.0, 0.14, 0.18, 0.1],
  [1.19, 0.31, 0.14, 0.07],
  [0.86, 0.52, 0.2, 0.085],
  [1.41, 0.78, 0.12, 0.045],
];

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

  /**
   * Carbine shot inside a pressurized module: a clipping overpressure
   * blast (phase 1), structure-borne hull excitation (phase 3), slide
   * action plus tumbling casing scatter (phase 4), and a quiet
   * threshold-shift ring.
   */
  private playKineticCarbine(destination: AudioNode, volume: number): void {
    const t = this.ctx.currentTime;
    const variation = 0.94 + Math.random() * 0.12;
    this.playMuzzleBlast(destination, t, volume, variation);
    this.playHullConduction(destination, t, volume, variation);
    this.playActionAndCasing(destination, t, volume, variation);
    this.playShotTinnitus(destination, t + 0.05, volume, variation);
  }

  /** Phase 1: N-wave crack through saturation plus 180->30 Hz chest punch. */
  private playMuzzleBlast(
    destination: AudioNode,
    t: number,
    volume: number,
    variation: number
  ): void {
    const crack = this.ctx.createBufferSource();
    crack.buffer = this.crackBuffer;

    const crackFilter = this.ctx.createBiquadFilter();
    crackFilter.type = 'highpass';
    crackFilter.frequency.setValueAtTime(1200 * variation, t);

    const saturator = this.ctx.createWaveShaper();
    saturator.curve = this.distortionCurve;

    const crackGain = this.ctx.createGain();
    crackGain.gain.setValueAtTime(0.001, t);
    crackGain.gain.linearRampToValueAtTime(1.0 * volume * variation, t + 0.0005);
    crackGain.gain.exponentialRampToValueAtTime(0.001, t + 0.015);

    crack.connect(crackFilter);
    crackFilter.connect(saturator);
    saturator.connect(crackGain);
    crackGain.connect(destination);

    const punch = this.ctx.createOscillator();
    punch.type = 'sine';
    punch.frequency.setValueAtTime(180 * variation, t);
    punch.frequency.exponentialRampToValueAtTime(30, t + 0.04);

    const punchGain = this.ctx.createGain();
    punchGain.gain.setValueAtTime(0.001, t);
    punchGain.gain.linearRampToValueAtTime(1.05 * volume * variation, t + 0.001);
    punchGain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);

    punch.connect(punchGain);
    punchGain.connect(destination);

    crack.start(t);
    crack.stop(t + 0.05);
    punch.start(t);
    punch.stop(t + 0.06);
  }

  /** Phase 3: airframe excitation, 150 Hz hoop thump plus lingering hum. */
  private playHullConduction(
    destination: AudioNode,
    t: number,
    volume: number,
    variation: number
  ): void {
    triggerNoiseBurst(this.ctx, this.noiseBuffer, destination, t, {
      duration: 0.3,
      peak: 0.5 * volume * variation,
      type: 'bandpass',
      frequency: 150,
      q: 8.0,
      attackTime: 0.002,
    });
    this.playHullHum(destination, t, volume, variation);
  }

  /** Cylindrical hull bending modes droning in the 120-450 Hz band. */
  private playHullHum(destination: AudioNode, t: number, volume: number, variation: number): void {
    const dur = 0.9;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(210 * variation, t);
    osc.frequency.exponentialRampToValueAtTime(130, t + dur);

    triggerShapedOsc(this.ctx, osc, destination, t, {
      duration: dur,
      peak: 0.22 * volume,
      attackTime: 0.012,
    });
  }

  /** Phase 4: slide dual-click near 3 kHz plus erratic casing tings. */
  private playActionAndCasing(
    destination: AudioNode,
    t: number,
    volume: number,
    variation: number
  ): void {
    triggerNoiseBurst(this.ctx, this.crackBuffer, destination, t + 0.035, {
      duration: 0.012,
      peak: 0.25 * volume,
      type: 'bandpass',
      frequency: 3000,
      q: 5.0,
      attackTime: 0.001,
    });
    triggerNoiseBurst(this.ctx, this.crackBuffer, destination, t + 0.055, {
      duration: 0.012,
      peak: 0.2 * volume,
      type: 'bandpass',
      frequency: 2900,
      q: 5.0,
      attackTime: 0.001,
    });
    this.playCasingTings(destination, t, volume, variation);
  }

  /** High-Q brass tings scattering off lockers, 4-8 kHz. */
  private playCasingTings(
    destination: AudioNode,
    t: number,
    volume: number,
    variation: number
  ): void {
    const base = 5200 * variation;
    for (const [ratio, offset, decay, peak] of CASING_TINGS) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(base * ratio, t + offset);
      triggerDecayingOsc(this.ctx, osc, destination, t + offset, decay, peak * volume);
    }
  }

  /** Temporary threshold shift: faint 4 kHz ring fading in after 50 ms. */
  private playShotTinnitus(
    destination: AudioNode,
    t: number,
    volume: number,
    variation: number
  ): void {
    const dur = 0.7;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(4050 * variation, t);

    triggerShapedOsc(this.ctx, osc, destination, t, {
      duration: dur,
      peak: 0.045 * volume,
      attackTime: 0.15,
    });
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

  /**
   * Bullet striking a metal wall: a Dirac-like ballistic shock with
   * low-frequency punch (phase 1), a downward-sweeping dispersive plate
   * chirp plus high-Q modal "spang" (phase 2), and a pitch-dropping
   * ricochet whistle when a fragment deflects (phase 3).
   */
  public playImpact(
    destination: AudioNode,
    type: 'kinetic' | 'laser' | 'welder',
    volume = 0.7
  ): void {
    if (type === 'kinetic') {
      this.playKineticMetalImpact(destination, volume);
      return;
    }
    this.playEnergyImpact(destination, type, volume);
  }

  /** Orchestrates the three kinetic phases with shared timing. */
  private playKineticMetalImpact(destination: AudioNode, volume: number): void {
    const t = this.ctx.currentTime;
    const variation = 0.94 + Math.random() * 0.12;
    this.playShockSlap(destination, t, volume, variation);
    this.playPlateDispersion(destination, t, volume, variation);
    this.playPlateModes(destination, t, volume, variation);
    this.playRicochetWhine(destination, t + 0.08, volume, variation);
  }

  /** Phase 1: extreme-crest broadband shock plus bulk plate punch. */
  private playShockSlap(
    destination: AudioNode,
    t: number,
    volume: number,
    variation: number
  ): void {
    triggerNoiseBurst(this.ctx, this.crackBuffer, destination, t, {
      duration: 0.04,
      peak: 1.0 * volume * variation,
      type: 'none',
      attackTime: 0.0005,
    });
    triggerNoiseBurst(this.ctx, this.crackBuffer, destination, t, {
      duration: 0.015,
      peak: 0.3 * volume,
      type: 'highpass',
      frequency: 8000,
      attackTime: 0.0005,
    });
    this.playLowPunch(destination, t, volume, variation);
  }

  /** Bulk wall displacement: heavy 80-250 Hz thump under the shock. */
  private playLowPunch(destination: AudioNode, t: number, volume: number, variation: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(165 * variation, t);
    osc.frequency.exponentialRampToValueAtTime(55, t + 0.14);

    triggerShapedOsc(this.ctx, osc, destination, t, {
      duration: 0.14,
      peak: 0.9 * volume * variation,
      attackTime: 0.002,
    });
  }

  /** Phase 2a: flexural-wave chirp; highs outrun lows, so pitch dives. */
  private playPlateDispersion(
    destination: AudioNode,
    t: number,
    volume: number,
    variation: number
  ): void {
    const dur = 0.32;
    const startF = 5400 * variation;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(startF, t);
    osc.frequency.exponentialRampToValueAtTime(900, t + 0.26);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(startF * 0.9, t);
    filter.frequency.exponentialRampToValueAtTime(850, t + dur);
    filter.Q.setValueAtTime(9.0, t);

    triggerFilteredOsc(this.ctx, osc, filter, destination, t, dur, 0.3 * volume * variation);
  }

  /** Phase 2b: high-density inharmonic plate modes, 1.5-8 kHz. */
  private playPlateModes(
    destination: AudioNode,
    t: number,
    volume: number,
    variation: number
  ): void {
    for (const [freq, level, decay] of PLATE_MODES) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq * variation, t);
      triggerDecayingOsc(this.ctx, osc, destination, t, decay, level * volume);
    }
  }

  /** Phase 3: tumbling-fragment vortex whistle with Doppler dive. */
  private playRicochetWhine(
    destination: AudioNode,
    t: number,
    volume: number,
    variation: number
  ): void {
    if (Math.random() < 0.3) return;
    const dur = 0.5;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(2700 * variation, t);
    osc.frequency.exponentialRampToValueAtTime(820, t + dur);

    const flutter = this.ctx.createOscillator();
    flutter.type = 'sine';
    flutter.frequency.setValueAtTime(27, t);
    const flutterDepth = this.ctx.createGain();
    flutterDepth.gain.setValueAtTime(120, t);
    flutter.connect(flutterDepth);
    flutterDepth.connect(osc.frequency as unknown as AudioNode);

    triggerShapedOsc(this.ctx, osc, destination, t, {
      duration: dur,
      peak: 0.12 * volume,
      attackTime: 0.04,
    });

    flutter.start(t);
    flutter.stop(t + dur);
  }

  /** Legacy energy-impact thump for laser / welder hits. */
  private playEnergyImpact(destination: AudioNode, type: 'laser' | 'welder', volume: number): void {
    const t = this.ctx.currentTime;
    const dur = 0.07;

    const osc = this.ctx.createOscillator();
    osc.type = type === 'laser' ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(type === 'laser' ? 420 : 180, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + dur);

    triggerDecayingOsc(this.ctx, osc, destination, t, dur, 0.5 * volume);
  }
}
