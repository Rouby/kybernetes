/**
 * AudioPrefs: framework-free master audio controls (Phase 1).
 * Mirrors useMasterAudio without React: volumes persist through the
 * AudioBusManager, enable() arms the context from a user gesture.
 */

import type { BusVolumes } from '../../audio/AudioBusManager';
import { ShipAudioEngine } from '../../audio/ShipAudioEngine';

export interface AudioSnapshot {
  readonly ready: boolean;
  readonly muted: boolean;
  readonly masterPct: number;
  readonly musicPct: number;
  readonly musicOn: boolean;
}

type AudioListener = (snapshot: AudioSnapshot) => void;

function readVolumes(): BusVolumes | null {
  return ShipAudioEngine.getInstance().busManager?.getVolumes() ?? null;
}

const MUSIC_ON_KEY = 'kybernetes_music_on';

function loadMusicOn(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(MUSIC_ON_KEY) !== '0';
  } catch {
    return true;
  }
}

function persistMusicOn(on: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(MUSIC_ON_KEY, on ? '1' : '0');
  } catch {
    // Ignore quota or private storage errors
  }
}

function toSnapshot(volumes: BusVolumes | null, musicOn: boolean): AudioSnapshot {
  if (volumes === null) return { ready: false, muted: false, masterPct: 70, musicPct: 70, musicOn };
  return {
    ready: true,
    muted: volumes.isMuted,
    masterPct: Math.round(volumes.master * 100),
    musicPct: Math.round(volumes.music * 100),
    musicOn,
  };
}

export class AudioPrefs {
  private musicOn = loadMusicOn();
  private snapshot: AudioSnapshot = toSnapshot(readVolumes(), this.musicOn);
  private readonly listeners = new Set<AudioListener>();
  private unsubscribe: (() => void) | null = null;

  public getSnapshot(): AudioSnapshot {
    return this.snapshot;
  }

  public subscribe(listener: AudioListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public attach(): void {
    const bus = ShipAudioEngine.getInstance().busManager;
    if (bus === null) return;
    this.update(bus.getVolumes());
    this.unsubscribe = bus.subscribe((volumes) => this.update(volumes));
    this.syncMusic();
  }

  public detach(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  public enable(): void {
    const engine = ShipAudioEngine.getInstance();
    engine.init();
    engine.resume();
    this.detach();
    this.attach();
    this.update(readVolumes());
    this.syncMusic();
  }

  public setMasterPct(pct: number): void {
    const bus = ShipAudioEngine.getInstance().busManager;
    if (bus === null) return;
    bus.setVolume('master', pct / 100);
    this.update(bus.getVolumes());
  }

  public setMuted(muted: boolean): void {
    const bus = ShipAudioEngine.getInstance().busManager;
    if (bus === null) return;
    bus.setMuted(muted);
    this.update(bus.getVolumes());
  }

  public setMusicPct(pct: number): void {
    const bus = ShipAudioEngine.getInstance().busManager;
    if (bus === null) return;
    bus.setVolume('music', pct / 100);
    this.update(bus.getVolumes());
  }

  public setMusicOn(on: boolean): void {
    this.musicOn = on;
    persistMusicOn(on);
    this.update(readVolumes());
    this.syncMusic();
  }

  private syncMusic(): void {
    ShipAudioEngine.getInstance().setMusicDesired(this.snapshot.musicOn);
  }

  private update(volumes: BusVolumes | null): void {
    this.snapshot = toSnapshot(volumes, this.musicOn);
    for (const listener of this.listeners) listener(this.snapshot);
  }
}
