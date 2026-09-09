/**
 * Seamless docking channel: walk the tube while docked, never teleport.
 * HIRE grants role/clearance only; frame changes happen by walking across
 * the mated mouth in world space (sim-core dockCrossing.ts preserves world
 * position, no transfer volumes or egress jumps).
 */

export type DockPhase = 'docked' | 'boarding_closing' | 'departing' | 'in_transit' | 'inbound';

export interface DockMouthWorld {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export interface DockStatusBroadcast {
  readonly type: 'DOCK_STATUS';
  readonly v: 2;
  readonly tick: number;
  readonly serverTimeMs: number;
  readonly vesselId: string;
  readonly dockId: string;
  readonly phase: DockPhase;
  /** True while pawns may walk across (docked, gates unsealed). */
  readonly walkable: boolean;
  /** Seconds until the gates seal (0 when not counting down). */
  readonly secondsToSeal: number;
  readonly stationGate: string;
  readonly tubeGate: string;
  readonly vesselGate: string;
  /** Station-side tube room pawns walk through (e.g. station.andock_tube). */
  readonly tubeRoom: string;
  /** World-space mouth segment where station tube meets ship (for tube draw). */
  readonly mouthWorld: DockMouthWorld;
}
