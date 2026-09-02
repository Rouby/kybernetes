export type IntruderLifecycleState = 'breaching' | 'advancing' | 'sabotaging' | 'neutralized';

export type IntruderAiState =
  | 'fleeing_vacuum'
  | 'attacking_player'
  | 'attacking_door'
  | 'advancing'
  | 'sabotaging'
  | 'neutralized';

export type WeaponType = 'kinetic_carbine' | 'pulse_laser' | 'arc_welder';

export interface IntruderState {
  id: string;
  name: string;
  x: number;
  y: number;
  facingAngle: number;
  health: number; // 0..100
  maxHealth: number;
  currentRoomId: string;
  targetRoomId: string;
  state: IntruderLifecycleState;
  aiState?: IntruderAiState;
  sabotageSecondsRemaining: number; // Countdown from 20s when in targetRoomId
  targetDoorId?: string;
  lastShotTime?: number;
}

export interface BoardingPodState {
  id: string;
  roomId: string; // The compartment breached (e.g. 'cargo', 'quarters')
  x: number;
  y: number;
  hullBreached: boolean;
  breachProgress: number; // 0..1
}

export interface SentryGunState {
  id: string;
  roomId: string;
  x: number;
  y: number;
  facingAngle: number;
  ammo: number;
  maxAmmo: number;
  targetIntruderId: string | null;
  isFiring: boolean;
}

export interface DoorState {
  id: string;
  name: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  isOpen: boolean;
  isAirlock: boolean; // True if an exterior hull door opening to space vacuum
  roomA: string;
  roomB: string; // 'vacuum' if isAirlock
  health?: number; // For breakable/attackable doors
}

export interface ProjectileState {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  color: string;
  fromPlayer: boolean;
  lifeSeconds: number;
  weaponType?: WeaponType | 'raider_plasma';
  maxLife?: number;
}

export interface BoardingTacticsTelemetry {
  intruders: IntruderState[];
  boardingPods: BoardingPodState[];
  sentries: SentryGunState[];
  lockedBulkheads: string[]; // List of doorway/wall IDs sealed shut
  ventedRooms: string[]; // List of compartment IDs actively decompressed
  doors: DoorState[];
  projectiles: ProjectileState[];
  roomO2: Record<string, number>; // 0..100% per room
}
