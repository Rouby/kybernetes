import { describe, expect, it } from 'vitest';
import {
  INPUT_HEARTBEAT_MS,
  type InputSample,
  shouldSendInput,
  wantsImmediateSend,
} from './inputGate';

function sample(over: Partial<InputSample> = {}): InputSample {
  return { x: 0, y: 0, facing: 0, sprint: false, sealed: false, ...over };
}

describe('input send gate', () => {
  it('sends the first sample unconditionally', () => {
    expect(shouldSendInput(null, sample(), 0)).toBe(true);
  });

  it('suppresses identical idle samples inside the heartbeat', () => {
    const last = sample();
    expect(shouldSendInput(last, sample(), 50)).toBe(false);
    expect(shouldSendInput(last, sample(), INPUT_HEARTBEAT_MS - 1)).toBe(false);
  });

  it('repeats the heartbeat even while idle', () => {
    expect(shouldSendInput(sample(), sample(), INPUT_HEARTBEAT_MS)).toBe(true);
  });

  it('sends on movement, aim, suit, and sprint changes', () => {
    const last = sample();
    expect(shouldSendInput(last, sample({ x: 1 }), 50)).toBe(true);
    expect(shouldSendInput(last, sample({ facing: 0.5 }), 50)).toBe(true);
    expect(shouldSendInput(last, sample({ sealed: true }), 50)).toBe(true);
    expect(shouldSendInput(last, sample({ sprint: true }), 50)).toBe(true);
  });

  it('fires at once on the press edge instead of waiting for the pump', () => {
    expect(wantsImmediateSend(false, { x: 1, y: 0 })).toBe(true);
    expect(wantsImmediateSend(true, { x: 1, y: 0 })).toBe(false);
    expect(wantsImmediateSend(false, null)).toBe(false);
  });

  it('ignores sub-pixel jitter below epsilon', () => {
    const last = sample({ x: 0.5, facing: 1 });
    expect(shouldSendInput(last, sample({ x: 0.505, facing: 1.01 }), 50)).toBe(false);
  });
});
