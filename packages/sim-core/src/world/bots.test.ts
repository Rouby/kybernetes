import { describe, expect, it } from 'vitest';
import { assembleWorld, spawnPawn } from './assemble.js';
import {
  BOT_LINES,
  BOT_STUCK_TICKS,
  botTarget,
  defaultWaypoints,
  ensureBot,
  routeSubTarget,
  tickBots,
} from './bots.js';
import { HesperiaV2Spec } from './content/HesperiaV2.hull.js';
import { tickWorld } from './tickWorld.js';
import type { World } from './types.js';

function shipBotWorld(): World {
  const assembled = assembleWorld([{ frameId: 'ship', hull: HesperiaV2Spec }]);
  const withBot = spawnPawn(assembled, {
    id: 'b1',
    owner: 'npc:ship:engineer',
    frameId: 'ship',
    roomId: 'ship.corridor',
    x: 480,
    y: 360,
    color: '#9fb4c8',
  });
  return ensureBot(withBot, 'b1');
}

describe('bot schedules', () => {
  it('assigns sorted room-center patrols', () => {
    const world = shipBotWorld();
    expect(world.bots.b1?.waypoints.length).toBe(9);
    expect(defaultWaypoints(world, 'void')).toEqual([]);
    const schedule = world.bots.b1;
    if (schedule === undefined) throw new Error('missing schedule');
    expect(botTarget(schedule)).toBeDefined();
  });

  it('ignores unknown pawns and issues one input per active bot', () => {
    const world = shipBotWorld();
    expect(ensureBot(world, 'ghost')).toBe(world);
    expect(tickBots(world).inputs).toHaveLength(1);
  });

  it('steers toward waypoints through the tick', () => {
    const world = shipBotWorld();
    const before = world.pawns.b1?.pos;
    const stepped = tickWorld(world, 0.05, []);
    const after = stepped.pawns.b1?.pos;
    expect(after).toBeDefined();
    if (before === undefined || after === undefined) throw new Error('missing bot');
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(0);
  });

  it('opens shut doors ahead with door discipline', () => {
    let world = shipBotWorld();
    for (let i = 0; i < 400; i += 1) world = tickWorld(world, 0.05, []);
    const opened = Object.values(world.portals).filter((portal) => portal.state === 'open');
    expect(opened.length).toBeGreaterThan(0);
  });

  it('speaks on arrival and falls silent after its line', () => {
    let world = shipBotWorld();
    let said = '';
    for (let i = 0; i < 600; i += 1) {
      world = tickWorld(world, 0.05, []);
      const line = world.pawns.b1?.say ?? '';
      if (line !== '') {
        said = line;
        break;
      }
    }
    expect(BOT_LINES as readonly string[]).toContain(said);
    // Pin the bot mid-dwell so no second arrival can speak: the line expires.
    const bot = world.bots.b1;
    const pawn = world.pawns.b1;
    if (bot === undefined || pawn === undefined) throw new Error('missing bot');
    world = {
      ...world,
      bots: { ...world.bots, b1: { ...bot, waitUntilTick: world.tick + 1000 } },
    };
    for (let i = 0; i < 200; i += 1) world = tickWorld(world, 0.05, []);
    expect(world.pawns.b1?.say ?? 'loud').toBe('');
  });

  it('routes cross-room legs through door midpoints, not bulkheads', () => {
    const world = shipBotWorld();
    const door = routeSubTarget(world, 'ship.bridge', 'ship.corridor');
    expect(door).toBeDefined();
    // Bridge door segment midpoint (160-200 at y:320).
    expect(door?.x).toBeCloseTo(180, 0);
    expect(door?.y).toBeCloseTo(320, 0);
    expect(routeSubTarget(world, 'ship.corridor', 'ship.corridor')).toBeUndefined();
    expect(routeSubTarget(world, 'ship.bridge', 'void.nowhere')).toBeUndefined();
  });

  it('skips a waypoint it cannot make progress toward', () => {
    let world = shipBotWorld();
    // One target behind a sealed door: the bot leans on it with no progress.
    const bot = world.bots.b1;
    const door = world.portals['ship.door_bridge'];
    if (bot === undefined || door === undefined) throw new Error('missing rig');
    world = {
      ...world,
      portals: { ...world.portals, 'ship.door_bridge': { ...door, state: 'sealed' } },
      bots: {
        ...world.bots,
        b1: {
          ...bot,
          waypoints: [{ x: 180, y: 260, roomId: 'ship.bridge' }],
          index: 0,
          waitUntilTick: 0,
        },
      },
    };
    for (let i = 0; i < BOT_STUCK_TICKS + 120; i += 1) world = tickWorld(world, 0.05, []);
    expect(world.bots.b1?.index ?? 0).toBeGreaterThan(0);
  });

  it('dwells on arrival before moving to the next waypoint', () => {
    let world = shipBotWorld();
    let arrivedAt = -1;
    for (let i = 0; i < 600; i += 1) {
      world = tickWorld(world, 0.05, []);
      if ((world.bots.b1?.index ?? 0) > 0) {
        arrivedAt = world.tick;
        break;
      }
    }
    expect(arrivedAt).toBeGreaterThan(0);
    expect(world.bots.b1?.waitUntilTick ?? 0).toBeGreaterThan(arrivedAt);
  });
});
