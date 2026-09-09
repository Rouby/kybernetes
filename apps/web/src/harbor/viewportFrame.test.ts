import type { SnapshotBroadcast } from '@kybernetes/protocol';
import { describe, expect, it } from 'vitest';
import { type HarborViewportProps, telemetryKey } from './HarborViewport';

function view(over: Record<string, unknown> = {}): HarborViewportProps {
  return over as unknown as HarborViewportProps;
}

function snapshot(over: Record<string, unknown> = {}): SnapshotBroadcast {
  return { tick: 100, ...over } as unknown as SnapshotBroadcast;
}

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
