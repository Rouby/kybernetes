/**
 * Intent router: thin mapping from validated ClientIntent to one kernel call.
 * No game math here. Invalid intents are dropped with a metric upstream.
 */

import type { ClientIntent } from '@kybernetes/protocol';
import {
  applyConsume,
  cancelVoyage,
  carriedCrateOf,
  claimFixture,
  dockLinkForPortal,
  dropCrate,
  engineDemandMw,
  ensureShipSystems,
  fireWeapon,
  fixtureOnline,
  hailRescueVoyage,
  harvestTray,
  isCarrying,
  pickupCrate,
  plotChartVoyage,
  plotVoyage,
  reactorOutputMw,
  repackCargo,
  repairFixture,
  restartShipReactor,
  runRecycle,
  setSleeping,
  setSuitSealed,
  startCook,
  startReload,
  tryToggleDoor,
  tuneShipEngine,
  tuneShipReactor,
  unpackCrates,
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
      return {
        world: applyConsume(world, pawnId, intent.itemId),
        movement: pending,
        notice: 'CONSUME_ok',
      };
    case 'SLEEP':
      return {
        world: setSleeping(world, pawnId, intent.active),
        movement: pending,
        notice: 'SLEEP_ok',
      };
    case 'FIRE':
      return routeFire(world, pawnId, intent, pending);
    case 'RELOAD':
      return routeReload(world, pawnId, pending);
    case 'CLAIM':
      return routeClaim(world, pawnId, intent, pending);
    case 'VEND':
      return routeVend(world, pawnId, intent, pending);
    case 'COOK':
      return routeCook(world, pawnId, intent, pending);
    case 'HARVEST':
      return routeHarvest(world, pawnId, intent, pending);
    case 'RECYCLE':
      return routeRecycle(world, pawnId, intent, pending);
    case 'REPAIR':
      return routeRepair(world, pawnId, intent, pending);
    case 'INTERACT':
      return routeInteract(world, pawnId, intent, pending);
    case 'HELLO':
    case 'JOIN_BEACON':
      return { world, movement: pending, notice: intent.type };
    default: {
      const shipped = routeShipIntent(world, pawnId, intent, pending);
      if (shipped !== undefined) return shipped;
      return routeAction(world, intent, pending);
    }
  }
}

/** Solo-ship console intents (M2 reactor/engine, M3 nav). Thin map, no math. */
function routeShipIntent(
  world: World,
  pawnId: string,
  intent: ClientIntent,
  pending: readonly WorldInput[]
): RouteResult | undefined {
  switch (intent.type) {
    case 'REACTOR_TUNE':
      return routeReactorTune(world, pawnId, intent, pending);
    case 'REACTOR_RESTART':
      return routeReactorRestart(world, pawnId, pending);
    case 'ENGINE_TUNE':
      return routeEngineTune(world, pawnId, intent, pending);
    case 'NAV_PLOT':
      return routeNavPlot(world, pawnId, intent, pending);
    case 'NAV_CANCEL':
      return routeNavCancel(world, pawnId, pending);
    case 'HAIL':
      return routeHail(world, pawnId, pending);
    default:
      return routeCargoIntent(world, pawnId, intent, pending);
  }
}

/** Physical-crate intents (M4 floor model). Thin map, no math. */
function routeCargoIntent(
  world: World,
  pawnId: string,
  intent: ClientIntent,
  pending: readonly WorldInput[]
): RouteResult | undefined {
  switch (intent.type) {
    case 'CARGO_PICKUP':
      return routeCargoPickup(world, pawnId, intent, pending);
    case 'CARGO_DROP':
      return routeCargoDrop(world, pawnId, pending);
    case 'CARGO_UNPACK':
      return routeCargoUnpack(world, pawnId, intent, pending);
    case 'CARGO_REPACK':
      return routeCargoRepack(world, pawnId, intent, pending);
    default:
      return undefined;
  }
}

/** Hands-full: carriers must set the crate down before any fixture console. */
function denyHandsFull(
  world: World,
  pawnId: string,
  verb: string,
  pending: readonly WorldInput[]
): RouteResult | undefined {
  if (!isCarrying(world.cargo, pawnId)) return undefined;
  return { world, movement: pending, notice: `${verb}_hands-full` };
}

