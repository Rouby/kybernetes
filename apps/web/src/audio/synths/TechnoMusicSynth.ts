/**
 * Freaky techno background loop: procedural hardgroove/schranz at 144 BPM.
 *
 * Lookahead scheduler (25 ms tick, 120 ms horizon) drives a 32-step loop:
 * distorted four-on-the-floor, rolling F-minor acid bass with a b2 creep,
 * offbeat hats, ride, woody knocks, tom fills, crashes, bar 2
 * hoover stabs, restrained acid squelches, a vocal chop hook answering
 * an industrial bar-2 lead, and a UFO siren every 8th loop. Intensity
 * strips layers; freak opens filters + lead/siren. Per-voice mute/solo +
 * a live activity snapshot feed the ?music=1 techno lab view.
 */
import { createDistortionCurve, createNoiseBuffer, triggerNoiseBurst } from '../audioHelpers';
import {
  acidMidiForStep,
  bassMidiForStep,
  crashShouldSound,
  isClapStep,
  isClosedHatStep,
  isKickStep,
  isKnockStep,
  isOpenHatStep,
  isRideStep,
  isStabStep,
  leadMidiForStep,
  midiToFreq,
  sirenShouldSound,
  TECHNO_STEPS_PER_LOOP,
  type TechnoVoice,
  type TechnoVowel,
  technoStepDurationSec,
  tomMidiForStep,
  vocalChopAt,
  vocalMidiForChop,
} from './technoPatterns';
import { FREAKY_MAIN_TRACK, type TechnoTrack } from './technoTracks';

export interface TechnoHitMark {
  readonly step: number;
  readonly loop: number;
  readonly at: number;
}

export interface TechnoMusicSnapshot {
  readonly playing: boolean;
  readonly loop: number;
  readonly trackId: string;
  readonly bpm: number;
  readonly intensity: number;
  readonly freak: number;
  readonly muted: readonly TechnoVoice[];
  readonly solo: TechnoVoice | null;
  readonly lastHit: Record<TechnoVoice, TechnoHitMark>;
}

const EMPTY_MARK: TechnoHitMark = { step: -1, loop: -1, at: -1 };

function emptyHits(): Record<TechnoVoice, TechnoHitMark> {
  return {
    kick: EMPTY_MARK,
    hat: EMPTY_MARK,
    clap: EMPTY_MARK,
    ride: EMPTY_MARK,
    knock: EMPTY_MARK,
    toms: EMPTY_MARK,
    crash: EMPTY_MARK,
    bass: EMPTY_MARK,
    acid: EMPTY_MARK,
    stab: EMPTY_MARK,
    chop: EMPTY_MARK,
    lead: EMPTY_MARK,
    siren: EMPTY_MARK,
  };
}

/** Vowel formants as [frequencyHz, level] triples; the saw becomes a voice. */
const VOWEL_FORMANTS: Record<TechnoVowel, readonly (readonly [number, number])[]> = {
  ah: [
    [730, 0.5],
    [1090, 0.32],
    [2440, 0.18],
  ],
  eh: [
    [530, 0.45],
    [1840, 0.3],
    [2480, 0.2],
  ],
  ee: [
    [270, 0.4],
    [2290, 0.32],
    [3010, 0.22],
  ],
  oh: [
    [570, 0.5],
    [840, 0.32],
    [2410, 0.18],
  ],
};

export interface TechnoStartOptions {
  readonly intensity?: number;
  readonly freak?: number;
  readonly when?: number;
}

export class TechnoMusicSynth {
  private readonly ctx: AudioContext;
  private readonly noiseBuffer: AudioBuffer;
  private musicGain: GainNode | null = null;
  private delaySend: GainNode | null = null;
  private bassFilter: BiquadFilterNode | null = null;
  private bassCut = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextTime = 0;
  private step = 0;
  private loopIndex = 0;
  private intensity = 0.8;
  private freak = 0.8;
  private track: TechnoTrack = FREAKY_MAIN_TRACK;
  private tempoScale = 1;
  private outputLevel = 0.5;
  private mutedVoices = new Set<TechnoVoice>();
  private soloVoice: TechnoVoice | null = null;
  private lastHit: Record<TechnoVoice, TechnoHitMark> = emptyHits();

