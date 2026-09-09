/**
 * Per-intent runtime validators for protocol v2. Split from `validate.ts`
 * so the router/rate-limit surface stays small while intent guards evolve
 * alongside their wire shapes. Invalid intents are dropped with a counter,
 * never throwing inside the tick. JSON-safe inputs only.
 */

import { isPawnTrim, isThrusterTint } from './appearance.js';
import { isRole } from './content.js';
import type { ClientIntent } from './intents.js';

export type ValidateFailure = 'not-object' | 'unknown-type' | 'bad-field' | 'bad-version';

export interface ValidateOk {
  readonly ok: true;
  readonly intent: ClientIntent;
}

export interface ValidateErr {
  readonly ok: false;
  readonly reason: ValidateFailure;
  readonly field?: string;
}

export type ValidateResult = ValidateOk | ValidateErr;

const MAX_CALLSIGN_LENGTH = 24;
const MAX_ID_LENGTH = 64;
const MAX_SEQ = 1_000_000_000;
const MAX_FACING = Math.PI * 2;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isShortId(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 1 && value.length <= MAX_ID_LENGTH;
}

function isSeq(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value) && value >= 0 && value <= MAX_SEQ;
}

function isUnitVec(value: unknown): value is { x: number; y: number } {
  if (!isRecord(value)) return false;
  const { x, y } = value;
  if (!isFiniteNumber(x) || !isFiniteNumber(y)) return false;
  if (Math.abs(x) > 1 || Math.abs(y) > 1) return false;
  return x * x + y * y <= 1.0001;
}

function isFacing(value: unknown): value is number {
  return isFiniteNumber(value) && Math.abs(value) <= MAX_FACING;
}

function fail(reason: ValidateFailure, field?: string): ValidateErr {
  return field === undefined ? { ok: false, reason } : { ok: false, reason, field };
}

export function validateHello(raw: Record<string, unknown>): ValidateResult {
  if (typeof raw.callsign !== 'string' || raw.callsign.length < 1) {
    return fail('bad-field', 'callsign');
  }
  if (raw.callsign.length > MAX_CALLSIGN_LENGTH) return fail('bad-field', 'callsign');
  if (typeof raw.color !== 'string' || raw.color.length > 16) return fail('bad-field', 'color');
  if (!isFiniteNumber(raw.clientVersion)) return fail('bad-field', 'clientVersion');
  if (raw.trim !== undefined && !isPawnTrim(raw.trim)) return fail('bad-field', 'trim');
  if (raw.thruster !== undefined && !isThrusterTint(raw.thruster))
    return fail('bad-field', 'thruster');
  return {
    ok: true,
    intent: {
      type: 'HELLO',
      callsign: raw.callsign,
      color: raw.color,
      clientVersion: raw.clientVersion,
      ...(raw.trim === undefined ? {} : { trim: raw.trim }),
      ...(raw.thruster === undefined ? {} : { thruster: raw.thruster }),
    },
  };
}

export function validateJoinBeacon(raw: Record<string, unknown>): ValidateResult {
  if (!isShortId(raw.beacon)) return fail('bad-field', 'beacon');
  if (!isSeq(raw.seq)) return fail('bad-field', 'seq');
  if (raw.userId !== undefined && !isShortId(raw.userId)) return fail('bad-field', 'userId');
  const userId = typeof raw.userId === 'string' ? raw.userId : undefined;
  return {
    ok: true,
    intent:
      userId === undefined
        ? { type: 'JOIN_BEACON', beacon: raw.beacon, seq: raw.seq }
        : { type: 'JOIN_BEACON', beacon: raw.beacon, seq: raw.seq, userId },
  };
}

export function validateObserve(raw: Record<string, unknown>): ValidateResult {
  if (!isShortId(raw.beacon)) return fail('bad-field', 'beacon');
  if (!isSeq(raw.seq)) return fail('bad-field', 'seq');
  return {
    ok: true,
    intent: { type: 'OBSERVE', seq: raw.seq as number, beacon: raw.beacon as string },
  };
}

export function validateInput(raw: Record<string, unknown>): ValidateResult {
  if (!isSeq(raw.seq)) return fail('bad-field', 'seq');
  if (!isUnitVec(raw.moveVec)) return fail('bad-field', 'moveVec');
  if (!isFacing(raw.facing)) return fail('bad-field', 'facing');
  if (typeof raw.sprint !== 'boolean') return fail('bad-field', 'sprint');
  if (typeof raw.sealed !== 'boolean') return fail('bad-field', 'sealed');
  return {
    ok: true,
    intent: {
      type: 'INPUT',
      seq: raw.seq,
      moveVec: { x: raw.moveVec.x, y: raw.moveVec.y },
      facing: raw.facing,
      sprint: raw.sprint,
      sealed: raw.sealed,
    },
  };
}

export function validateInteract(raw: Record<string, unknown>): ValidateResult {
  if (!isSeq(raw.seq)) return fail('bad-field', 'seq');
  if (!isShortId(raw.fixtureId)) return fail('bad-field', 'fixtureId');
  return { ok: true, intent: { type: 'INTERACT', seq: raw.seq, fixtureId: raw.fixtureId } };
}

export function validateDoor(raw: Record<string, unknown>): ValidateResult {
  if (!isSeq(raw.seq)) return fail('bad-field', 'seq');
  if (!isShortId(raw.portalId)) return fail('bad-field', 'portalId');
  if (typeof raw.wantOpen !== 'boolean') return fail('bad-field', 'wantOpen');
  return {
    ok: true,
    intent: { type: 'DOOR', seq: raw.seq, portalId: raw.portalId, wantOpen: raw.wantOpen },
  };
}

