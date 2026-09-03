import { useCallback, useEffect, useState } from 'react';
import type { BusVolumes } from './AudioBusManager';
import { ShipAudioEngine } from './ShipAudioEngine';

export function useAudio() {
  const engine = ShipAudioEngine.getInstance();
  const [volumes, setVolumes] = useState<BusVolumes>(() => {
    return (
      engine.busManager?.getVolumes() ?? {
        master: 0.7,
        ambience: 0.6,
        foley: 0.8,
        ui: 0.75,
        crisis: 0.9,
        isMuted: false,
      }
    );
  });

  useEffect(() => {
    engine.init();
    if (engine.busManager) {
      setVolumes(engine.busManager.getVolumes());
      return engine.busManager.subscribe((v) => setVolumes(v));
    }
  }, [engine]);

  const setVolume = useCallback(
    (bus: keyof Omit<BusVolumes, 'isMuted'>, value: number) => {
      engine.busManager?.setVolume(bus, value);
      if (engine.busManager) {
        setVolumes(engine.busManager.getVolumes());
      }
    },
    [engine]
  );

  const toggleMute = useCallback(() => {
    const muted = engine.busManager?.toggleMute() ?? false;
    if (engine.busManager) {
      setVolumes(engine.busManager.getVolumes());
    }
    return muted;
  }, [engine]);

  const setMuted = useCallback(
    (muted: boolean) => {
      engine.busManager?.setMuted(muted);
      if (engine.busManager) {
        setVolumes(engine.busManager.getVolumes());
      }
    },
    [engine]
  );

  const playUiClick = useCallback(() => {
    engine.playUiClick();
  }, [engine]);

  const playDebriefStamp = useCallback(() => {
    engine.playDebriefStamp();
  }, [engine]);

  return {
    volumes,
    setVolume,
    toggleMute,
    setMuted,
    playUiClick,
    playDebriefStamp,
    engine,
  };
}
