/**
 * Solo-ship intent set (TRANSFORM M1). Canonical shapes live in intents.ts;
 * this module names the solo-loop subset so routers and tests can pin the
 * M1 surface without re-declaring types. Pure types only.
 */

import type {
  CargoDropIntent,
  CargoPickupIntent,
  CargoRepackIntent,
  CargoUnpackIntent,
  SpawnAboardIntent,
} from './intents.js';

export type {
  CargoDropIntent,
  CargoPickupIntent,
  CargoRepackIntent,
  CargoUnpackIntent,
  SpawnAboardIntent,
};

export type ShipIntent =
  | SpawnAboardIntent
  | CargoPickupIntent
  | CargoDropIntent
  | CargoUnpackIntent
  | CargoRepackIntent;

export const SHIP_INTENT_TYPES: readonly ShipIntent['type'][] = [
  'SPAWN_ABOARD',
  'CARGO_PICKUP',
  'CARGO_DROP',
  'CARGO_UNPACK',
  'CARGO_REPACK',
] as const;