function dropWhereFor(world: World, frameId: string): 'bayFloor' | 'shipFloor' {
  return world.vessels[frameId] === undefined ? 'bayFloor' : 'shipFloor';
}

function fixturePointsOn(world: World, frameId: string): readonly { x: number; y: number }[] {
  return Object.values(world.fixtures)
    .filter((fix) => fix.roomId.startsWith(`${frameId}.`))
    .map((fix) => ({ x: fix.pos.x, y: fix.pos.y }));
}

function routeCargoPickup(
  world: World,
  pawnId: string,
  intent: Extract<ClientIntent, { type: 'CARGO_PICKUP' }>,
  pending: readonly WorldInput[]
): RouteResult {
  const pawn = world.pawns[pawnId];
  if (pawn === undefined) return { world, movement: pending, notice: 'CARGO_no-pawn' };
  const result = pickupCrate(
    world.cargo,
    intent.crateId,
    pawnId,
    pawn.frameId,
    pawn.pos,
    pawn.facing
  );
  if (!result.ok) return { world, movement: pending, notice: `CARGO_${result.reason}` };
  return { world: { ...world, cargo: result.hold }, movement: pending, notice: 'CARGO_ok' };
}

function routeCargoDrop(world: World, pawnId: string, pending: readonly WorldInput[]): RouteResult {
  const pawn = world.pawns[pawnId];
  if (pawn === undefined) return { world, movement: pending, notice: 'CARGO_no-pawn' };
  const carried = carriedCrateOf(world.cargo, pawnId);
  if (carried === undefined) {
    return { world, movement: pending, notice: 'CARGO_not-carrying' };
  }
  const result = dropCrate(
    world.cargo,
    pawnId,
    pawn.frameId,
    carried.x,
    carried.y,
    dropWhereFor(world, pawn.frameId),
    fixturePointsOn(world, pawn.frameId),
    pawn.facing
  );
  if (!result.ok) return { world, movement: pending, notice: `CARGO_${result.reason}` };
  return { world: { ...world, cargo: result.hold }, movement: pending, notice: 'CARGO_ok' };
}

function routeCargoUnpack(
  world: World,
  pawnId: string,
  intent: Extract<ClientIntent, { type: 'CARGO_UNPACK' }>,
  pending: readonly WorldInput[]
): RouteResult {
  const pawn = world.pawns[pawnId];
  if (pawn === undefined) return { world, movement: pending, notice: 'CARGO_no-pawn' };
  if (world.vessels[pawn.frameId] === undefined) {
    return { world, movement: pending, notice: 'CARGO_wrong-frame' };
  }
  const result = unpackCrates(world.cargo, pawn.frameId, pawn.frameId, intent.crateIds);
  if (!result.ok) return { world, movement: pending, notice: `CARGO_${result.reason}` };
  return { world: { ...world, cargo: result.hold }, movement: pending, notice: 'CARGO_ok' };
}

function routeCargoRepack(
  world: World,
  pawnId: string,
  intent: Extract<ClientIntent, { type: 'CARGO_REPACK' }>,
  pending: readonly WorldInput[]
): RouteResult {
  const pawn = world.pawns[pawnId];
  if (pawn === undefined) return { world, movement: pending, notice: 'CARGO_no-pawn' };
  if (world.vessels[pawn.frameId] === undefined) {
    return { world, movement: pending, notice: 'CARGO_wrong-frame' };
  }
  const crateId = `crate:${pawn.frameId}:${world.tick}:${Object.keys(world.cargo.crates).length}`;
  const items = intent.items.map((item) => ({ goodId: item.goodId, qty: item.qty }));
  const result = repackCargo(world.cargo, pawn.frameId, pawn.frameId, items, {
    id: crateId,
    frameId: pawn.frameId,
    x: pawn.pos.x,
    y: pawn.pos.y,
  });
  if (!result.ok) return { world, movement: pending, notice: `CARGO_${result.reason}` };
  return { world: { ...world, cargo: result.hold }, movement: pending, notice: 'CARGO_ok' };
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
  if (result.kind === 'empty') return 'FIRE_empty';
  if (result.kind === 'down') return 'FIRE_down';
  return `FIRE_fired:${result.projectileId}`;
}