  constructor(ctx: AudioContext, track: TechnoTrack = FREAKY_MAIN_TRACK) {
    this.ctx = ctx;
    this.noiseBuffer = createNoiseBuffer(ctx, 1.0, 'white');
    this.loadTrack(track);
  }

  public get currentTrack(): TechnoTrack {
    return this.track;
  }

  /** Swap compositions live; intensity and freak follow the new track. */
  public loadTrack(track: TechnoTrack): void {
    this.track = track;
    this.setIntensity(track.defaultIntensity);
    this.setFreak(track.defaultFreak);
  }

  /** Pitch-fader multiplier: effective BPM equals printed BPM times scale. */
  public setTempoScale(scale: number): void {
    this.tempoScale = Math.max(0.5, Math.min(1.5, scale));
  }

  public getTempoScale(): number {
    return this.tempoScale;
  }

  /** Deck fader for DJ crossfades; applied to the output bus immediately. */
  public setOutputLevel(level: number): void {
    this.outputLevel = Math.max(0, Math.min(1, level));
    if (this.musicGain !== null) {
      this.musicGain.gain.setTargetAtTime(this.outputLevel, this.ctx.currentTime, 0.05);
    }
  }

  public effectiveStepDur(): number {
    return technoStepDurationSec(this.track.bpm) / this.tempoScale;
  }

  /** Seconds until this deck's next loop start; 0 when stopped. */
  public secondsToLoopStart(): number {
    if (!this.isPlaying()) return 0;
    const startAt = this.nextTime + (TECHNO_STEPS_PER_LOOP - this.step) * this.effectiveStepDur();
    return Math.max(0, startAt - this.ctx.currentTime);
  }

  public isPlaying(): boolean {
    return this.timer !== null;
  }

  public setIntensity(value: number): void {
    this.intensity = Math.max(0, Math.min(1, value));
  }

  public setFreak(value: number): void {
    this.freak = Math.max(0, Math.min(1, value));
  }

  public setVoiceMuted(voice: TechnoVoice, muted: boolean): void {
    if (muted) this.mutedVoices.add(voice);
    else this.mutedVoices.delete(voice);
  }

  public isVoiceMuted(voice: TechnoVoice): boolean {
    return this.mutedVoices.has(voice);
  }

  public setSoloVoice(voice: TechnoVoice | null): void {
    this.soloVoice = voice;
  }

  public getSnapshot(): TechnoMusicSnapshot {
    return {
      playing: this.isPlaying(),
      loop: this.loopIndex,
      trackId: this.track.id,
      bpm: Math.round(this.track.bpm * this.tempoScale),
      intensity: this.intensity,
      freak: this.freak,
      muted: [...this.mutedVoices],
      solo: this.soloVoice,
      lastHit: { ...this.lastHit },
    };
  }

  /** Step currently sounding (scheduler runs ~1 step ahead of the speakers). */
  public soundingStep(): number {
    const ahead = this.nextTime - this.ctx.currentTime;
    const stepsAhead = Math.max(0, Math.round(ahead / this.effectiveStepDur()));
    const idx = (this.step - stepsAhead) % TECHNO_STEPS_PER_LOOP;
    return (idx + TECHNO_STEPS_PER_LOOP) % TECHNO_STEPS_PER_LOOP;
  }

  public start(destination: AudioNode, options: TechnoStartOptions = {}): void {
    if (this.timer !== null) return;
    if (options.intensity !== undefined) this.setIntensity(options.intensity);
    if (options.freak !== undefined) this.setFreak(options.freak);
    this.buildGraph(destination);
    this.step = 0;
    this.loopIndex = 0;
    this.nextTime = options.when ?? this.ctx.currentTime + 0.06;
    this.timer = setInterval(() => this.tick(), 25);
  }

  public stop(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
    this.teardownGraph();
  }

