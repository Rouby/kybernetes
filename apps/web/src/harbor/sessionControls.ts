/**
 * Session controls: pause state, death derivation, and the gameplay
 * intent gate. Small hook so the session component stays under the
 * complexity gate; RESTART always passes so menus can open fresh runs.
 */

import type { ClientIntent } from '@kybernetes/protocol';
import type { RefObject } from 'react';
import { useCallback, useRef, useState } from 'react';
import { ShipAudioEngine } from '../audio/ShipAudioEngine';
import { isDeathVitals } from './deathNotice';
import type { useHarborSocket } from './useHarborSocket';

type HarborSocket = ReturnType<typeof useHarborSocket>;

export interface SessionControls {
  readonly paused: boolean;
  readonly pausedRef: RefObject<boolean>;
  readonly dead: boolean;
  readonly togglePause: () => void;
  readonly restart: () => void;
  readonly sendPlayIntent: (intent: ClientIntent) => void;
}

export function useSessionControls(socket: HarborSocket): SessionControls {
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const dead = socket.death !== null || isDeathVitals(socket.vitals);
  const deadRef = useRef(dead);
  deadRef.current = dead;
  const setPausedBoth = useCallback((value: boolean): void => {
    pausedRef.current = value;
    setPaused(value);
  }, []);
  const togglePause = useCallback((): void => {
    setPausedBoth(!pausedRef.current);
  }, [setPausedBoth]);
  const sendPlayIntent = useCallback(
    (intent: ClientIntent): void => {
      if (intent.type === 'RESTART') {
        socket.sendIntent(intent);
        return;
      }
      if (pausedRef.current || deadRef.current) return;
      socket.sendIntent(intent);
    },
    [socket.sendIntent]
  );
  const restart = useCallback((): void => {
    setPausedBoth(false);
    socket.clearDeath();
    socket.sendIntent({ type: 'RESTART', seq: 0 });
    ShipAudioEngine.getInstance().playUiClick();
  }, [setPausedBoth, socket.clearDeath, socket.sendIntent]);
  return { paused, pausedRef, dead, togglePause, restart, sendPlayIntent };
}