function routeReload(world: World, pawnId: string, pending: readonly WorldInput[]): RouteResult {
  const reloaded = startReload(world, pawnId);
  return { world: reloaded.world, movement: pending, notice: `RELOAD_${reloaded.result}` };
}

const FIXTURE_REACH_PX = 150;

function pawnNearFixture(world: World, pawnId: string, fixtureId: string): boolean {
  const pawn = world.pawns[pawnId];
  const fix = world.fixtures[fixtureId];
  if (pawn === undefined || fix === undefined) return false;
  const dot = fix.roomId.indexOf('.');
  const fixtureFrame = dot < 0 ? '' : fix.roomId.slice(0, dot);
  if (fixtureFrame !== pawn.frameId) return false;
  return Math.hypot(pawn.pos.x - fix.pos.x, pawn.pos.y - fix.pos.y) <= FIXTURE_REACH_PX;
}

function needReach(
  world: World,
  pawnId: string,
  fixtureId: string,
  pending: readonly WorldInput[],
  verb: string
): RouteResult | undefined {
  if (world.pawns[pawnId] === undefined)
    return { world, movement: pending, notice: `${verb}_no-pawn` };
  const hands = denyHandsFull(world, pawnId, verb, pending);
  if (hands !== undefined) return hands;
  if (world.fixtures[fixtureId] === undefined)
    return { world, movement: pending, notice: `${verb}_unknown` };
  if (!pawnNearFixture(world, pawnId, fixtureId))
    return { world, movement: pending, notice: `${verb}_too-far` };
  return undefined;
}

/**
 * Console gate for the M2 tune intents: the pawn must stand at a
 * same-frame console of the right kind. Consoles stay usable through
 * blackouts on purpose — the restart drill is the recovery path.
 */
function consoleGate(
  world: World,
  pawnId: string,
  kind: 'reactor_console' | 'engine_console' | 'nav_console',
  verb: string,
  pending: readonly WorldInput[]
): { vesselId: string } | RouteResult {
  const pawn = world.pawns[pawnId];
  if (pawn === undefined) return { world, movement: pending, notice: `${verb}_no-pawn` };
  const hands = denyHandsFull(world, pawnId, verb, pending);
  if (hands !== undefined) return hands;
  if (world.vessels[pawn.frameId] === undefined) {
    return { world, movement: pending, notice: `${verb}_too-far` };
  }
  const reached = Object.values(world.fixtures).some(
    (fix) => fix.kind === kind && pawnNearFixture(world, pawnId, fix.id)
  );
  if (!reached) return { world, movement: pending, notice: `${verb}_too-far` };
  return { vesselId: pawn.frameId };
}

function routeReactorTune(
  world: World,
  pawnId: string,
  intent: Extract<ClientIntent, { type: 'REACTOR_TUNE' }>,
  pending: readonly WorldInput[]
): RouteResult {
  const gate = consoleGate(world, pawnId, 'reactor_console', 'REACTOR', pending);
  if (!('vesselId' in gate)) return gate;
  const ensured = ensureShipSystems(world, gate.vesselId);
  const next = tuneShipReactor(ensured, gate.vesselId, intent.rodsDelta, intent.coolantDelta);
  return { world: next, movement: pending, notice: 'REACTOR_ok' };
}

function routeReactorRestart(
  world: World,
  pawnId: string,
  pending: readonly WorldInput[]
): RouteResult {
  const gate = consoleGate(world, pawnId, 'reactor_console', 'REACTOR', pending);
  if (!('vesselId' in gate)) return gate;
  const ensured = ensureShipSystems(world, gate.vesselId);
  return {
    world: restartShipReactor(ensured, gate.vesselId),
    movement: pending,
    notice: 'REACTOR_ok',
  };
}

