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
  private lastDecompressionRoarTime = 0;
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

    // 4. Decompression roar & venting foley
    const roomAtmos =
      currentRoomId && telemetry.roomAtmospheres
        ? telemetry.roomAtmospheres[currentRoomId]
        : undefined;
    if (roomAtmos?.isVenting && now - this.lastDecompressionRoarTime > 3500) {
      this.lastDecompressionRoarTime = now;
      this.pneumaticSynth?.playVentingBurst(this.busManager.crisisGain, 2.5, 0.85);
    }

    // 5. Vitals Crisis (Heartbeat, suffocation breath, vacuum muffling)
    this.processVitalsTrauma(vitals, o2, now, roomAtmos?.pressureKpa ?? 101.3);
  }

  private processVitalsTrauma(
    vitals: PlayerVitals | undefined,
    o2: number,
    now: number,
    roomPressure = 101.3
  ): void {
    if (!vitals || !this.busManager || !this.vitalsSynth) return;
    this.processSuffocation(vitals, o2, now, roomPressure);
    this.processHeartbeat(vitals, now);
  }

  // fallow-ignore-next-line complexity
  private processSuffocation(
    vitals: PlayerVitals,
    o2: number,
    now: number,
    roomPressure = 101.3
  ): void {
    if (!this.busManager || !this.vitalsSynth) return;
    const isVacuumUnsealed = !vitals.suit?.isSealed && roomPressure < 50;
    const isSuffocating =
      vitals.hypoxiaPercent > 30 ||
      o2 <= 25 ||
      vitals.health <= 20 ||
      isVacuumUnsealed ||
      (vitals.suit?.isSealed && vitals.suit.o2RemainingSeconds < 60);

    if (isSuffocating) {
      const pressureRatio = isVacuumUnsealed ? Math.max(0.01, roomPressure / 101.3) : 1.0;
      const severityRatio = Math.min(
        1.0,
        Math.max(
          vitals.hypoxiaPercent / 100,
          (25 - o2) / 25,
          (20 - vitals.health) / 20,
          1 - pressureRatio
        )
      );
      const clampCutoff = Math.max(220, 20000 * Math.max(0.01, 1 - severityRatio));
      this.busManager.setMasterCrisisCutoff(clampCutoff);

      const breathInterval = vitals.hypoxiaPercent > 60 ? 900 : 1400;
      if (now - this.lastBreathTime > breathInterval) {
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

  /**
   * Shared spatial-foley preamble: calculate params at (x, y), drop
   * inaudible voices below gainFloor, and return a panned channel input.
   * Returns null when audio is unavailable or the voice is culled.
   */
  private spatialFoleyInput(x: number, y: number, gainFloor: number): AudioNode | null {
    if (!this.busManager || !this.spatializer) return null;
    const params = this.spatializer.calculate(
      this.listenerX,
      this.listenerY,
      x,
      y,
      this.activeDoors
    );
    if (params.gain < gainFloor) return null;
    const channel = this.spatializer.createSpatialChannel(this.busManager.foleyGain);
    this.spatializer.applySpatialParams(channel, params, 0.01);
    return channel.input;
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
    const input = this.spatialFoleyInput(emitterX, emitterY, 0.05);
    if (!input) return;

    this.activeFoleyVoices++;
    this.metalSynth.playFootstep(input, surface, 0.6);

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

    const input = this.spatialFoleyInput(originX, originY, 0.03);
    if (!input) return;
    this.ballisticsSynth.playWeaponFire(input, weaponType, chargeRatio, 0.85);
  }

  // Hitscan combat has no impact points yet; kept for the tracer milestone.
  public playImpact(x: number, y: number, type: 'kinetic' | 'laser' | 'welder'): void {
    if (!this.ballisticsSynth) return;
    const input = this.spatialFoleyInput(x, y, 0.03);
    if (!input) return;
    this.ballisticsSynth.playImpact(input, type, 0.65);
  }

  public playDoorToggle(x: number, y: number, isOpen: boolean): void {
    if (!this.pneumaticSynth) return;
    const input = this.spatialFoleyInput(x, y, 0.03);
    if (!input) return;
    this.pneumaticSynth.playDoorCycle(input, isOpen, 0.85);
  }

  public playStationInteract(): void {
    if (!this.busManager || !this.uiSynth) return;
    this.uiSynth.playPromptChirp(this.busManager.uiGain);
  }

  // fallow-ignore-next-line unused-class-member -- no debrief flow on the v2 client yet
  public playDebriefStamp(): void {
    if (!this.busManager || !this.uiSynth) return;
    this.uiSynth.playDebriefStamp(this.busManager.uiGain);
  }

  public playUiClick(): void {
    if (!this.busManager || !this.uiSynth) return;
    this.uiSynth.playClick(this.busManager.uiGain);
  }

  // fallow-ignore-next-line unused-class-member -- no blast events on the v2 client yet
  public playExplosionShockwave(): void {
    if (!this.busManager || !this.vitalsSynth) return;
    this.vitalsSynth.playTinnitusRing(this.busManager.crisisGain, 3.5, 0.7);
  }

  public playVisorToggle(sealed: boolean): void {
    if (!this.busManager || !this.vitalsSynth) return;
    this.vitalsSynth.playVisorSeal(this.busManager.foleyGain, sealed);
  }
}
