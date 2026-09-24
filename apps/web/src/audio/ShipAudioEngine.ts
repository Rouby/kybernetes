import type {
  DoorState,
  PlayerVitals,
  TelemetryDeltaBroadcast,
  WeaponType,
} from '@kybernetes/protocol';
import { AcousticSpatializer } from './AcousticSpatializer';
import { AudioBusManager } from './AudioBusManager';
import {
  bassSwap,
  crossfadeLevels,
  DJ_OUTPUT_LEVEL,
  DJ_XFADE_BARS,
  DJ_XFADE_TICK_MS,
  tempoGlide,
} from './djTransition';
import { SpatialFoleyPool } from './SpatialFoleyPool';
import { AlarmSynth } from './synths/AlarmSynth';
import { BallisticsSynth } from './synths/BallisticsSynth';
import { type DeckSurfaceType, MetallicPlateSynth } from './synths/MetallicPlateSynth';
import { PneumaticSynth } from './synths/PneumaticSynth';
import { TechnoMusicSynth } from './synths/TechnoMusicSynth';
import { TerminalUiSynth } from './synths/TerminalUiSynth';
import { TECHNO_STEPS_PER_LOOP, type TechnoVoice } from './synths/technoPatterns';
import { TECHNO_TRACKS, trackById } from './synths/technoTracks';
import { VitalsMonitorSynth } from './synths/VitalsMonitorSynth';
import { type ChantKind, VocalChantSynth } from './synths/VocalChantSynth';
import {
  assessSuffocation,
  heartbeatTempo,
  mapperTelemetrySnapshot,
  type TelemetryAudioSnapshot,
} from './TelemetryAudioMapper';

interface DeckTransition {
  readonly fromSynth: TechnoMusicSynth;
  readonly toSynth: TechnoMusicSynth;
  readonly matchScale: number;
  readonly t0ms: number;
  readonly durMs: number;
  readonly timer: ReturnType<typeof setInterval>;
}

interface DropTransition {
  readonly fromSynth: TechnoMusicSynth;
  readonly toSynth: TechnoMusicSynth;
  readonly t0ms: number;
  readonly buildMs: number;
  readonly targetScale: number;
  readonly priorScale: number;
  readonly priorMuted: readonly TechnoVoice[];
  readonly timers: readonly ReturnType<typeof setTimeout>[];
  readonly ramp: ReturnType<typeof setInterval> | null;
}

/** First strip wave at build start: musical voices go, groove stays. */
const DROP_STRIP_WAVE_1: readonly TechnoVoice[] = ['lead', 'stab', 'chop', 'acid', 'siren'];

/** Second wave at the halfway mark: kick, hats, bass and ride survive. */
const DROP_STRIP_WAVE_2: readonly TechnoVoice[] = ['knock', 'clap', 'toms', 'crash'];

export class ShipAudioEngine {
  private static instance: ShipAudioEngine | null = null;

  public ctx: AudioContext | null = null;
  public busManager: AudioBusManager | null = null;
  public spatializer: AcousticSpatializer | null = null;

  // Synths
  public metalSynth: MetallicPlateSynth | null = null;
  public pneumaticSynth: PneumaticSynth | null = null;
  public ballisticsSynth: BallisticsSynth | null = null;
  public uiSynth: TerminalUiSynth | null = null;
  public vitalsSynth: VitalsMonitorSynth | null = null;
  public alarmSynth: AlarmSynth | null = null;
  public technoSynth: TechnoMusicSynth | null = null;
  public vocalSynth: VocalChantSynth | null = null;
  private deckTransition: DeckTransition | null = null;
  private dropTransition: DropTransition | null = null;
  private driftTimer: ReturnType<typeof setInterval> | null = null;

  // Listener Coordinates & Spatial Context
  private listenerX = 0;
  private listenerY = 0;
  private activeDoors: DoorState[] = [];

