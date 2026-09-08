/**
 * Harbor scenario: station hub plus one docked reference vessel, gauntlet dock
 * link, captain aboard, and transit primed. The M5 loop stage; the SimHost,
 * the playable preview, and the loop tests all start here.
 */

import { type AirAuthorityState, bindAirFrame } from './airAuthority.js';
import { assembleWorld } from './assemble.js';
import { HesperiaV2Spec } from './content/HesperiaV2.hull.js';
import { StationHubSpec } from './content/StationHub.hull.js';
import { ensureCaptain } from './crew.js';
import { type DockLink, initialTransit } from './schedule.js';
import type { World } from './types.js';

export const HARBOR_STATION = 'station';
export const HARBOR_SHIP = 'ship';
export const HARBOR_BEACON = 'HESP01';
export const SHIP_ORIGIN = { x: 1400, y: 0 };

export const HARBOR_DOCK: DockLink = {
  id: 'harbor',
  stationFrame: HARBOR_STATION,
  stationPortal: 'station.bay_gauntlet',
  stationX: 960,
  stationY: 200,
  vesselFrame: HARBOR_SHIP,
  vesselPortal: 'ship.ship_mouth',
  vesselX: 880,
  vesselY: 370,
  radius: 100,
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
  return ensureCaptain(world, HARBOR_SHIP);
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
