/**
 * FireController: framework-free predicted fire loop (Phase 1).
 * Mirrors useSessionFire: optimistic shots, hold-to-fire pump, server
 * refusal reconcile. No React; attach()/detach() own the rAF loop.
 */

import type { ClientIntent, SnapshotBroadcast, VitalsBroadcast } from '@kybernetes/protocol';
import { ShipAudioEngine } from '../../audio/ShipAudioEngine';
import { shouldFireShot } from '../../harbor/fireGate';
import {
  dropYoungShots,
  type PredictedShot,
  spawnPredictedShot,
} from '../../harbor/predictedShots';
import type { PredictedPose } from './MovementController';

export interface FireDeps {
  readonly sendPlayIntent: (intent: ClientIntent) => void;
  readonly getSnapshot: () => SnapshotBroadcast | null;
  readonly getPawnId: () => string | null;
  readonly getVitals: () => VitalsBroadcast | null;
  readonly getPredicted: () => PredictedPose | null;
  readonly getFacing: () => number;
}

export class FireController {
  private shots: PredictedShot[] = [];
  private fireSignal = 0;
  private shotId = 0;
  private fireHeld = false;
  private refusedId = 0;
  private raf = 0;
  private lastMs = 0;
  private acc = 0;
  private attached = false;

  constructor(private readonly deps: FireDeps) {}

  public getShots(): readonly PredictedShot[] {
    return this.shots;
  }

  public getFireSignal(): number {
    return this.fireSignal;
  }

  public pressFireStart(): void {
    this.fireHeld = true;
    this.fireOnce();
  }

  public pressFireEnd(): void {
    this.fireHeld = false;
  }

  public reconcileNotices(notices: readonly { id: number; message: string }[]): void {
    const latest = notices[notices.length - 1];
    if (latest === undefined || latest.id === this.refusedId) return;
    this.refusedId = latest.id;
    if (/^FIRE_(empty|down|miss)/.test(latest.message)) {
      this.shots = dropYoungShots(this.shots, performance.now(), 600);
    }
  }

  public attach(): void {
    if (this.attached) return;
    this.attached = true;
    this.lastMs = performance.now();
    this.acc = 0;
    this.raf = requestAnimationFrame(this.frame);
  }

  public detach(): void {
    if (!this.attached) return;
    this.attached = false;
    cancelAnimationFrame(this.raf);
  }

  private readonly frame = (now: number): void => {
    if (!this.attached) return;
    const dt = Math.min((now - this.lastMs) / 1000, 0.1);
    this.lastMs = now;
    this.acc += dt;
    if (this.acc >= 0.16) {
      this.acc -= 0.16;
      if (this.fireHeld) this.fireOnce();
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  private fireOnce(): void {
    const self = this.aimableSelf();
    if (self === undefined) return;
    this.deps.sendPlayIntent({
      type: 'FIRE',
      seq: 0,
      originAngle: this.deps.getFacing(),
      weapon: 'kinetic_carbine',
    });
    this.emitShot(self.frameId, self.x, self.y);
    ShipAudioEngine.getInstance().playWeaponFire(self.x, self.y, 'kinetic_carbine');
  }

  private aimableSelf(): { frameId: string; x: number; y: number } | undefined {
    const snapshot = this.deps.getSnapshot();
    const pawnId = this.deps.getPawnId();
    const self = snapshot?.pawns.find((pawn) => pawn.id === pawnId);
    if (self === undefined || !shouldFireShot(this.deps.getVitals(), true)) return undefined;
    return { frameId: self.frameId, x: self.x, y: self.y };
  }

  private emitShot(frameId: string, x: number, y: number): void {
    this.fireSignal += 1;
    this.shotId += 1;
    const at = this.deps.getPredicted();
    this.shots = [
      ...this.shots.slice(-7),
      spawnPredictedShot(
        this.shotId,
        frameId,
        at?.x ?? x,
        at?.y ?? y,
        this.deps.getFacing(),
        'kinetic_carbine',
        performance.now()
      ),
    ];
  }
}