  // Vitals & Telemetry State
  private lastHeartbeatTime = 0;
  private lastBreathTime = 0;
  private isInhaling = true;
  private lastHullGroanTime = 0;
  private lastDecompressionRoarTime = 0;
  private previousAlertLevel: 'nominal' | 'yellow' | 'red' = 'nominal';
  private musicDesired = false;

  // Voice Concurrency Limiting
  private activeFoleyVoices = 0;
  private readonly MAX_CONCURRENT_FOLEY = 8;
  private foleyPool: SpatialFoleyPool | null = null;

  public static getInstance(): ShipAudioEngine {
    if (!ShipAudioEngine.instance) {
      ShipAudioEngine.instance = new ShipAudioEngine();
    }
    return ShipAudioEngine.instance;
  }

  public init(): void {
    if (this.ctx) return;
    if (this.initGraph()) this.setupGestureUnlock();
  }

  private initGraph(): boolean {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.busManager = new AudioBusManager(this.ctx);
      this.spatializer = new AcousticSpatializer(this.ctx);
      this.metalSynth = new MetallicPlateSynth(this.ctx);
      this.pneumaticSynth = new PneumaticSynth(this.ctx);
      this.ballisticsSynth = new BallisticsSynth(this.ctx);
      this.uiSynth = new TerminalUiSynth(this.ctx);
      this.vitalsSynth = new VitalsMonitorSynth(this.ctx);
      this.alarmSynth = new AlarmSynth(this.ctx);
      this.technoSynth = new TechnoMusicSynth(this.ctx);
      this.vocalSynth = new VocalChantSynth(this.ctx);
      return true;
    } catch {
      // AudioContext unavailable in environment
      return false;
    }
  }

  public resume(): void {
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') this.resumeSuspended();
    else this.resumeRunning();
  }

  private resumeSuspended(): void {
    this.ctx?.resume().then(() => this.startAmbientLoop());
  }

  private resumeRunning(): void {
    if (this.ctx?.state === 'running') this.startAmbientLoop();
  }

  private startAmbientLoop(): void {
    this.startTechnoIfReady();
  }

  /** Background-music intent: starts now when unlocked, else on resume. */
  public setMusicDesired(desired: boolean): void {
    this.musicDesired = desired;
    if (!desired) this.technoSynth?.stop();
    else this.startTechnoIfReady();
  }

  private startTechnoIfReady(): void {
    if (!this.musicDesired || !this.technoSynth) return;
    this.startDeck(this.technoSynth);
  }

  private startDeck(synth: TechnoMusicSynth): void {
    if (!this.ctx || !this.busManager) return;
    if (this.ctx.state !== 'running' || synth.isPlaying()) return;
    const track = synth.currentTrack;
    synth.start(this.busManager.musicGain, {
      intensity: track.defaultIntensity,
      freak: track.defaultFreak,
    });
  }

  private setupGestureUnlock(): void {
    const unlock = () => {
      this.resume();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  public updateListener(x: number, y: number, doors?: DoorState[]): void {
    this.listenerX = x;
    this.listenerY = y;
    if (doors) this.activeDoors = doors;
  }

  public updateTelemetry(
    telemetry: TelemetryDeltaBroadcast,
    vitals?: PlayerVitals,
    currentRoomId?: string
  ): void {
    if (!this.ctx || !this.busManager) return;
    const now = performance.now();
    const mapped = mapperTelemetrySnapshot(telemetry, currentRoomId, this.previousAlertLevel);
    this.previousAlertLevel = mapped.alertLevel;
    this.applyHullSection(mapped.snapshot, now);
    this.applyAlertSection(mapped.snapshot);
    this.applyVentSection(mapped.snapshot, now);
    this.processVitalsTrauma(vitals, mapped.snapshot, now);
  }

  private applyHullSection(snapshot: TelemetryAudioSnapshot, now: number): void {
    if (!this.busManager) return;
    if (snapshot.hullPct >= 50) return;
    if (now - this.lastHullGroanTime <= 7000 + Math.random() * 5000) return;
    this.lastHullGroanTime = now;
    this.metalSynth?.playHullGroan(this.busManager.ambienceGain, (50 - snapshot.hullPct) / 50);
  }

  private applyAlertSection(snapshot: TelemetryAudioSnapshot): void {
    if (!this.busManager) return;
    if (snapshot.alertChanged === 'red') {
      this.alarmSynth?.playRedAlertKlaxon(this.busManager.crisisGain);
      this.technoSynth?.setIntensity(1.0);
    } else if (snapshot.alertChanged === 'yellow') {
      this.alarmSynth?.playCautionChime(this.busManager.crisisGain);
      this.technoSynth?.setIntensity(0.65);
    } else if (snapshot.alertChanged === null) {
      this.technoSynth?.setIntensity(0.45);
    }
  }

  private applyVentSection(snapshot: TelemetryAudioSnapshot, now: number): void {
    if (!this.busManager) return;
    if (!snapshot.venting || now - this.lastDecompressionRoarTime <= 3500) return;
    this.lastDecompressionRoarTime = now;
    this.pneumaticSynth?.playVentingBurst(this.busManager.crisisGain, 2.5, 0.85);
  }

  private processVitalsTrauma(
    vitals: PlayerVitals | undefined,
    snapshot: TelemetryAudioSnapshot,
    now: number
  ): void {
    if (!vitals || !this.busManager || !this.vitalsSynth) return;
    this.processSuffocation(vitals, snapshot, now);
    this.processHeartbeat(vitals, now);
  }

  private processSuffocation(
    vitals: PlayerVitals,
    snapshot: TelemetryAudioSnapshot,
    now: number
  ): void {
    if (!this.busManager || !this.vitalsSynth) return;
    const assessment = assessSuffocation(vitals, snapshot.oxygen, snapshot.roomPressureKpa);
    if (assessment === null) {
      this.busManager.setMasterCrisisCutoff(20000);
      return;
    }
    this.busManager.setMasterCrisisCutoff(assessment.crisisCutoffHz);
    if (now - this.lastBreathTime > assessment.breathIntervalMs) {
      this.lastBreathTime = now;
      this.vitalsSynth.playSuffocationBreath(this.busManager.crisisGain, this.isInhaling);
      this.isInhaling = !this.isInhaling;
    }
  }

  private processHeartbeat(vitals: PlayerVitals, now: number): void {
    if (!this.busManager || !this.vitalsSynth) return;
    const tempo = heartbeatTempo(vitals);
    if (tempo !== null && now - this.lastHeartbeatTime > tempo.intervalMs) {
      this.lastHeartbeatTime = now;
      this.vitalsSynth.playHeartbeat(this.busManager.crisisGain, tempo.bpm);
    }
  }

  // --- Spatial Foley & Interactions ---

  private pool(): SpatialFoleyPool | null {
    if (!this.busManager || !this.spatializer) return null;
    if (this.foleyPool === null) {
      this.foleyPool = new SpatialFoleyPool(this.spatializer, this.busManager.foleyGain);
    }
    return this.foleyPool;
  }

  /**
   * Shared spatial-foley preamble: check out a pooled voice at (x, y),
   * dropping inaudible voices below gainFloor.
   * Returns null when audio is unavailable or the voice is culled.
   */
  private spatialFoleyInput(
    x: number,
    y: number,
    gainFloor: number,
    holdSeconds: number
  ): AudioNode | null {
    const pool = this.pool();
    if (!pool) return null;
    return pool.acquire(
      this.listenerX,
      this.listenerY,
      x,
      y,
      this.activeDoors,
      gainFloor,
      holdSeconds
    );
  }

  public playLocalFootstep(surface: DeckSurfaceType = 'steel'): void {
    if (!this.busManager || !this.metalSynth) return;
    this.metalSynth.playFootstep(this.busManager.foleyGain, surface, 0.7);
  }

  public playRemoteFootstep(
    emitterX: number,
    emitterY: number,
    surface: DeckSurfaceType = 'steel'
  ): void {
    if (!this.metalSynth) return;
    if (this.activeFoleyVoices >= this.MAX_CONCURRENT_FOLEY) return;
    const input = this.spatialFoleyInput(emitterX, emitterY, 0.05, 0.15);
    if (!input) return;

    this.activeFoleyVoices++;
    this.metalSynth.playFootstep(input, surface, 0.6);

    setTimeout(() => {
      this.activeFoleyVoices = Math.max(0, this.activeFoleyVoices - 1);
    }, 60);
  }

  public playWeaponFire(
    originX: number,
    originY: number,
    weaponType: WeaponType | 'raider_plasma',
    chargeRatio = 1.0,
    isLocal = true
  ): void {
    if (!this.busManager || !this.ballisticsSynth) return;
    if (isLocal) this.fireLocalWeapon(weaponType, chargeRatio);
    else this.fireRemoteWeapon(originX, originY, weaponType, chargeRatio);
  }

  private fireLocalWeapon(weaponType: WeaponType | 'raider_plasma', chargeRatio: number): void {
    if (!this.busManager || !this.ballisticsSynth) return;
    this.ballisticsSynth.playWeaponFire(this.busManager.foleyGain, weaponType, chargeRatio, 1.0);
  }

  private fireRemoteWeapon(
    originX: number,
    originY: number,
    weaponType: WeaponType | 'raider_plasma',
    chargeRatio: number
  ): void {
    if (!this.ballisticsSynth) return;
    const input = this.spatialFoleyInput(originX, originY, 0.03, 0.8);
    if (!input) return;
    this.ballisticsSynth.playWeaponFire(input, weaponType, chargeRatio, 0.85);
  }

  // Hitscan combat has no impact points yet; kept for the tracer milestone.
  public playImpact(x: number, y: number, type: 'kinetic' | 'laser' | 'welder'): void {
    if (!this.ballisticsSynth) return;
    const input = this.spatialFoleyInput(x, y, 0.03, 0.6);
    if (!input) return;
    this.ballisticsSynth.playImpact(input, type, 0.65);
  }

  public playDoorToggle(x: number, y: number, isOpen: boolean): void {
    if (!this.pneumaticSynth) return;
    const input = this.spatialFoleyInput(x, y, 0.03, 1.0);
    if (!input) return;
    this.pneumaticSynth.playDoorCycle(input, isOpen, 0.85);
  }

  public playStationInteract(): void {
    if (!this.busManager || !this.uiSynth) return;
    this.uiSynth.playPromptChirp(this.busManager.uiGain);
  }

  public playDebriefStamp(): void {
    if (!this.busManager || !this.uiSynth) return;
    this.uiSynth.playDebriefStamp(this.busManager.uiGain);
  }

  public playUiClick(): void {
    if (!this.busManager || !this.uiSynth) return;
    this.uiSynth.playClick(this.busManager.uiGain);
  }

  /** Packing bench: grabbed a staged unit. */
  public playPackGrab(): void {
    if (!this.busManager || !this.uiSynth) return;
    this.uiSynth.playPromptChirp(this.busManager.uiGain, 0.35);
  }

  /** Packing bench: released a dragged unit. */
  public playPackDrop(): void {
    if (!this.busManager || !this.metalSynth) return;
    this.metalSynth.playCrateThunk(this.busManager.foleyGain, 0.5);
  }

  /** Packing bench: a staged unit came to rest. */
  public playPackLand(): void {
    if (!this.busManager || !this.metalSynth) return;
    this.metalSynth.playCrateThunk(this.busManager.foleyGain, 0.3);
  }

  /** Packing bench: ratcheted the held unit. */
  public playPackRotate(): void {
    if (!this.busManager || !this.alarmSynth) return;
    this.alarmSynth.playGeigerClick(this.busManager.uiGain, 0.35);
  }

  /** Packing bench: the lid seated across the mouth. */
  public playLidSeat(): void {
    if (!this.busManager || !this.metalSynth) return;
    this.metalSynth.playCrateThunk(this.busManager.foleyGain, 0.85);
  }

  /** Trade: the server accepted a sealed crate. */
  public playSealStamp(): void {
    if (!this.busManager || !this.uiSynth) return;
    this.uiSynth.playDebriefStamp(this.busManager.uiGain, 0.9);
  }

  /** Trade: the server paid out a bay sale. */
  public playCashRegister(): void {
    if (!this.busManager || !this.uiSynth) return;
    this.uiSynth.playCashRegister(this.busManager.uiGain, 0.6);
  }

  /** Trade: the server rejected a seal. */
  public playPackReject(): void {
    if (!this.busManager || !this.uiSynth) return;
    this.uiSynth.playTelemetrySquelch(this.busManager.uiGain, 0.5);
  }

  public playExplosionShockwave(): void {
    if (!this.busManager || !this.vitalsSynth) return;
    this.vitalsSynth.playTinnitusRing(this.busManager.crisisGain, 3.5, 0.7);
  }

  public playVisorToggle(sealed: boolean): void {
    if (!this.busManager || !this.vitalsSynth) return;
    this.vitalsSynth.playVisorSeal(this.busManager.foleyGain, sealed);
  }

  /** Freaky techno background loop through the dedicated music bus. */
  public startTechno(intensity = 0.8, freak = 0.8): void {
    if (!this.busManager || !this.technoSynth) return;
    this.technoSynth.start(this.busManager.musicGain, { intensity, freak });
  }

  /** Hard cut to a track by id (unknown ids fall back to the main track). */
  public playTrack(id: string): void {
    if (!this.ctx || !this.busManager || !this.technoSynth) return;
    this.cancelTransition();
    this.cancelDropTransition();
    this.technoSynth.stop();
    this.technoSynth.loadTrack(trackById(id));
    this.technoSynth.setTempoScale(1);
    this.technoSynth.setBassCut(0);
    this.technoSynth.setOutputLevel(DJ_OUTPUT_LEVEL);
    this.startDeck(this.technoSynth);
  }

  /** Next track in registry order, wrapping around. */
  public nextTrackId(): string {
    const ids = TECHNO_TRACKS.map((track) => track.id);
    const current = this.technoSynth?.currentTrack.id ?? 'freaky-main';
    return ids[(ids.indexOf(current) + 1) % ids.length];
  }

  /** DJ crossfade to the next track in registry order. */
  public crossfadeOther(bars = DJ_XFADE_BARS): void {
    this.transitionTo(this.nextTrackId(), bars);
  }

  /**
   * Drop transition, quantized to the phrase: the build starts on the next
   * loop boundary, strips to kick, hats, bass and ride in two waves while
   * gliding to the target tempo, rolls the final loop, then slams the new
   * track in on the one with an impact.
   */
  public transitionDropTo(id: string, buildBars = 4): void {
    if (!this.ctx || !this.busManager || !this.technoSynth) return;
    const track = trackById(id);
    if (track.id === this.technoSynth.currentTrack.id) return;
    if (this.deckTransition !== null || this.dropTransition !== null) return;
    this.clearTempoDrift();
    const fromSynth = this.technoSynth;
    const toSynth = new TechnoMusicSynth(this.ctx);
    toSynth.loadTrack(track);
    toSynth.setOutputLevel(0);
    const loopSec = TECHNO_STEPS_PER_LOOP * fromSynth.effectiveStepDur();
    const buildSec = Math.max(0.02, buildBars) * loopSec;
    const delaySec = fromSynth.secondsToLoopStart();
    const t0ms = performance.now() + delaySec * 1000;
    this.dropTransition = {
      fromSynth,
      toSynth,
      t0ms,
      buildMs: buildSec * 1000,
      targetScale: track.bpm / fromSynth.currentTrack.bpm,
      priorScale: fromSynth.getTempoScale(),
      priorMuted: fromSynth.getSnapshot().muted,
      timers: [],
      ramp: null,
    };
    const beginAt = setTimeout(() => this.beginDropBuild(), delaySec * 1000);
    const wave2At = setTimeout(
      () => this.muteWave(fromSynth, DROP_STRIP_WAVE_2, true),
      (delaySec + buildSec / 2) * 1000
    );
    const rollAt = setTimeout(
      () => fromSynth.playRoll(loopSec),
      (delaySec + Math.max(0, buildSec - loopSec)) * 1000
    );
    const dropAt = setTimeout(() => this.finishDrop(), (delaySec + buildSec) * 1000);
    const ramp = setInterval(() => this.tickDropBuild(), 250);
    this.dropTransition = {
      ...this.dropTransition,
      timers: [beginAt, wave2At, rollAt, dropAt],
      ramp,
    };
  }

  private beginDropBuild(): void {
    const drop = this.dropTransition;
    if (!drop) return;
    this.muteWave(drop.fromSynth, DROP_STRIP_WAVE_1, true);
  }

  private muteWave(synth: TechnoMusicSynth, voices: readonly TechnoVoice[], muted: boolean): void {
    for (const voice of voices) synth.setVoiceMuted(voice, muted);
  }

  private tickDropBuild(): void {
    const drop = this.dropTransition;
    if (!drop) return;
    const k = Math.min(1, Math.max(0, (performance.now() - drop.t0ms) / drop.buildMs));
    drop.fromSynth.setOutputLevel(DJ_OUTPUT_LEVEL * (1 - 0.3 * k));
    drop.fromSynth.setTempoScale(drop.priorScale + (drop.targetScale - drop.priorScale) * k);
  }

  private finishDrop(): void {
    const drop = this.dropTransition;
    if (!drop || !this.busManager) return;
    this.clearDropTimers(drop);
    this.restoreStrip(drop.fromSynth, drop.priorMuted, drop.priorScale);
    drop.fromSynth.stop();
    drop.toSynth.setOutputLevel(DJ_OUTPUT_LEVEL);
    drop.toSynth.setBassCut(0);
    drop.toSynth.setTempoScale(1);
    drop.toSynth.start(this.busManager.musicGain);
    drop.toSynth.playImpact();
    this.technoSynth = drop.toSynth;
    this.dropTransition = null;
  }

  /** Return a stripped deck to the exact mixer state the build found. */
  private restoreStrip(
    synth: TechnoMusicSynth,
    priorMuted: readonly TechnoVoice[],
    priorScale: number
  ): void {
    for (const voice of [...DROP_STRIP_WAVE_1, ...DROP_STRIP_WAVE_2]) {
      synth.setVoiceMuted(voice, priorMuted.includes(voice));
    }
    synth.setOutputLevel(DJ_OUTPUT_LEVEL);
    synth.setBassCut(0);
    synth.setTempoScale(priorScale);
  }

  private clearDropTimers(drop: DropTransition): void {
    for (const timer of drop.timers) clearTimeout(timer);
    if (drop.ramp !== null) clearInterval(drop.ramp);
  }

  private cancelDropTransition(): void {
    const drop = this.dropTransition;
    this.dropTransition = null;
    if (!drop) return;
    this.clearDropTimers(drop);
    drop.toSynth.stop();
    this.restoreStrip(drop.fromSynth, drop.priorMuted, drop.priorScale);
  }

  /**
   * Realistic DJ blend: the incoming deck beatmatches silently, floats its
   * mids and highs in over a long phrase with tempo locked, swaps basslines
   * at the midpoint, then drifts home to its printed BPM after the blend.
   */
  public transitionTo(id: string, bars = DJ_XFADE_BARS): void {
    if (!this.ctx || !this.busManager || !this.technoSynth) return;
    const track = trackById(id);
    if (track.id === this.technoSynth.currentTrack.id) return;
    if (this.deckTransition !== null || this.dropTransition !== null) return;
    this.clearTempoDrift();
    const toSynth = new TechnoMusicSynth(this.ctx);
    toSynth.loadTrack(track);
    const matchScale =
      (this.technoSynth.currentTrack.bpm * this.technoSynth.getTempoScale()) / track.bpm;
    toSynth.setTempoScale(matchScale);
    toSynth.setOutputLevel(0);
    toSynth.setBassCut(1);
    const delaySec = this.technoSynth.secondsToLoopStart();
    toSynth.start(this.busManager.musicGain, { when: this.ctx.currentTime + delaySec });
    const fromStepDur = this.technoSynth.effectiveStepDur();
    const timer = setInterval(() => this.tickTransition(), DJ_XFADE_TICK_MS);
    this.deckTransition = {
      fromSynth: this.technoSynth,
      toSynth,
      matchScale,
      t0ms: performance.now() + delaySec * 1000,
      durMs: Math.max(0.02, bars) * 32 * fromStepDur * 1000,
      timer,
    };
  }

  private tickTransition(): void {
    const transition = this.deckTransition;
    if (!transition) return;
    const k = Math.max(0, Math.min(1, (performance.now() - transition.t0ms) / transition.durMs));
    const [outLevel, inLevel] = crossfadeLevels(k);
    const [outCut, inCut] = bassSwap(k);
    transition.fromSynth.setOutputLevel(outLevel);
    transition.fromSynth.setBassCut(outCut);
    transition.toSynth.setOutputLevel(inLevel);
    transition.toSynth.setBassCut(inCut);
    if (k >= 1) this.finishTransition();
  }

  private finishTransition(): void {
    const transition = this.deckTransition;
    if (!transition) return;
    clearInterval(transition.timer);
    transition.fromSynth.stop();
    transition.toSynth.setOutputLevel(DJ_OUTPUT_LEVEL);
    transition.toSynth.setBassCut(0);
    this.technoSynth = transition.toSynth;
    this.deckTransition = null;
    this.startTempoDrift(transition.toSynth, transition.matchScale);
  }

  /** Slow ride home to the printed BPM after the blend (8 loops). */
  private startTempoDrift(synth: TechnoMusicSynth, fromScale: number): void {
    this.clearTempoDrift();
    if (Math.abs(fromScale - 1) < 0.001) return;
    const baseStepDur = synth.effectiveStepDur() * fromScale;
    const durMs = 8 * 32 * baseStepDur * 1000;
    const t0ms = performance.now();
    this.driftTimer = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0ms) / durMs);
      synth.setTempoScale(tempoGlide(fromScale, k));
      if (k >= 1) this.clearTempoDrift();
    }, 250);
  }

  private clearTempoDrift(): void {
    if (this.driftTimer === null) return;
    clearInterval(this.driftTimer);
    this.driftTimer = null;
  }

  private cancelTransition(): void {
    const transition = this.deckTransition;
    this.deckTransition = null;
    this.clearTempoDrift();
    if (!transition) return;
    clearInterval(transition.timer);
    transition.toSynth.stop();
    transition.fromSynth.setOutputLevel(DJ_OUTPUT_LEVEL);
    transition.fromSynth.setBassCut(0);
  }

  public stopTechno(): void {
    this.cancelTransition();
    this.cancelDropTransition();
    this.technoSynth?.stop();
  }

  public setTechnoFreak(freak: number): void {
    this.technoSynth?.setFreak(freak);
  }

  public isTechnoPlaying(): boolean {
    return this.technoSynth?.isPlaying() ?? false;
  }

  /** Hype vocal hook through the music bus. */
  public playVocalChant(kind: ChantKind = 'oh4'): void {
    if (!this.busManager || !this.vocalSynth) return;
    this.vocalSynth.playChant(this.busManager.musicGain, kind);
  }

  /** Debug preview: push a fake alert transition (klaxon + music intensity). */
  public previewAlert(level: 'nominal' | 'yellow' | 'red'): void {
    this.updateTelemetry({ alertLevel: level } as TelemetryDeltaBroadcast, undefined, undefined);
  }
}
