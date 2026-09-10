/**
 * GameSession: framework-free live game session (Phase 3 Round 12).
 * Mirrors HarborSession on the vanilla stores: socket transport, movement
 * prediction, predicted fire, pause/death gating, ship consoles, audio
 * prefs, and the ViewportDriver, composed through the shared GL overlay
 * wiring. GL-only by construction; the ?debug=1 panel rides DebugHud.
 * No React, no DOM queries outside attach/dispose.
 */

import type { ClientIntent, SnapshotBroadcast } from '@kybernetes/protocol';
import {
  buildHarborWorld,
  collidersForFrame,
  type World,
  withSnapshotStates,
} from '@kybernetes/sim-core';
import type { InteractTarget } from '../harbor/interactTarget';
import type { PredictedShot } from '../harbor/predictedShots';
import { withDockWalkable } from '../harbor/renderState';
import type { HarborViewportProps } from '../harbor/viewportFrame';
import { DebugHud } from './DebugHud';
import { buildGlOverlayWiring } from './sessionOverlay';
import { attachActionRouter } from './stores/ActionRouter';
import { AudioPrefs } from './stores/AudioPrefs';
import { ConsoleStore } from './stores/ConsoleStore';
import { FireController } from './stores/FireController';
import { MovementController } from './stores/MovementController';
import { SessionControlStore } from './stores/SessionControlStore';
import {
  createSocketStore,
  type HarborIdentity,
  type SocketFactory,
  type SocketStore,
  type SocketStoreState,
} from './stores/SocketStore';
import { ViewportDriver } from './ViewportDriver';

export interface GameSessionProps {
  readonly identity: HarborIdentity;
  readonly debug: boolean;
  readonly onQuit: () => void;
  readonly onShipLost?: (shipId: string) => void;
  readonly factory?: SocketFactory;
}

export class GameSession {
  public readonly socket: SocketStore;
  public readonly controls: SessionControlStore;
  public readonly movement: MovementController;
  public readonly fire: FireController;
  public readonly consoles: ConsoleStore;
  public readonly audio: AudioPrefs;
  private readonly statics: World = buildHarborWorld();
  private readonly targetRef: { current: InteractTarget | null } = { current: null };
  private readonly aimLocked = { current: false };
  private readonly facing = { current: 0 };
  private readonly pausedFlag = { current: false };
  private readonly shotsHolder: { current: PredictedShot[] } = { current: [] };
  private readonly fireSignalHolder = { current: 0 };
  private settingsOpen = false;
  private lastSnapshot: SnapshotBroadcast | null | undefined;
  private lastProps: HarborViewportProps | null = null;
  private driver: ViewportDriver | null = null;
  private hud: DebugHud | null = null;
  private detachRouter: (() => void) | null = null;
  private raf = 0;
  private running = false;

  constructor(private readonly props: GameSessionProps) {
    this.socket = createSocketStore(props.identity, props.factory);
    this.controls = new SessionControlStore({
      sendIntent: (intent) => this.socket.sendIntent(intent),
      clearDeath: () => this.socket.clearDeath(),
    });
    this.movement = new MovementController({
      sendIntent: (intent) => this.controls.sendPlayIntent(intent),
      isMouseAim: () => this.aimLocked.current,
    });
    this.fire = new FireController({
      sendPlayIntent: (intent) => this.controls.sendPlayIntent(intent),
      getSnapshot: () => this.socket.getState().snapshot,
      getPawnId: () => this.socket.getState().pawnId,
      getVitals: () => this.socket.getState().vitals,
      getPredicted: () => this.movement.getSnapshot().predicted,
      getFacing: () => this.movement.getFacing(),
    });
    this.consoles = new ConsoleStore((shipId) => this.props.onShipLost?.(shipId));
    this.audio = new AudioPrefs();
    this.lastSnapshot = null;
  }

  public attach(root: HTMLElement): void {
    if (this.running) return;
    this.running = true;
    const canvas = document.createElement('canvas');
    canvas.dataset.testid = 'harbor-canvas';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    root.appendChild(canvas);
    const driver = new ViewportDriver();
    this.driver = driver;
    if (this.props.debug) this.hud = new DebugHud(root);
    this.detachRouter = attachActionRouter({
      sendIntent: (intent) => this.controls.sendPlayIntent(intent),
      statics: this.statics,
      getSnapshot: () => this.socket.getState().snapshot,
      getPawnId: () => this.socket.getState().pawnId,
      getOffer: () => this.socket.getState().offer,
      toggleSeal: () => this.movement.toggleSeal(),
      targetRef: this.targetRef,
      getFacing: () => this.movement.getFacing(),
      pressFireStart: () => this.fire.pressFireStart(),
      pressFireEnd: () => this.fire.pressFireEnd(),
      isPaused: () => this.controls.getSnapshot().paused,
      isDead: () => this.controls.getSnapshot().dead,
      onTogglePause: () => {
        if (this.settingsOpen) this.settingsOpen = false;
        else this.controls.togglePause();
      },
      onConsole: (kind) => this.consoles.toggleConsole(kind),
    });
    this.movement.attach();
    this.fire.attach();
    this.audio.attach();
    this.socket.connect();
    driver.attach(canvas);
    this.sync();
    this.raf = requestAnimationFrame(this.tick);
  }

