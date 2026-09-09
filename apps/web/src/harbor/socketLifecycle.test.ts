import { describe, expect, it, vi } from 'vitest';
import {
  detachHarborSocket,
  HARBOR_RECONNECT_MS,
  handleHarborSocketError,
  scheduleHarborReconnect,
} from './socketLifecycle';

function fakeSocket() {
  return {
    onopen: vi.fn(),
    onmessage: vi.fn(),
    onclose: vi.fn(),
    onerror: vi.fn(),
    close: vi.fn(),
  };
}

describe('scheduleHarborReconnect', () => {
  it('reconnects after the harbor backoff', () => {
    vi.useFakeTimers();
    try {
      const connect = vi.fn();
      scheduleHarborReconnect(connect);
      expect(connect).not.toHaveBeenCalled();
      vi.advanceTimersByTime(HARBOR_RECONNECT_MS);
      expect(connect).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('handleHarborSocketError', () => {
  it('closes the socket to funnel through onclose', () => {
    const socket = { close: vi.fn() };
    handleHarborSocketError(socket, false);
    expect(socket.close).toHaveBeenCalledTimes(1);
  });

  it('leaves disposed sockets alone', () => {
    const socket = { close: vi.fn() };
    handleHarborSocketError(socket, true);
    expect(socket.close).not.toHaveBeenCalled();
  });
});

describe('detachHarborSocket', () => {
  it('nulls handlers and closes the socket', () => {
    const socket = fakeSocket();
    detachHarborSocket(socket);
    expect(socket.onopen).toBeNull();
    expect(socket.onmessage).toBeNull();
    expect(socket.onclose).toBeNull();
    expect(socket.onerror).toBeNull();
    expect(socket.close).toHaveBeenCalledTimes(1);
  });

  it('tolerates a socket that never connected', () => {
    expect(() => detachHarborSocket(null)).not.toThrow();
  });
});
