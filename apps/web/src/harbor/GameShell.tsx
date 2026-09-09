/**
 * GameShell: menu, customization, and live session phases. The menu owns
 * identity; Embark mounts the session (and its socket), Quit unmounts it
 * so the connection closes and the world stops for this client.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ShipAudioEngine } from '../audio/ShipAudioEngine';
import { useMasterAudio } from './audioControls';
import { CustomizeScreen } from './CustomizeScreen';
import { HarborSession } from './HarborSession';
import { type HarborIdentityState, loadIdentity, saveIdentity } from './identity';
import { TerminalCanvas } from './TerminalCanvas';
import type { HarborIdentity } from './useHarborSocket';

type ShellPhase = 'menu' | 'customize' | 'game';

function useAudioUnlock(): void {
  useEffect(() => {
    const initAudio = (): void => {
      ShipAudioEngine.getInstance().init();
      ShipAudioEngine.getInstance().resume();
    };
    window.addEventListener('keydown', initAudio, { once: true });
    window.addEventListener('pointerdown', initAudio, { once: true });
    return () => {
      window.removeEventListener('keydown', initAudio);
      window.removeEventListener('pointerdown', initAudio);
    };
  }, []);
}

export function GameShell() {
  useAudioUnlock();
  const [phase, setPhase] = useState<ShellPhase>('menu');
  const [identity, setIdentity] = useState<HarborIdentityState>(() =>
    loadIdentity(window.localStorage)
  );
  const beacon = useMemo(
    () => new URLSearchParams(window.location.search).get('beacon') ?? 'HESP01',
    []
  );
  const updateIdentity = useCallback((draft: HarborIdentityState): void => {
    saveIdentity(window.localStorage, draft);
    setIdentity(draft);
  }, []);
  const sessionIdentity: HarborIdentity = useMemo(
    () => ({
      callsign: identity.callsign,
      color: identity.color,
      trim: identity.trim,
      thruster: identity.thruster,
      userId: identity.userId,
      beacon,
    }),
    [identity, beacon]
  );
  const quitToMenu = useCallback((): void => {
    setPhase('menu');
  }, []);
  const audio = useMasterAudio();
  const embark = useCallback((): void => {
    setPhase('game');
  }, []);
  const customize = useCallback((): void => {
    setPhase('customize');
  }, []);
  if (phase === 'game') {
    return <HarborSession identity={sessionIdentity} onQuit={quitToMenu} />;
  }
  return (
    <div
      style={{
        position: 'relative',
        background: '#07090d',
        width: '100vw',
        height: '100vh',
        color: '#cfd8e3',
        overflow: 'hidden',
      }}
    >
      {phase === 'customize' ? (
        <CustomizeScreen
          draft={identity}
          onChange={updateIdentity}
          onBack={() => setPhase('menu')}
          onEmbark={() => setPhase('game')}
        />
      ) : (
        <TerminalCanvas
          callsign={identity.callsign}
          audio={audio}
          onEmbark={embark}
          onCustomize={customize}
        />
      )}
    </div>
  );
}
