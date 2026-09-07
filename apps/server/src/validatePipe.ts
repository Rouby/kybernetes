/**
 * Validate pipe: parse, version check, schema guard, rate limit.
 * Invalid input dropped with a metric; malformed JSON never reaches sim.
 */

import {
  type ClientIntent,
  INTENT_RATE_LIMIT_PER_SECOND,
  PROTOCOL_VERSION,
  readPacketVersion,
  validateClientIntent,
} from '@kybernetes/protocol';

export type PipeOutcome =
  | { readonly kind: 'ok'; readonly intent: ClientIntent }
  | { readonly kind: 'version-mismatch'; readonly received: number | undefined }
  | { readonly kind: 'invalid'; readonly reason: string }
  | { readonly kind: 'rate-limited'; readonly intentType: string };

export interface RateState {
  counts: Map<string, number>;
  windowStartMs: number;
}

export function createRateState(nowMs: number): RateState {
  return { counts: new Map(), windowStartMs: nowMs };
}

export function parsePipeInput(rawText: string, nowMs: number, rates: RateState): PipeOutcome {
  const parsed = parseJson(rawText);
  if (parsed === undefined) return { kind: 'invalid', reason: 'bad-json' };
  return validatePipePacket(parsed, nowMs, rates);
}

function parseJson(rawText: string): unknown {
  try {
    return JSON.parse(rawText) as unknown;
  } catch {
    return undefined;
  }
}

export function validatePipePacket(raw: unknown, nowMs: number, rates: RateState): PipeOutcome {
  const version = readPacketVersion(raw);
  if (version !== undefined && version !== PROTOCOL_VERSION) {
    return { kind: 'version-mismatch', received: version };
  }
  const result = validateClientIntent(raw);
  if (!result.ok) return { kind: 'invalid', reason: result.reason };
  if (isRateLimited(rates, result.intent.type, nowMs)) {
    return { kind: 'rate-limited', intentType: result.intent.type };
  }
  return { kind: 'ok', intent: result.intent };
}

function isRateLimited(rates: RateState, intentType: string, nowMs: number): boolean {
  rollWindow(rates, nowMs);
  const limit = INTENT_RATE_LIMIT_PER_SECOND[intentType] ?? 4;
  const count = rates.counts.get(intentType) ?? 0;
  if (count >= limit) return true;
  rates.counts.set(intentType, count + 1);
  return false;
}

function rollWindow(rates: RateState, nowMs: number): void {
  if (nowMs - rates.windowStartMs >= 1000) {
    rates.counts.clear();
    rates.windowStartMs = nowMs;
  }
}
