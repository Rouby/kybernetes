import type { StartingRole } from './actions';

export interface PawnState {
  id: string;
  callsign: string;
  role: StartingRole;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facingAngle: number;
  currentDeck: string;
  isOperating: boolean;
  isResting: boolean;
  color: string;
}

export interface BulkheadState {
  id: string;
  deckId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  isLocked: boolean;
  isSealed: boolean;
  isTransparent: boolean;
}

export interface StationFixture {
  id: string;
  deckId: string;
  name: string;
  stationType: 'reactor' | 'mess' | 'armory' | 'hydroponics' | 'cargo' | 'bunk' | 'bridge';
  x: number;
  y: number;
  radius: number;
}
