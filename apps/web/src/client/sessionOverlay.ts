/**
 * sessionOverlay: framework-free GL overlay wiring (Phase 3 Round 12).
 * Moved out of HarborSession so the vanilla GameSession shares it verbatim.
 * Audio/console inputs are minimal structural interfaces satisfied by both
 * the React hooks and the vanilla stores. No React, no DOM.
 */

import type {
  CargoStateBroadcast,
  ClientIntent,
  DeathCause,
  MarketStateBroadcast,
  NavStateBroadcast,
  ShipStatusBroadcast,
  ShipSystemsBroadcast,
  SnapshotBroadcast,
} from '@kybernetes/protocol';
import { cargoScreenFor } from '../harbor/cargoModel';
import { hubIdForFrame, marketScreenFor } from '../harbor/marketModel';
import type { ConsoleKind } from '../harbor/sessionActions';
import type { GlSessionWiring } from '../harbor/viewportFrame';
import type { GlAudioState } from '../webgl/ui/UiPass';

export interface OverlayAudio {
  readonly ready: boolean;
  readonly muted: boolean;
  readonly masterPct: number;
  readonly enable: () => void;
  readonly setMasterPct: (pct: number) => void;
  readonly setMuted: (muted: boolean) => void;
}

export interface OverlayConsoles {
  readonly consoleOpen: ConsoleKind | null;
  readonly shipSystems: ShipSystemsBroadcast | null;
  readonly closeConsole: () => void;
}

export interface GlOverlayBuildArgs {
  readonly glUi: boolean;
  readonly paused: boolean;
  readonly dead: boolean;
  readonly deathCause: DeathCause | undefined;
  readonly settingsOpen: boolean;
  readonly audio: OverlayAudio;
  readonly consoles: OverlayConsoles;
  readonly navState: NavStateBroadcast | null;
  readonly marketStates: Readonly<Record<string, MarketStateBroadcast>>;
  readonly credits: number;
  readonly snapshot: SnapshotBroadcast | null;
  readonly pawnId: string | null;
  readonly cargoState: CargoStateBroadcast | null;
  readonly shipStatus: ShipStatusBroadcast | null;
  readonly sendIntent: (intent: ClientIntent) => void;
  readonly togglePause: () => void;
  readonly restart: () => void;
  readonly onQuit: () => void;
  readonly setSettingsOpen: (open: boolean) => void;
}

export function buildGlOverlayWiring(args: GlOverlayBuildArgs): GlSessionWiring | null {
  if (!args.glUi) return null;
  return {
    paused: args.paused,
    dead: args.dead,
    cause: args.deathCause,
    settingsOpen: args.settingsOpen,
    audio: audioSnapshotOf(args.audio),
    console: consoleStateOf(args.consoles),
    navState: args.navState,
    cargo: cargoWiringOf(args.snapshot, args.pawnId, args.cargoState),
    market: marketWiringOf(
      args.marketStates,
      args.snapshot,
      args.pawnId,
      args.cargoState,
      args.credits
    ),
    shipStatus: args.shipStatus,
    sendIntent: args.sendIntent,
    onCloseConsole: args.consoles.closeConsole,
    onResume: closeAnd(args, args.togglePause),
    onRestart: closeAnd(args, args.restart),
    onQuit: args.onQuit,
    onOpenSettings: () => args.setSettingsOpen(true),
    onCloseSettings: () => args.setSettingsOpen(false),
    onEnableAudio: args.audio.enable,
    onVolumeDown: () => args.audio.setMasterPct(Math.max(0, args.audio.masterPct - 10)),
    onVolumeUp: () => args.audio.setMasterPct(Math.min(100, args.audio.masterPct + 10)),
    onToggleMute: () => args.audio.setMuted(!args.audio.muted),
  };
}

function audioSnapshotOf(audio: OverlayAudio): GlAudioState {
  return { ready: audio.ready, muted: audio.muted, masterPct: audio.masterPct };
}

function marketWiringOf(
  marketStates: Readonly<Record<string, MarketStateBroadcast>>,
  snapshot: SnapshotBroadcast | null,
  pawnId: string | null,
  cargoState: CargoStateBroadcast | null,
  credits: number
): GlSessionWiring['market'] {
  const frameId = snapshot?.pawns.find((pawn) => pawn.id === pawnId)?.frameId ?? null;
  const hubId = hubIdForFrame(frameId);
  if (hubId === null) return null;
  const market = marketStates[hubId];
  if (market === undefined) return null;
  const screen = marketScreenFor(market, snapshot, cargoState, pawnId, credits);
  const buys: Record<string, number> = {};
  for (const row of screen.buys) buys[row.goodId] = row.qty;
  return { hubId, screen, buys, sellIds: [...screen.sellIds] };
}

function cargoWiringOf(
  snapshot: SnapshotBroadcast | null,
  pawnId: string | null,
  cargoState: CargoStateBroadcast | null
): GlSessionWiring['cargo'] {
  return cargoScreenFor(snapshot, cargoState, pawnId);
}

function consoleStateOf(consoles: OverlayConsoles): GlSessionWiring['console'] {
  if (consoles.consoleOpen === null || consoles.shipSystems === null) return null;
  return { kind: consoles.consoleOpen, systems: consoles.shipSystems };
}

function closeAnd(args: GlOverlayBuildArgs, next: () => void): () => void {
  return () => {
    args.setSettingsOpen(false);
    next();
  };
}
