/**
 * Protocol v2 client intents (input only). Replaces actions.ts.
 * The client never sends position: it sends sampled input and the server integrates.
 * All intents are JSON-safe plain objects with discriminant `type` tags.
 */

import type { Role } from './content.js';

export interface HelloIntent {
  readonly type: 'HELLO';
  readonly callsign: string;
  readonly color: string;
  readonly clientVersion: number;
}

export interface JoinBeaconIntent {
  readonly type: 'JOIN_BEACON';
  readonly beacon: string;
  readonly seq: number;
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

export type ClientIntent =
  | HelloIntent
  | JoinBeaconIntent
  | InputIntent
  | InteractIntent
  | DoorIntent
  | HireIntent
  | TalkIntent
  | SuitIntent
  | ConsumeIntent
  | SleepIntent
  | FireIntent;

export type ClientIntentType = ClientIntent['type'];

export const INPUT_INTENT_TYPES: readonly ClientIntentType[] = [
  'HELLO',
  'JOIN_BEACON',
  'INPUT',
  'INTERACT',
  'DOOR',
  'HIRE',
  'TALK',
  'SUIT',
  'CONSUME',
  'SLEEP',
  'FIRE',
] as const;
