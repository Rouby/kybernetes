export type IntruderLifecycleState = 'breaching' | 'advancing' | 'sabotaging' | 'neutralized';

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
  sabotageSecondsRemaining: number; // Countdown from 20s when in targetRoomId
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

export interface BoardingTacticsTelemetry {
  intruders: IntruderState[];
  boardingPods: BoardingPodState[];
  sentries: SentryGunState[];
  lockedBulkheads: string[]; // List of doorway/wall IDs sealed shut
  ventedRooms: string[]; // List of compartment IDs actively decompressed
}
