import type { SnapshotBroadcast } from '@kybernetes/protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShipAudioEngine } from '../audio/ShipAudioEngine';
import {
  type HarborViewportProps,
  impactFoleyKind,
  mouseScreenOf,
  playImpactFoley,
  REMOTE_SHOT_PX,
  REMOTE_STEP_PX,
  telemetryKey,
  trackRemoteFootsteps,
  trackRemoteShots,
} from './viewportFrame';

afterEach(() => {
  vi.restoreAllMocks();
});

function view(over: Record<string, unknown> = {}): HarborViewportProps {
  return over as unknown as HarborViewportProps;
}

function snapshot(over: Record<string, unknown> = {}): SnapshotBroadcast {
  return { tick: 100, ...over } as unknown as SnapshotBroadcast;
}

describe('mouseScreenOf', () => {
  it('feeds hover only after the first mousemove', () => {
    expect(mouseScreenOf({ mouse: { x: 0, y: 0, moved: false } })).toBeUndefined();
    expect(mouseScreenOf({ mouse: { x: 12, y: 34, moved: true } })).toEqual({ x: 12, y: 34 });
  });
});

describe('combat foley hooks', () => {
  it('maps weapon ids to impact voices with a kinetic fallback', () => {
    expect(impactFoleyKind('kinetic_carbine')).toBe('kinetic');
    expect(impactFoleyKind('pulse_laser')).toBe('laser');
    expect(impactFoleyKind('arc_welder')).toBe('welder');
    expect(impactFoleyKind('mystery_gun')).toBe('kinetic');
  });

  it('thunks once per fresh impact', () => {
    const playImpact = vi
      .spyOn(ShipAudioEngine.getInstance(), 'playImpact')
      .mockImplementation(() => undefined);
    playImpactFoley([]);
    expect(playImpact).not.toHaveBeenCalled();
    playImpactFoley([
      { x: 1, y: 2, weapon: 'kinetic_carbine' },
      { x: 3, y: 4, weapon: 'pulse_laser' },
    ]);
    expect(playImpact).toHaveBeenCalledTimes(2);
    expect(playImpact).toHaveBeenCalledWith(1, 2, 'kinetic');
    expect(playImpact).toHaveBeenCalledWith(3, 4, 'laser');
  });

  it('walks remote pawns into audible footsteps', () => {
    const playRemoteFootstep = vi
      .spyOn(ShipAudioEngine.getInstance(), 'playRemoteFootstep')
      .mockImplementation(() => undefined);
    const steps = new Map();
    trackRemoteFootsteps(steps, [{ id: 'r1', x: 0, y: 0 }]);
    expect(playRemoteFootstep).not.toHaveBeenCalled();
    trackRemoteFootsteps(steps, [{ id: 'r1', x: REMOTE_STEP_PX - 1, y: 0 }]);
    expect(playRemoteFootstep).not.toHaveBeenCalled();
    trackRemoteFootsteps(steps, [{ id: 'r1', x: REMOTE_STEP_PX + 10, y: 0 }]);
    expect(playRemoteFootstep).toHaveBeenCalledTimes(1);
    expect(playRemoteFootstep).toHaveBeenCalledWith(REMOTE_STEP_PX + 10, 0);
    trackRemoteFootsteps(steps, []);
    expect(steps.has('r1')).toBe(false);
  });

  it('spatializes remote gunshots once while sparing local echoes', () => {
    const playWeaponFire = vi
      .spyOn(ShipAudioEngine.getInstance(), 'playWeaponFire')
      .mockImplementation(() => undefined);
    const seen = new Set<string>();
    const origins = new Map([['deck', { x: 100, y: 0 }]]);
    const server = [{ id: 's1', frameId: 'deck', x: 10, y: 20, weapon: 'kinetic_carbine' }];
    trackRemoteShots(seen, server, [], origins);
    expect(playWeaponFire).toHaveBeenCalledTimes(1);
    expect(playWeaponFire).toHaveBeenCalledWith(110, 20, 'kinetic_carbine', 1.0, false);
    trackRemoteShots(seen, server, [], origins);
    expect(playWeaponFire).toHaveBeenCalledTimes(1);
    const local = [{ frameId: 'deck', x: 10 + REMOTE_SHOT_PX - 1, y: 20 }];
    trackRemoteShots(new Set<string>(), server, local, origins);
    expect(playWeaponFire).toHaveBeenCalledTimes(1);
  });
});

describe('telemetryKey', () => {
  it('keys channel ticks and revisions', () => {
    const key = telemetryKey(
      view({ telemetry: { tick: 3 }, manifest: { rev: 7, shipName: 'Kestrel' } }),
      snapshot({ portalRev: 9 })
    );
    expect(key).toBe('100:3:7:9');
  });

  it('falls back across missing channels', () => {
    expect(telemetryKey(view(), snapshot())).toBe('100:-1:?:100');
    expect(telemetryKey(view({ manifest: { shipName: 'Kestrel' } }), snapshot({ tick: 4 }))).toBe(
      '4:-1:Kestrel:4'
    );
  });
});
