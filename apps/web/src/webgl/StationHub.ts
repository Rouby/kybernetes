import type { DockingPhase } from '@kybernetes/protocol';
import { getShipDockingOffset, type IntroState } from '@kybernetes/sim-core';

export function liveEtaSeconds(broadcastEta: number, receivedAtMs: number, nowMs: number): number {
  return Math.max(0, broadcastEta - (nowMs - receivedAtMs) / 1000);
}

export function resolveClientShipOffset(
  phase: DockingPhase | undefined,
  etaSeconds: number | undefined,
  legIndex: number | undefined
): { x: number; y: number } {
  const state: IntroState = {
    phase: phase ?? 'inbound',
    shipName: '',
    destination: '',
    etaSeconds: etaSeconds ?? 20,
    legIndex: legIndex ?? 0,
    legDurationSeconds: 120,
    progressPercent: 0,
    offerId: null,
    offeredJobs: null,
    assignedJob: null,
    turnaroundSeconds: 30,
  };
  return getShipDockingOffset(state);
}

export interface StationNpc {
  x: number;
  y: number;
  color: string;
}

export const STATION_NPCS: readonly StationNpc[] = [
  { x: 660, y: 725, color: '#2dd4bf' },
  { x: 500, y: 875, color: '#b55fe6' },
];
