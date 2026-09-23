/**
 * sessionOverlay: framework-free GL overlay wiring (Phase 3 Round 12).
 * Moved out of HarborSession so the vanilla GameSession shares it verbatim.
 * Audio/console inputs are minimal structural interfaces satisfied by both
 * the React hooks and the vanilla stores. No React, no DOM.
 */

import type {
  CargoStateBroadcast,
  ChartStateBroadcast,
  ClientIntent,
  DeathCause,
  MarketStateBroadcast,
  NavStateBroadcast,
  ShipStatusBroadcast,
  ShipSystemsBroadcast,
  SnapshotBroadcast,
} from '@kybernetes/protocol';
import { footprintFor } from '@kybernetes/sim-core';
import { cargoScreenFor } from '../harbor/cargoModel';
import {
  hubIdForFrame,
  marketScreenFor,
  type SellCapture,
  sellCaptureFor,
  sellScreenFor,
  type TradeReceiptModel,
} from '../harbor/marketModel';
import { aboardCargoFor } from '../harbor/navTradeHints';
import type { ConsoleKind } from '../harbor/sessionActions';
import type { GlSessionWiring } from '../harbor/viewportFrame';
import type { PackStore } from '../pack/PackStore';
import { packScreenFor } from '../pack/packModel';
import type { GlAudioState } from '../webgl/ui/UiPass';

export interface OverlayAudio {
  readonly ready: boolean;
  readonly muted: boolean;
  readonly masterPct: number;
  readonly musicPct: number;
  readonly musicOn: boolean;
  readonly enable: () => void;
  readonly setMasterPct: (pct: number) => void;
  readonly setMuted: (muted: boolean) => void;
  readonly setMusicPct: (pct: number) => void;
  readonly setMusicOn: (on: boolean) => void;
}

export interface OverlayConsoles {
  readonly consoleOpen: ConsoleKind | null;
  readonly shipSystems: ShipSystemsBroadcast | null;
  readonly coursePreview: readonly string[] | null;
  readonly thrustPct: number;
  readonly openConsole: (kind: ConsoleKind) => void;
  readonly closeConsole: () => void;
  readonly previewCourse: (stops: readonly string[]) => void;
  readonly clearPreview: () => void;
  readonly setThrustPct: (pct: number) => void;
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
  readonly chartState: ChartStateBroadcast | null;
  readonly packStore: PackStore;
  readonly marketStates: Readonly<Record<string, MarketStateBroadcast>>;
  readonly credits: number;
  readonly snapshot: SnapshotBroadcast | null;
  readonly pawnId: string | null;
  readonly cargoState: CargoStateBroadcast | null;
  readonly shipStatus: ShipStatusBroadcast | null;
  readonly receipt: TradeReceiptModel | null;
  readonly onSellCapture: (capture: SellCapture) => void;
  readonly onCloseReceipt: () => void;
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
    chartState: args.chartState,
    coursePreview: args.consoles.coursePreview,
    onPreviewCourse: (stops) => args.consoles.previewCourse(stops),
    onClearPreview: () => args.consoles.clearPreview(),
    courseThrust: args.consoles.thrustPct,
    onThrustPct: (pct) => args.consoles.setThrustPct(pct),
    cargo: cargoWiringOf(args.snapshot, args.pawnId, args.cargoState),
    receipt: args.receipt === null ? null : { screen: args.receipt },
    onSellCapture: args.onSellCapture,
    onCloseReceipt: args.onCloseReceipt,
    navAboard: aboardCargoFor(args.snapshot, args.pawnId, args.cargoState),
    market: marketWiringOf(args.marketStates, args.snapshot, args.pawnId, args.credits),
    sell: sellWiringOf(args.marketStates, args.snapshot, args.pawnId),
    pack: packWiringOf(
      args.packStore,
      args.marketStates,
      args.snapshot,
      args.pawnId,
      args.cargoState,
      args.credits,
      args.sendIntent
    ),
    shipStatus: args.shipStatus,
    sendIntent: args.sendIntent,
    onConsole: (kind) => args.consoles.openConsole(kind),
    onPackOpen: (ctx) => {
      args.packStore.open(ctx);
      args.consoles.openConsole('pack');
    },
    onCloseConsole: () => {
      args.packStore.close();
      args.consoles.closeConsole();
    },
    onResume: closeAnd(args, args.togglePause),
    onRestart: closeAnd(args, args.restart),
    onQuit: args.onQuit,
    onOpenSettings: () => args.setSettingsOpen(true),
    onCloseSettings: () => args.setSettingsOpen(false),
    onEnableAudio: args.audio.enable,
    onVolumeDown: () => args.audio.setMasterPct(Math.max(0, args.audio.masterPct - 10)),
    onVolumeUp: () => args.audio.setMasterPct(Math.min(100, args.audio.masterPct + 10)),
    onToggleMute: () => args.audio.setMuted(!args.audio.muted),
    onMusicDown: () => args.audio.setMusicPct(Math.max(0, args.audio.musicPct - 10)),
    onMusicUp: () => args.audio.setMusicPct(Math.min(100, args.audio.musicPct + 10)),
    onToggleMusic: () => args.audio.setMusicOn(!args.audio.musicOn),
  };
}

