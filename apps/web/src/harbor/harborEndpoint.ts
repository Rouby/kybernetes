/**
 * Harbor endpoint: resolve the daemon WebSocket URL for the running page.
 * Production and dev default to ws://localhost:3001; e2e passes
 * ?harborPort=<free-port> so each spec file talks to its private daemon
 * even when a stale server still holds 3001.
 */

export const DEFAULT_HARBOR_PORT = 3001;

export function parseHarborPort(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw.trim() === '') return null;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return port;
}

function readWindowSearch(): string | null {
  if (typeof window === 'undefined') return null;
  const search = window.location?.search;
  return typeof search === 'string' ? search : null;
}

export function resolveHarborPort(search?: string): number {
  const query = search ?? readWindowSearch();
  if (query === null || query === undefined) return DEFAULT_HARBOR_PORT;
  return parseHarborPort(new URLSearchParams(query).get('harborPort')) ?? DEFAULT_HARBOR_PORT;
}

export function harborWsUrl(search?: string): string {
  return `ws://localhost:${resolveHarborPort(search)}`;
}
