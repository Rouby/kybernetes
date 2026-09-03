export interface BusVolumes {
  master: number;
  ambience: number;
  foley: number;
  ui: number;
  crisis: number;
  isMuted: boolean;
}

const STORAGE_KEY = 'kybernetes_audio_settings';

const DEFAULT_VOLUMES: BusVolumes = {
  master: 0.7,
  ambience: 0.6,
  foley: 0.8,
  ui: 0.75,
  crisis: 0.9,
  isMuted: false,
};

function loadStoredVolumes(): BusVolumes {
  if (typeof window === 'undefined') return { ...DEFAULT_VOLUMES };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_VOLUMES };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_VOLUMES, ...parsed };
  } catch {
    return { ...DEFAULT_VOLUMES };
  }
}

function persistVolumes(volumes: BusVolumes): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(volumes));
  } catch {
    // Ignore quota or private storage errors
  }
}

export class AudioBusManager {
  private ctx: AudioContext;
  private volumes: BusVolumes;
  private listeners: Set<(v: BusVolumes) => void> = new Set();

  public masterGain: GainNode;
  public masterCrisisFilter: BiquadFilterNode;
  public masterCompressor: DynamicsCompressorNode;
  public ambienceGain: GainNode;
  public foleyGain: GainNode;
  public uiGain: GainNode;
  public crisisGain: GainNode;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.volumes = loadStoredVolumes();

    this.masterGain = ctx.createGain();
    this.masterCrisisFilter = ctx.createBiquadFilter();
    this.masterCompressor = ctx.createDynamicsCompressor();
    this.ambienceGain = ctx.createGain();
    this.foleyGain = ctx.createGain();
    this.uiGain = ctx.createGain();
    this.crisisGain = ctx.createGain();

    this.setupNodeGraph();
    this.applyVolumes();
  }

  private setupNodeGraph(): void {
    // Setup dynamic crisis low-pass filter (clamped during suffocation/critical health)
    this.masterCrisisFilter.type = 'lowpass';
    this.masterCrisisFilter.frequency.setValueAtTime(20000, this.ctx.currentTime);
    this.masterCrisisFilter.Q.setValueAtTime(1.0, this.ctx.currentTime);
    this.masterCompressor.threshold.setValueAtTime(-12, this.ctx.currentTime);
    this.masterCompressor.knee.setValueAtTime(18, this.ctx.currentTime);
    this.masterCompressor.ratio.setValueAtTime(4, this.ctx.currentTime);
    this.masterCompressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
    this.masterCompressor.release.setValueAtTime(0.18, this.ctx.currentTime);

    // Route buses through master crisis filter -> master gain -> destination
    this.ambienceGain.connect(this.masterCrisisFilter);
    this.foleyGain.connect(this.masterCrisisFilter);
    this.crisisGain.connect(this.masterCrisisFilter);

    // UI connects directly to master gain to keep UI audible even during in-game audio trauma
    this.uiGain.connect(this.masterGain);

    this.masterCrisisFilter.connect(this.masterCompressor);
    this.masterCompressor.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);
  }

  // fallow-ignore-next-line unused-class-member
  public getVolumes(): BusVolumes {
    return { ...this.volumes };
  }

  // fallow-ignore-next-line unused-class-member
  public setVolume(bus: keyof Omit<BusVolumes, 'isMuted'>, value: number): void {
    const clamped = Math.max(0, Math.min(1, value));
    this.volumes[bus] = clamped;
    persistVolumes(this.volumes);
    this.applyVolumes();
  }

  // fallow-ignore-next-line unused-class-member
  public toggleMute(): boolean {
    this.volumes.isMuted = !this.volumes.isMuted;
    persistVolumes(this.volumes);
    this.applyVolumes();
    return this.volumes.isMuted;
  }

  // fallow-ignore-next-line unused-class-member
  public setMuted(muted: boolean): void {
    this.volumes.isMuted = muted;
    persistVolumes(this.volumes);
    this.applyVolumes();
  }

  private applyVolumes(): void {
    const t = this.ctx.currentTime;
    const effectiveMaster = this.volumes.isMuted ? 0 : this.volumes.master;

    this.masterGain.gain.setTargetAtTime(effectiveMaster, t, 0.03);
    this.ambienceGain.gain.setTargetAtTime(this.volumes.ambience, t, 0.03);
    this.foleyGain.gain.setTargetAtTime(this.volumes.foley, t, 0.03);
    this.uiGain.gain.setTargetAtTime(this.volumes.ui, t, 0.03);
    this.crisisGain.gain.setTargetAtTime(this.volumes.crisis, t, 0.03);
    this.notify();
  }

  // fallow-ignore-next-line unused-class-member
  public subscribe(cb: (v: BusVolumes) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notify(): void {
    const copy = { ...this.volumes };
    for (const cb of this.listeners) {
      cb(copy);
    }
  }

  public setMasterCrisisCutoff(cutoffHz: number): void {
    const clamped = Math.max(200, Math.min(20000, cutoffHz));
    this.masterCrisisFilter.frequency.setTargetAtTime(clamped, this.ctx.currentTime, 0.1);
  }
}
