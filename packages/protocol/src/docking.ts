/**
 * Physical docking channel: walk the gauntlet while docked, never teleport.
 * HIRE grants role/clearance only; frame changes happen exclusively via
 * dock transfer volumes stepped in sim-core schedule.ts.
 */

export type DockPhase = 'docked' | 'boarding_closing' | 'departing' | 'in_transit' | 'inbound';

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
  readonly vesselGate: string;
}
