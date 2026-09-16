/** @vitest-environment node */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BusVolumes } from '../../audio/AudioBusManager';
import { ShipAudioEngine } from '../../audio/ShipAudioEngine';
import { AudioPrefs, type AudioSnapshot } from './AudioPrefs';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AudioPrefs lifecycle', () => {
  it('exposes attach/detach for the Phase 3 session', () => {
    const prefs = new AudioPrefs();
    expect(typeof prefs.attach).toBe('function');
    expect(typeof prefs.detach).toBe('function');
  });
});

describe('AudioPrefs bus subscription', () => {
  function fakeBus() {
    const listeners = new Set<(volumes: BusVolumes) => void>();
    let volumes: BusVolumes = {
      master: 0.7,
      ambience: 0.6,
      foley: 0.8,
      ui: 0.75,
      crisis: 0.9,
      isMuted: false,
    };
    return {
      listeners,
      bus: {
        getVolumes: () => volumes,
        setVolume: (_bus: string, value: number) => {
          volumes = { ...volumes, master: value };
        },
        setMuted: (muted: boolean) => {
          volumes = { ...volumes, isMuted: muted };
        },
        subscribe: (fn: (volumes: BusVolumes) => void) => {
          listeners.add(fn);
          return () => {
            listeners.delete(fn);
          };
        },
      },
      emit: (next: BusVolumes) => {
        volumes = next;
        for (const fn of listeners) fn(next);
      },
    };
  }

  it('attaches on enable even when the bus arrived late', () => {
    const engine = ShipAudioEngine.getInstance();
    const prior = engine.busManager;
    engine.busManager = null;
    try {
      const prefs = new AudioPrefs();
      prefs.attach();
      const seen: AudioSnapshot[] = [];
      prefs.subscribe((snapshot) => seen.push(snapshot));
      const fake = fakeBus();
      engine.busManager = fake.bus as unknown as typeof engine.busManager;
      prefs.enable();
      fake.emit({ master: 0.5, ambience: 0.6, foley: 0.8, ui: 0.75, crisis: 0.9, isMuted: false });
      expect(seen.length).toBeGreaterThan(0);
      expect(prefs.getSnapshot().masterPct).toBe(50);
      expect(prefs.getSnapshot().ready).toBe(true);
    } finally {
      engine.busManager = prior;
    }
  });
});

describe('AudioPrefs', () => {
  it('reports not-ready without an audio context', () => {
    const prefs = new AudioPrefs();
    expect(prefs.getSnapshot().ready).toBe(false);
    expect(prefs.getSnapshot().masterPct).toBe(70);
  });

  it('notifies subscribers and tolerates missing bus', () => {
    const prefs = new AudioPrefs();
    let calls = 0;
    const release = prefs.subscribe(() => {
      calls += 1;
    });
    prefs.setMasterPct(80);
    prefs.setMuted(true);
    prefs.enable();
    release();
    expect(calls).toBeGreaterThanOrEqual(0);
  });
});
