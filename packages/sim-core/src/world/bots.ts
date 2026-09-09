/**
 * Bots are schedule automatons: waypoint patrols on the portal graph with door
 * discipline (open shut doors ahead, respect cooldowns) and voice lines on
 * arrival. NPC crew and captains get default patrols when hired or staged.
 */

import { isPortalConnecting, nearestPortal, tryToggleDoor } from './doors.js';
import { dockLinkForPortal } from './schedule.js';
import type { WorldInput } from './tickWorld.js';
import type { PawnBody, PortalEdge, Vec2, World } from './types.js';

export interface BotWaypoint {
  readonly x: number;
  readonly y: number;
  readonly roomId: string;
}

export interface BotSchedule {
  readonly pawnId: string;
  readonly waypoints: readonly BotWaypoint[];
  readonly index: number;
  readonly waitUntilTick: number;
  readonly lineIndex: number;
  /** Last spot the bot provably made progress from (stuck detection). */
  readonly lastX: number;
  readonly lastY: number;
  readonly lastProgressTick: number;
}

export const BOT_LINES = [
  'All decks report ready.',
  'Watch rotation steady.',
  'Mind the gauges.',
  'Gauntlet sealed.',
  'Fresh greens from the trays.',
  'Rations hot at the mess.',
] as const;

export const BOT_ARRIVE_RADIUS = 24;
export const BOT_DOOR_RADIUS = 55;
export const BOT_DWELL_TICKS = 40;
export const BOT_SAY_TICKS = 60;

export function defaultWaypoints(world: World, frameId: string): BotWaypoint[] {
  return Object.values(world.rooms)
    .filter((room) => room.frameId === frameId)
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .map((room) => ({
      x: room.rect.x + room.rect.w / 2,
      y: room.rect.y + room.rect.h / 2,
      roomId: room.id,
    }));
}

export function ensureBot(world: World, pawnId: string): World {
  if (world.bots[pawnId] !== undefined) return world;
  const pawn = world.pawns[pawnId];
  if (pawn === undefined) return world;
  const waypoints = defaultWaypoints(world, pawn.frameId);
  if (waypoints.length === 0) return world;
  return {
    ...world,
    bots: {
      ...world.bots,
      [pawnId]: {
        pawnId,
        waypoints,
        index: 0,
        waitUntilTick: 0,
        lineIndex: 0,
        lastX: pawn.pos.x,
        lastY: pawn.pos.y,
        lastProgressTick: world.tick,
      },
    },
  };
}

export function tickBots(world: World): { world: World; inputs: WorldInput[] } {
  let next = world;
  const inputs: WorldInput[] = [];
  for (const bot of Object.values(world.bots)) {
    const stepped = tickBot(next, bot.pawnId);
    next = stepped.world;
    if (stepped.input !== undefined) inputs.push(stepped.input);
  }
  return { world: next, inputs };
}

function tickBot(world: World, pawnId: string): { world: World; input?: WorldInput } {
  const bot = world.bots[pawnId];
  const pawn = world.pawns[pawnId];
  if (bot === undefined || pawn === undefined) return { world };
  const cleared = clearExpiredSay(world, pawnId);
  if (cleared.tick < bot.waitUntilTick) return { world: cleared };
  const unstuck = checkStuck(cleared, bot.pawnId);
  const live = unstuck.world.bots[bot.pawnId];
  if (live === undefined) return { world: unstuck.world };
  // A skipped waypoint dwells briefly so the bot visibly reconsiders.
  if (unstuck.skipped) return { world: unstuck.world };
  return tickBotMoving(unstuck.world, live);
}

function clearExpiredSay(world: World, pawnId: string): World {
  const pawn = world.pawns[pawnId];
  if (pawn === undefined || pawn.say === '' || world.tick <= pawn.sayUntilTick) return world;
  return { ...world, pawns: { ...world.pawns, [pawnId]: { ...pawn, say: '', sayUntilTick: 0 } } };
}

/** Ticks without progress before a bot admits defeat on a waypoint. */
export const BOT_STUCK_TICKS = 60;
/** Drift under this radius in the window reads as wedged on a bulkhead. */
export const BOT_STUCK_PX = 6;

function checkStuck(world: World, pawnId: string): { world: World; skipped: boolean } {
  const bot = world.bots[pawnId];
  const pawn = world.pawns[pawnId];
  if (bot === undefined || pawn === undefined) return { world, skipped: false };
  if (world.tick - bot.lastProgressTick < BOT_STUCK_TICKS) return { world, skipped: false };
  const moved = Math.hypot(pawn.pos.x - bot.lastX, pawn.pos.y - bot.lastY);
  const refreshed: BotSchedule = {
    ...bot,
    lastX: pawn.pos.x,
    lastY: pawn.pos.y,
    lastProgressTick: world.tick,
  };
  if (moved >= BOT_STUCK_PX) {
    return { world: { ...world, bots: { ...world.bots, [pawnId]: refreshed } }, skipped: false };
  }
  const skipped: BotSchedule = {
    ...refreshed,
    index: bot.index + 1,
    waitUntilTick: world.tick + 20,
  };
  return { world: { ...world, bots: { ...world.bots, [pawnId]: skipped } }, skipped: true };
}

