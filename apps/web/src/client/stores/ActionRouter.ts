/**
 * ActionRouter: framework-free keyboard intents (Phase 1).
 * Same key map as sessionActions (E use, H talk, J hire, T seal, F fire,
 * R reload, Esc pause) behind the pause/death gate. Attaches plain window
 * listeners; pure actionKeyFor/consoleKindOf are reused, not duplicated.
 */

import type {
  ClientIntent,
  HireOfferBroadcast,
  Role,
  SnapshotBroadcast,
} from '@kybernetes/protocol';
import type { World } from '@kybernetes/sim-core';
import { ShipAudioEngine } from '../../audio/ShipAudioEngine';
import {
  doorSpotsOf,
  type InteractTarget,
  selectInteractTarget,
  sightBlockers,
  targetIntent,
} from '../../harbor/interactTarget';
import {
  actionKeyFor,
  type ConsoleKind,
  consoleKindOf,
  type GameplayAction,
} from '../../harbor/sessionActions';

export interface ActionWiring {
  readonly sendIntent: (intent: ClientIntent) => void;
  readonly statics: World;
  readonly getSnapshot: () => SnapshotBroadcast | null;
  readonly getPawnId: () => string | null;
  readonly getOffer: () => HireOfferBroadcast | null;
  readonly toggleSeal: () => void;
  readonly targetRef: { current: InteractTarget | null };
  readonly getFacing: () => number;
  readonly pressFireStart: () => void;
  readonly pressFireEnd: () => void;
  readonly isPaused: () => boolean;
  readonly isDead: () => boolean;
  readonly isPackOpen: () => boolean;
  readonly onPackRotate: () => void;
  readonly onTogglePause: () => void;
  readonly onConsole: (kind: ConsoleKind) => void;
}

export function attachActionRouter(wiring: ActionWiring): () => void {
  const onDown = (event: KeyboardEvent): void => {
    if (event.repeat) return;
    handleKeyDown(wiring, event.key.toLowerCase());
  };
  const onUp = (event: KeyboardEvent): void => {
    if (event.key.toLowerCase() === 'f') wiring.pressFireEnd();
  };
  window.addEventListener('keydown', onDown);
  window.addEventListener('keyup', onUp);
  return () => {
    window.removeEventListener('keydown', onDown);
    window.removeEventListener('keyup', onUp);
  };
}

function handleKeyDown(wiring: ActionWiring, key: string): void {
  if (key === 'escape') {
    if (!wiring.isDead()) wiring.onTogglePause();
    return;
  }
  if (wiring.isPaused() || wiring.isDead()) return;
  if (wiring.isPackOpen()) {
    if (key === 'r') wiring.onPackRotate();
    else if (key === 'c') wiring.onConsole('pack');
    return;
  }
  dispatchAction(actionKeyFor(key, wiring.getOffer() !== null), wiring);
}

type ActionHandler = (wiring: ActionWiring) => void;

const ACTION_HANDLERS: Record<GameplayAction, ActionHandler> = {
  use: pressUse,
  talk: pressTalk,
  hire: pressHireFromOffer,
  seal: (wiring) => wiring.toggleSeal(),
  fire: (wiring) => wiring.pressFireStart(),
  reload: pressReload,
  cargo: (wiring) => wiring.onConsole('cargo'),
  drop: pressDrop,
  unpack: pressUnpack,
};

function dispatchAction(action: GameplayAction | null, wiring: ActionWiring): void {
  if (action === null) return;
  ACTION_HANDLERS[action](wiring);
}

function pressHireFromOffer(wiring: ActionWiring): void {
  const offer = wiring.getOffer();
  const job = offer?.jobs[0];
  const offerId = offer?.offerId;
  if (job === undefined || offerId === undefined) return;
  wiring.sendIntent({ type: 'HIRE', seq: 0, offerId, job: job as Role });
  ShipAudioEngine.getInstance().playStationInteract();
}

function pressReload(wiring: ActionWiring): void {
  wiring.sendIntent({ type: 'RELOAD', seq: 0 });
  ShipAudioEngine.getInstance().playUiClick();
}

