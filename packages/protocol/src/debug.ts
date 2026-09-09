/**
 * Server debug channel: whole-sim health for pawn-less observers.
 * Observers join via OBSERVE and receive SNAPSHOT/TELEMETRY read-only
 * plus SERVER_STATS at 1Hz. No pawn, no seat, no latched input.
 */

export interface PawnLinkQuality {
  readonly pawnId: string;
  readonly callsign: string;
  readonly frameId: string;
  readonly roomHint: string;
  /** Ms since the last INPUT/FIRE/DOOR from this pawn. */
  readonly lastInputAgeMs: number;
  readonly latched: boolean;
  /** Ingress messages per second (rolling). */
  readonly msgsPerS: number;
}

export interface ServerStatsBroadcast {
  readonly type: 'SERVER_STATS';
  readonly v: 2;
  readonly tick: number;
  readonly serverTimeMs: number;
  /** Measured sim steps per second vs tpsTarget (20). */
  readonly tpsActual: number;
  readonly tpsTarget: number;
  readonly tickMsLast: number;
  readonly tickMsAvg: number;
  readonly droppedSteps: number;
  readonly accumulatorMs: number;
  readonly observers: number;
  readonly pawns: readonly PawnLinkQuality[];
}

export type ServerDebugSnapshot = ServerStatsBroadcast;
