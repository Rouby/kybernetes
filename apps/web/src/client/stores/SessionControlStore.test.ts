/** @vitest-environment node */
import { describe, expect, it, vi } from 'vitest';
import { SessionControlStore } from './SessionControlStore';

function deps() {
  return { sendIntent: vi.fn(), clearDeath: vi.fn() };
}

describe('SessionControlStore', () => {
  it('toggles pause and notifies', () => {
    const store = new SessionControlStore(deps());
    const seen: boolean[] = [];
    store.subscribe((snapshot) => {
      seen.push(snapshot.paused);
    });
    expect(store.getSnapshot().paused).toBe(false);
    store.togglePause();
    expect(store.getSnapshot().paused).toBe(true);
    store.setPaused(false);
    expect(store.getSnapshot().paused).toBe(false);
    expect(seen.length).toBeGreaterThan(0);
  });

  it('gates play intents but always passes RESTART', () => {
    const active = deps();
    const store = new SessionControlStore(active);
    store.sendPlayIntent({
      type: 'INPUT',
      seq: 0,
      moveVec: { x: 1, y: 0 },
      facing: 0,
      sprint: false,
      sealed: false,
    });
    expect(active.sendIntent).toHaveBeenCalledTimes(1);
    store.setPaused(true);
    store.sendPlayIntent({
      type: 'INPUT',
      seq: 0,
      moveVec: { x: 1, y: 0 },
      facing: 0,
      sprint: false,
      sealed: false,
    });
    expect(active.sendIntent).toHaveBeenCalledTimes(1);
    store.sendPlayIntent({ type: 'RESTART', seq: 0 });
    expect(active.sendIntent).toHaveBeenCalledTimes(2);
  });

  it('marks dead on death broadcast and restarts', () => {
    const active = deps();
    const store = new SessionControlStore(active);
    expect(store.getSnapshot().dead).toBe(false);
    store.setDeath({ cause: 'combat' } as unknown as import('@kybernetes/protocol').DeathBroadcast);
    expect(store.getSnapshot().dead).toBe(true);
    store.restart();
    expect(store.getSnapshot().paused).toBe(false);
    expect(active.clearDeath).toHaveBeenCalledTimes(1);
  });

  it('marks dead on dead vitals', () => {
    const store = new SessionControlStore(deps());
    store.setVitals({
      vitals: { dead: true },
    } as unknown as import('@kybernetes/protocol').VitalsBroadcast);
    expect(store.getSnapshot().dead).toBe(true);
    store.setVitals(null);
    store.setDeath(null);
    expect(store.getSnapshot().dead).toBe(false);
  });
});
