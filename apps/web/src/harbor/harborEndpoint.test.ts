import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HARBOR_PORT,
  harborWsUrl,
  parseHarborPort,
  resolveHarborPort,
} from './harborEndpoint';

describe('harborEndpoint', () => {
  it('parses valid ports and rejects garbage', () => {
    expect(parseHarborPort('41233')).toBe(41233);
    expect(parseHarborPort(null)).toBeNull();
    expect(parseHarborPort('')).toBeNull();
    expect(parseHarborPort('  ')).toBeNull();
    expect(parseHarborPort('abc')).toBeNull();
    expect(parseHarborPort('3.5')).toBeNull();
    expect(parseHarborPort('0')).toBeNull();
    expect(parseHarborPort('70000')).toBeNull();
  });

  it('defaults to 3001 without a harborPort param', () => {
    expect(resolveHarborPort('?harbor=1')).toBe(DEFAULT_HARBOR_PORT);
    expect(resolveHarborPort('')).toBe(DEFAULT_HARBOR_PORT);
    expect(harborWsUrl('?harbor=1')).toBe(`ws://localhost:${DEFAULT_HARBOR_PORT}`);
  });

  it('honors an ephemeral harborPort for e2e isolation', () => {
    expect(resolveHarborPort('?harbor=1&harborPort=41233')).toBe(41233);
    expect(harborWsUrl('?harbor=1&harborPort=41233&debug=1')).toBe('ws://localhost:41233');
  });

  it('ignores an invalid harborPort instead of crashing', () => {
    expect(resolveHarborPort('?harborPort=nope')).toBe(DEFAULT_HARBOR_PORT);
  });
});
