/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { createObserverStore } from './ObserverStore';

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

describe('ObserverStore', () => {
  it('sends HELLO + OBSERVE and applies snapshots', () => {
    const fake = makeFake();
    const store = createObserverStore('HESP01', () => fake as unknown as WebSocket);
    store.connect();
    fake.onopen?.({});
    expect(store.getState().connected).toBe(true);
    const hello = JSON.parse(fake.sent[0] as string) as { type: string };
    const observe = JSON.parse(fake.sent[1] as string) as { type: string; beacon: string };
    expect(hello.type).toBe('HELLO');
    expect(observe.type).toBe('OBSERVE');
    expect(observe.beacon).toBe('HESP01');
    fake.onmessage?.({
      data: JSON.stringify({
        type: 'SNAPSHOT',
        v: 2,
        tick: 5,
        serverTimeMs: 500,
        pawns: [],
        impacts: [],
        portals: [],
        projectiles: [],
        frames: [],
      }),
    });
    expect(store.getState().snapshot?.tick).toBe(5);
    store.dispose();
    expect(store.getState().connected).toBe(false);
  });

  it('notifies subscribers', () => {
    const fake = makeFake();
    const store = createObserverStore('HESP01', () => fake as unknown as WebSocket);
    let calls = 0;
    store.subscribe(() => {
      calls += 1;
    });
    store.connect();
    fake.onopen?.({});
    expect(calls).toBeGreaterThan(0);
    store.dispose();
  });
});
