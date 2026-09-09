/**
 * Harbor scenario: station hub plus one docked reference vessel, Andockschleuse dock
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
 * Harbor tube crossing: seamless world-space walk through andock_tube.
 * The tube (1140-1210) bridges Andockschleuse A to the ship mouth at world
 * x=1210; crossing the mouth line re-bases world position into the other
 * frame with no jump. All three leaves seal with the cycle.
 */
export const HARBOR_DOCK: DockLink = {
  id: 'harbor',
  stationFrame: HARBOR_STATION,
  stationPortal: 'station.korridor_ost_andock',
  tubePortal: 'station.andock_tube_mund',
  tubeRoom: 'station.andock_tube',
  vesselFrame: HARBOR_SHIP,
  vesselPortal: 'ship.schiff_mund',
  mouthWorld: { x1: 1210, y1: 240, x2: 1210, y2: 280 },
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
  world = ensureLivingFixtures(world);
  world = ensureLivingCrew(world);
  return ensureStationCrowd(world);
}

/** Ambient harbor crowd: three wanderers that never crew, never fight. */
const STATION_CROWD: ReadonlyArray<{
  id: string;
  roomId: string;
  x: number;
  y: number;
  color: string;
}> = [
  {
    id: 'npc:station:korridor',
    roomId: 'station.korridor_mitte',
    x: 460,
    y: 240,
    color: '#2dd4bf',
  },
  { id: 'npc:station:habitat', roomId: 'station.habitat', x: 160, y: 100, color: '#b55fe6' },
  { id: 'npc:station:fracht', roomId: 'station.frachthalle', x: 410, y: 380, color: '#ffd166' },
];

/** Living crew: barkeep, trader, ship cook, and deckhand on fixed work loops. */
const LIVING_CREW: ReadonlyArray<{
  id: string;
  frameId: string;
  roomId: string;
  x: number;
  y: number;
  color: string;
  waypoints: ReadonlyArray<{ x: number; y: number; roomId: string }>;
}> = [
  {
    id: 'npc:station:barkeep',
    frameId: HARBOR_STATION,
    roomId: 'station.frachthalle',
    x: 360,
    y: 295,
    color: '#ff9f6b',
    waypoints: [
      { x: 350, y: 295, roomId: 'station.frachthalle' },
      { x: 372, y: 295, roomId: 'station.frachthalle' },
    ],
  },
  {
    id: 'npc:station:trader',
    frameId: HARBOR_STATION,
    roomId: 'station.frachthalle',
    x: 470,
    y: 440,
    color: '#7ee787',
    waypoints: [
      { x: 462, y: 438, roomId: 'station.frachthalle' },
      { x: 494, y: 318, roomId: 'station.frachthalle' },
    ],
  },
  {
    id: 'npc:ship:cook',
    frameId: HARBOR_SHIP,
    roomId: 'ship.kajute_nord',
    x: 150,
    y: 210,
    color: '#ffd166',
    waypoints: [
      { x: 160, y: 172, roomId: 'ship.kajute_nord' },
      { x: 165, y: 246, roomId: 'ship.kajute_nord' },
    ],
  },
  {
    id: 'npc:ship:deckhand',
    frameId: HARBOR_SHIP,
    roomId: 'ship.kajute_sued',
    x: 140,
    y: 350,
    color: '#2dd4bf',
    waypoints: [
      { x: 190, y: 325, roomId: 'ship.kajute_sued' },
      { x: 198, y: 200, roomId: 'ship.kajute_nord' },
    ],
  },
];