export function validateHire(raw: Record<string, unknown>): ValidateResult {
  if (!isSeq(raw.seq)) return fail('bad-field', 'seq');
  if (!isShortId(raw.offerId)) return fail('bad-field', 'offerId');
  if (!isRole(raw.job)) return fail('bad-field', 'job');
  return { ok: true, intent: { type: 'HIRE', seq: raw.seq, offerId: raw.offerId, job: raw.job } };
}

export function validateTalk(raw: Record<string, unknown>): ValidateResult {
  if (!isSeq(raw.seq)) return fail('bad-field', 'seq');
  if (!isShortId(raw.npcId)) return fail('bad-field', 'npcId');
  return { ok: true, intent: { type: 'TALK', seq: raw.seq, npcId: raw.npcId } };
}

export function validateSuit(raw: Record<string, unknown>): ValidateResult {
  if (!isSeq(raw.seq)) return fail('bad-field', 'seq');
  if (typeof raw.sealed !== 'boolean') return fail('bad-field', 'sealed');
  return { ok: true, intent: { type: 'SUIT', seq: raw.seq, sealed: raw.sealed } };
}

export function validateConsume(raw: Record<string, unknown>): ValidateResult {
  if (!isSeq(raw.seq)) return fail('bad-field', 'seq');
  if (!isShortId(raw.itemId)) return fail('bad-field', 'itemId');
  return { ok: true, intent: { type: 'CONSUME', seq: raw.seq, itemId: raw.itemId } };
}

export function validateSleep(raw: Record<string, unknown>): ValidateResult {
  if (!isSeq(raw.seq)) return fail('bad-field', 'seq');
  if (!isShortId(raw.bunkId)) return fail('bad-field', 'bunkId');
  if (typeof raw.active !== 'boolean') return fail('bad-field', 'active');
  return {
    ok: true,
    intent: { type: 'SLEEP', seq: raw.seq, bunkId: raw.bunkId, active: raw.active },
  };
}

export function validateFire(raw: Record<string, unknown>): ValidateResult {
  if (!isSeq(raw.seq)) return fail('bad-field', 'seq');
  if (!isFacing(raw.originAngle)) return fail('bad-field', 'originAngle');
  if (!isShortId(raw.weapon)) return fail('bad-field', 'weapon');
  return {
    ok: true,
    intent: { type: 'FIRE', seq: raw.seq, originAngle: raw.originAngle, weapon: raw.weapon },
  };
}

export function validateReload(raw: Record<string, unknown>): ValidateResult {
  if (!isSeq(raw.seq)) return fail('bad-field', 'seq');
  return { ok: true, intent: { type: 'RELOAD', seq: raw.seq } };
}

export function validateClaim(raw: Record<string, unknown>): ValidateResult {
  if (!isSeq(raw.seq)) return fail('bad-field', 'seq');
  if (!isShortId(raw.fixtureId)) return fail('bad-field', 'fixtureId');
  return { ok: true, intent: { type: 'CLAIM', seq: raw.seq, fixtureId: raw.fixtureId } };
}

export function validateVend(raw: Record<string, unknown>): ValidateResult {
  if (!isSeq(raw.seq)) return fail('bad-field', 'seq');
  if (!isShortId(raw.fixtureId)) return fail('bad-field', 'fixtureId');
  if (!isShortId(raw.vendId)) return fail('bad-field', 'vendId');
  return {
    ok: true,
    intent: { type: 'VEND', seq: raw.seq, fixtureId: raw.fixtureId, vendId: raw.vendId },
  };
}

export function validateCook(raw: Record<string, unknown>): ValidateResult {
  if (!isSeq(raw.seq)) return fail('bad-field', 'seq');
  if (!isShortId(raw.stoveId)) return fail('bad-field', 'stoveId');
  return { ok: true, intent: { type: 'COOK', seq: raw.seq, stoveId: raw.stoveId } };
}

export function validateHarvest(raw: Record<string, unknown>): ValidateResult {
  if (!isSeq(raw.seq)) return fail('bad-field', 'seq');
  if (!isShortId(raw.trayId)) return fail('bad-field', 'trayId');
  return { ok: true, intent: { type: 'HARVEST', seq: raw.seq, trayId: raw.trayId } };
}

export function validateRecycle(raw: Record<string, unknown>): ValidateResult {
  if (!isSeq(raw.seq)) return fail('bad-field', 'seq');
  if (!isShortId(raw.recyclerId)) return fail('bad-field', 'recyclerId');
  return { ok: true, intent: { type: 'RECYCLE', seq: raw.seq, recyclerId: raw.recyclerId } };
}

export function validateRepair(raw: Record<string, unknown>): ValidateResult {
  if (!isSeq(raw.seq)) return fail('bad-field', 'seq');
  if (!isShortId(raw.fixtureId)) return fail('bad-field', 'fixtureId');
  return { ok: true, intent: { type: 'REPAIR', seq: raw.seq, fixtureId: raw.fixtureId } };
}

export function validateRestart(raw: Record<string, unknown>): ValidateResult {
  if (!isSeq(raw.seq)) return fail('bad-field', 'seq');
  return { ok: true, intent: { type: 'RESTART', seq: raw.seq } };
}
