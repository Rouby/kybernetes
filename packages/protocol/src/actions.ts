export type StartingRole =
  | 'wiper'
  | 'galley_hand'
  | 'security_private'
  | 'hydro_tender'
  | 'stevedore';

export interface JoinVesselAction {
  type: 'JOIN_VESSEL';
  vesselCode: string;
  callsign: string;
  role: StartingRole;
}

export interface PlayerMoveIntent {
  type: 'PLAYER_MOVE';
  x: number;
  y: number;
  vx: number;
  vy: number;
  facingAngle: number;
}

export interface InteractStationIntent {
  type: 'INTERACT_STATION';
  stationId: string;
  deckId: string;
}

export interface StartDutyAction {
  type: 'START_DUTY';
  dutyId: string;
  stationId: string;
}

export interface CancelDutyAction {
  type: 'CANCEL_DUTY';
  dutyId: string;
}

export interface ConsumeItemAction {
  type: 'CONSUME_ITEM';
  itemId: string; // 'nutrient_paste' | 'recaf' | 'ration_tin' | 'recycled_water'
}

export interface BunkSleepAction {
  type: 'BUNK_SLEEP';
  bunkId: string;
  active: boolean;
}

export interface ToggleBattleStationsAction {
  type: 'TOGGLE_BATTLE_STATIONS';
  alertLevel: 'nominal' | 'yellow' | 'red';
}

export interface BulkheadLockAction {
  type: 'BULKHEAD_LOCK';
  bulkheadId: string;
  locked: boolean;
}

export interface VentCompartmentAction {
  type: 'VENT_COMPARTMENT';
  compartmentId: string;
  venting: boolean;
}

export type ClientAction =
  | JoinVesselAction
  | PlayerMoveIntent
  | InteractStationIntent
  | StartDutyAction
  | CancelDutyAction
  | ConsumeItemAction
  | BunkSleepAction
  | ToggleBattleStationsAction
  | BulkheadLockAction
  | VentCompartmentAction;
