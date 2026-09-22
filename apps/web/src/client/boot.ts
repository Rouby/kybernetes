/**
 * boot: framework-free application entry (Phase 3 Round 13).
 * Debug flag mounts the observer view; otherwise the ScreenManager owns
 * menu through game-over. main.tsx flips to this once proven.
 */

import { buildSoloShipWorld } from '@kybernetes/sim-core';
import { DebugView } from '../harbor/DebugView';
import { ScreenManager } from './ScreenManager';
import { mountSoundboard } from './Soundboard';
import { createObserverStore } from './stores/ObserverStore';

export function startBoot(): () => void {
  const params = new URLSearchParams(window.location.search);
  const root = document.getElementById('root');
  if (root === null) throw new Error('boot: #root mount point is missing');
  if (params.get('debug-world') === '1' || params.get('view') === 'debug') {
    return startDebugView(root, params.get('beacon') ?? 'HESP01');
  }
  if (params.get('soundboard') === '1') return mountSoundboard(root);
  const manager = new ScreenManager({
    root,
    storage: window.localStorage,
    beacon: params.get('beacon') ?? 'HESP01',
    callsign: params.get('callsign'),
    debug: params.get('debug') === '1',
  });
  manager.start();
  return () => manager.dispose();
}

function startDebugView(root: HTMLElement, beacon: string): () => void {
  const store = createObserverStore(beacon);
  // Solo world: the debug canvas needs every hub's geometry. The daemon serves
  // buildSoloShipWorld by default and the game renders all four hubs; a harbor
  // static world would leave hub_b/c/d (and their docks) invisible here.
  const view = new DebugView(root, { staticWorld: buildSoloShipWorld(), store });
  store.connect();
  view.attach();
  return () => {
    view.dispose();
    store.dispose();
  };
}
