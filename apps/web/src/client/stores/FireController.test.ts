/** @vitest-environment node */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FireController } from './FireController';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('FireController lifecycle', () => {
  it('exposes attach/detach for the Phase 3 session', () => {
    const controller = new FireController(liveDeps());
    expect(typeof controller.attach).toBe('function');
    expect(typeof controller.detach).toBe('function');
  });
});

function liveDeps() {
  return {
    sendPlayIntent: vi.fn(),
    getSnapshot: () =>
      ({
        pawns: [{ id: 'p1', x: 10, y: 20, frameId: 'deck' }],
      }) as unknown as import('@kybernetes/protocol').SnapshotBroadcast,
    getPawnId: () => 'p1',
    getVitals: () =>
      ({
        vitals: { ammo: 6, mags: [6], reloading: false, health: 100 },
      }) as unknown as import('@kybernetes/protocol').VitalsBroadcast,
    getPredicted: () => ({ x: 11, y: 21, facing: 0 }),
    getFacing: () => 0,
  };
}

describe('FireController', () => {
  it('fires once on press and tracks signal', () => {
    const controller = new FireController(liveDeps());
    expect(controller.getFireSignal()).toBe(0);
    controller.pressFireStart();
    expect(controller.getFireSignal()).toBe(1);
    expect(controller.getShots()).toHaveLength(1);
    controller.pressFireEnd();
  });

  it('refuses to fire without a pawn', () => {
    const controller = new FireController({ ...liveDeps(), getPawnId: () => null });
    controller.pressFireStart();
    expect(controller.getFireSignal()).toBe(0);
    expect(controller.getShots()).toHaveLength(0);
  });

  it('holds exact 6.25Hz cadence across uneven frames', () => {
    let now = 1000;
    const queued: FrameRequestCallback[] = [];
    vi.stubGlobal('performance', { now: () => now });
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      queued.push(cb);
      return queued.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    const sendPlayIntent = vi.fn();
    const controller = new FireController({ ...liveDeps(), sendPlayIntent });
    controller.pressFireStart();
    controller.attach();
    for (const step of [100, 100, 100, 100, 100, 100, 100, 100, 100, 100]) {
      now += step;
      queued.shift()?.(now);
    }
    controller.pressFireEnd();
    controller.detach();
    expect(controller.getFireSignal()).toBe(7);
    expect(sendPlayIntent).toHaveBeenCalledTimes(7);
  });

  it('reconciles server refusal notices', () => {
    const controller = new FireController(liveDeps());
    controller.pressFireStart();
    expect(controller.getShots()).toHaveLength(1);
    controller.reconcileNotices([{ id: 7, message: 'FIRE_empty' }]);
    controller.reconcileNotices([{ id: 7, message: 'FIRE_empty' }]);
    expect(controller.getFireSignal()).toBe(1);
  });
});