/** A portal a bot may walk through: open, connecting, or a door it can open. */
function portalWalkable(portal: PortalEdge): boolean {
  if (portal.kind === 'window') return false;
  if (portal.state === 'sealed') return false;
  if (isPortalConnecting(portal)) return true;
  return portal.kind === 'door' || portal.kind === 'airlock' || portal.kind === 'open';
}

function neighborRooms(world: World, roomId: string): { room: string; via: PortalEdge }[] {
  const out: { room: string; via: PortalEdge }[] = [];
  for (const portal of Object.values(world.portals)) {
    if (!portalWalkable(portal)) continue;
    if (portal.roomA === roomId && portal.roomB !== 'space' && portal.roomB !== 'vacuum') {
      out.push({ room: portal.roomB, via: portal });
    } else if (portal.roomB === roomId) {
      out.push({ room: portal.roomA, via: portal });
    }
  }
  return out;
}

/**
 * Next door midpoint toward the target room over the portal graph, so bots
 * walk through doorways instead of leaning on the bulkhead between rooms.
 * Returns undefined when already there, unreachable, or unknown rooms.
 */
export function routeSubTarget(
  world: World,
  fromRoom: string,
  targetRoom: string
): { x: number; y: number } | undefined {
  if (fromRoom === targetRoom) return undefined;
  if (world.rooms[fromRoom] === undefined || world.rooms[targetRoom] === undefined) {
    return undefined;
  }
  const prev = new Map<string, { room: string; via: PortalEdge }>();
  const seen = new Set<string>([fromRoom]);
  const queue = [fromRoom];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    if (current === targetRoom) break;
    for (const edge of neighborRooms(world, current)) {
      if (seen.has(edge.room)) continue;
      seen.add(edge.room);
      prev.set(edge.room, { room: current, via: edge.via });
      queue.push(edge.room);
    }
  }
  if (!seen.has(targetRoom)) return undefined;
  let hop = targetRoom;
  let via: PortalEdge | undefined;
  while (hop !== fromRoom) {
    const step = prev.get(hop);
    if (step === undefined) return undefined;
    via = step.via;
    hop = step.room;
  }
  if (via === undefined) return undefined;
  return { x: (via.segment.x1 + via.segment.x2) / 2, y: (via.segment.y1 + via.segment.y2) / 2 };
}

function subTargetFor(
  world: World,
  pawn: PawnBody,
  target: BotWaypoint
): { x: number; y: number; isFinal: boolean } {
  if (pawn.roomHint !== target.roomId) {
    const door = routeSubTarget(world, pawn.roomHint, target.roomId);
    if (door !== undefined) return { ...door, isFinal: false };
  }
  return { x: target.x, y: target.y, isFinal: true };
}

function tickBotMoving(world: World, bot: BotSchedule): { world: World; input?: WorldInput } {
  const pawn = world.pawns[bot.pawnId];
  const target = bot.waypoints[bot.index % Math.max(bot.waypoints.length, 1)];
  if (pawn === undefined || target === undefined) return { world };
  const goal = subTargetFor(world, pawn, target);
  const dx = goal.x - pawn.pos.x;
  const dy = goal.y - pawn.pos.y;
  if (goal.isFinal && Math.hypot(dx, dy) < BOT_ARRIVE_RADIUS) return arriveWaypoint(world, bot);
  const opened = openDoorAhead(world, bot.pawnId);
  const len = Math.hypot(dx, dy) || 1;
  return {
    world: opened,
    input: {
      pawnId: bot.pawnId,
      moveX: dx / len,
      moveY: dy / len,
      sprint: false,
      facing: Math.atan2(dy, dx),
    },
  };
}

function arriveWaypoint(world: World, bot: BotSchedule): { world: World; input?: WorldInput } {
  const pawn = world.pawns[bot.pawnId];
  const line = BOT_LINES[bot.lineIndex % BOT_LINES.length] as string;
  const bots = {
    ...world.bots,
    [bot.pawnId]: {
      ...bot,
      index: bot.index + 1,
      waitUntilTick: world.tick + BOT_DWELL_TICKS,
      lineIndex: bot.lineIndex + 1,
    },
  };
  if (pawn === undefined) return { world: { ...world, bots } };
  const pawns = {
    ...world.pawns,
    [bot.pawnId]: { ...pawn, say: line, sayUntilTick: world.tick + BOT_SAY_TICKS },
  };
  return { world: { ...world, bots, pawns } };
}

function openDoorAhead(world: World, pawnId: string): World {
  const near = nearestPortal(world, pawnId, BOT_DOOR_RADIUS);
  if (near === undefined || near.state === 'open' || near.state === 'destroyed') return world;
  if (near.kind === 'window') return world;
  // Dock gates belong to the approach cycle; the walkable exception covers
  // bots, and toggling a leaf open would vent the frame to vacuum.
  if (dockLinkForPortal(world, near.id) !== undefined) return world;
  const result = tryToggleDoor(world, near.id, true, 0);
  if (!result.ok) return world;
  return { ...world, portals: { ...world.portals, [near.id]: result.portal } };
}

export function botTarget(bot: BotSchedule): Vec2 | undefined {
  return bot.waypoints[bot.index % Math.max(bot.waypoints.length, 1)];
}
