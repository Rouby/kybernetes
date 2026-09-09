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
  | RestartIntent;

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
] as const;
