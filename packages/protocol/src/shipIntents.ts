/**
 * Solo-ship intent set (TRANSFORM M1). Canonical shapes live in intents.ts;
 * this module names the solo-loop subset so routers and tests can pin the
 * M1 surface without re-declaring types. Pure types only.
 */

import type { SpawnAboardIntent } from './intents.js';

export type { SpawnAboardIntent };

export type ShipIntent = SpawnAboardIntent;

export const SHIP_INTENT_TYPES: readonly ShipIntent['type'][] = ['SPAWN_ABOARD'] as const;
