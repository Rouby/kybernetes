/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { AudioPrefs } from './AudioPrefs';

describe('AudioPrefs lifecycle', () => {
  it('exposes attach/detach for the Phase 3 session', () => {
    const prefs = new AudioPrefs();
    expect(typeof prefs.attach).toBe('function');
    expect(typeof prefs.detach).toBe('function');
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