function routeEngineTune(
  world: World,
  pawnId: string,
  intent: Extract<ClientIntent, { type: 'ENGINE_TUNE' }>,
  pending: readonly WorldInput[]
): RouteResult {
  const gate = engineTuneGate(world, pawnId, intent, pending);
  if (!('vesselId' in gate)) return gate;
  const ensured = ensureShipSystems(world, gate.vesselId);
  const next = tuneShipEngine(ensured, gate.vesselId, intent.spoolCmd, intent.tuneSet);
  return { world: next, movement: pending, notice: 'ENGINE_ok' };
}

function engineTuneGate(
  world: World,
  pawnId: string,
  intent: Extract<ClientIntent, { type: 'ENGINE_TUNE' }>,
  pending: readonly WorldInput[]
): { vesselId: string } | RouteResult {
  const engine = consoleGate(world, pawnId, 'engine_console', 'ENGINE', pending);
  if ('vesselId' in engine) return engine;
  if (intent.tuneSet !== undefined) return engine;
  return consoleGate(world, pawnId, 'nav_console', 'ENGINE', pending);
}

function routeNavPlot(
  world: World,
  pawnId: string,
  intent: Extract<ClientIntent, { type: 'NAV_PLOT' }>,
  pending: readonly WorldInput[]
): RouteResult {
  const gate = consoleGate(world, pawnId, 'nav_console', 'NAV', pending);
  if (!('vesselId' in gate)) return gate;
  const ensured = ensureShipSystems(world, gate.vesselId);
  const systems = ensured.ships[gate.vesselId];
  if (systems === undefined) return { world: ensured, movement: pending, notice: 'NAV_denied' };
  const output = systems.reactor.scrammed
    ? 0
    : reactorOutputMw(systems.reactor, systems.reactorTier);
  const checks = {
    hot: systems.reactor.hot && !systems.reactor.scrammed,
    powered: output >= engineDemandMw(systems.engine.spool),
    engineFuel: systems.engineFuel,
  };
  const thrust = intent.thrust01 ?? 1;
  // Empty waypoints take the legacy path so stale clients see identical notices.
  const plotted =
    intent.waypointIds.length === 0
      ? plotVoyage(ensured, gate.vesselId, intent.destHubId, checks, thrust)
      : plotChartVoyage(
          ensured,
          gate.vesselId,
          [...intent.waypointIds, intent.destHubId],
          checks,
          thrust
        );
  if (plotted.reject !== undefined) {
    return { world: plotted.world, movement: pending, notice: `NAV_${plotted.reject}` };
  }
  return { world: plotted.world, movement: pending, notice: 'NAV_ok' };
}

function routeHail(world: World, pawnId: string, pending: readonly WorldInput[]): RouteResult {
  const gate = consoleGate(world, pawnId, 'nav_console', 'HAIL', pending);
  if (!('vesselId' in gate)) return gate;
  const ensured = ensureShipSystems(world, gate.vesselId);
  const before = ensured.ships[gate.vesselId]?.nav.hailS ?? 0;
  const next = hailRescueVoyage(ensured, gate.vesselId);
  const after = next.ships[gate.vesselId]?.nav.hailS ?? 0;
  if (after <= before) {
    return { world: next, movement: pending, notice: 'HAIL_denied' };
  }
  return { world: next, movement: pending, notice: 'HAIL_ok' };
}

function routeNavCancel(world: World, pawnId: string, pending: readonly WorldInput[]): RouteResult {
  const gate = consoleGate(world, pawnId, 'nav_console', 'NAV', pending);
  if (!('vesselId' in gate)) return gate;
  const ensured = ensureShipSystems(world, gate.vesselId);
  const before = ensured.ships[gate.vesselId]?.nav.phase;
  const next = cancelVoyage(ensured, gate.vesselId);
  const after = next.ships[gate.vesselId]?.nav.phase;
  if (before !== 'spooling' || after !== 'docked') {
    return { world: next, movement: pending, notice: 'NAV_denied' };
  }
  return { world: next, movement: pending, notice: 'NAV_ok' };
}