function ensureLivingCrew(world: World): World {
  let next = world;
  for (const npc of LIVING_CREW) {
    if (next.pawns[npc.id] === undefined) {
      next = spawnPawn(next, {
        id: npc.id,
        owner: npc.id,
        frameId: npc.frameId,
        roomId: npc.roomId,
        x: npc.x,
        y: npc.y,
        color: npc.color,
      });
    }
    next = ensureBot(next, npc.id);
    const sched = next.bots[npc.id];
    if (sched !== undefined) {
      next = {
        ...next,
        bots: { ...next.bots, [npc.id]: { ...sched, waypoints: [...npc.waypoints] } },
      };
    }
  }
  return next;
}

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
    // The crowd mills the halls, never the airlock tube itself: the tube
    // is a walkway, not a lounge.
    const sched = next.bots[npc.id];
    if (sched !== undefined) {
      const waypoints = sched.waypoints.filter(
        (point) => point.roomId !== 'station.andock_a' && point.roomId !== 'station.andock_tube'
      );
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

/** V1 living fixtures against walls with walkways clear:
 * galley counters on the north/east cabin walls, bunks head-to-south-wall,
 * bar on the freight hall north stretch, lockers stacked on the west wall. */
const LIVING_FIXTURES: ReadonlyArray<{
  id: string;
  roomId: string;
  kind: string;
  x: number;
  y: number;
  prompt?: string;
}> = [
  {
    id: 'station.bar_counter',
    roomId: 'station.frachthalle',
    kind: 'bar_counter',
    x: 360,
    y: 310,
    prompt: '[E] Order Drink',
  },
  { id: 'station.stool_a', roomId: 'station.frachthalle', kind: 'stool', x: 350, y: 335 },
  { id: 'station.stool_b', roomId: 'station.frachthalle', kind: 'stool', x: 370, y: 335 },
  { id: 'station.stool_c', roomId: 'station.frachthalle', kind: 'stool', x: 390, y: 335 },
  {
    id: 'station.job_board',
    roomId: 'station.korridor_mitte',
    kind: 'job_board',
    x: 460,
    y: 240,
    prompt: '[E] Browse Contracts',
  },
  {
    id: 'station.vending_wall',
    roomId: 'station.frachthalle',
    kind: 'vending_wall',
    x: 500,
    y: 310,
    prompt: '[E] Vend',
  },
  {
    id: 'station.market_stall',
    roomId: 'station.frachthalle',
    kind: 'market_stall',
    x: 470,
    y: 445,
    prompt: '[E] Trade',
  },
  {
    id: 'station.locker_a',
    roomId: 'station.frachthalle',
    kind: 'personal_locker',
    x: 315,
    y: 300,
    prompt: '[E] Claim Locker',
  },
  {
    id: 'station.locker_b',
    roomId: 'station.frachthalle',
    kind: 'personal_locker',
    x: 315,
    y: 332,
    prompt: '[E] Claim Locker',
  },
  {
    id: 'ship.stove',
    roomId: 'ship.kajute_nord',
    kind: 'stove',
    x: 160,
    y: 145,
    prompt: '[E] Cook',
  },
  {
    id: 'ship.freezer',
    roomId: 'ship.kajute_nord',
    kind: 'freezer',
    x: 206,
    y: 190,
    prompt: '[E] Check Freezer',
  },
  { id: 'ship.sink', roomId: 'ship.kajute_nord', kind: 'sink', x: 110, y: 142 },
  {
    id: 'ship.mess_table',
    roomId: 'ship.kajute_nord',
    kind: 'mess_table',
    x: 165,
    y: 258,
    prompt: '[E] Eat Together',
  },
  {
    id: 'ship.hydro_tray',
    roomId: 'ship.kajute_sued',
    kind: 'hydro_tray',
    x: 200,
    y: 315,
    prompt: '[E] Harvest',
  },
  {
    id: 'ship.recycler',
    roomId: 'ship.kajute_sued',
    kind: 'water_recycler',
    x: 200,
    y: 395,
    prompt: '[E] Recycle Water',
  },
  {
    id: 'ship.bunk_a',
    roomId: 'ship.kajute_sued',
    kind: 'claim_bunk',
    x: 115,
    y: 412,
    prompt: '[E] Claim Bunk',
  },
  {
    id: 'ship.bunk_b',
    roomId: 'ship.kajute_sued',
    kind: 'claim_bunk',
    x: 165,
    y: 412,
    prompt: '[E] Claim Bunk',
  },
  {
    id: 'ship.breaker',
    roomId: 'ship.korridor_schiff',
    kind: 'breaker_box',
    x: 48,
    y: 500,
    prompt: '[E] Reset Breaker',
  },
  {
    id: 'ship.aid',
    roomId: 'ship.bruecke',
    kind: 'aid_cabinet',
    x: 195,
    y: 25,
    prompt: '[E] Bandage',
  },
];

function ensureLivingFixtures(world: World): World {
  let next = world;
  let changed = false;
  for (const spec of LIVING_FIXTURES) {
    if (next.fixtures[spec.id] !== undefined) continue;
    changed = true;
    next = {
      ...next,
      fixtures: {
        ...next.fixtures,
        [spec.id]: {
          id: spec.id,
          roomId: spec.roomId,
          kind: spec.kind,
          pos: { x: spec.x, y: spec.y },
          radius: 24,
          prompt: spec.prompt,
          integrity: 100,
          online: true,
          progress01: 0,
          level01: spec.kind === 'freezer' ? 0.2 : 0,
        },
      },
    };
  }
  return changed ? next : world;
}
