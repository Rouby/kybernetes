import type {
  DoorState,
  PlayerVitals,
  TelemetryDeltaBroadcast,
  WeaponType,
} from '@kybernetes/protocol';
import { AcousticSpatializer } from './AcousticSpatializer';
import { AudioBusManager } from './AudioBusManager';
import { SpatialFoleyPool } from './SpatialFoleyPool';
import { AlarmSynth } from './synths/AlarmSynth';
import { BallisticsSynth } from './synths/BallisticsSynth';
import { type DeckSurfaceType, MetallicPlateSynth } from './synths/MetallicPlateSynth';
import { PneumaticSynth } from './synths/PneumaticSynth';
import { ReactorDroneSynth } from './synths/ReactorDroneSynth';
import { TerminalUiSynth } from './synths/TerminalUiSynth';
import { VitalsMonitorSynth } from './synths/VitalsMonitorSynth';
import {
  assessSuffocation,
  heartbeatTempo,
  mapperTelemetrySnapshot,
  type TelemetryAudioSnapshot,
} from './TelemetryAudioMapper';

export class ShipAudioEngine {
  private static instance: ShipAudioEngine | null = null;

  public ctx: AudioContext | null = null;
  public busManager: AudioBusManager | null = null;
  public spatializer: AcousticSpatializer | null = null;

  // Synths
  public metalSynth: MetallicPlateSynth | null = null;
  public pneumaticSynth: PneumaticSynth | null = null;
  public reactorSynth: ReactorDroneSynth | null = null;
  public ballisticsSynth: BallisticsSynth | null = null;
  public uiSynth: TerminalUiSynth | null = null;
  public vitalsSynth: VitalsMonitorSynth | null = null;
  public alarmSynth: AlarmSynth | null = null;

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
      this.reactorSynth = new ReactorDroneSynth(this.ctx);
      this.ballisticsSynth = new BallisticsSynth(this.ctx);
      this.uiSynth = new TerminalUiSynth(this.ctx);
      this.vitalsSynth = new VitalsMonitorSynth(this.ctx);
      this.alarmSynth = new AlarmSynth(this.ctx);
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
    if (this.busManager && this.reactorSynth) {
      this.reactorSynth.start(this.busManager.ambienceGain);
    }
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
    this.applyReactorSection(mapped.snapshot, currentRoomId);
    this.applyHullSection(mapped.snapshot, now);
    this.applyAlertSection(mapped.snapshot);
    this.applyVentSection(mapped.snapshot, now);
    this.processVitalsTrauma(vitals, mapped.snapshot, now);
  }

  private applyReactorSection(
    snapshot: TelemetryAudioSnapshot,
    currentRoomId: string | undefined
  ): void {
    this.reactorSynth?.updateTelemetry(
      snapshot.reactorLoad,
      snapshot.oxygen,
      currentRoomId === 'bridge'
    );
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
    } else if (snapshot.alertChanged === 'yellow') {
      this.alarmSynth?.playCautionChime(this.busManager.crisisGain);
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
}
