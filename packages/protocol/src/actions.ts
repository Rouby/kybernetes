import type { WeaponType } from './boarding';
import type { NavalDamageEventType } from './subsystems';

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

export interface TriggerPdtInterceptAction {
  type: 'TRIGGER_PDT_INTERCEPT';
  eventId: string;
}

export interface DeployFireSuppressionAction {
  type: 'DEPLOY_FIRE_SUPPRESSION';
  roomId: string;
}

export interface EmergencyHullRepairAction {
  type: 'EMERGENCY_HULL_REPAIR';
  roomId: string;
}

export interface VentReactorCoolantAction {
  type: 'VENT_REACTOR_COOLANT';
}

export interface TriggerNavalDamageEventAction {
  type: 'TRIGGER_NAVAL_EVENT';
  eventType: NavalDamageEventType;
}

export interface TriggerBoardingEventAction {
  type: 'TRIGGER_BOARDING_EVENT';
  breachRoomId?: string;
}

export interface EngageIntruderAction {
  type: 'ENGAGE_INTRUDER';
  intruderId: string;
  weaponType?: 'kinetic_rifle' | 'arc_welder' | 'shock_baton';
}

export interface DeploySentryAction {
  type: 'DEPLOY_SENTRY';
  roomId: string;
}

export interface FireWeaponAction {
  type: 'FIRE_WEAPON';
  originX: number;
  originY: number;
  targetX: number;
  targetY: number;
  weaponType: WeaponType;
}

export interface EquipWeaponAction {
  type: 'EQUIP_WEAPON';
  weaponType: WeaponType;
}

export interface ToggleDoorAction {
  type: 'TOGGLE_DOOR';
  doorId: string;
  open: boolean;
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
  | VentCompartmentAction
  | TriggerPdtInterceptAction
  | DeployFireSuppressionAction
  | EmergencyHullRepairAction
  | VentReactorCoolantAction
  | TriggerNavalDamageEventAction
  | TriggerBoardingEventAction
  | EngageIntruderAction
  | DeploySentryAction
  | FireWeaponAction
  | EquipWeaponAction
  | ToggleDoorAction;
