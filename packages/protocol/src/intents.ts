/**
 * Protocol v2 client intents (input only). Replaces actions.ts.
 * The client never sends position: it sends sampled input and the server integrates.
 * All intents are JSON-safe plain objects with discriminant `type` tags.
 */

import type { PawnTrim, ThrusterTint } from './appearance.js';
import type { Role } from './content.js';

export interface HelloIntent {
  readonly type: 'HELLO';
  readonly callsign: string;
  readonly color: string;
  readonly clientVersion: number;
  readonly trim?: PawnTrim;
  readonly thruster?: ThrusterTint;
}

export interface JoinBeaconIntent {
  readonly type: 'JOIN_BEACON';
  readonly beacon: string;
  readonly seq: number;
  readonly userId?: string;
}

export interface InputIntent {
  readonly type: 'INPUT';
  readonly seq: number;
  readonly moveVec: { readonly x: number; readonly y: number };
  readonly facing: number;
  readonly sprint: boolean;
  readonly sealed: boolean;
}

export interface InteractIntent {
  readonly type: 'INTERACT';
  readonly seq: number;
  readonly fixtureId: string;
}

export interface DoorIntent {
  readonly type: 'DOOR';
  readonly seq: number;
  readonly portalId: string;
  readonly wantOpen: boolean;
}

export interface HireIntent {
  readonly type: 'HIRE';
  readonly seq: number;
  readonly offerId: string;
  readonly job: Role;
}

export interface TalkIntent {
  readonly type: 'TALK';
  readonly seq: number;
  readonly npcId: string;
}

export interface SuitIntent {
  readonly type: 'SUIT';
  readonly seq: number;
  readonly sealed: boolean;
}

export interface ConsumeIntent {
  readonly type: 'CONSUME';
  readonly seq: number;
  readonly itemId: string;
}

export interface SleepIntent {
  readonly type: 'SLEEP';
  readonly seq: number;
  readonly bunkId: string;
  readonly active: boolean;
}

export interface FireIntent {
  readonly type: 'FIRE';
  readonly seq: number;
  readonly originAngle: number;
  readonly weapon: string;
}

export interface ReloadIntent {
  readonly type: 'RELOAD';
  readonly seq: number;
}

export interface ObserveIntent {
  readonly type: 'OBSERVE';
  readonly seq: number;
  readonly beacon: string;
}

export interface ClaimIntent {
  readonly type: 'CLAIM';
  readonly seq: number;
  readonly fixtureId: string;
}

export interface VendIntent {
  readonly type: 'VEND';
  readonly seq: number;
  readonly fixtureId: string;
  readonly vendId: string;
}

export interface CookIntent {
  readonly type: 'COOK';
  readonly seq: number;
  readonly stoveId: string;
}

export interface HarvestIntent {
  readonly type: 'HARVEST';
  readonly seq: number;
  readonly trayId: string;
}

export interface RecycleIntent {
  readonly type: 'RECYCLE';
  readonly seq: number;
  readonly recyclerId: string;
}

export interface RepairIntent {
  readonly type: 'REPAIR';
  readonly seq: number;
  readonly fixtureId: string;
}

export interface RestartIntent {
  readonly type: 'RESTART';
  readonly seq: number;
}

export interface SpawnAboardIntent {
  readonly type: 'SPAWN_ABOARD';
  readonly seq: number;
  readonly userId?: string;
}

export interface ReactorTuneIntent {
  readonly type: 'REACTOR_TUNE';
  readonly seq: number;
  readonly rodsDelta: number;
  readonly coolantDelta: number;
}

export interface ReactorRestartIntent {
  readonly type: 'REACTOR_RESTART';
  readonly seq: number;
}

export interface EngineTuneIntent {
  readonly type: 'ENGINE_TUNE';
  readonly seq: number;
  readonly spoolCmd: 0 | 1;
  readonly tuneSet?: number;
}

export interface NavPlotIntent {
  readonly type: 'NAV_PLOT';
  readonly seq: number;
  readonly destHubId: string;
}

export interface NavCancelIntent {
  readonly type: 'NAV_CANCEL';
  readonly seq: number;
}

export interface DistressIntent {
  readonly type: 'DISTRESS';
  readonly seq: number;
}

export interface CargoPickupIntent {
  readonly type: 'CARGO_PICKUP';
  readonly seq: number;
  readonly crateId: string;
}

export interface CargoDropIntent {
  readonly type: 'CARGO_DROP';
  readonly seq: number;
}

export interface CargoUnpackIntent {
  readonly type: 'CARGO_UNPACK';
  readonly seq: number;
  readonly crateIds: readonly string[];
}

export interface CargoRepackIntent {
  readonly type: 'CARGO_REPACK';
  readonly seq: number;
  readonly goodId: string;
  readonly qty: number;
}

export interface MarketBuyIntent {
  readonly type: 'MARKET_BUY';
  readonly seq: number;
  readonly hubId: string;
  readonly goodId: string;
  readonly qty: number;
}

export interface MarketSellIntent {
  readonly type: 'MARKET_SELL';
  readonly seq: number;
  readonly hubId: string;
  readonly crateIds: readonly string[];
}

export type ClientIntent =
  | HelloIntent
  | JoinBeaconIntent
  | ObserveIntent
  | InputIntent
  | InteractIntent
  | DoorIntent
  | HireIntent
  | TalkIntent
  | SuitIntent
  | ConsumeIntent
  | SleepIntent
  | FireIntent
  | ReloadIntent
  | ClaimIntent
  | VendIntent
  | CookIntent
  | HarvestIntent
  | RecycleIntent
  | RepairIntent
  | RestartIntent
  | SpawnAboardIntent
  | ReactorTuneIntent
  | ReactorRestartIntent
  | EngineTuneIntent
  | NavPlotIntent
  | NavCancelIntent
  | DistressIntent
  | CargoPickupIntent
  | CargoDropIntent
  | CargoUnpackIntent
  | CargoRepackIntent
  | MarketBuyIntent
  | MarketSellIntent;

export type ClientIntentType = ClientIntent['type'];

export const INPUT_INTENT_TYPES: readonly ClientIntentType[] = [
  'HELLO',
  'JOIN_BEACON',
  'OBSERVE',
  'INPUT',
  'INTERACT',
  'DOOR',
  'HIRE',
  'TALK',
  'SUIT',
  'CONSUME',
  'SLEEP',
  'FIRE',
  'RELOAD',
  'CLAIM',
  'VEND',
  'COOK',
  'HARVEST',
  'RECYCLE',
  'REPAIR',
  'RESTART',
  'SPAWN_ABOARD',
  'REACTOR_TUNE',
  'REACTOR_RESTART',
  'ENGINE_TUNE',
  'NAV_PLOT',
  'NAV_CANCEL',
  'DISTRESS',
  'CARGO_PICKUP',
  'CARGO_DROP',
  'CARGO_UNPACK',
  'CARGO_REPACK',
  'MARKET_BUY',
  'MARKET_SELL',
] as const;
