/**
 * MovementController: framework-free port of useHarborMovement (Phase 1).
 * WASD sampled into INPUT intents at up to 20Hz with local prediction and
 * authoritative reconcile. No React: plain subscribe/getState plus
 * attach()/detach() for window listeners and the rAF loop. Pure helpers
 * (readMoveInput, reconcilePrediction) are exported for Vitest.
 */

import type { ClientIntent, SnapshotPawn, WallSegment } from '@kybernetes/protocol';
import { predictStep, predictVelocity } from '@kybernetes/sim-core';
import { ShipAudioEngine } from '../../audio/ShipAudioEngine';
import type { InputSample } from '../../harbor/inputGate';
import { shouldSendInput, wantsImmediateSend } from '../../harbor/inputGate';

export interface PredictedPose {
  readonly x: number;
  readonly y: number;
  readonly facing: number;
}

export interface MovementSnapshot {
  readonly predicted: PredictedPose | null;
  readonly sealed: boolean;
  readonly facing: number;
}

type MovementListener = (snapshot: MovementSnapshot) => void;

const KEY_DELTAS: Record<string, { x: number; y: number }> = {
  KeyW: { x: 0, y: -1 },
  ArrowUp: { x: 0, y: -1 },
  KeyS: { x: 0, y: 1 },
  ArrowDown: { x: 0, y: 1 },
  KeyA: { x: -1, y: 0 },
  ArrowLeft: { x: -1, y: 0 },
  KeyD: { x: 1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
};

const SNAP_DIST = 80;
const FOOTSTEP_PX = 56;
const PREDICT_RADIUS = 12;

export function readMoveInput(keys: ReadonlySet<string>): { x: number; y: number } | null {
  let x = 0;
  let y = 0;
  for (const key of keys) {
    const delta = KEY_DELTAS[key];
    if (delta !== undefined) {
      x += delta.x;
      y += delta.y;
    }
  }
  if (x === 0 && y === 0) return null;
  const len = Math.hypot(x, y);
  return { x: x / len, y: y / len };
}

/** Snap on teleport/sub-pixel drift, lerp the middle (mirrors the hook). */
export function reconcilePrediction(prev: PredictedPose | null, auth: SnapshotPawn): PredictedPose {
  if (prev === null) return { x: auth.x, y: auth.y, facing: auth.facing };
  const error = Math.hypot(auth.x - prev.x, auth.y - prev.y);
  if (error > SNAP_DIST || error < 6) {
    return { x: auth.x, y: auth.y, facing: auth.facing };
  }
  return {
    x: prev.x + (auth.x - prev.x) * 0.25,
    y: prev.y + (auth.y - prev.y) * 0.25,
    facing: auth.facing,
  };
}

interface NetState {
  pump: number;
  lastSent: InputSample | null;
  lastSentMs: number;
  wasActive: boolean;
}

function createNetState(): NetState {
  return { pump: 0, lastSent: null, lastSentMs: 0, wasActive: false };
}

export interface MovementDeps {
  readonly sendIntent: (intent: ClientIntent) => void;
  readonly isMouseAim?: () => boolean;
}

export class MovementController {
  private predicted: PredictedPose | null = null;
  private sealed = false;
  private facing = 0;
  private velocity = { x: 0, y: 0 };
  private footstepAcc = 0;
  private readonly keys = new Set<string>();
  private readonly listeners = new Set<MovementListener>();
  private readonly net: NetState = createNetState();
  private colliders: readonly WallSegment[] = [];
  private authoritative: SnapshotPawn | undefined;
  private raf = 0;
  private lastMs = 0;
  private attached = false;

  constructor(private readonly deps: MovementDeps) {}

  public getSnapshot(): MovementSnapshot {
    return { predicted: this.predicted, sealed: this.sealed, facing: this.facing };
  }

  public subscribe(listener: MovementListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public setColliders(colliders: readonly WallSegment[]): void {
    this.colliders = colliders;
  }

  public setAuthoritative(auth: SnapshotPawn | undefined): void {
    this.authoritative = auth;
    if (auth === undefined) return;
    this.velocity = { x: auth.vx, y: auth.vy };
    const next = reconcilePrediction(this.predicted, auth);
    this.predicted = next;
    this.emit();
  }

  public getFacing(): number {
    return this.facing;
  }

  public toggleSeal(): void {
    this.sealed = !this.sealed;
    this.deps.sendIntent({ type: 'SUIT', seq: 0, sealed: this.sealed });
    ShipAudioEngine.getInstance().playVisorToggle(this.sealed);
    this.emit();
  }

  public attach(): void {
    if (this.attached) return;
    this.attached = true;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.lastMs = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  public detach(): void {
    if (!this.attached) return;
    this.attached = false;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    cancelAnimationFrame(this.raf);
  }

  private emit(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) listener(snapshot);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (KEY_DELTAS[event.code] !== undefined) this.keys.add(event.code);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
  };

  private readonly frame = (now: number): void => {
    if (!this.attached) return;
    const dt = Math.min((now - this.lastMs) / 1000, 0.1);
    this.lastMs = now;
    const input = readMoveInput(this.keys);
    this.updateFacing(input);
    this.stepPrediction(input, dt);
    this.pumpNetwork(input, dt, now);
    this.raf = requestAnimationFrame(this.frame);
  };

  private updateFacing(input: { x: number; y: number } | null): void {
    if (input !== null && this.deps.isMouseAim?.() !== true) {
      this.facing = Math.atan2(input.y, input.x);
    }
  }

  private stepPrediction(input: { x: number; y: number } | null, dt: number): void {
    const prev = this.predicted;
    const base = prev ?? this.poseOfAuthoritative();
    const nextVel = predictVelocity(this.velocity, input, dt);
    this.velocity = nextVel;
    if (base === null) return;
    if (input === null) {
      const next = base.facing === this.facing ? base : { ...base, facing: this.facing };
      this.commitPrediction(prev, next);
      return;
    }
    const target = { x: base.x + nextVel.x * dt, y: base.y + nextVel.y * dt };
    const stepped = predictStep(base, PREDICT_RADIUS, target, this.colliders);
    this.commitPrediction(prev, { ...stepped, facing: this.facing });
  }

  private poseOfAuthoritative(): PredictedPose | null {
    const auth = this.authoritative;
    if (auth === undefined) return null;
    return { x: auth.x, y: auth.y, facing: auth.facing };
  }

  private commitPrediction(prev: PredictedPose | null, next: PredictedPose): void {
    if (prev !== null) this.trackFootsteps(prev, next);
    this.predicted = next;
    this.emit();
  }

  private trackFootsteps(prev: PredictedPose, next: PredictedPose): void {
    this.footstepAcc += Math.hypot(next.x - prev.x, next.y - prev.y);
    if (this.footstepAcc < FOOTSTEP_PX) return;
    this.footstepAcc = 0;
    ShipAudioEngine.getInstance().playLocalFootstep();
  }

  private pumpNetwork(input: { x: number; y: number } | null, dt: number, now: number): void {
    this.net.pump += dt;
    const pressed = wantsImmediateSend(this.net.wasActive, input);
    this.net.wasActive = input !== null;
    if (this.net.pump < 0.05 && !pressed) return;
    this.net.pump = 0;
    const sample: InputSample = {
      x: input?.x ?? 0,
      y: input?.y ?? 0,
      facing: this.facing,
      sprint: false,
      sealed: this.sealed,
    };
    if (!shouldSendInput(this.net.lastSent, sample, now - this.net.lastSentMs)) return;
    this.net.lastSent = sample;
    this.net.lastSentMs = now;
    this.deps.sendIntent({
      type: 'INPUT',
      seq: 0,
      moveVec: { x: sample.x, y: sample.y },
      facing: sample.facing,
      sprint: sample.sprint,
      sealed: sample.sealed,
    });
  }
}
