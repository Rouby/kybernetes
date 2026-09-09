/**
 * Shared lifecycle primitives for the harbor WebSocket hooks.
 * `useHarborSocket` (player) and `useHarborObserver` (read-only debug
 * transport) run the same connect / retry / teardown skeleton with
 * different hello payloads and close handling; these helpers keep that
 * skeleton in one place so effect cleanup cannot drift between hooks.
 */

export const HARBOR_RECONNECT_MS = 2000;

export type DetachableSocket = Pick<
  WebSocket,
  'onopen' | 'onmessage' | 'onclose' | 'onerror' | 'close'
>;

/** Schedule a reconnect attempt after the standard harbor backoff. */
export function scheduleHarborReconnect(connect: () => void): ReturnType<typeof setTimeout> {
  return setTimeout(connect, HARBOR_RECONNECT_MS);
}

/** Funnel socket errors into `onclose` unless the effect is disposed. */
export function handleHarborSocketError(socket: { close: () => void }, isDisposed: boolean): void {
  if (!isDisposed) socket.close();
}

/**
 * Detach all handlers and close the socket. Safe to call with null when
 * the connection never established.
 */
export function detachHarborSocket(socket: DetachableSocket | null): void {
  if (!socket) return;
  socket.onopen = null;
  socket.onmessage = null;
  socket.onclose = null;
  socket.onerror = null;
  socket.close();
}