function routeClaim(
  world: World,
  pawnId: string,
  intent: Extract<ClientIntent, { type: 'CLAIM' }>,
  pending: readonly WorldInput[]
): RouteResult {
  const gated = needReach(world, pawnId, intent.fixtureId, pending, 'CLAIM');
  if (gated !== undefined) return gated;
  const before = world.fixtures[intent.fixtureId]?.claimedBy;
  const next = claimFixture(world, intent.fixtureId, pawnId);
  const after = next.fixtures[intent.fixtureId]?.claimedBy;
  if (before !== undefined && before !== pawnId)
    return { world, movement: pending, notice: 'CLAIM_taken' };
  if (after !== pawnId) return { world, movement: pending, notice: 'CLAIM_denied' };
  return { world: next, movement: pending, notice: 'CLAIM_ok' };
}

function routeVend(
  world: World,
  pawnId: string,
  intent: Extract<ClientIntent, { type: 'VEND' }>,
  pending: readonly WorldInput[]
): RouteResult {
  const gated = needReach(world, pawnId, intent.fixtureId, pending, 'VEND');
  if (gated !== undefined) return gated;
  const fix = world.fixtures[intent.fixtureId];
  if (fix === undefined || fix.kind !== 'vending_wall')
    return { world, movement: pending, notice: 'VEND_denied' };
  if (!fixtureOnline(fix)) return { world, movement: pending, notice: 'VEND_offline' };
  if (!isVendable(intent.vendId)) return { world, movement: pending, notice: 'VEND_denied' };
  return routeVendItem(world, pawnId, intent, pending);
}

function isVendable(vendId: string): boolean {
  return vendId === 'ration_tin' || vendId === 'recycled_water' || vendId === 'suit_patch';
}

function routeVendItem(
  world: World,
  pawnId: string,
  intent: Extract<ClientIntent, { type: 'VEND' }>,
  pending: readonly WorldInput[]
): RouteResult {
  if (intent.vendId === 'suit_patch') return routeSuitPatch(world, pawnId, pending);
  const itemId = intent.vendId === 'ration_tin' ? 'ration_tin' : 'recycled_water';
  return { world: applyConsume(world, pawnId, itemId), movement: pending, notice: 'VEND_ok' };
}

function routeSuitPatch(world: World, pawnId: string, pending: readonly WorldInput[]): RouteResult {
  const vitals = world.vitals[pawnId];
  if (vitals === undefined) return { world, movement: pending, notice: 'VEND_no-pawn' };
  const integrity = Math.min(100, vitals.suitIntegrity + 25);
  return {
    world: {
      ...world,
      vitals: { ...world.vitals, [pawnId]: { ...vitals, suitIntegrity: integrity } },
    },
    movement: pending,
    notice: 'VEND_ok',
  };
}

function routeCook(
  world: World,
  pawnId: string,
  intent: Extract<ClientIntent, { type: 'COOK' }>,
  pending: readonly WorldInput[]
): RouteResult {
  const gated = needReach(world, pawnId, intent.stoveId, pending, 'COOK');
  if (gated !== undefined) return gated;
  const fix = world.fixtures[intent.stoveId];
  if (fix === undefined || fix.kind !== 'stove')
    return { world, movement: pending, notice: 'COOK_denied' };
  if (!fixtureOnline(fix)) return { world, movement: pending, notice: 'COOK_offline' };
  const next = startCook(world, intent.stoveId);
  if (next.fixtures[intent.stoveId]?.progress01 === fix.progress01)
    return { world, movement: pending, notice: 'COOK_busy' };
  return { world: next, movement: pending, notice: 'COOK_ok' };
}

function routeHarvest(
  world: World,
  pawnId: string,
  intent: Extract<ClientIntent, { type: 'HARVEST' }>,
  pending: readonly WorldInput[]
): RouteResult {
  const gated = needReach(world, pawnId, intent.trayId, pending, 'HARVEST');
  if (gated !== undefined) return gated;
  const fix = world.fixtures[intent.trayId];
  if (fix === undefined || fix.kind !== 'hydro_tray')
    return { world, movement: pending, notice: 'HARVEST_denied' };
  if (!fixtureOnline(fix)) return { world, movement: pending, notice: 'HARVEST_offline' };
  const before = fix.progress01 ?? 0;
  const next = harvestTray(world, intent.trayId);
  if (stillGrowing(next.fixtures, intent.trayId, before))
    return { world, movement: pending, notice: 'HARVEST_growing' };
  return { world: next, movement: pending, notice: 'HARVEST_ok' };
}

