/**
 * HarborSession: the live game behind Embark. Owns the player socket and
 * all gameplay input. Esc pauses local input (the world stays live),
 * server-declared death opens the flatline panel, and Quit unmounts the
 * session so the socket closes and the menu returns.
 */

import type { DeathCause, SnapshotPortal } from '@kybernetes/protocol';
import {
  buildHarborWorld,
  collidersForFrame,
  type World,
  withSnapshotStates,
} from '@kybernetes/sim-core';
import { type RefObject, useMemo, useRef } from 'react';
import { DeathOverlay } from './DeathOverlay';
import { HarborViewport } from './HarborViewport';
import type { InteractTarget } from './interactTarget';
import { PauseOverlay } from './PauseOverlay';
import { dockChipText, withDockWalkable } from './renderState';
import { ShipConsolePanel } from './ShipConsolePanel';
import { useSessionActions } from './sessionActions';
import { useSessionControls } from './sessionControls';
import { useSessionFire } from './sessionFire';
import {
  describeTarget,
  type HarborSocket,
  noticesLine,
  offerLine,
  statusLine,
  vitalsLine,
} from './sessionHud';
import { type PredictedPawn, useHarborMovement } from './useHarborMovement';
import { type HarborIdentity, useHarborSocket } from './useHarborSocket';
import { type ShipConsoleState, useShipConsole } from './useShipConsole';

const EMPTY_PORTALS: readonly SnapshotPortal[] = [];

export interface HarborSessionProps {
  readonly identity: HarborIdentity;
  readonly onQuit: () => void;
  /** Solo loop: fired on SHIP_LOST (wired in M6 alongside the socket notice). */
  readonly onShipLost?: (shipId: string) => void;
}

function harborPortals(snapshot: HarborSocket['snapshot']): readonly SnapshotPortal[] {
  return snapshot?.portals ?? EMPTY_PORTALS;
}

function useSessionDerived(socket: HarborSocket, staticWorld: World) {
  const ownPawn = socket.snapshot?.pawns.find((pawn) => pawn.id === socket.pawnId);
  const ownFrameId = ownPawn?.frameId ?? 'station';
  const snapshotPortals = harborPortals(socket.snapshot);
  const predictionView = useMemo(
    () => withDockWalkable(withSnapshotStates(staticWorld, snapshotPortals), socket.dock),
    [staticWorld, snapshotPortals, socket.dock]
  );
  const colliders = useMemo(
    () => collidersForFrame(predictionView, ownFrameId),
    [predictionView, ownFrameId]
  );
  return { ownPawn, colliders };
}

export function HarborSession({ identity: base, onQuit, onShipLost }: HarborSessionProps) {
  const identity = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const callsign = params.get('callsign') ?? base.callsign;
    return { ...base, callsign };
  }, [base]);
  const showDebug = useMemo(
    () => new URLSearchParams(window.location.search).get('debug') === '1',
    []
  );
  const staticWorld = useMemo(() => buildHarborWorld(), []);
  const socket = useHarborSocket(identity);
  const { paused, pausedRef, dead, togglePause, restart, sendPlayIntent } =
    useSessionControls(socket);
  const { ownPawn, colliders } = useSessionDerived(socket, staticWorld);
  const aimLockedRef = useRef(false);
  const movement = useHarborMovement(ownPawn, sendPlayIntent, colliders, aimLockedRef);
  const targetRef = useRef<InteractTarget | null>(null);
  const fire = useSessionFire(socket, movement.predicted, movement.facingRef, sendPlayIntent);
  const consoles = useShipConsole(socket, onShipLost);
  useSessionActions({
    sendIntent: sendPlayIntent,
    statics: staticWorld,
    snapshot: socket.snapshot,
    pawnId: socket.pawnId,
    offer: socket.offer,
    toggleSeal: movement.toggleSeal,
    targetRef,
    facingRef: movement.facingRef,
    pressFireStart: fire.pressFireStart,
    pressFireEnd: fire.pressFireEnd,
    pausedRef,
    dead,
    onTogglePause: togglePause,
    onConsole: consoles.toggleConsole,
  });

  return (
    <div style={{ background: '#07090d', width: '100vw', height: '100vh', color: '#cfd8e3' }}>
      <SessionDebugHud
        show={showDebug}
        socket={socket}
        predicted={movement.predicted}
        target={targetRef.current}
      />
      <SessionViewport
        statics={staticWorld}
        socket={socket}
        beacon={identity.beacon}
        userId={identity.userId}
        movement={movement}
        fire={fire}
        targetRef={targetRef}
        aimLockedRef={aimLockedRef}
      />
      <SessionOverlays
        paused={paused}
        dead={dead}
        cause={socket.death?.cause ?? socket.vitals?.vitals.deathCause}
        onResume={togglePause}
        onRestart={restart}
        onQuit={onQuit}
      />
      <ConsoleHost
        consoles={consoles}
        sendIntent={sendPlayIntent}
        navState={socket.navState}
        shipStatus={socket.shipStatus}
      />
    </div>
  );
}

