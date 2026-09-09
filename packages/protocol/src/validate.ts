/**
 * Protocol v2 runtime guards. Invalid intents are dropped with a counter,
 * never throwing inside the tick. JSON-safe inputs only.
 *
 * Per-intent validators live in `intentValidators.ts`; this module keeps the
 * dispatch router, the result contract re-exports, and the rate-limit table.
 */

import type { ValidateErr, ValidateFailure, ValidateResult } from './intentValidators.js';
import {
  isRecord,
  validateConsume,
  validateDoor,
  validateFire,
  validateHello,
  validateHire,
  validateInput,
  validateInteract,
  validateJoinBeacon,
  validateObserve,
  validateReload,
  validateSleep,
  validateSuit,
  validateTalk,
} from './intentValidators.js';

function fail(reason: ValidateFailure, field?: string): ValidateErr {
  return field === undefined ? { ok: false, reason } : { ok: false, reason, field };
}

export function validateClientIntent(raw: unknown): ValidateResult {
  if (!isRecord(raw)) return fail('not-object');
  if (typeof raw.type !== 'string') return fail('unknown-type');
  switch (raw.type) {
    case 'HELLO':
      return validateHello(raw);
    case 'JOIN_BEACON':
      return validateJoinBeacon(raw);
    case 'OBSERVE':
      return validateObserve(raw);
    case 'INPUT':
      return validateInput(raw);
    case 'INTERACT':
      return validateInteract(raw);
    case 'DOOR':
      return validateDoor(raw);
    case 'HIRE':
      return validateHire(raw);
    case 'TALK':
      return validateTalk(raw);
    case 'SUIT':
      return validateSuit(raw);
    case 'CONSUME':
      return validateConsume(raw);
    case 'SLEEP':
      return validateSleep(raw);
    case 'FIRE':
      return validateFire(raw);
    case 'RELOAD':
      return validateReload(raw);
    default:
      return fail('unknown-type');
  }
}

export const INTENT_RATE_LIMIT_PER_SECOND: Readonly<Record<string, number>> = {
  HELLO: 2,
  JOIN_BEACON: 2,
  INPUT: 20,
  INTERACT: 8,
  DOOR: 8,
  HIRE: 2,
  TALK: 2,
  SUIT: 8,
  CONSUME: 4,
  SLEEP: 2,
  // FIRE is spam-guarded only; magazine depth is the real fire limiter.
  FIRE: 30,
  RELOAD: 2,
  OBSERVE: 2,
};
