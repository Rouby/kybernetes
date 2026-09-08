/**
 * Bots are schedule automatons: waypoint patrols on the portal graph with door
 * discipline (open shut doors ahead, respect cooldowns) and voice lines on
 * arrival. NPC crew and captains get default patrols when hired or staged.
 */

import { nearestPortal, tryToggleDoor } from './doors.js';
import type { WorldInput } from './tickWorld.js';
import type { Vec2, World } from './types.js';

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
}

export const BOT_LINES = [
  'All decks report ready.',
  'Watch rotation steady.',
  'Mind the gauges.',
  'Gauntlet sealed.',
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
      [pawnId]: { pawnId, waypoints, index: 0, waitUntilTick: 0, lineIndex: 0 },
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
  return tickBotMoving(cleared, bot);
}

function clearExpiredSay(world: World, pawnId: string): World {
  const pawn = world.pawns[pawnId];
  if (pawn === undefined || pawn.say === '' || world.tick <= pawn.sayUntilTick) return world;
  return { ...world, pawns: { ...world.pawns, [pawnId]: { ...pawn, say: '', sayUntilTick: 0 } } };
}

function tickBotMoving(world: World, bot: BotSchedule): { world: World; input?: WorldInput } {
  const pawn = world.pawns[bot.pawnId];
  const target = bot.waypoints[bot.index % Math.max(bot.waypoints.length, 1)];
  if (pawn === undefined || target === undefined) return { world };
  const dx = target.x - pawn.pos.x;
  const dy = target.y - pawn.pos.y;
  if (Math.hypot(dx, dy) < BOT_ARRIVE_RADIUS) return arriveWaypoint(world, bot);
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
  const result = tryToggleDoor(world, near.id, true, 0);
  if (!result.ok) return world;
  return { ...world, portals: { ...world.portals, [near.id]: result.portal } };
}

export function botTarget(bot: BotSchedule): Vec2 | undefined {
  return bot.waypoints[bot.index % Math.max(bot.waypoints.length, 1)];
}
