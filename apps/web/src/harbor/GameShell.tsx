/**
 * GameShell: menu, customization, solo intro, live session, and ship-loss
 * phases. The menu owns identity; Embark mounts the session (and its
 * socket), Quit unmounts it so the connection closes and the world stops
 * for this client. State lives in useShellState, phase bodies in small
 * components, so every unit stays under the complexity gate.
 */

import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { ShipAudioEngine } from '../audio/ShipAudioEngine';
import { useMasterAudio } from './audioControls';
import { CustomizeScreen } from './CustomizeScreen';
import { GameOverShell } from './GameOverShell';
import { HarborSession } from './HarborSession';
import { type HarborIdentityState, loadIdentity, saveIdentity } from './identity';
import { SoloShipIntro } from './SoloShipIntro';
import { TerminalCanvas } from './TerminalCanvas';
import type { HarborIdentity } from './useHarborSocket';

type ShellPhase = 'menu' | 'customize' | 'intro' | 'game' | 'gameover';

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

interface ShellState {
  readonly phase: ShellPhase;
  readonly identity: HarborIdentityState;
  readonly sessionIdentity: HarborIdentity;
  readonly soloShipId: string;
  readonly lostShipId: string | null;
  readonly updateIdentity: (draft: HarborIdentityState) => void;
  readonly toPhase: (phase: ShellPhase) => void;
  readonly handleShipLost: (shipId: string) => void;
  readonly quitToMenu: () => void;
}

function useShellState(): ShellState {
  const [phase, setPhase] = useState<ShellPhase>('menu');
  const [identity, setIdentity] = useState<HarborIdentityState>(() =>
    loadIdentity(window.localStorage)
  );
  const [lostShipId, setLostShipId] = useState<string | null>(null);
  const beacon = useBeacon();
  const updateIdentity = useCallback((draft: HarborIdentityState): void => {
    saveIdentity(window.localStorage, draft);
    setIdentity(draft);
  }, []);
  const sessionIdentity = useSessionIdentity(identity, beacon);
  const toPhase = useCallback((next: ShellPhase): void => {
    setPhase(next);
  }, []);
  const handleShipLost = useCallback((shipId: string): void => {
    setLostShipId(shipId);
    setPhase('gameover');
  }, []);
  const quitToMenu = useCallback((): void => {
    setPhase('menu');
  }, []);
  // Owned solo ship id for the M1 loop (server persists the matching record).
  return {
    phase,
    identity,
    sessionIdentity,
    soloShipId: `ship:${identity.userId}`,
    lostShipId,
    updateIdentity,
    toPhase,
    handleShipLost,
    quitToMenu,
  };
}

function useBeacon(): string {
  return useMemo(() => new URLSearchParams(window.location.search).get('beacon') ?? 'HESP01', []);
}

function useSessionIdentity(identity: HarborIdentityState, beacon: string): HarborIdentity {
  return useMemo(
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
}

export function GameShell() {
  useAudioUnlock();
  const shell = useShellState();
  if (shell.phase === 'menu' || shell.phase === 'customize') {
    return <MenuCustomize shell={shell} />;
  }
  return <ActivePhase shell={shell} />;
}

function ActivePhase({ shell }: { readonly shell: ShellState }) {
  if (shell.phase === 'game') {
    return (
      <HarborSession
        identity={shell.sessionIdentity}
        onQuit={shell.quitToMenu}
        onShipLost={shell.handleShipLost}
      />
    );
  }
  if (shell.phase === 'intro') {
    return <SoloShipIntro shipId={shell.soloShipId} onEmbark={() => shell.toPhase('game')} />;
  }
  return (
    <GameOverShell
      shipId={shell.lostShipId ?? shell.soloShipId}
      onRestart={() => shell.toPhase('game')}
    />
  );
}

function MenuCustomize({ shell }: { readonly shell: ShellState }) {
  const audio = useMasterAudio();
  if (shell.phase === 'customize') {
    return (
      <MenuFrame>
        <CustomizeScreen
          draft={shell.identity}
          onChange={shell.updateIdentity}
          onBack={() => shell.toPhase('menu')}
          onEmbark={() => shell.toPhase('intro')}
        />
      </MenuFrame>
    );
  }
  return (
    <MenuFrame>
      <TerminalCanvas
        callsign={shell.identity.callsign}
        audio={audio}
        onEmbark={() => shell.toPhase('intro')}
        onCustomize={() => shell.toPhase('customize')}
      />
    </MenuFrame>
  );
}

function MenuFrame({ children }: { readonly children: ReactNode }) {
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
      {children}
    </div>
  );
}