function ConsoleHost({
  consoles,
  sendIntent,
  navState,
  shipStatus,
}: {
  readonly consoles: ShipConsoleState;
  readonly sendIntent: ReturnType<typeof useHarborSocket>['sendIntent'];
  readonly navState: HarborSocket['navState'];
  readonly shipStatus: HarborSocket['shipStatus'];
}) {
  if (consoles.consoleOpen === null || consoles.shipSystems === null) return null;
  return (
    <ShipConsolePanel
      kind={consoles.consoleOpen}
      systems={consoles.shipSystems}
      sendIntent={sendIntent}
      onClose={consoles.closeConsole}
      navState={navState}
      shipStatus={shipStatus}
    />
  );
}

function SessionViewport({
  statics,
  socket,
  beacon,
  userId,
  movement,
  fire,
  targetRef,
  aimLockedRef,
}: {
  readonly statics: World;
  readonly socket: HarborSocket;
  readonly beacon: string;
  readonly userId: string;
  readonly movement: ReturnType<typeof useHarborMovement>;
  readonly fire: ReturnType<typeof useSessionFire>;
  readonly targetRef: RefObject<InteractTarget | null>;
  readonly aimLockedRef: RefObject<boolean>;
}) {
  return (
    <HarborViewport
      statics={statics}
      targetRef={targetRef}
      snapshot={socket.snapshot}
      pawnId={socket.pawnId}
      beacon={beacon}
      userId={userId}
      predicted={movement.predicted}
      telemetry={socket.telemetry}
      vitals={socket.vitals}
      manifest={socket.manifest}
      dock={socket.dock}
      notices={socket.notices}
      facingRef={movement.facingRef}
      aimLockedRef={aimLockedRef}
      fireSignalRef={fire.fireSignalRef}
      shotsRef={fire.shotsRef}
      shipUnderway={socket.watch?.phase === 'active_watch'}
      onFireDown={fire.pressFireStart}
      onFireUp={fire.pressFireEnd}
    />
  );
}

function SessionDebugHud({
  show,
  socket,
  predicted,
  target,
}: {
  readonly show: boolean;
  readonly socket: HarborSocket;
  readonly predicted: Predicted;
  readonly target: InteractTarget | null;
}) {
  if (!show) return null;
  return (
    <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 10, pointerEvents: 'none' }}>
      <HarborHud socket={socket} predicted={predicted} target={target} />
    </div>
  );
}

function SessionOverlays({
  paused,
  dead,
  cause,
  onResume,
  onRestart,
  onQuit,
}: {
  readonly paused: boolean;
  readonly dead: boolean;
  readonly cause: DeathCause | undefined;
  readonly onResume: () => void;
  readonly onRestart: () => void;
  readonly onQuit: () => void;
}) {
  if (dead) {
    return <DeathOverlay cause={cause} onRestart={onRestart} onQuit={onQuit} />;
  }
  if (paused) {
    return <PauseOverlay onResume={onResume} onRestart={onRestart} onQuit={onQuit} />;
  }
  return null;
}

type Predicted = PredictedPawn | null;

function HarborHud({
  socket,
  predicted,
  target,
}: {
  socket: HarborSocket;
  predicted: Predicted;
  target: InteractTarget | null;
}) {
  return (
    <>
      <div data-testid="harbor-pawn">{socket.pawnId ?? '-'}</div>
      <div data-testid="harbor-target">{describeTarget(target)}</div>
      <HudStatus socket={socket} />
      <div data-testid="harbor-dock">{dockChipText(socket.dock)}</div>
      <div data-testid="harbor-pos">
        {predicted ? `x:${Math.round(predicted.x)} y:${Math.round(predicted.y)}` : 'x:? y:?'}{' '}
      </div>
      <HudVitals socket={socket} />
      <HudWatch socket={socket} />
      <HudManifest socket={socket} />
      <div data-testid="harbor-offer">{offerLine(socket.offer)} </div>
      <div data-testid="harbor-notices">{noticesLine(socket.notices)} </div>
    </>
  );
}

function HudStatus({ socket }: { socket: HarborSocket }) {
  return <div data-testid="harbor-status">{statusLine(socket)} </div>;
}

function HudVitals({ socket }: { socket: HarborSocket }) {
  return <div data-testid="harbor-vitals">{vitalsLine(socket)} </div>;
}

function HudWatch({ socket }: { socket: HarborSocket }) {
  const watch = socket.watch;
  const done = watch === null ? 0 : watch.checklist.filter((task) => task.done).length;
  return (
    <div data-testid="harbor-watch">
      {watch === null
        ? 'watch:none'
        : `watch#${watch.watchNo} ${watch.remainingS}s ${watch.grade} tasks:${done}/${watch.checklist.length}`}{' '}
    </div>
  );
}

function HudManifest({ socket }: { socket: HarborSocket }) {
  return (
    <div data-testid="harbor-manifest">
      {socket.manifest === null
        ? 'crew:-'
        : `beacon:${socket.manifest.beacon} crew:${socket.manifest.crew.map((entry) => `${entry.callsign}:${entry.role}`).join(',')}`}{' '}
    </div>
  );
}