function audioSnapshotOf(audio: OverlayAudio): GlAudioState {
  return {
    ready: audio.ready,
    muted: audio.muted,
    masterPct: audio.masterPct,
    musicPct: audio.musicPct,
    musicOn: audio.musicOn,
  };
}

function marketWiringOf(
  marketStates: Readonly<Record<string, MarketStateBroadcast>>,
  snapshot: SnapshotBroadcast | null,
  pawnId: string | null,
  credits: number
): GlSessionWiring['market'] {
  const frameId = snapshot?.pawns.find((pawn) => pawn.id === pawnId)?.frameId ?? null;
  const hubId = hubIdForFrame(frameId);
  if (hubId === null) return null;
  const market = marketStates[hubId];
  if (market === undefined) return null;
  return { hubId, screen: marketScreenFor(market, snapshot, pawnId, credits) };
}

function sellWiringOf(
  marketStates: Readonly<Record<string, MarketStateBroadcast>>,
  snapshot: SnapshotBroadcast | null,
  pawnId: string | null
): GlSessionWiring['sell'] {
  const frameId = snapshot?.pawns.find((pawn) => pawn.id === pawnId)?.frameId ?? null;
  const hubId = hubIdForFrame(frameId);
  if (hubId === null) return null;
  const market = marketStates[hubId];
  if (market === undefined) return null;
  const screen = sellScreenFor(market, snapshot, pawnId);
  return {
    hubId,
    screen,
    sellIds: [...screen.sellIds],
    captureFor: (crateIds) => sellCaptureFor(market, snapshot, crateIds),
  };
}

function packWiringOf(
  packStore: PackStore,
  marketStates: Readonly<Record<string, MarketStateBroadcast>>,
  snapshot: SnapshotBroadcast | null,
  pawnId: string | null,
  cargoState: CargoStateBroadcast | null,
  credits: number,
  sendIntent: (intent: ClientIntent) => void
): GlSessionWiring['pack'] {
  const ctx = packStore.context();
  if (ctx === null) return null;
  const snap = packStore.getSnapshot();
  const frameId = snapshot?.pawns.find((pawn) => pawn.id === pawnId)?.frameId ?? null;
  const hubId = ctx.mode === 'buy' ? (ctx.hubId ?? hubIdForFrame(frameId)) : null;
  const market = hubId !== null ? marketStates[hubId] : undefined;
  const screen = packScreenFor(
    ctx.mode,
    hubId,
    market ?? null,
    snapshot,
    pawnId,
    cargoState,
    credits,
    snap
  );
  return {
    screen,
    scene: {
      bodies: [...snap.bodies],
      walls: [...snap.walls],
      crate: { ...snap.crate },
      sealReady: snap.sealReady,
    },
    onAdd: (goodId: string) => {
      const foot = footprintFor(goodId);
      packStore.stageUnit(goodId, foot.w, foot.h);
    },
    onSeal: () => packSeal(packStore, sendIntent),
    onAuto: () => packStore.tidyUp(),
    onClear: () => packStore.clearStaged(),
  };
}

function packSeal(packStore: PackStore, sendIntent: (intent: ClientIntent) => void): void {
  const ctx = packStore.context();
  if (ctx === null) return;
  const items = packStore.takeSealed(ctx.mode === 'buy' ? 'buy' : 'repack');
  if (items === null) return;
  if (ctx.mode === 'buy' && ctx.hubId !== undefined) {
    sendIntent({ type: 'MARKET_BUY', seq: 0, hubId: ctx.hubId, items });
  } else if (ctx.mode === 'repack') {
    sendIntent({ type: 'CARGO_REPACK', seq: 0, items });
  }
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
