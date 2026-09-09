/**
 * Harbor movement: WASD sampled into INPUT intents at up to 20Hz with local
 * prediction and authoritative reconcile. Prediction collides against the
 * same frame colliders as the server (via predictStep), so reconciles are
 * small corrections rather than teleports. Idle clients suppress unchanged
 * INPUT (500ms heartbeat) so the server tick skips pointless wakeups.
 */

import type { ClientIntent, SnapshotPawn, WallSegment } from '@kybernetes/protocol';
import { predictStep, predictVelocity } from '@kybernetes/sim-core';
import type { RefObject } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ShipAudioEngine } from '../audio/ShipAudioEngine';
import type { InputSample } from './inputGate';
import { shouldSendInput, wantsImmediateSend } from './inputGate';

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

export interface PredictedPawn {
  readonly x: number;
  readonly y: number;
  readonly facing: number;
}

function readMoveInput(keys: Set<string>): { x: number; y: number } | null {
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

const PREDICT_RADIUS = 12;

export function useHarborMovement(
  authoritative: SnapshotPawn | undefined,
  sendIntent: (intent: ClientIntent) => void,
  colliders: readonly WallSegment[] = [],
  mouseAimRef?: RefObject<boolean>
) {
  const [predicted, setPredicted] = useState<PredictedPawn | null>(null);
  const [sealed, setSealed] = useState(false);
  const keysRef = useRef<Set<string>>(new Set());
  const facingRef = useRef(0);
  const sealedRef = useRef(false);
  const predictedRef = useRef<PredictedPawn | null>(null);
  const authRef = useRef(authoritative);
  authRef.current = authoritative;
  const collidersRef = useRef(colliders);
  collidersRef.current = colliders;
  const footstepRef = useRef(0);
  const velRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const onDown = (event: KeyboardEvent): void => {
      if (KEY_DELTAS[event.code] !== undefined) keysRef.current.add(event.code);
    };
    const onUp = (event: KeyboardEvent): void => {
      keysRef.current.delete(event.code);
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, []);

  useEffect(() => {
    let raf = 0;
    const net: FrameNetState = { pump: 0, lastSent: null, lastSentMs: 0, wasActive: false };
    let last = performance.now();
    const frame = (now: number): void => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const input = readMoveInput(keysRef.current);
      updateAimFacing(input, facingRef, mouseAimRef?.current);
      const { prev, next } = stepPrediction(
        predictedRef,
        authRef.current,
        input,
        dt,
        facingRef.current,
        collidersRef.current,
        velRef
      );
      if (next !== prev && next !== null) {
        trackFootsteps(footstepRef, prev, next);
        commitPrediction(predictedRef, setPredicted, next);
      }
      pumpNetworkInput(net, input, dt, now, facingRef.current, sealedRef.current, sendIntent);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // mouseAimRef flips once per session (first mouse move); restarting the loop is harmless
  }, [sendIntent, mouseAimRef?.current]);

  useEffect(() => {
    if (authoritative === undefined) return;
    velRef.current = { x: authoritative.vx, y: authoritative.vy };
    const prev = predictedRef.current;
    if (prev === null) {
      const snap: PredictedPawn = {
        x: authoritative.x,
        y: authoritative.y,
        facing: authoritative.facing,
      };
      predictedRef.current = snap;
      setPredicted(snap);
      return;
    }
    const error = Math.hypot(authoritative.x - prev.x, authoritative.y - prev.y);
    // Snap on teleport and on sub-pixel drift (kills the stop-trail); lerp the middle.
    const next: PredictedPawn =
      error > SNAP_DIST || error < 6
        ? { x: authoritative.x, y: authoritative.y, facing: authoritative.facing }
        : {
            x: prev.x + (authoritative.x - prev.x) * 0.25,
            y: prev.y + (authoritative.y - prev.y) * 0.25,
            facing: authoritative.facing,
          };
    predictedRef.current = next;
    setPredicted(next);
  }, [authoritative]);

  const toggleSeal = useCallback((): void => {
    const nextSealed = !sealedRef.current;
    sealedRef.current = nextSealed;
    setSealed(nextSealed);
    sendIntent({ type: 'SUIT', seq: 0, sealed: nextSealed });
    ShipAudioEngine.getInstance().playVisorToggle(nextSealed);
  }, [sendIntent]);

  return { predicted, sealed, facingRef, toggleSeal };
}

function snapshotPose(auth: SnapshotPawn | undefined): PredictedPawn | null {
  if (auth === undefined) return null;
  return { x: auth.x, y: auth.y, facing: auth.facing };
}

interface FrameNetState {
  pump: number;
  lastSent: InputSample | null;
  lastSentMs: number;
  wasActive: boolean;
}

function updateAimFacing(
  input: { x: number; y: number } | null,
  facingRef: { current: number },
  mouseAim: boolean | undefined
): void {
  if (input !== null && mouseAim !== true) facingRef.current = Math.atan2(input.y, input.x);
}

function stepPrediction(
  predictedRef: { current: PredictedPawn | null },
  auth: SnapshotPawn | undefined,
  input: { x: number; y: number } | null,
  dt: number,
  facing: number,
  colliders: readonly WallSegment[],
  velRef: { current: { x: number; y: number } }
): { prev: PredictedPawn | null; next: PredictedPawn | null } {
  const prev = predictedRef.current;
  const step = advancePose(
    prev ?? snapshotPose(auth),
    input,
    dt,
    facing,
    colliders,
    velRef.current
  );
  velRef.current = step.vel;
  return { prev, next: step.pose };
}

function trackFootsteps(
  footstepRef: { current: number },
  prev: PredictedPawn | null,
  next: PredictedPawn | null
): void {
  if (prev === null || next === null) return;
  footstepRef.current += Math.hypot(next.x - prev.x, next.y - prev.y);
  if (footstepRef.current < FOOTSTEP_PX) return;
  footstepRef.current = 0;
  ShipAudioEngine.getInstance().playLocalFootstep();
}

function commitPrediction(
  predictedRef: { current: PredictedPawn | null },
  setPredicted: (next: PredictedPawn | null) => void,
  next: PredictedPawn | null
): void {
  predictedRef.current = next;
  setPredicted(next);
}

function pumpNetworkInput(
  net: FrameNetState,
  input: { x: number; y: number } | null,
  dt: number,
  now: number,
  facing: number,
  sealed: boolean,
  sendIntent: (intent: ClientIntent) => void
): void {
  net.pump += dt;
  const pressed = wantsImmediateSend(net.wasActive, input);
  net.wasActive = input !== null;
  if (net.pump < 0.05 && !pressed) return;
  net.pump = 0;
  const sample: InputSample = {
    x: input?.x ?? 0,
    y: input?.y ?? 0,
    facing,
    sprint: false,
    sealed,
  };
  if (!shouldSendInput(net.lastSent, sample, now - net.lastSentMs)) return;
  net.lastSent = sample;
  net.lastSentMs = now;
  sendIntent({
    type: 'INPUT',
    seq: 0,
    moveVec: { x: sample.x, y: sample.y },
    facing: sample.facing,
    sprint: sample.sprint,
    sealed: sample.sealed,
  });
}

function advancePose(
  base: PredictedPawn | null,
  input: { x: number; y: number } | null,
  dt: number,
  facing: number,
  colliders: readonly WallSegment[],
  vel: { x: number; y: number }
): { pose: PredictedPawn | null; vel: { x: number; y: number } } {
  const nextVel = predictVelocity(vel, input, dt);
  if (base === null) return { pose: null, vel: nextVel };
  if (input === null) {
    return { pose: base.facing === facing ? base : { ...base, facing }, vel: nextVel };
  }
  const target = { x: base.x + nextVel.x * dt, y: base.y + nextVel.y * dt };
  const stepped = predictStep(base, PREDICT_RADIUS, target, colliders);
  return { pose: { ...stepped, facing }, vel: nextVel };
}
