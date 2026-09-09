/**
 * Master audio controls: shared by the canvas terminal buttons and the
 * DOM settings panel. Volumes persist through the AudioBusManager; before
 * the first gesture there is no bus, so controls report not-ready and an
 * enable action arms the context from the click gesture.
 */

import { useCallback, useEffect, useState } from 'react';
import type { BusVolumes } from '../audio/AudioBusManager';
import { ShipAudioEngine } from '../audio/ShipAudioEngine';

function readVolumes(): BusVolumes | null {
  return ShipAudioEngine.getInstance().busManager?.getVolumes() ?? null;
}

export interface MasterAudio {
  readonly ready: boolean;
  readonly muted: boolean;
  readonly masterPct: number;
  readonly enable: () => void;
  readonly setMasterPct: (pct: number) => void;
  readonly setMuted: (muted: boolean) => void;
}

export function useMasterAudio(): MasterAudio {
  const [volumes, setVolumes] = useState<BusVolumes | null>(() => readVolumes());
  const bus = ShipAudioEngine.getInstance().busManager;
  useEffect(() => {
    if (bus === null) return;
    setVolumes(bus.getVolumes());
    return bus.subscribe(setVolumes);
  }, [bus]);
  const enable = useCallback((): void => {
    const engine = ShipAudioEngine.getInstance();
    engine.init();
    engine.resume();
    setVolumes(readVolumes());
  }, []);
  const setMasterPct = useCallback((pct: number): void => {
    const bus = ShipAudioEngine.getInstance().busManager;
    if (bus === null) return;
    bus.setVolume('master', pct / 100);
    setVolumes(bus.getVolumes());
  }, []);
  const setMuted = useCallback((muted: boolean): void => {
    const bus = ShipAudioEngine.getInstance().busManager;
    if (bus === null) return;
    bus.setMuted(muted);
    setVolumes(bus.getVolumes());
  }, []);
  if (volumes === null) {
    return { ready: false, muted: false, masterPct: 70, enable, setMasterPct, setMuted };
  }
  return {
    ready: true,
    muted: volumes.isMuted,
    masterPct: Math.round(volumes.master * 100),
    enable,
    setMasterPct,
    setMuted,
  };
}
