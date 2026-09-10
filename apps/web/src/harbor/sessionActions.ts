/**
 * Session actions: keyboard intents behind the pause/death gate. Pure and
 * pinned by Vitest; the vanilla ActionRouter owns the window listeners.
 */

import type {
  ClientIntent,
  FixtureKind,
  HireOfferBroadcast,
  Role,
  SnapshotBroadcast,
} from '@kybernetes/protocol';
import type { World } from '@kybernetes/sim-core';
import { ShipAudioEngine } from '../audio/ShipAudioEngine';
import {
  doorSpotsOf,
  type InteractTarget,
  selectInteractTarget,
  sightBlockers,
  targetIntent,
} from './interactTarget';

type SendIntent = (intent: ClientIntent) => void;
type Snapshot = SnapshotBroadcast | null;
type Offer = HireOfferBroadcast | null;

export type GameplayAction =
  | 'use'
  | 'talk'
  | 'hire'
  | 'seal'
  | 'fire'
  | 'reload'
  | 'cargo'
  | 'drop'
  | 'unpack';

export type ConsoleKind = 'reactor_console' | 'engine_console' | 'nav_console' | 'cargo';

/** Fixture kinds that open a console panel instead of firing a one-shot intent. */
export function consoleKindOf(target: InteractTarget | null): ConsoleKind | null {
  if (target === null || target.kind !== 'fixture') return null;
  return consoleKindOfFixture(target.contact.kind);
}

function consoleKindOfFixture(kind: FixtureKind): ConsoleKind | null {
  if (kind === 'reactor_console' || kind === 'engine_console' || kind === 'nav_console')
    return kind;
  return null;
}

export function actionKeyFor(key: string, hasOffer: boolean): GameplayAction | null {
  if (key === 'e') return 'use';
  if (key === 'h') return 'talk';
  if (key === 'j') return hasOffer ? 'hire' : null;
  if (key === 't') return 'seal';
  if (key === 'f') return 'fire';
  if (key === 'r') return 'reload';
  if (key === 'c') return 'cargo';
  if (key === 'g') return 'drop';
  if (key === 'u') return 'unpack';
  return null;
}

interface DispatchContext {
  readonly sendIntent: SendIntent;
  readonly statics: World;
  readonly snapshot: Snapshot;
  readonly pawnId: string | null;
  readonly offer: Offer;
  readonly toggleSeal: () => void;
  readonly targetRef: { current: InteractTarget | null };
  readonly facing: number;
  readonly pressFireStart: () => void;
  readonly onConsole: (kind: ConsoleKind) => void;
}

function _dispatchAction(action: GameplayAction | null, ctx: DispatchContext): void {
  if (action === 'use')
    pressUse(
      ctx.sendIntent,
      ctx.statics,
      ctx.snapshot,
      ctx.pawnId,
      ctx.targetRef,
      ctx.facing,
      ctx.onConsole
    );
  else if (action === 'talk') pressTalk(ctx.sendIntent, ctx.snapshot);
  else if (action === 'hire') pressHireFromOffer(ctx.sendIntent, ctx.offer);
  else if (action === 'seal') ctx.toggleSeal();
  else if (action === 'fire') ctx.pressFireStart();
  else if (action === 'reload') pressReload(ctx.sendIntent);
}

function pressHireFromOffer(sendIntent: SendIntent, offer: Offer): void {
  const job = offer?.jobs[0];
  if (job === undefined) return;
  const offerId = offer?.offerId;
  if (offerId === undefined) return;
  pressHire(sendIntent, offerId, job);
}

function pressReload(sendIntent: SendIntent): void {
  sendIntent({ type: 'RELOAD', seq: 0 });
  ShipAudioEngine.getInstance().playUiClick();
}

/** [E]: uses the viewport's shared target (prompt and action agree); falls back
 * to a cursor-less resolve on the very first frames before the loop runs. */
function pressUse(
  sendIntent: SendIntent,
  statics: World,
  snapshot: Snapshot,
  pawnId: string | null,
  targetRef: { current: InteractTarget | null },
  facing: number,
  onConsole: (kind: ConsoleKind) => void
): void {
  if (snapshot === null || pawnId === null) return;
  const pawn = snapshot.pawns.find((entry) => entry.id === pawnId);
  if (pawn === undefined) return;
  const at = { x: pawn.x, y: pawn.y };
  const target = targetRef.current ?? resolveUseTarget(statics, snapshot, pawn.frameId, at, facing);
  if (target === null) return;
  const console = consoleKindOf(target);
  if (console !== null) {
    onConsole(console);
    ShipAudioEngine.getInstance().playUiClick();
    return;
  }
  sendUseIntent(sendIntent, target, at);
}

function resolveUseTarget(
  statics: World,
  snapshot: NonNullable<Snapshot>,
  frameId: string,
  at: { x: number; y: number },
  facing: number
): InteractTarget | null {
  return selectInteractTarget({
    fixtures: snapshot.fixtures,
    doors: doorSpotsOf(statics, frameId),
    openById: new Map(snapshot.portals.map((portal) => [portal.id, portal.open] as const)),
    frameId,
    at,
    facing,
    blockers: sightBlockers(statics, frameId, snapshot.portals),
    crates: (snapshot.crates ?? [])
      .filter((crate) => crate.where !== 'carriedBy')
      .map((crate) => ({ id: crate.id, x: crate.x, y: crate.y, frameId: crate.frameId })),
  });
}

function sendUseIntent(
  sendIntent: SendIntent,
  target: InteractTarget,
  at: { x: number; y: number }
): void {
  const intent = targetIntent(target);
  sendIntent(intent);
  if (target.kind === 'door') {
    ShipAudioEngine.getInstance().playDoorToggle(at.x, at.y, !target.open);
  } else {
    playUseSound(intent.type, at);
  }
}

function playUseSound(intentType: string, at: { x: number; y: number }): void {
  const engine = ShipAudioEngine.getInstance();
  if (intentType === 'REPAIR') engine.playDoorToggle(at.x, at.y, true);
  else if (intentType === 'CLAIM') engine.playUiClick();
  else engine.playStationInteract();
}

function pressTalk(sendIntent: SendIntent, snapshot: Snapshot): void {
  if (snapshot === null) return;
  const captain = snapshot.pawns.find((pawn) => pawn.id.startsWith('captain:'));
  if (captain === undefined) return;
  sendIntent({ type: 'TALK', seq: 0, npcId: captain.id });
  ShipAudioEngine.getInstance().playStationInteract();
}

function pressHire(sendIntent: SendIntent, offerId: string, job: Role): void {
  sendIntent({ type: 'HIRE', seq: 0, offerId, job });
  ShipAudioEngine.getInstance().playStationInteract();
}
