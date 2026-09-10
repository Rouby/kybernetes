/** @vitest-environment node */
import type { SnapshotPawn } from '@kybernetes/protocol';
import { describe, expect, it, vi } from 'vitest';
import { MovementController, readMoveInput, reconcilePrediction } from './MovementController';

function pawn(x: number, y: number, facing = 0): SnapshotPawn {
  return {
    id: 'p1',
    x,
    y,
    vx: 0,
    vy: 0,
    facing,
    frameId: 'deck',
    roomHint: 'bridge',
    color: '#fff',
  };
}

describe('readMoveInput', () => {
  it('returns null for empty or unknown keys', () => {
    expect(readMoveInput(new Set())).toBeNull();
    expect(readMoveInput(new Set(['KeyQ', 'Space']))).toBeNull();
  });

  it('normalizes diagonal input', () => {
    const v = readMoveInput(new Set(['KeyW', 'KeyD']));
    expect(v?.x).toBeCloseTo(Math.SQRT1_2);
    expect(v?.y).toBeCloseTo(-Math.SQRT1_2);
  });

  it('ignores unknown codes alongside real keys', () => {
    expect(readMoveInput(new Set(['KeyW', 'KeyQ']))).toEqual({ x: 0, y: -1 });
  });
});

describe('reconcilePrediction', () => {
  it('snaps when there is no previous pose', () => {
    expect(reconcilePrediction(null, pawn(5, 6, 1))).toEqual({ x: 5, y: 6, facing: 1 });
  });

  it('snaps on teleport distance and sub-pixel drift', () => {
    expect(reconcilePrediction({ x: 0, y: 0, facing: 0 }, pawn(200, 0, 2))).toEqual({
      x: 200,
      y: 0,
      facing: 2,
    });
    expect(reconcilePrediction({ x: 0, y: 0, facing: 0 }, pawn(3, 4, 2))).toEqual({
      x: 3,
      y: 4,
      facing: 2,
    });
  });

  it('lerps toward mid-range corrections', () => {
    expect(reconcilePrediction({ x: 0, y: 0, facing: 0 }, pawn(40, 0, 1))).toEqual({
      x: 10,
      y: 0,
      facing: 1,
    });
  });
});

describe('MovementController lifecycle', () => {
  it('exposes attach/detach for the Phase 3 session', () => {
    const controller = new MovementController({ sendIntent: vi.fn() });
    expect(typeof controller.attach).toBe('function');
    expect(typeof controller.detach).toBe('function');
  });
});

describe('MovementController.toggleSeal', () => {
  it('flips seal state and emits a SUIT intent', () => {
    const sendIntent = vi.fn();
    const controller = new MovementController({ sendIntent });
    expect(controller.getSnapshot().sealed).toBe(false);
    controller.toggleSeal();
    expect(controller.getSnapshot().sealed).toBe(true);
    expect(sendIntent).toHaveBeenLastCalledWith({ type: 'SUIT', seq: 0, sealed: true });
    controller.toggleSeal();
    expect(controller.getSnapshot().sealed).toBe(false);
  });
});
describe('MovementController wiring', () => {
  it('subscribes, tracks colliders, reconciles and reports facing', () => {
    const sendIntent = vi.fn();
    const controller = new MovementController({ sendIntent });
    const seen: number[] = [];
    const release = controller.subscribe((snapshot) => {
      seen.push(snapshot.facing);
    });
    controller.setColliders([]);
    controller.setAuthoritative(pawn(12, 34, 0.5));
    expect(controller.getSnapshot().predicted).toEqual({ x: 12, y: 34, facing: 0.5 });
    expect(controller.getFacing()).toBe(0);
    expect(seen.length).toBeGreaterThan(0);
    release();
  });
});
