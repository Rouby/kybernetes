/**
 * HarborSession: the live game behind Embark. Owns the player socket and
 * all gameplay input. Esc pauses local input (the world stays live),
 * server-declared death opens the flatline panel, and Quit unmounts the
 * session so the socket closes and the menu returns.
 */

import type { DeathCause, SnapshotPortal } from '@kybernetes/protocol';
import { buildHarborWorld, collidersForFrame, withSnapshotStates } from '@kybernetes/sim-core';
import { useMemo, useRef } from 'react';
import { DeathOverlay } from './DeathOverlay';
import { HarborViewport } from './HarborViewport';
import type { InteractTarget } from './interactTarget';
import { PauseOverlay } from './PauseOverlay';
import { dockChipText, withDockWalkable } from './renderState';
import { useSessionActions } from './sessionActions';
import { useSessionControls } from './sessionControls';
import { useSessionFire } from './sessionFire';
import { type PredictedPawn, useHarborMovement } from './useHarborMovement';
import { type HarborIdentity, useHarborSocket } from './useHarborSocket';

const EMPTY_PORTALS: readonly SnapshotPortal[] = [];

export interface HarborSessionProps {
  readonly identity: HarborIdentity;
  readonly onQuit: () => void;
}

export function HarborSession({ identity: base, onQuit }: HarborSessionProps) {
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
  const ownPawn = socket.snapshot?.pawns.find((pawn) => pawn.id === socket.pawnId);
  const ownFrameId = ownPawn?.frameId ?? 'station';
  const snapshotPortals = socket.snapshot?.portals ?? EMPTY_PORTALS;
  const predictionView = useMemo(
    () => withDockWalkable(withSnapshotStates(staticWorld, snapshotPortals), socket.dock),
    [staticWorld, snapshotPortals, socket.dock]
  );
  const colliders = useMemo(
    () => collidersForFrame(predictionView, ownFrameId),
    [predictionView, ownFrameId]
  );
  const aimLockedRef = useRef(false);
  const movement = useHarborMovement(ownPawn, sendPlayIntent, colliders, aimLockedRef);
  const targetRef = useRef<InteractTarget | null>(null);
  const fire = useSessionFire(socket, movement.predicted, movement.facingRef, sendPlayIntent);
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
  });

  return (
    <div style={{ background: '#07090d', width: '100vw', height: '100vh', color: '#cfd8e3' }}>
      <SessionDebugHud
        show={showDebug}
        socket={socket}
        predicted={movement.predicted}
        target={targetRef.current}
      />
      <HarborViewport
        statics={staticWorld}
        targetRef={targetRef}
        snapshot={socket.snapshot}
        pawnId={socket.pawnId}
        beacon={identity.beacon}
        userId={identity.userId}
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
      <SessionOverlays
        paused={paused}
        dead={dead}
        cause={socket.death?.cause ?? socket.vitals?.vitals.deathCause}
        onResume={togglePause}
        onRestart={restart}
        onQuit={onQuit}
      />
    </div>
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

type HarborSocket = ReturnType<typeof useHarborSocket>;
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
      <div data-testid="harbor-offer">
        {socket.offer === null ? 'offer:-' : `offer:${socket.offer.jobs.join('/')}`}{' '}
      </div>
      <div data-testid="harbor-notices">
        {socket.notices.length === 0
          ? 'notices:-'
          : socket.notices.map((notice) => `${notice.title}:${notice.message}`).join(' | ')}{' '}
      </div>
    </>
  );
}

function describeTarget(target: InteractTarget | null): string {
  if (target === null) return 'target:-';
  if (target.kind === 'door') return `target:door:${target.open ? 'open' : 'closed'}`;
  return 'target:fixture';
}

function ventCount(socket: HarborSocket): number {
  return (socket.telemetry?.atmos ?? []).filter((room) => room.pressureKpa < 50).length;
}

function HudStatus({ socket }: { socket: HarborSocket }) {
  const pawn = socket.snapshot?.pawns.find((entry) => entry.id === socket.pawnId);
  const room = pawn === undefined ? '-' : shortId(pawn.roomHint);
  const face = pawn === undefined ? '?' : Math.round(((pawn.facing * 180) / Math.PI + 360) % 360);
  return (
    <div data-testid="harbor-status">
      {socket.connected
        ? `tick:${socket.snapshot?.tick ?? '-'} room:${room} sx:${pawn === undefined ? '?' : Math.round(pawn.x)} face:${face} vent:${ventCount(socket)}`
        : 'offline'}{' '}
    </div>
  );
}

function HudVitals({ socket }: { socket: HarborSocket }) {
  const vitals = socket.vitals?.vitals;
  return (
    <div data-testid="harbor-vitals">
      {vitals === undefined
        ? 'vitals:-'
        : `hp:${Math.round(vitals.health)} hyp:${Math.round(vitals.hypoxia)} suit:${vitals.suitSealed ? 'sealed' : 'open'} hunger:${Math.round(vitals.hunger)} mag:${vitals.ammo}/${vitals.reserve} spares:[${vitals.mags.join(',')}]${vitals.reloading ? '(reloading)' : ''} credits:${socket.vitals?.credits ?? 0}`}{' '}
    </div>
  );
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

function shortId(id: string): string {
  const dot = id.indexOf('.');
  return dot < 0 ? id : id.slice(dot + 1);
}