function stillGrowing(fixtures: World['fixtures'], trayId: string, before: number): boolean {
  return (fixtures[trayId]?.progress01 ?? 0) >= before && before < 1;
}

function routeRecycle(
  world: World,
  pawnId: string,
  intent: Extract<ClientIntent, { type: 'RECYCLE' }>,
  pending: readonly WorldInput[]
): RouteResult {
  const gated = needReach(world, pawnId, intent.recyclerId, pending, 'RECYCLE');
  if (gated !== undefined) return gated;
  const fix = world.fixtures[intent.recyclerId];
  if (fix === undefined || fix.kind !== 'water_recycler')
    return { world, movement: pending, notice: 'RECYCLE_denied' };
  if (!fixtureOnline(fix)) return { world, movement: pending, notice: 'RECYCLE_offline' };
  const next = runRecycle(world, intent.recyclerId);
  if (next === world) return { world, movement: pending, notice: 'RECYCLE_busy' };
  return { world: next, movement: pending, notice: 'RECYCLE_ok' };
}

function routeRepair(
  world: World,
  pawnId: string,
  intent: Extract<ClientIntent, { type: 'REPAIR' }>,
  pending: readonly WorldInput[]
): RouteResult {
  const gated = needReach(world, pawnId, intent.fixtureId, pending, 'REPAIR');
  if (gated !== undefined) return gated;
  const fix = world.fixtures[intent.fixtureId];
  if (fix === undefined) return { world, movement: pending, notice: 'REPAIR_unknown' };
  if ((fix.integrity ?? 100) >= 100) return { world, movement: pending, notice: 'REPAIR_full' };
  return { world: repairFixture(world, intent.fixtureId), movement: pending, notice: 'REPAIR_ok' };
}

function routeInteract(
  world: World,
  pawnId: string,
  intent: Extract<ClientIntent, { type: 'INTERACT' }>,
  pending: readonly WorldInput[]
): RouteResult {
  const hands = denyHandsFull(world, pawnId, 'INTERACT', pending);
  if (hands !== undefined) return hands;
  const fix = world.fixtures[intent.fixtureId];
  if (fix === undefined) return { world, movement: pending, notice: 'INTERACT_unknown' };
  if (!pawnNearFixture(world, pawnId, intent.fixtureId))
    return { world, movement: pending, notice: 'INTERACT_too-far' };
  if (!fixtureOnline(fix)) return { world, movement: pending, notice: 'INTERACT_offline' };
  if (fix.kind === 'aid_cabinet') return routeAid(world, pawnId, pending);
  if (fix.kind === 'sink') return routeSink(world, pawnId, pending);
  if (fix.kind === 'mess_table')
    return {
      world: applyConsume(world, pawnId, 'hot_meal'),
      movement: pending,
      notice: 'INTERACT_ate',
    };
  return { world, movement: pending, notice: 'INTERACT_ok' };
}

function routeAid(world: World, pawnId: string, pending: readonly WorldInput[]): RouteResult {
  const pawn = world.pawns[pawnId];
  if (pawn === undefined) return { world, movement: pending, notice: 'INTERACT_no-pawn' };
  const hp = Math.min(pawn.health.maxHp, pawn.health.hp + 20);
  return {
    world: {
      ...world,
      pawns: { ...world.pawns, [pawnId]: { ...pawn, health: { ...pawn.health, hp } } },
    },
    movement: pending,
    notice: 'INTERACT_aided',
  };
}

function routeSink(world: World, pawnId: string, pending: readonly WorldInput[]): RouteResult {
  return {
    world: applyConsume(world, pawnId, 'recycled_water'),
    movement: pending,
    notice: 'INTERACT_drank',
  };
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
  // Dock gates belong to the approach cycle for the whole voyage: hands
  // off, or the corridor vents through the open leaf while the hull is gone.
  if (dockLinkForPortal(world, intent.portalId) !== undefined) {
    return { world, movement: pending, notice: 'DOOR_dock-cycle' };
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
