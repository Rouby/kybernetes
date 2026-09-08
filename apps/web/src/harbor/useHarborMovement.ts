/**
 * Harbor movement: WASD sampled into INPUT intents at 20Hz with local
 * prediction and authoritative reconcile. Prediction collides against the
 * same frame colliders as the server (via predictStep), so reconciles are
 * small corrections rather than teleports.
 */

import type { ClientIntent, SnapshotPawn, WallSegment } from '@kybernetes/protocol';
import { predictStep } from '@kybernetes/sim-core';
import { useCallback, useEffect, useRef, useState } from 'react';

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

const PREDICT_SPEED = 200;
const SNAP_DIST = 80;

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
  colliders: readonly WallSegment[] = []
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
    let last = performance.now();
    let pump = 0;
    const frame = (now: number): void => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const input = readMoveInput(keysRef.current);
      if (input !== null) facingRef.current = Math.atan2(input.y, input.x);
      const prev = predictedRef.current;
      const base = prev ?? snapshotPose(authRef.current);
      const next = advancePose(base, input, dt, facingRef.current, collidersRef.current);
      if (next !== prev) {
        predictedRef.current = next;
        setPredicted(next);
      }
      pump += dt;
      if (pump >= 0.05) {
        pump = 0;
        sendIntent({
          type: 'INPUT',
          seq: 0,
          moveVec: input ?? { x: 0, y: 0 },
          facing: facingRef.current,
          sprint: false,
          sealed: sealedRef.current,
        });
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [sendIntent]);

  useEffect(() => {
    if (authoritative === undefined) return;
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
    const next: PredictedPawn =
      error > SNAP_DIST
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
  }, [sendIntent]);

  return { predicted, sealed, facingRef, toggleSeal };
}

function snapshotPose(auth: SnapshotPawn | undefined): PredictedPawn | null {
  if (auth === undefined) return null;
  return { x: auth.x, y: auth.y, facing: auth.facing };
}

function advancePose(
  base: PredictedPawn | null,
  input: { x: number; y: number } | null,
  dt: number,
  facing: number,
  colliders: readonly WallSegment[]
): PredictedPawn | null {
  if (base === null) return null;
  if (input === null) return base.facing === facing ? base : { ...base, facing };
  const target = {
    x: base.x + input.x * PREDICT_SPEED * dt,
    y: base.y + input.y * PREDICT_SPEED * dt,
  };
  const stepped = predictStep(base, PREDICT_RADIUS, target, colliders);
  return { ...stepped, facing };
}
