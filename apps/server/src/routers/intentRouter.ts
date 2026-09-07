/**
 * Intent router: thin mapping from validated ClientIntent to one kernel call.
 * No game math here. Invalid intents are dropped with a metric upstream.
 */

import type { ClientIntent } from '@kybernetes/protocol';
import type { World, WorldInput } from '@kybernetes/sim-core';

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
  };
  return { world, movement: [...pending, movement] };
}

function routeAction(
  world: World,
  intent: ClientIntent,
  pending: readonly WorldInput[]
): RouteResult {
  return { world, movement: pending, notice: intent.type };
}