function pressUse(wiring: ActionWiring): void {
  const found = findUseTarget(wiring);
  if (found === null) return;
  activateUseTarget(wiring, found.target, found.at);
}

function findUseTarget(
  wiring: ActionWiring
): { target: InteractTarget; at: { x: number; y: number } } | null {
  const snapshot = wiring.getSnapshot();
  const pawnId = wiring.getPawnId();
  if (snapshot === null || pawnId === null) return null;
  const pawn = snapshot.pawns.find((entry) => entry.id === pawnId);
  if (pawn === undefined) return null;
  const at = { x: pawn.x, y: pawn.y };
  const target = wiring.targetRef.current ?? resolveUseTarget(wiring, snapshot, pawn.frameId, at);
  if (target === null) return null;
  return { target, at };
}

function activateUseTarget(
  wiring: ActionWiring,
  target: InteractTarget,
  at: { x: number; y: number }
): void {
  const consoleKind = consoleKindOf(target);
  if (consoleKind !== null) {
    wiring.onConsole(consoleKind);
    ShipAudioEngine.getInstance().playUiClick();
    return;
  }
  sendTargetIntent(wiring, target, at);
}

function sendTargetIntent(
  wiring: ActionWiring,
  target: InteractTarget,
  at: { x: number; y: number }
): void {
  const intent = targetIntent(target);
  wiring.sendIntent(intent);
  if (target.kind === 'door') {
    ShipAudioEngine.getInstance().playDoorToggle(at.x, at.y, !target.open);
    return;
  }
  playUseSound(intent.type, at);
}

function resolveUseTarget(
  wiring: ActionWiring,
  snapshot: SnapshotBroadcast,
  frameId: string,
  at: { x: number; y: number }
): InteractTarget | null {
  return selectInteractTarget({
    fixtures: snapshot.fixtures,
    doors: doorSpotsOf(wiring.statics, frameId),
    openById: new Map(snapshot.portals.map((portal) => [portal.id, portal.open] as const)),
    frameId,
    at,
    facing: wiring.getFacing(),
    blockers: sightBlockers(wiring.statics, frameId, snapshot.portals),
    crates: (snapshot.crates ?? [])
      .filter((crate) => crate.where !== 'carriedBy')
      .map((crate) => ({ id: crate.id, x: crate.x, y: crate.y, frameId: crate.frameId })),
  });
}

function playUseSound(intentType: string, at: { x: number; y: number }): void {
  const engine = ShipAudioEngine.getInstance();
  if (intentType === 'REPAIR') engine.playDoorToggle(at.x, at.y, true);
  else if (intentType === 'CLAIM') engine.playUiClick();
  else engine.playStationInteract();
}

function pressDrop(wiring: ActionWiring): void {
  wiring.sendIntent({ type: 'CARGO_DROP', seq: 0 });
  ShipAudioEngine.getInstance().playUiClick();
}

function pressUnpack(wiring: ActionWiring): void {
  const snapshot = wiring.getSnapshot();
  const pawnId = wiring.getPawnId();
  if (snapshot === null || pawnId === null) return;
  const pawn = snapshot.pawns.find((entry) => entry.id === pawnId);
  if (pawn === undefined) return;
  const crateIds = (snapshot.crates ?? [])
    .filter((crate) => crate.where === 'shipFloor' && crate.frameId === pawn.frameId)
    .map((crate) => crate.id);
  if (crateIds.length === 0) return;
  wiring.sendIntent({ type: 'CARGO_UNPACK', seq: 0, crateIds });
  ShipAudioEngine.getInstance().playUiClick();
}

function pressTalk(wiring: ActionWiring): void {
  const snapshot = wiring.getSnapshot();
  if (snapshot === null) return;
  const captain = snapshot.pawns.find((pawn) => pawn.id.startsWith('captain:'));
  if (captain === undefined) return;
  wiring.sendIntent({ type: 'TALK', seq: 0, npcId: captain.id });
  ShipAudioEngine.getInstance().playStationInteract();
}