  private buildGraph(destination: AudioNode): void {
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.setValueAtTime(0.0, this.ctx.currentTime);
    this.musicGain.gain.linearRampToValueAtTime(this.outputLevel, this.ctx.currentTime + 0.8);
    this.delaySend = this.ctx.createGain();
    const delay = this.ctx.createDelay(1.0);
    delay.delayTime.setValueAtTime(technoStepDurationSec(this.track.bpm) * 3, this.ctx.currentTime);
    const feedback = this.ctx.createGain();
    feedback.gain.setValueAtTime(0.35, this.ctx.currentTime);
    const dampen = this.ctx.createBiquadFilter();
    dampen.type = 'lowpass';
    dampen.frequency.setValueAtTime(2400, this.ctx.currentTime);
    this.delaySend.connect(delay);
    delay.connect(dampen);
    dampen.connect(feedback);
    feedback.connect(delay);
    dampen.connect(this.musicGain);
    this.bassFilter = this.ctx.createBiquadFilter();
    this.bassFilter.type = 'highpass';
    this.bassFilter.frequency.setValueAtTime(20, this.ctx.currentTime);
    this.musicGain.connect(this.bassFilter);
    this.bassFilter.connect(destination);
  }

  /** Deck EQ: highpass the bass out for blends (0 = full, 1 = mids up only). */
  public setBassCut(cut: number): void {
    this.bassCut = Math.max(0, Math.min(1, cut));
    if (this.bassFilter !== null) {
      const freq = 20 * 20 ** this.bassCut;
      this.bassFilter.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.1);
    }
  }

  private teardownGraph(): void {
    const t = this.ctx.currentTime;
    try {
      this.musicGain?.gain.setTargetAtTime(0.0, t, 0.05);
    } catch {
      // ignore torn-down contexts in tests
    }
    const gain = this.musicGain;
    const send = this.delaySend;
    const bass = this.bassFilter;
    this.musicGain = null;
    this.delaySend = null;
    this.bassFilter = null;
    setTimeout(() => {
      try {
        gain?.disconnect();
        send?.disconnect();
        bass?.disconnect();
      } catch {
        // already disconnected
      }
    }, 300);
  }

  private tick(): void {
    if (this.musicGain === null) return;
    const stepDur = this.effectiveStepDur();
    const horizon = this.ctx.currentTime + 0.12;
    while (this.nextTime < horizon) {
      this.scheduleStep(this.step, this.nextTime, this.loopIndex);
      this.nextTime += stepDur;
      this.step += 1;
      if (this.step >= TECHNO_STEPS_PER_LOOP) {
        this.step = 0;
        this.loopIndex += 1;
      }
    }
  }

  /** Single 16th-note slot; public so tests and the WAV preview can reuse it. */
  public scheduleStep(step: number, time: number, loopIndex: number): void {
    if (this.musicGain === null) return;
    this.scheduleKick(step, time, loopIndex);
    this.scheduleHats(step, time, loopIndex);
    this.scheduleClap(step, time, loopIndex);
    this.scheduleRide(step, time, loopIndex);
    this.scheduleKnock(step, time, loopIndex);
    this.scheduleToms(step, time, loopIndex);
    this.scheduleCrash(step, time, loopIndex);
    this.scheduleBass(step, time, loopIndex);
    this.scheduleAcid(step, time, loopIndex);
    this.scheduleStabSlot(step, time, loopIndex);
    this.scheduleHook(step, time, loopIndex);
    this.scheduleFreak(step, time, loopIndex);
  }

  private voiceOn(voice: TechnoVoice): boolean {
    if (this.soloVoice !== null) return voice === this.soloVoice;
    return !this.mutedVoices.has(voice);
  }

  private markHit(voice: TechnoVoice, step: number, loop: number, at: number): void {
    this.lastHit[voice] = { step, loop, at };
  }

  private scheduleKick(step: number, time: number, loop: number): void {
    if (!this.voiceOn('kick') || !isKickStep(step)) return;
    this.playKick(time);
    this.markHit('kick', step, loop, time);
  }

  private scheduleHats(step: number, time: number, loop: number): void {
    if (!this.voiceOn('hat') || this.intensity <= 0.25) return;
    if (isOpenHatStep(step)) this.playHat(time, true);
    else if (isClosedHatStep(step)) this.playHat(time, false);
    else return;
    this.markHit('hat', step, loop, time);
  }

  private scheduleClap(step: number, time: number, loop: number): void {
    if (!this.voiceOn('clap') || !isClapStep(step)) return;
    this.playClap(time);
    this.markHit('clap', step, loop, time);
  }

  private scheduleRide(step: number, time: number, loop: number): void {
    if (!this.voiceOn('ride') || this.intensity <= 0.35 || !isRideStep(step)) return;
    this.playRide(time);
    this.markHit('ride', step, loop, time);
  }

  private scheduleKnock(step: number, time: number, loop: number): void {
    if (!this.voiceOn('knock') || this.intensity <= 0.55 || !isKnockStep(this.track, step)) return;
    this.playKnock(time);
    this.markHit('knock', step, loop, time);
  }

  private scheduleToms(step: number, time: number, loop: number): void {
    if (!this.voiceOn('toms') || this.intensity <= 0.5) return;
    const tom = tomMidiForStep(this.track, step, loop);
    if (tom === null) return;
    this.playTom(tom, time);
    this.markHit('toms', step, loop, time);
  }

  private scheduleCrash(step: number, time: number, loop: number): void {
    if (
      !this.voiceOn('crash') ||
      this.intensity <= 0.25 ||
      !crashShouldSound(this.track, step, loop)
    ) {
      return;
    }
    this.playCrash(time);
    this.markHit('crash', step, loop, time);
  }

  private scheduleAcid(step: number, time: number, loop: number): void {
    if (!this.voiceOn('acid') || this.intensity <= 0.5) return;
    const acid = acidMidiForStep(this.track, step);
    if (acid === null) return;
    this.playAcid(acid, time);
    this.markHit('acid', step, loop, time);
  }

  private scheduleBass(step: number, time: number, loop: number): void {
    if (!this.voiceOn('bass') || this.intensity <= 0.15) return;
    if (step % this.track.bassStride !== this.track.bassPhase) return;
    this.playBass(step, time);
    this.markHit('bass', step, loop, time);
  }

  private scheduleStabSlot(step: number, time: number, loop: number): void {
    if (!this.voiceOn('stab') || this.intensity <= 0.5 || !isStabStep(this.track, step)) return;
    this.playStab(time);
    this.markHit('stab', step, loop, time);
  }

  private scheduleHook(step: number, time: number, loop: number): void {
    if (!this.voiceOn('chop') || this.intensity <= 0.5) return;
    const chop = vocalChopAt(this.track, step);
    if (chop === null) return;
    this.playVocalChop(vocalMidiForChop(this.track, chop), chop.vowel, time);
    this.markHit('chop', step, loop, time);
  }

  private playVocalChop(midi: number, vowel: TechnoVowel, time: number): void {
    const out = this.musicGain;
    if (!out) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(midiToFreq(midi) * 1.06, time);
    osc.frequency.exponentialRampToValueAtTime(midiToFreq(midi), time + 0.05);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(0.16, time + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);
    osc.connect(gain);
    this.applyVowelFilters(gain, vowel, time, out);
    osc.start(time);
    osc.stop(time + 0.2);
  }

  private applyVowelFilters(
    src: AudioNode,
    vowel: TechnoVowel,
    time: number,
    out: AudioNode
  ): void {
    const send = this.delaySend;
    for (const [freq, level] of VOWEL_FORMANTS[vowel]) {
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(freq, time);
      filter.Q.setValueAtTime(7, time);
      const voice = this.ctx.createGain();
      voice.gain.setValueAtTime(level, time);
      src.connect(filter);
      filter.connect(voice);
      voice.connect(out);
      if (send) voice.connect(send);
    }
  }

  private scheduleFreak(step: number, time: number, loopIndex: number): void {
    if (this.freak <= 0.3) return;
    this.scheduleLead(step, time, loopIndex);
    this.scheduleSiren(step, time, loopIndex);
  }

  private scheduleLead(step: number, time: number, loop: number): void {
    if (!this.voiceOn('lead') || this.intensity <= 0.4) return;
    const lead = leadMidiForStep(this.track, step);
    if (lead === null) return;
    this.playLead(lead, time);
    this.markHit('lead', step, loop, time);
  }

  private scheduleSiren(step: number, time: number, loop: number): void {
    if (!this.voiceOn('siren') || step !== 0 || !sirenShouldSound(this.track, loop)) return;
    this.playSiren(time);
    this.markHit('siren', step, loop, time);
  }

  private playKick(time: number): void {
    const out = this.musicGain;
    if (!out) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, time);
    osc.frequency.exponentialRampToValueAtTime(42, time + 0.11);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.95, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.28);
    osc.connect(gain);
    gain.connect(out);
    osc.start(time);
    osc.stop(time + 0.3);
    this.playKickClick(time, out);
  }

  private playKickClick(time: number, out: AudioNode): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(4000, time);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.25, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.02);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(out);
    src.start(time);
    src.stop(time + 0.03);
  }

  private playHat(time: number, open: boolean): void {
    const out = this.musicGain;
    if (!out) return;
    const dur = open ? 0.22 : 0.05;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(8000, time);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(open ? 0.22 : 0.14, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(out);
    src.start(time);
    src.stop(time + dur + 0.02);
  }

  private playClap(time: number): void {
    const out = this.musicGain;
    if (!out) return;
    for (let hit = 0; hit < 3; hit++) this.playClapHit(time + hit * 0.012, out);
  }

  private playClapHit(time: number, out: AudioNode): void {
    triggerNoiseBurst(this.ctx, this.noiseBuffer, out, time, {
      duration: 0.12,
      peak: 0.3,
      type: 'bandpass',
      frequency: 1800,
      q: 1.8,
    });
  }

  private playBass(step: number, time: number): void {
    const out = this.musicGain;
    if (!out) return;
    const cutoff = 300 + this.intensity * 2200 + this.freak * 900;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(midiToFreq(bassMidiForStep(this.track, step)), time);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.setValueAtTime(11, time);
    filter.frequency.setValueAtTime(cutoff * 1.8, time);
    filter.frequency.exponentialRampToValueAtTime(Math.max(120, cutoff * 0.4), time + 0.2);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.34, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.22);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(out);
    osc.start(time);
    osc.stop(time + 0.24);
  }

  private playStab(time: number): void {
    const out = this.musicGain;
    const send = this.delaySend;
    if (!out) return;
    for (const midi of this.track.stabMidis) this.playStabVoice(midi, time, out, send);
  }

  private playStabVoice(midi: number, time: number, out: AudioNode, send: AudioNode | null): void {
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(midiToFreq(midi), time);
    osc.detune.setValueAtTime((midi % 2 === 0 ? 1 : -1) * 9, time);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1100 + this.freak * 900, time);
    filter.Q.setValueAtTime(1.2, time);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.11, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(out);
    if (send) gain.connect(send);
    osc.start(time);
    osc.stop(time + 0.32);
  }

  /** Industrial lead: detuned saw unison grinding through a dirty lowpass. */
  private playLead(midi: number, time: number): void {
    const out = this.musicGain;
    const send = this.delaySend;
    if (!out || !send) return;
    const filter = this.leadChain(time);
    const shaper = this.ctx.createWaveShaper();
    shaper.curve = createDistortionCurve(30);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.2, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.16);
    filter.connect(shaper);
    shaper.connect(gain);
    gain.connect(out);
    gain.connect(send);
    this.playLeadVoice(midi, -7, time, filter);
    this.playLeadVoice(midi, 7, time, filter);
  }

  /** Shared distorted lowpass the unison pair grinds through. */
  private leadChain(time: number): BiquadFilterNode {
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900 + this.freak * 700, time);
    filter.Q.setValueAtTime(4, time);
    return filter;
  }

  /** One detuned saw of the unison pair; pitch snaps down into the note. */
  private playLeadVoice(midi: number, detune: number, time: number, filter: AudioNode): void {
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(midiToFreq(midi) * 1.03, time);
    osc.frequency.exponentialRampToValueAtTime(midiToFreq(midi), time + 0.03);
    osc.detune.setValueAtTime(detune, time);
    osc.connect(filter);
    osc.start(time);
    osc.stop(time + 0.18);
  }

  private playSiren(time: number): void {
    const out = this.musicGain;
    const send = this.delaySend;
    if (!out) return;
    const dur = technoStepDurationSec() * 8;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(420, time);
    osc.frequency.exponentialRampToValueAtTime(2400, time + dur);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(0.028 + this.freak * 0.022, time + dur * 0.7);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
    osc.connect(gain);
    gain.connect(out);
    if (send) gain.connect(send);
    osc.start(time);
    osc.stop(time + dur + 0.02);
  }

  private playRide(time: number): void {
    const out = this.musicGain;
    if (!out) return;
    this.playRidePing(5230, 0.07, time, out);
    this.playRidePing(7410, 0.05, time, out);
    this.playRideWash(time, out);
  }

  private playRidePing(freq: number, peak: number, time: number, out: AudioNode): void {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, time);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(peak, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.35);
    osc.connect(gain);
    gain.connect(out);
    osc.start(time);
    osc.stop(time + 0.37);
  }

  private playRideWash(time: number, out: AudioNode): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(7000, time);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.09, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(out);
    src.start(time);
    src.stop(time + 0.15);
  }

  /** Woody knock: pitch-dropping knock plus a stick click, zero metal. */
  private playKnock(time: number): void {
    const out = this.musicGain;
    if (!out) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(260, time);
    osc.frequency.exponentialRampToValueAtTime(150, time + 0.05);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.28, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.09);
    osc.connect(gain);
    gain.connect(out);
    osc.start(time);
    osc.stop(time + 0.11);
    this.playKnockClick(time, out);
  }

  private playKnockClick(time: number, out: AudioNode): void {
    triggerNoiseBurst(this.ctx, this.noiseBuffer, out, time, {
      duration: 0.02,
      peak: 0.12,
      type: 'bandpass',
      frequency: 3000,
      q: 1.5,
    });
  }

  private playTom(midi: number, time: number): void {
    const out = this.musicGain;
    if (!out) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(midiToFreq(midi) * 1.6, time);
    osc.frequency.exponentialRampToValueAtTime(midiToFreq(midi), time + 0.18);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.45, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.28);
    osc.connect(gain);
    gain.connect(out);
    osc.start(time);
    osc.stop(time + 0.3);
    this.playTomStick(time, out);
  }

  private playCrash(time: number): void {
    const out = this.musicGain;
    if (!out) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(800, time);
    filter.frequency.exponentialRampToValueAtTime(7500, time + 0.8);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.2, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 1.4);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(out);
    src.start(time);
    src.stop(time + 1.42);
  }

  private playAcid(midi: number, time: number): void {
    const out = this.musicGain;
    const send = this.delaySend;
    if (!out || !send) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(midiToFreq(midi), time);
    const filter = this.acidFilter(time);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.1, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.16);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(out);
    gain.connect(send);
    osc.start(time);
    osc.stop(time + 0.18);
  }

  /** Muted 303-style sweep: snaps open, gurgles shut. */
  private acidFilter(time: number): BiquadFilterNode {
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.setValueAtTime(10, time);
    filter.frequency.setValueAtTime(400, time);
    filter.frequency.exponentialRampToValueAtTime(2400, time + 0.05);
    filter.frequency.exponentialRampToValueAtTime(500, time + 0.18);
    return filter;
  }

  private playTomStick(time: number, out: AudioNode): void {
    triggerNoiseBurst(this.ctx, this.noiseBuffer, out, time, {
      duration: 0.03,
      peak: 0.18,
      type: 'bandpass',
      frequency: 3200,
      q: 2.5,
    });
  }

  /** Snare roll accelerating into the drop across durSec. */
  public playRoll(durSec: number): void {
    const out = this.musicGain;
    if (!out || durSec <= 0) return;
    const hits = 24;
    const ratio = 0.9;
    const unit = durSec / ((1 - ratio ** hits) / (1 - ratio));
    let at = this.ctx.currentTime + 0.02;
    for (let i = 0; i < hits; i++) {
      this.rollHit(at, 0.1 + (0.25 * i) / hits);
      at += unit * ratio ** i;
    }
  }

  private rollHit(time: number, peak: number): void {
    const out = this.musicGain;
    if (!out) return;
    triggerNoiseBurst(this.ctx, this.noiseBuffer, out, time, {
      duration: 0.05,
      peak,
      type: 'bandpass',
      frequency: 2000,
      q: 1.5,
    });
  }

  /** Drop impact: sub boom plus a crashing wash. */
  public playImpact(): void {
    const out = this.musicGain;
    const send = this.delaySend;
    if (!out || !send) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(30, t + 0.5);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.9, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    osc.connect(gain);
    gain.connect(out);
    osc.start(t);
    osc.stop(t + 0.62);
    triggerNoiseBurst(this.ctx, this.noiseBuffer, out, t, {
      duration: 0.5,
      peak: 0.3,
      type: 'lowpass',
      frequency: 3000,
      frequencyEnd: 300,
    });
  }
}
