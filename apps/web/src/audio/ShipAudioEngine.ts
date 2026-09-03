import type {
  DoorState,
  PlayerVitals,
  TelemetryDeltaBroadcast,
  WeaponType,
} from '@kybernetes/protocol';
import { AcousticSpatializer } from './AcousticSpatializer';
import { AudioBusManager } from './AudioBusManager';
import { AlarmSynth } from './synths/AlarmSynth';
import { BallisticsSynth } from './synths/BallisticsSynth';
import { type DeckSurfaceType, MetallicPlateSynth } from './synths/MetallicPlateSynth';
import { PneumaticSynth } from './synths/PneumaticSynth';
import { ReactorDroneSynth } from './synths/ReactorDroneSynth';
import { TerminalUiSynth } from './synths/TerminalUiSynth';
import { VitalsMonitorSynth } from './synths/VitalsMonitorSynth';

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
  private previousAlertLevel: 'nominal' | 'yellow' | 'red' = 'nominal';

  // Voice Concurrency Limiting
  private activeFoleyVoices = 0;
  private readonly MAX_CONCURRENT_FOLEY = 8;

  public static getInstance(): ShipAudioEngine {
    if (!ShipAudioEngine.instance) {
      ShipAudioEngine.instance = new ShipAudioEngine();
    }
    return ShipAudioEngine.instance;
  }

  // fallow-ignore-next-line complexity
  public init(): void {
    if (this.ctx) return;
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

      this.setupGestureUnlock();
    } catch {
      // AudioContext unavailable in environment
    }
  }

  // fallow-ignore-next-line complexity
  public resume(): void {
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().then(() => this.startAmbientLoop());
    } else if (this.ctx.state === 'running') {
      this.startAmbientLoop();
    }
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

  // fallow-ignore-next-line complexity
  public updateTelemetry(
    telemetry: TelemetryDeltaBroadcast,
    vitals?: PlayerVitals,
    currentRoomId?: string
  ): void {
    if (!this.ctx || !this.busManager) return;
    const now = performance.now();

    // 1. Living ship reactor & air circulation
    const reactorLoad = telemetry.reactorOutputMw ?? telemetry.reactor?.outputMw ?? 50;
    const o2 = telemetry.oxygenLevelPercent ?? telemetry.lifeSupport?.o2LevelPercent ?? 100;
    const isOnBridge = currentRoomId === 'bridge';
    this.reactorSynth?.updateTelemetry(reactorLoad, o2, isOnBridge);

    // 2. Low Hull Groans (<50%)
    const hullPct = telemetry.hullIntegrityPercent ?? telemetry.hull?.integrityPercent ?? 100;
    if (hullPct < 50 && now - this.lastHullGroanTime > 7000 + Math.random() * 5000) {
      this.lastHullGroanTime = now;
      this.metalSynth?.playHullGroan(this.busManager.ambienceGain, (50 - hullPct) / 50);
    }

    // 3. Alert Level Transition
    if (telemetry.alertLevel && telemetry.alertLevel !== this.previousAlertLevel) {
      if (telemetry.alertLevel === 'red') {
        this.alarmSynth?.playRedAlertKlaxon(this.busManager.crisisGain);
      } else if (telemetry.alertLevel === 'yellow') {
        this.alarmSynth?.playCautionChime(this.busManager.crisisGain);
      }
      this.previousAlertLevel = telemetry.alertLevel;
    }

    // 4. Vitals Crisis (Heartbeat, suffocation breath, mix ducking)
    this.processVitalsTrauma(vitals, o2, now);
  }

  private processVitalsTrauma(vitals: PlayerVitals | undefined, o2: number, now: number): void {
    if (!vitals || !this.busManager || !this.vitalsSynth) return;
    this.processSuffocation(vitals, o2, now);
    this.processHeartbeat(vitals, now);
  }

  // fallow-ignore-next-line complexity
  private processSuffocation(vitals: PlayerVitals, o2: number, now: number): void {
    if (!this.busManager || !this.vitalsSynth) return;
    if (o2 <= 25 || vitals.health <= 20) {
      const severityRatio = Math.min(o2 / 25, vitals.health / 20);
      const clampCutoff = Math.max(320, 20000 * Math.max(0.1, severityRatio));
      this.busManager.setMasterCrisisCutoff(clampCutoff);

      if (now - this.lastBreathTime > 1400) {
        this.lastBreathTime = now;
        this.vitalsSynth.playSuffocationBreath(this.busManager.crisisGain, this.isInhaling);
        this.isInhaling = !this.isInhaling;
      }
    } else {
      this.busManager.setMasterCrisisCutoff(20000);
    }
  }

  // fallow-ignore-next-line complexity
  private processHeartbeat(vitals: PlayerVitals, now: number): void {
    if (!this.busManager || !this.vitalsSynth) return;
    if (vitals.fatigue >= 75 || vitals.health <= 25) {
      const bpm = vitals.health <= 25 ? 120 : 90;
      const intervalMs = (60 / bpm) * 1000;
      if (now - this.lastHeartbeatTime > intervalMs) {
        this.lastHeartbeatTime = now;
        this.vitalsSynth.playHeartbeat(this.busManager.crisisGain, bpm);
      }
    }
  }

  // --- Spatial Foley & Interactions ---

  public playLocalFootstep(surface: DeckSurfaceType = 'steel'): void {
    if (!this.busManager || !this.metalSynth) return;
    this.metalSynth.playFootstep(this.busManager.foleyGain, surface, 0.7);
  }

  // fallow-ignore-next-line unused-class-member, complexity
  public playRemoteFootstep(
    emitterX: number,
    emitterY: number,
    surface: DeckSurfaceType = 'steel'
  ): void {
    if (!this.busManager || !this.spatializer || !this.metalSynth) return;
    if (this.activeFoleyVoices >= this.MAX_CONCURRENT_FOLEY) return;

    const params = this.spatializer.calculate(
      this.listenerX,
      this.listenerY,
      emitterX,
      emitterY,
      this.activeDoors
    );
    if (params.gain < 0.05) return;

    this.activeFoleyVoices++;
    const channel = this.spatializer.createSpatialChannel(this.busManager.foleyGain);
    this.spatializer.applySpatialParams(channel, params, 0.01);
    this.metalSynth.playFootstep(channel.input, surface, 0.6);

    setTimeout(() => {
      this.activeFoleyVoices = Math.max(0, this.activeFoleyVoices - 1);
    }, 60);
  }

  // fallow-ignore-next-line complexity
  public playWeaponFire(
    originX: number,
    originY: number,
    weaponType: WeaponType | 'raider_plasma',
    chargeRatio = 1.0,
    isLocal = true
  ): void {
    if (!this.busManager || !this.ballisticsSynth) return;

    if (isLocal) {
      this.ballisticsSynth.playWeaponFire(this.busManager.foleyGain, weaponType, chargeRatio, 1.0);
      return;
    }

    if (!this.spatializer) return;
    const params = this.spatializer.calculate(
      this.listenerX,
      this.listenerY,
      originX,
      originY,
      this.activeDoors
    );
    if (params.gain < 0.03) return;

    const channel = this.spatializer.createSpatialChannel(this.busManager.foleyGain);
    this.spatializer.applySpatialParams(channel, params, 0.01);
    this.ballisticsSynth.playWeaponFire(channel.input, weaponType, chargeRatio, 0.85);
  }

  // fallow-ignore-next-line complexity
  public playImpact(x: number, y: number, type: 'kinetic' | 'laser' | 'welder'): void {
    if (!this.busManager || !this.spatializer || !this.ballisticsSynth) return;
    const params = this.spatializer.calculate(
      this.listenerX,
      this.listenerY,
      x,
      y,
      this.activeDoors
    );
    if (params.gain < 0.03) return;

    const channel = this.spatializer.createSpatialChannel(this.busManager.foleyGain);
    this.spatializer.applySpatialParams(channel, params, 0.01);
    this.ballisticsSynth.playImpact(channel.input, type, 0.65);
  }

  // fallow-ignore-next-line complexity
  public playDoorToggle(x: number, y: number, isOpen: boolean): void {
    if (!this.busManager || !this.spatializer || !this.pneumaticSynth) return;
    const params = this.spatializer.calculate(
      this.listenerX,
      this.listenerY,
      x,
      y,
      this.activeDoors
    );
    if (params.gain < 0.03) return;

    const channel = this.spatializer.createSpatialChannel(this.busManager.foleyGain);
    this.spatializer.applySpatialParams(channel, params, 0.01);
    this.pneumaticSynth.playDoorCycle(channel.input, isOpen, 0.85);
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

  public playExplosionShockwave(): void {
    if (!this.busManager || !this.vitalsSynth) return;
    this.vitalsSynth.playTinnitusRing(this.busManager.crisisGain, 3.5, 0.7);
  }
}
