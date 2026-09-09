/**
 * HarborApp: the v2 client slice. `?view=debug` mounts the pawn-less
 * observer root (OBSERVE, read-only) so the debug view never steals or
 * drives the player pawn; otherwise the game shell owns menu, character
 * customization, and the live session behind Embark.
 */

import { buildHarborWorld } from '@kybernetes/sim-core';
import { useMemo } from 'react';
import { DebugWorldView } from './DebugWorldView';
import { GameShell } from './GameShell';
import { useHarborObserver } from './useHarborObserver';

export function HarborApp() {
  const showDebugWorld = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('debug-world') === '1' || params.get('view') === 'debug';
  }, []);
  if (showDebugWorld) return <HarborObserverRoot />;
  return <GameShell />;
}

function HarborObserverRoot() {
  const staticWorld = useMemo(() => buildHarborWorld(), []);
  const beacon = useMemo(
    () => new URLSearchParams(window.location.search).get('beacon') ?? 'HESP01',
    []
  );
  const observer = useHarborObserver({ beacon });
  return (
    <div style={{ background: '#07090d', width: '100vw', height: '100vh', color: '#cfd8e3' }}>
      <DebugWorldView
        staticWorld={staticWorld}
        snapshot={observer.snapshot}
        telemetry={observer.telemetry}
        stats={observer.stats}
        dock={observer.dock}
      />
    </div>
  );
}
