import { describe, expect, it } from 'vitest';
import { packCrateRect } from '../webgl/ui/UiToolkit';
import { PackStore, pointInRect } from './PackStore';

function opened(): PackStore {
  const store = new PackStore();
  store.open({ mode: 'buy', hubId: 'hub_a' });
  store.setViewport(480, 360);
  return store;
}

function step(store: PackStore, frames: number): void {
  let now = 1000;
  for (let i = 0; i < frames; i += 1) {
    now += 1000 / 60;
    store.update(now);
  }
}

describe('packCrateRect', () => {
  it('sats a 120x128 crate box on the canvas bottom', () => {
    expect(packCrateRect(480, 360)).toEqual({ x: 180, y: 198, w: 120, h: 128 });
    expect(pointInRect(1, 1, { x: 0, y: 0, w: 10, h: 10 })).toBe(true);
    expect(pointInRect(11, 5, { x: 0, y: 0, w: 10, h: 10 })).toBe(false);
  });
});

describe('PackStore staging', () => {
  it('stays shut until opened and caps bodies', () => {
    const store = new PackStore();
    expect(store.isOpen()).toBe(false);
    expect(store.stageUnit('scrap', 50, 40)).toBe(false);
    expect(store.pressAt(10, 10)).toBe(false);
    expect(store.rotateHeld()).toBe(false);
    expect(store.takeSealed('buy')).toBeNull();
    store.open({ mode: 'buy', hubId: 'hub_a' });
    store.setViewport(480, 360);
    expect(store.isOpen()).toBe(true);
    expect(store.bodyCount()).toBe(1);
    expect(store.stageUnit('scrap', 0, 40)).toBe(false);
    expect(store.stageUnit('scrap', 50, 40)).toBe(true);
    expect(store.bodyCount()).toBe(2);
    store.close();
    expect(store.isOpen()).toBe(false);
    expect(store.bodyCount()).toBe(0);
  });

  it('drops staged units under gravity', () => {
    const store = opened();
    store.stageUnit('rations', 30, 20);
    const bodies = () => store.getSnapshot().bodies.filter((view) => view.goodId === 'rations');
    const before = bodies()[0];
    step(store, 30);
    const after = bodies()[0];
    expect(after?.y ?? 0).toBeGreaterThan(before?.y ?? 0);
  });

  it('stages left of the crate and tidies into a sealable load', () => {
    const store = opened();
    store.stageUnit('rations', 30, 20);
    step(store, 120);
    const staged = store.getSnapshot().bodies.find((view) => view.goodId === 'rations');
    expect((staged?.x ?? 200) + (staged?.w ?? 0) / 2).toBeLessThan(180);
    expect(staged?.inside).toBe(false);
    store.tidyUp();
    step(store, 600);
    const snap = store.getSnapshot();
    expect(snap.insideTotal).toBe(1);
    expect(snap.bodies.find((view) => view.goodId === 'rations')?.settled).toBe(true);
    expect(snap.sealReady).toBe(true);
  });

  it('drags the lid by hand then seals and ships a fresh one', () => {
    const store = opened();
    store.stageUnit('rations', 30, 20);
    step(store, 60);
    const lid = () => store.getSnapshot().bodies.find((view) => view.goodId === 'lid');
    const at = lid();
    if (at === undefined) throw new Error('missing lid');
    expect(store.pressAt(at.x, at.y)).toBe(true);
    store.moveTo(360, 150);
    step(store, 20);
    store.moveTo(240, 150);
    step(store, 20);
    store.moveTo(240, 191);
    step(store, 20);
    store.release();
    step(store, 60);
    const placed = lid();
    expect(Math.abs((placed?.x ?? 0) - 240)).toBeLessThan(40);
    expect(Math.abs((placed?.y ?? 0) - 191)).toBeLessThan(40);
    store.tidyUp();
    step(store, 600);
    expect(store.sealReady()).toBe(true);
    expect(store.takeSealed('buy')).toEqual([{ goodId: 'rations', qty: 1 }]);
    expect(store.bodyCount()).toBe(1);
    expect(lid()?.goodId).toBe('lid');
  });
});

