/**
 * Dock status view: pure derivation of walkability + seal countdown.
 * The tube leaves seal on departure; while any dock gate is sealed
 * or the vessel is not docked, walking across is blocked. No DOM.
 */

import type { DockPhase, DockStatusBroadcast } from '@kybernetes/protocol';
import { phaseDuration } from './schedule.js';
import type { World } from './types.js';

export const BOARDING_CLOSING_S = 5;

export function dockPhaseOf(world: World, vesselId: string): DockPhase {
  const schedule = world.vessels[vesselId]?.schedule ?? 'docked';
  if (schedule !== 'docked') return schedule;
  const remaining = world.transit[vesselId]?.timerS ?? phaseDuration('docked');
  if (remaining <= BOARDING_CLOSING_S) return 'boarding_closing';
  return 'docked';
}

export function dockWalkable(world: World, dockId: string): boolean {
  const dock = world.docks[dockId];
  if (dock === undefined) return false;
  if (dockPhaseOf(world, dock.vesselFrame) !== 'docked') return false;
  const stationGate = world.portals[dock.stationPortal];
  const tubeGate = world.portals[dock.tubePortal];
  const vesselGate = world.portals[dock.vesselPortal];
  if (stationGate === undefined || tubeGate === undefined || vesselGate === undefined) return false;
  return (
    stationGate.state !== 'sealed' && tubeGate.state !== 'sealed' && vesselGate.state !== 'sealed'
  );
}

export function secondsToSealOf(world: World, vesselId: string): number {
  const phase = dockPhaseOf(world, vesselId);
  if (phase === 'boarding_closing') {
    return Math.max(0, Math.round((world.transit[vesselId]?.timerS ?? 0) * 10) / 10);
  }
  return 0;
}

export function dockStatusOf(
  world: World,
  dockId: string,
  nowMs: number
): DockStatusBroadcast | undefined {
  const dock = world.docks[dockId];
  if (dock === undefined) return undefined;
  const phase = dockPhaseOf(world, dock.vesselFrame);
  return {
    type: 'DOCK_STATUS',
    v: 2,
    tick: world.tick,
    serverTimeMs: nowMs,
    vesselId: dock.vesselFrame,
    dockId: dock.id,
    phase,
    walkable: dockWalkable(world, dockId),
    secondsToSeal: secondsToSealOf(world, dock.vesselFrame),
    stationGate: dock.stationPortal,
    tubeGate: dock.tubePortal,
    vesselGate: dock.vesselPortal,
    tubeRoom: dock.tubeRoom,
    mouthWorld: { ...dock.mouthWorld },
  };
}
