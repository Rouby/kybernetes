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
  validateClaim,
  validateConsume,
  validateCook,
  validateDoor,
  validateFire,
  validateHarvest,
  validateHello,
  validateHire,
  validateInput,
  validateInteract,
  validateJoinBeacon,
  validateObserve,
  validateRecycle,
  validateReload,
  validateRepair,
  validateRestart,
  validateSleep,
  validateSuit,
  validateTalk,
  validateVend,
} from './intentValidators.js';

function fail(reason: ValidateFailure, field?: string): ValidateErr {
  return field === undefined ? { ok: false, reason } : { ok: false, reason, field };
}

type IntentValidator = (raw: Record<string, unknown>) => ValidateResult;

const INTENT_VALIDATORS: Readonly<Record<string, IntentValidator>> = {
  HELLO: validateHello,
  JOIN_BEACON: validateJoinBeacon,
  OBSERVE: validateObserve,
  INPUT: validateInput,
  INTERACT: validateInteract,
  DOOR: validateDoor,
  HIRE: validateHire,
  TALK: validateTalk,
  SUIT: validateSuit,
  CONSUME: validateConsume,
  SLEEP: validateSleep,
  FIRE: validateFire,
  RELOAD: validateReload,
  CLAIM: validateClaim,
  VEND: validateVend,
  COOK: validateCook,
  HARVEST: validateHarvest,
  RECYCLE: validateRecycle,
  REPAIR: validateRepair,
  RESTART: validateRestart,
};

export function validateClientIntent(raw: unknown): ValidateResult {
  if (!isRecord(raw)) return fail('not-object');
  if (typeof raw.type !== 'string') return fail('unknown-type');
  const validator = INTENT_VALIDATORS[raw.type];
  if (validator === undefined) return fail('unknown-type');
  return validator(raw);
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
  CLAIM: 4,
  VEND: 4,
  COOK: 4,
  HARVEST: 4,
  RECYCLE: 4,
  REPAIR: 8,
  RESTART: 2,
};
