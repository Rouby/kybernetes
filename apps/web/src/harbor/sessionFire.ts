/**
 * Session fire control: predicted shots, the hold-to-fire loop, and
 * server refusal reconciles. Isolated so the session component stays lean.
 */

import type { ClientIntent } from '@kybernetes/protocol';
import type { RefObject } from 'react';
import { useCallback, useEffect, useRef } from 'react';
import { ShipAudioEngine } from '../audio/ShipAudioEngine';
import { shouldFireShot } from './fireGate';
import { dropYoungShots, type PredictedShot, spawnPredictedShot } from './predictedShots';
import type { PredictedPawn } from './useHarborMovement';
import type { useHarborSocket } from './useHarborSocket';

type HarborSocket = ReturnType<typeof useHarborSocket>;

export interface SessionFire {
  readonly shotsRef: RefObject<PredictedShot[]>;
  readonly fireSignalRef: RefObject<number>;
  readonly pressFireStart: () => void;
  readonly pressFireEnd: () => void;
}

export function useSessionFire(
  socket: HarborSocket,
  predicted: PredictedPawn | null,
  facingRef: RefObject<number>,
  sendPlayIntent: (intent: ClientIntent) => void
): SessionFire {
  const predictedRef = useRef(predicted);
  predictedRef.current = predicted;
  const shotsRef = useRef<PredictedShot[]>([]);
  const shotIdRef = useRef(0);
  const fireSignalRef = useRef(0);
  const fireHeldRef = useRef(false);
  const fire = useCallback((): void => {
    fireOnce(
      socket,
      predictedRef.current,
      facingRef.current,
      sendPlayIntent,
      shotsRef,
      shotIdRef,
      fireSignalRef
    );
  }, [socket, sendPlayIntent, facingRef]);
  const fireRef = useRef(fire);
  fireRef.current = fire;
  const pressFireStart = useCallback((): void => {
    fireHeldRef.current = true;
    fireRef.current();
  }, []);
  const pressFireEnd = useCallback((): void => {
    fireHeldRef.current = false;
  }, []);
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const frame = (now: number): void => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      acc += dt;
      if (acc >= 0.16) {
        acc = 0;
        if (fireHeldRef.current) fireRef.current();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
  const refusedRef = useRef(0);
  useEffect(() => {
    const latest = socket.notices[socket.notices.length - 1];
    if (latest === undefined || latest.id === refusedRef.current) return;
    refusedRef.current = latest.id;
    if (/^FIRE_(empty|down|miss)/.test(latest.message)) {
      shotsRef.current = dropYoungShots(shotsRef.current, performance.now(), 600);
    }
  }, [socket.notices]);
  return { shotsRef, fireSignalRef, pressFireStart, pressFireEnd };
}

function fireOnce(
  socket: HarborSocket,
  predicted: PredictedPawn | null,
  facing: number,
  sendPlayIntent: (intent: ClientIntent) => void,
  shotsRef: RefObject<PredictedShot[]>,
  shotIdRef: RefObject<number>,
  fireSignalRef: RefObject<number>
): void {
  const self = socket.snapshot?.pawns.find((pawn) => pawn.id === socket.pawnId);
  if (self === undefined || !shouldFireShot(socket.vitals, true)) return;
  sendPlayIntent({ type: 'FIRE', seq: 0, originAngle: facing, weapon: 'kinetic_carbine' });
  fireSignalRef.current += 1;
  shotIdRef.current += 1;
  const at = predicted;
  shotsRef.current = [
    ...shotsRef.current.slice(-7),
    spawnPredictedShot(
      shotIdRef.current,
      self.frameId,
      at?.x ?? self.x,
      at?.y ?? self.y,
      facing,
      'kinetic_carbine',
      performance.now()
    ),
  ];
  ShipAudioEngine.getInstance().playWeaponFire(self.x, self.y, 'kinetic_carbine');
}
