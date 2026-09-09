import { describe, expect, it } from 'vitest';
import { validateClientIntent } from './validate.js';

describe('protocol v2 validate', () => {
  it('accepts input-only intents', () => {
    const result = validateClientIntent({
      type: 'INPUT',
      seq: 1,
      moveVec: { x: 0.5, y: 0 },
      facing: 1.2,
      sprint: false,
      sealed: true,
    });
    expect(result.ok).toBe(true);
  });

  it('rejects client position trust vectors', () => {
    const result = validateClientIntent({
      type: 'INPUT',
      seq: 1,
      moveVec: { x: 5, y: 0 },
      facing: 0,
      sprint: false,
      sealed: false,
    });
    expect(result.ok).toBe(false);
  });

  it('rejects unknown types without throwing', () => {
    expect(validateClientIntent({ type: 'TRIGGER_NAVAL_EVENT' }).ok).toBe(false);
    expect(validateClientIntent(null).ok).toBe(false);
    expect(validateClientIntent('hello').ok).toBe(false);
  });

  it('accepts OBSERVE for pawn-less debug viewers', () => {
    const result = validateClientIntent({ type: 'OBSERVE', seq: 0, beacon: 'HESP01' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.intent.type).toBe('OBSERVE');
  });

  it('rejects OBSERVE without a beacon', () => {
    expect(validateClientIntent({ type: 'OBSERVE', seq: 0 }).ok).toBe(false);
    expect(validateClientIntent({ type: 'OBSERVE', seq: 0, beacon: '' }).ok).toBe(false);
  });

  it('round-trips hire intents through JSON', () => {
    const raw = { type: 'HIRE', seq: 7, offerId: 'offer_1', job: 'engineer' };
    const parsed = JSON.parse(JSON.stringify(raw));
    const result = validateClientIntent(parsed);
    expect(result.ok).toBe(true);
  });
});