describe('PackStore dragging', () => {
  it('grabs, follows, rotates, and releases the top body', () => {
    const store = opened();
    store.stageUnit('scrap', 50, 40);
    step(store, 120);
    const goods = () => store.getSnapshot().bodies.filter((view) => view.goodId === 'scrap');
    const at = goods()[0];
    if (at === undefined) throw new Error('missing body');
    expect(store.pressAt(at.x, at.y)).toBe(true);
    expect(store.isDragging()).toBe(true);
    store.moveTo(at.x + 40, at.y);
    step(store, 10);
    const dragged = goods()[0];
    expect(dragged?.x ?? 0).toBeGreaterThan(at.x);
    const angle = dragged?.angle ?? 0;
    expect(store.rotateHeld()).toBe(true);
    expect(goods()[0]?.angle ?? 0).toBeGreaterThan(angle);
    store.release();
    expect(store.isDragging()).toBe(false);
  });

  it('ignores empty grabs and second presses', () => {
    const store = opened();
    expect(store.pressAt(-500, -500)).toBe(false);
    store.stageUnit('scrap', 50, 40);
    step(store, 120);
    const at = store.getSnapshot().bodies.find((view) => view.goodId === 'scrap');
    if (at === undefined) throw new Error('missing body');
    expect(store.pressAt(at.x, at.y)).toBe(true);
    expect(store.pressAt(at.x, at.y)).toBe(false);
    store.release();
  });
});

describe('PackStore sealing', () => {
  it('refuses empty and wandering loads with hints', () => {
    const store = opened();
    expect(store.sealReady()).toBe(false);
    expect(store.takeSealed('buy')).toBeNull();
    expect(store.getSnapshot().hint).toContain('Add goods');
    store.stageUnit('scrap', 50, 40);
    expect(store.getSnapshot().hint).toContain('lid');
  });

  it('flags settled bodies outside the crate for re-ordering', () => {
    const store = opened();
    store.stageUnit('scrap', 50, 40);
    step(store, 60);
    const at = store.getSnapshot().bodies[0];
    if (at === undefined) throw new Error('missing body');
    expect(store.pressAt(at.x, at.y)).toBe(true);
    store.moveTo(400, 200);
    step(store, 120);
    store.release();
    step(store, 600);
    const view = store.getSnapshot().bodies[0];
    expect(view?.inside).toBe(false);
    expect(view?.settled).toBe(true);
    expect(store.sealReady()).toBe(false);
  });

  it('tidies scattered bodies back toward the crate', () => {
    const store = opened();
    store.stageUnit('scrap', 50, 40);
    store.stageUnit('rations', 30, 20);
    step(store, 30);
    store.tidyUp();
    step(store, 240);
    expect(store.getSnapshot().insideTotal).toBe(2);
    const lid = store.getSnapshot().bodies.find((view) => view.goodId === 'lid');
    expect(Math.abs((lid?.x ?? 0) - 240)).toBeLessThan(10);
    expect(Math.abs((lid?.y ?? 0) - 191)).toBeLessThan(10);
  });

  it('clears staged goods but keeps the lid', () => {
    const store = opened();
    store.stageUnit('scrap', 50, 40);
    store.clearStaged();
    expect(store.bodyCount()).toBe(1);
    expect(store.getSnapshot().stagedTotal).toBe(0);
  });

  it('respawns rejected seals and clears confirmed ones', () => {
    const store = opened();
    store.stageUnit('rations', 30, 20);
    step(store, 60);
    store.tidyUp();
    step(store, 600);
    expect(store.takeSealed('buy')).toEqual([{ goodId: 'rations', qty: 1 }]);
    expect(store.bodyCount()).toBe(1);
    store.reconcileNotices([{ id: 1, message: 'MARKET_insufficient-funds' }]);
    expect(store.bodyCount()).toBe(2);
    store.reconcileNotices([{ id: 1, message: 'MARKET_insufficient-funds' }]);
    expect(store.bodyCount()).toBe(2);
    step(store, 600);
    store.tidyUp();
    step(store, 600);
    expect(store.takeSealed('buy')).toEqual([{ goodId: 'rations', qty: 1 }]);
    store.reconcileNotices([{ id: 2, message: 'MARKET_ok' }]);
    store.reconcileNotices([{ id: 3, message: 'MARKET_insufficient-funds' }]);
    expect(store.bodyCount()).toBe(1);
  });
});
