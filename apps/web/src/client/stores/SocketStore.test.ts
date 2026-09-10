/** @vitest-environment node */
import { PROTOCOL_VERSION } from '@kybernetes/protocol';
import { describe, expect, it, vi } from 'vitest';
import { createSocketStore } from './SocketStore';

(globalThis as unknown as { WebSocket: unknown }).WebSocket = { OPEN: 1 };

interface FakeSocket {
  sent: string[];
  readyState: number;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onclose: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  send(data: string): void;
  close(): void;
}

function makeFake(): FakeSocket {
  const fake: FakeSocket = {
    sent: [],
    readyState: 1,
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
    send: (data: string): void => {
      fake.sent.push(data);
    },
    close: (): void => {},
  };
  return fake;
}

function connected(): { store: ReturnType<typeof createSocketStore>; fake: FakeSocket } {
  const fake = makeFake();
  const store = createSocketStore(
    { callsign: 'VEGA', color: '#0ff', beacon: 'beacon-1', userId: 'user-1' },
    () => fake as unknown as WebSocket
  );
  store.connect();
  fake.onopen?.({});
  return { store, fake };
}

function snap(tick: number): Record<string, unknown> {
  return {
    type: 'SNAPSHOT',
    v: 2,
    tick,
    serverTimeMs: tick * 100,
    pawns: [],
    impacts: [],
    portals: [],
    projectiles: [],
    frames: [],
    decals: [],
  };
}

function emit(fake: FakeSocket, msg: unknown): void {
  fake.onmessage?.({ data: JSON.stringify(msg) });
}

describe('createSocketStore', () => {
  it('sends HELLO + SPAWN_ABOARD on open', () => {
    const { fake } = connected();
    expect(fake.sent).toHaveLength(2);
    const hello = JSON.parse(fake.sent[0]) as Record<string, unknown>;
    const spawn = JSON.parse(fake.sent[1]) as Record<string, unknown>;
    expect(hello).toMatchObject({ v: PROTOCOL_VERSION, type: 'HELLO', callsign: 'VEGA' });
    expect(spawn).toMatchObject({ v: PROTOCOL_VERSION, type: 'SPAWN_ABOARD', userId: 'user-1' });
  });

  it('applies SNAPSHOT and drops stale ticks', () => {
    const { store, fake } = connected();
    emit(fake, snap(10));
    expect(store.getState().snapshot?.tick).toBe(10);
    emit(fake, snap(4));
    expect(store.getState().snapshot?.tick).toBe(10);
  });

  it('sendIntent stamps the protocol version and increments seq', () => {
    const { store, fake } = connected();
    fake.sent.length = 0;
    store.sendIntent({ type: 'SUIT', seq: 0, sealed: true });
    store.sendIntent({ type: 'SUIT', seq: 0, sealed: false });
    const first = JSON.parse(fake.sent[0]) as { v: number; seq: number };
    const second = JSON.parse(fake.sent[1]) as { v: number; seq: number };
    expect(first.v).toBe(PROTOCOL_VERSION);
    expect(first.seq).toBe(1);
    expect(second.seq).toBe(2);
  });

  it('notifies subscribers on snapshot', () => {
    const { store, fake } = connected();
    const listener = vi.fn();
    const unsub = store.subscribe(listener);
    emit(fake, snap(7));
    expect(listener).toHaveBeenCalled();
    unsub();
  });

  it('dispose clears the connection', () => {
    const { store } = connected();
    expect(store.getState().connected).toBe(true);
    store.dispose();
    expect(store.getState().connected).toBe(false);
  });
});
