/**
 * Protocol v2 sequence cursors. Intents carry seq so the server can dedupe
 * and reorder; snapshots carry tick so the client can interpolate and detect
 * drops. Pure helpers only; per-client cursor state lives with the owner.
 */

export type SeqCursor = number | undefined;

export function isFreshSeq(cursor: SeqCursor, seq: number): boolean {
  if (!Number.isInteger(seq) || seq < 0) return false;
  return cursor === undefined || seq > cursor;
}

export function advanceSeq(cursor: SeqCursor, seq: number): SeqCursor {
  return isFreshSeq(cursor, seq) ? seq : cursor;
}

export function isNewerTick(prevTick: number, nextTick: number): boolean {
  if (!Number.isInteger(prevTick) || !Number.isInteger(nextTick)) return false;
  if (prevTick < 0 || nextTick < 0) return false;
  return nextTick > prevTick;
}
