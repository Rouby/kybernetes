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
}

type AudioListener = (snapshot: AudioSnapshot) => void;

function readVolumes(): BusVolumes | null {
  return ShipAudioEngine.getInstance().busManager?.getVolumes() ?? null;
}

function toSnapshot(volumes: BusVolumes | null): AudioSnapshot {
  if (volumes === null) return { ready: false, muted: false, masterPct: 70 };
  return { ready: true, muted: volumes.isMuted, masterPct: Math.round(volumes.master * 100) };
}

export class AudioPrefs {
  private snapshot: AudioSnapshot = toSnapshot(readVolumes());
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

  private update(volumes: BusVolumes | null): void {
    this.snapshot = toSnapshot(volumes);
    for (const listener of this.listeners) listener(this.snapshot);
  }
}
