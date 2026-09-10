/**
 * SessionControlStore: framework-free pause/death gate (Phase 1).
 * Mirrors useSessionControls: Esc pauses local input (world stays live),
 * server death or dead vitals blocks play intents, RESTART always passes.
 */

import type { ClientIntent, DeathBroadcast, VitalsBroadcast } from '@kybernetes/protocol';
import { ShipAudioEngine } from '../../audio/ShipAudioEngine';
import { isDeathVitals } from '../../harbor/deathNotice';

export interface SessionControlSnapshot {
  readonly paused: boolean;
  readonly dead: boolean;
}

type SessionControlListener = (snapshot: SessionControlSnapshot) => void;

export interface SessionControlDeps {
  readonly sendIntent: (intent: ClientIntent) => void;
  readonly clearDeath: () => void;
}

export class SessionControlStore {
  private paused = false;
  private death: DeathBroadcast | null = null;
  private vitals: VitalsBroadcast | null = null;
  private readonly listeners = new Set<SessionControlListener>();

  constructor(private readonly deps: SessionControlDeps) {}

  public getSnapshot(): SessionControlSnapshot {
    return { paused: this.paused, dead: this.isDead() };
  }

  public subscribe(listener: SessionControlListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public setDeath(death: DeathBroadcast | null): void {
    this.death = death;
    this.emit();
  }

  public setVitals(vitals: VitalsBroadcast | null): void {
    this.vitals = vitals;
    this.emit();
  }

  public togglePause(): void {
    if (this.isDead()) return;
    this.setPaused(!this.paused);
  }

  public setPaused(paused: boolean): void {
    this.paused = paused;
    this.emit();
  }

  public sendPlayIntent(intent: ClientIntent): void {
    if (intent.type === 'RESTART') {
      this.deps.sendIntent(intent);
      return;
    }
    if (this.paused || this.isDead()) return;
    this.deps.sendIntent(intent);
  }

  public restart(): void {
    this.setPaused(false);
    this.deps.clearDeath();
    this.deps.sendIntent({ type: 'RESTART', seq: 0 });
    ShipAudioEngine.getInstance().playUiClick();
  }

  private isDead(): boolean {
    return this.death !== null || isDeathVitals(this.vitals);
  }

  private emit(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}