  public dispose(): void {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.detachRouter?.();
    this.detachRouter = null;
    this.movement.detach();
    this.fire.detach();
    this.audio.detach();
    this.socket.dispose();
    this.driver?.detach();
    this.driver = null;
    this.hud = null;
  }

  public getProps(): HarborViewportProps | null {
    return this.lastProps;
  }

  public sync(): void {
    const state = this.socket.getState();
    if (state.snapshot !== this.lastSnapshot) {
      this.lastSnapshot = state.snapshot;
      this.syncWorld(state);
    }
    this.controls.setDeath(state.death);
    this.controls.setVitals(state.vitals);
    this.consoles.setShipSystems(state.shipSystems);
    this.consoles.setShipLost(state.shipLost);
    this.fire.reconcileNotices(state.notices);
    const movementSnap = this.movement.getSnapshot();
    const controlsSnap = this.controls.getSnapshot();
    this.facing.current = this.movement.getFacing();
    this.pausedFlag.current = controlsSnap.paused;
    this.shotsHolder.current = [...this.fire.getShots()];
    this.fireSignalHolder.current = this.fire.getFireSignal();
    this.lastProps = this.buildViewProps(
      state,
      controlsSnap.paused,
      controlsSnap.dead,
      movementSnap.predicted
    );
    if (this.driver !== null) this.driver.update(this.lastProps);
    if (this.hud !== null) this.hud.update(state, movementSnap.predicted, this.targetRef.current);
  }

  private syncWorld(state: SocketStoreState): void {
    const snapshot = state.snapshot;
    const own = snapshot?.pawns.find((pawn) => pawn.id === state.pawnId);
    const predictionView = withDockWalkable(
      withSnapshotStates(this.statics, snapshot?.portals ?? []),
      state.dock
    );
    this.movement.setColliders(collidersForFrame(predictionView, own?.frameId ?? 'station'));
    this.movement.setAuthoritative(own);
  }

  private buildViewProps(
    state: SocketStoreState,
    paused: boolean,
    dead: boolean,
    predicted: { x: number; y: number; facing: number } | null
  ): HarborViewportProps {
    return {
      statics: this.statics,
      snapshot: state.snapshot,
      pawnId: state.pawnId,
      beacon: this.props.identity.beacon,
      userId: this.props.identity.userId,
      predicted,
      telemetry: state.telemetry,
      vitals: state.vitals,
      manifest: state.manifest,
      dock: state.dock,
      notices: state.notices,
      facingRef: this.facing,
      aimLockedRef: this.aimLocked,
      fireSignalRef: this.fireSignalHolder,
      shotsRef: this.shotsHolder,
      shipUnderway: state.watch?.phase === 'active_watch',
      onFireDown: () => this.fire.pressFireStart(),
      onFireUp: () => this.fire.pressFireEnd(),
      targetRef: this.targetRef,
      glOverlay: this.buildOverlay(state, paused, dead),
    };
  }

  private buildOverlay(state: SocketStoreState, paused: boolean, dead: boolean) {
    const audioSnap = this.audio.getSnapshot();
    const consoleSnap = this.consoles.getSnapshot();
    return buildGlOverlayWiring({
      glUi: true,
      paused,
      dead,
      deathCause: state.death?.cause ?? state.vitals?.vitals.deathCause,
      settingsOpen: this.settingsOpen,
      audio: {
        ready: audioSnap.ready,
        muted: audioSnap.muted,
        masterPct: audioSnap.masterPct,
        enable: () => this.audio.enable(),
        setMasterPct: (pct) => this.audio.setMasterPct(pct),
        setMuted: (muted) => this.audio.setMuted(muted),
      },
      consoles: {
        consoleOpen: consoleSnap.consoleOpen,
        shipSystems: consoleSnap.shipSystems,
        closeConsole: () => this.consoles.closeConsole(),
      },
      navState: state.navState,
      shipStatus: state.shipStatus,
      sendIntent: (intent: ClientIntent) => this.controls.sendPlayIntent(intent),
      togglePause: () => this.controls.togglePause(),
      restart: () => this.controls.restart(),
      onQuit: () => this.props.onQuit(),
      setSettingsOpen: (open) => {
        this.settingsOpen = open;
      },
    });
  }

  private readonly tick = (): void => {
    if (!this.running) return;
    this.sync();
    this.raf = requestAnimationFrame(this.tick);
  };
}
