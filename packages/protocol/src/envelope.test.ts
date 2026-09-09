import { describe, expect, it } from 'vitest';
import {
  makeEnvelope,
  makeHelloMismatch,
  PROTOCOL_VERSION,
  SESSION_RESUMED_ELSEWHERE_CODE,
  shouldResumeAfterClose,
} from './envelope.js';

describe('protocol envelope', () => {
  it('stamps versioned envelopes', () => {
    expect(makeEnvelope('SNAPSHOT', 12, 3456)).toEqual({
      v: PROTOCOL_VERSION,
      tick: 12,
      serverTimeMs: 3456,
      type: 'SNAPSHOT',
    });
  });

  it('rejects old versions with a mismatch notice', () => {
    const notice = makeHelloMismatch(12, 3456, 1);
    expect(notice.type).toBe('HELLO_MISMATCH');
    expect(notice.expectedVersion).toBe(PROTOCOL_VERSION);
    expect(notice.receivedVersion).toBe(1);
  });

  it('reserves an application close code for session take-over', () => {
    expect(SESSION_RESUMED_ELSEWHERE_CODE).toBe(4400);
    expect(shouldResumeAfterClose(1000)).toBe(true);
    expect(shouldResumeAfterClose(1006)).toBe(true);
    expect(shouldResumeAfterClose(SESSION_RESUMED_ELSEWHERE_CODE)).toBe(false);
  });
});
