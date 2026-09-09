/**
 * Harbor scenario: station hub plus one docked reference vessel, gauntlet dock
 * link, captain aboard, and transit primed. The M5 loop stage; the SimHost,
 * the playable preview, and the loop tests all start here.
 */

import { type AirAuthorityState, bindAirFrame } from './airAuthority.js';
import { assembleWorld, spawnPawn } from './assemble.js';
import { ensureBot } from './bots.js';
import { HesperiaV2Spec } from './content/HesperiaV2.hull.js';
import { StationHubSpec } from './content/StationHub.hull.js';
import { ensureCaptain } from './crew.js';
import { type DockLink, initialTransit, SHIP_ORIGIN } from './schedule.js';
import type { World } from './types.js';

export const HARBOR_STATION = 'station';
export const HARBOR_SHIP = 'ship';
export const HARBOR_BEACON = 'HESP01';

/**
 * Harbor tube crossing: tight volumes at both gate leaves with landings a
 * stride past each leaf, so the frame flip reads as one more step. The
 * station leaf sits at gauntlet wall contact; the vessel leaf just inside
 * the stern ramp mouth (open while walkable, sealed with the cycle).
 */
export const HARBOR_DOCK: DockLink = {
  id: 'harbor',
  stationFrame: HARBOR_STATION,
  stationPortal: 'station.bay_gauntlet',
  stationX: 1008,
  stationY: 200,
  vesselFrame: HARBOR_SHIP,
  vesselPortal: 'ship.ship_mouth',
  vesselX: 30,
  vesselY: 360,
  radius: 18,
  vesselEgress: { x: 18, y: 360 },
  stationEgress: { x: 1008, y: 200 },
};

export function buildHarborWorld(): World {
  let world = assembleWorld([
    { frameId: HARBOR_STATION, hull: StationHubSpec },
    {
      frameId: HARBOR_SHIP,
      hull: HesperiaV2Spec,
      vessel: { name: 'CSS Hesperia', beacon: HARBOR_BEACON },
    },
  ]);
  const ship = world.vessels[HARBOR_SHIP];
  if (ship !== undefined) {
    world = {
      ...world,
      vessels: { ...world.vessels, [HARBOR_SHIP]: { ...ship, origin: { ...SHIP_ORIGIN } } },
    };
  }
  world = {
    ...world,
    transit: { ...world.transit, [HARBOR_SHIP]: initialTransit(HARBOR_SHIP) },
    docks: { ...world.docks, [HARBOR_DOCK.id]: HARBOR_DOCK },
  };
  world = ensureCaptain(world, HARBOR_SHIP);
  return ensureStationCrowd(world);
}

/** Ambient concourse crowd: three wanderers that never crew, never fight. */
const STATION_CROWD: ReadonlyArray<{
  id: string;
  roomId: string;
  x: number;
  y: number;
  color: string;
}> = [
  { id: 'npc:station:concourse', roomId: 'station.concourse', x: 300, y: 480, color: '#2dd4bf' },
  { id: 'npc:station:overlook', roomId: 'station.overlook', x: 300, y: -70, color: '#b55fe6' },
  { id: 'npc:station:lounge', roomId: 'station.lounge', x: 750, y: 350, color: '#ffd166' },
];

function ensureStationCrowd(world: World): World {
  let next = world;
  for (const npc of STATION_CROWD) {
    if (next.pawns[npc.id] !== undefined) continue;
    next = spawnPawn(next, {
      id: npc.id,
      owner: npc.id,
      frameId: HARBOR_STATION,
      roomId: npc.roomId,
      x: npc.x,
      y: npc.y,
      color: npc.color,
    });
    next = ensureBot(next, npc.id);
    // The crowd mills the concourse, never the gauntlet tube itself: the
    // dead-end tube is a transfer volume, not a lounge.
    const sched = next.bots[npc.id];
    if (sched !== undefined) {
      const waypoints = sched.waypoints.filter((point) => point.roomId !== 'station.gauntlet');
      if (waypoints.length > 0) {
        next = { ...next, bots: { ...next.bots, [npc.id]: { ...sched, waypoints } } };
      }
    }
  }
  return next;
}

export function bindWorldAir(auth: AirAuthorityState, world: World): void {
  const frameIds = new Set<string>([...Object.keys(world.vessels), ...Object.keys(world.stations)]);
  for (const frameId of frameIds) {
    bindAirFrame(
      auth,
      frameId,
      Object.values(world.rooms).filter((room) => room.frameId === frameId),
      Object.values(world.portals).filter((portal) => portal.id.startsWith(`${frameId}.`))
    );
  }
}
