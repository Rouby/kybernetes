/**
 * Strike 4 save-format broadcast (additive). SAVE_INFO advertises the
 * world-save version and universe revision a snapshot stream persists
 * against; existing v2 snapshots are unchanged. Pure types + makers only.
 */

import { PROTOCOL_VERSION } from './envelope.js';

export interface SaveInfoBroadcast {
  readonly type: 'SAVE_INFO';
  readonly v: typeof PROTOCOL_VERSION;
  readonly tick: number;
  readonly serverTimeMs: number;
  readonly worldVersion: number;
  readonly universeRev: number;
}

export function makeSaveInfo(
  tick: number,
  serverTimeMs: number,
  worldVersion: number,
  universeRev: number
): SaveInfoBroadcast {
  return { type: 'SAVE_INFO', v: PROTOCOL_VERSION, tick, serverTimeMs, worldVersion, universeRev };
}
