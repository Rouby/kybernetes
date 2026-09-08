/**
 * Intent router: thin mapping from validated ClientIntent to one kernel call.
 * No game math here. Invalid intents are dropped with a metric upstream.
 */

import type { ClientIntent } from '@kybernetes/protocol';
import {
  applyConsume,
  fireWeapon,
  setSleeping,
  setSuitSealed,
  tryToggleDoor,
  type World,
  type WorldInput,
} from '@kybernetes/sim-core';

export interface RouteResult {
  readonly world: World;
  readonly movement: readonly WorldInput[];
  readonly notice?: string;
}

export function routeIntent(
  world: World,
  pawnId: string,
  intent: ClientIntent,
  pending: readonly WorldInput[]
): RouteResult {
  switch (intent.type) {
    case 'INPUT':
      return routeInput(world, pawnId, intent, pending);
    case 'DOOR':
      return routeDoor(world, pawnId, intent, pending);
    case 'SUIT':
      return {
        world: setSuitSealed(world, pawnId, intent.sealed),
        movement: pending,
        notice: 'SUIT_ok',
      };
    case 'CONSUME':
      return { world: applyConsume(world, pawnId), movement: pending, notice: 'CONSUME_ok' };
    case 'SLEEP':
      return {
        world: setSleeping(world, pawnId, intent.active),
        movement: pending,
        notice: 'SLEEP_ok',
      };
    case 'FIRE':
      return routeFire(world, pawnId, intent, pending);
    case 'HELLO':
    case 'JOIN_BEACON':
      return { world, movement: pending, notice: intent.type };
    default:
      return routeAction(world, intent, pending);
  }
}

function routeInput(
  world: World,
  pawnId: string,
  intent: Extract<ClientIntent, { type: 'INPUT' }>,
  pending: readonly WorldInput[]
): RouteResult {
  const movement: WorldInput = {
    pawnId,
    moveX: intent.moveVec.x,
    moveY: intent.moveVec.y,
    sprint: intent.sprint,
    facing: intent.facing,
  };
  const suited = setSuitSealed(world, pawnId, intent.sealed);
  return { world: suited, movement: [...pending, movement] };
}

function pawnInReach(world: World, pawnId: string, portalId: string): boolean {
  const pawn = world.pawns[pawnId];
  const portal = world.portals[portalId];
  if (pawn === undefined || portal === undefined) return true;
  const midX = (portal.segment.x1 + portal.segment.x2) / 2;
  const midY = (portal.segment.y1 + portal.segment.y2) / 2;
  return Math.hypot(pawn.pos.x - midX, pawn.pos.y - midY) <= DOOR_REACH_PX;
}

function routeFire(
  world: World,
  pawnId: string,
  intent: Extract<ClientIntent, { type: 'FIRE' }>,
  pending: readonly WorldInput[]
): RouteResult {
  const fired = fireWeapon(world, pawnId, intent.originAngle, intent.weapon);
  return { world: fired.world, movement: pending, notice: fireNotice(fired.result) };
}

function fireNotice(result: ReturnType<typeof fireWeapon>['result']): string {
  if (result.kind === 'miss') return 'FIRE_miss';
  if (result.kind === 'overheated') return 'FIRE_overheated';
  if (result.kind === 'pawn') return `FIRE_pawn:${result.targetId}`;
  return `FIRE_${result.kind}:${result.portalId}`;
}

const DOOR_REACH_PX = 150;

/** Clearance is 0 until roles land in M5; spec portals require 0. */
function routeDoor(
  world: World,
  pawnId: string,
  intent: Extract<ClientIntent, { type: 'DOOR' }>,
  pending: readonly WorldInput[]
): RouteResult {
  if (!pawnInReach(world, pawnId, intent.portalId)) {
    return { world, movement: pending, notice: 'DOOR_too-far' };
  }
  const result = tryToggleDoor(world, intent.portalId, intent.wantOpen, 0);
  if (!result.ok) return { world, movement: pending, notice: `DOOR_${result.reason}` };
  const portals = { ...world.portals, [result.portal.id]: result.portal };
  return { world: { ...world, portals }, movement: pending, notice: 'DOOR_ok' };
}

function routeAction(
  world: World,
  intent: ClientIntent,
  pending: readonly WorldInput[]
): RouteResult {
  return { world, movement: pending, notice: intent.type };
}
