/**
 * HarborApp: the v2 client slice served at `?harbor=1`. Static harbor geometry
 * compiled locally, all dynamic state from v2 snapshots: predicted own pawn
 * with authoritative reconcile, snapshot remotes/doors, HUD from channels.
 */

import type { Role, SnapshotPortal } from '@kybernetes/protocol';
import {
  buildHarborWorld,
  collidersForFrame,
  type World,
  withSnapshotStates,
} from '@kybernetes/sim-core';
import type { RefObject } from 'react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { ShipAudioEngine } from '../audio/ShipAudioEngine';
import { DebugWorldView } from './DebugWorldView';
import { shouldFireShot } from './fireGate';
import { HarborViewport } from './HarborViewport';
import { dropYoungShots, type PredictedShot, spawnPredictedShot } from './predictedShots';
import { type PredictedPawn, useHarborMovement } from './useHarborMovement';
import { useHarborSocket } from './useHarborSocket';

const EMPTY_PORTALS: readonly SnapshotPortal[] = [];

function storedIdentity(): { callsign: string; color: string; userId: string } {
  let userId = window.localStorage.getItem('harbor.userId');
  if (userId === null) {
    userId = `u-${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem('harbor.userId', userId);
  }
  const callsign = window.localStorage.getItem('harbor.callsign') ?? 'Rook';
  return { callsign, color: '#ffd166', userId };
}

export function HarborApp() {
  useEffect(() => {
    const initAudio = (): void => {
      ShipAudioEngine.getInstance().init();
      ShipAudioEngine.getInstance().resume();
    };
    window.addEventListener('keydown', initAudio, { once: true });
    window.addEventListener('pointerdown', initAudio, { once: true });
    return () => {
      window.removeEventListener('keydown', initAudio);
      window.removeEventListener('pointerdown', initAudio);
    };
  }, []);
  const identity = useMemo(() => {
    const stored = storedIdentity();
    const params = new URLSearchParams(window.location.search);
    const beacon = params.get('beacon') ?? 'HESP01';
    const callsign = params.get('callsign') ?? stored.callsign;
    return { ...stored, callsign, beacon };
  }, []);
  const showDebug = useMemo(
    () => new URLSearchParams(window.location.search).get('debug') === '1',
    []
  );
  const showDebugWorld = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('debug-world') === '1' || params.get('view') === 'debug';
  }, []);
  const staticWorld = useMemo(() => buildHarborWorld(), []);
  const socket = useHarborSocket(identity);
  const ownPawn = socket.snapshot?.pawns.find((pawn) => pawn.id === socket.pawnId);
  const ownFrameId = ownPawn?.frameId ?? 'station';
  const snapshotPortals = socket.snapshot?.portals ?? EMPTY_PORTALS;
  const predictionView = useMemo(
    () => withSnapshotStates(staticWorld, snapshotPortals),
    [staticWorld, snapshotPortals]
  );
  const colliders = useMemo(
    () => collidersForFrame(predictionView, ownFrameId),
    [predictionView, ownFrameId]
  );
  const aimLockedRef = useRef(false);
  const movement = useHarborMovement(ownPawn, socket.sendIntent, colliders, aimLockedRef);

  const predictedRef = useRef(movement.predicted);
  predictedRef.current = movement.predicted;
  const shotsRef = useRef<PredictedShot[]>([]);
  const shotIdRef = useRef(0);
  const fire = useCallback((): void => {
    const self = socket.snapshot?.pawns.find((pawn) => pawn.id === socket.pawnId);
    if (self === undefined || !shouldFireShot(socket.vitals, true)) return;
    const angle = movement.facingRef.current;
    socket.sendIntent({
      type: 'FIRE',
      seq: 0,
      originAngle: angle,
      weapon: 'kinetic_carbine',
    });
    fireSignalRef.current += 1;
    shotIdRef.current += 1;
    const at = predictedRef.current;
    shotsRef.current = [
      ...shotsRef.current.slice(-7),
      spawnPredictedShot(
        shotIdRef.current,
        self.frameId,
        at?.x ?? self.x,
        at?.y ?? self.y,
        angle,
        'kinetic_carbine',
        performance.now()
      ),
    ];
    ShipAudioEngine.getInstance().playWeaponFire(self.x, self.y, 'kinetic_carbine');
  }, [socket.snapshot, socket.pawnId, socket.vitals, socket.sendIntent, movement.facingRef]);
  const fireRef = useRef(fire);
  fireRef.current = fire;
  const fireSignalRef = useRef(0);
  const fireHeldRef = useRef(false);
  const pressFireStart = useCallback((): void => {
    fireHeldRef.current = true;
    fireRef.current();
  }, []);
  const pressFireEnd = useCallback((): void => {
    fireHeldRef.current = false;
  }, []);
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const frame = (now: number): void => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      acc += dt;
      if (acc >= 0.16) {
        acc = 0;
        if (fireHeldRef.current) fireRef.current();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
  const refusedRef = useRef(0);
  useEffect(() => {
    const latest = socket.notices[socket.notices.length - 1];
    if (latest === undefined || latest.id === refusedRef.current) return;
    refusedRef.current = latest.id;
    if (/^FIRE_(overheated|empty|down|miss)/.test(latest.message)) {
      shotsRef.current = dropYoungShots(shotsRef.current, performance.now(), 600);
    }
  }, [socket.notices]);
  useActions(
    socket.sendIntent,
    staticWorld,
    socket.snapshot,
    socket.pawnId,
    socket.offer,
    movement.toggleSeal,
    predictedRef,
    pressFireStart,
    pressFireEnd
  );

  if (showDebugWorld) {
    return (
      <div style={{ background: '#07090d', width: '100vw', height: '100vh', color: '#cfd8e3' }}>
        {showDebug ? (
          <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 10, pointerEvents: 'none' }}>
            <HarborHud socket={socket} predicted={movement.predicted} />
          </div>
        ) : null}
        <DebugWorldView
          staticWorld={staticWorld}
          snapshot={socket.snapshot}
          telemetry={socket.telemetry}
          pawnId={socket.pawnId}
        />
      </div>
    );
  }
  return (
    <div style={{ background: '#07090d', width: '100vw', height: '100vh', color: '#cfd8e3' }}>
      {showDebug ? (
        <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 10, pointerEvents: 'none' }}>
          <HarborHud socket={socket} predicted={movement.predicted} />
        </div>
      ) : null}
      <HarborViewport
        snapshot={socket.snapshot}
        pawnId={socket.pawnId}
        predicted={movement.predicted}
        telemetry={socket.telemetry}
        vitals={socket.vitals}
        manifest={socket.manifest}
        notices={socket.notices}
        facingRef={movement.facingRef}
        aimLockedRef={aimLockedRef}
        fireSignalRef={fireSignalRef}
        shotsRef={shotsRef}
        shipUnderway={socket.watch?.phase === 'active_watch'}
        onFireDown={pressFireStart}
        onFireUp={pressFireEnd}
      />
    </div>
  );
}

type SendIntent = ReturnType<typeof useHarborSocket>['sendIntent'];
type Snapshot = ReturnType<typeof useHarborSocket>['snapshot'];
type Offer = ReturnType<typeof useHarborSocket>['offer'];

function useActions(
  sendIntent: SendIntent,
  statics: World,
  snapshot: Snapshot,
  pawnId: string | null,
  offer: Offer,
  toggleSeal: () => void,
  predictedRef: RefObject<{ x: number; y: number; facing: number } | null>,
  pressFireStart: () => void,
  pressFireEnd: () => void
): void {
  useEffect(() => {
    const onDown = (event: KeyboardEvent): void => {
      if (event.repeat) return;
      const key = event.key.toLowerCase();
      if (key === 'e') pressDoor(sendIntent, statics, snapshot, pawnId, predictedRef.current);
      else if (key === 'h') pressTalk(sendIntent, snapshot);
      else if (key === 'j' && offer !== null) {
        const job = offer.jobs[0];
        if (job !== undefined) pressHire(sendIntent, offer.offerId, job);
      } else if (key === 't') {
        toggleSeal();
      } else if (key === 'f') {
        pressFireStart();
      } else if (key === 'r') {
        sendIntent({ type: 'RELOAD', seq: 0 });
        ShipAudioEngine.getInstance().playUiClick();
      }
    };
    const onUp = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() === 'f') pressFireEnd();
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, [
    sendIntent,
    statics,
    snapshot,
    pawnId,
    offer,
    toggleSeal,
    predictedRef,
    pressFireStart,
    pressFireEnd,
  ]);
}

function pressDoor(
  sendIntent: SendIntent,
  statics: World,
  snapshot: Snapshot,
  pawnId: string | null,
  predicted: { x: number; y: number } | null
): void {
  if (snapshot === null || pawnId === null) return;
  const pawn = snapshot.pawns.find((entry) => entry.id === pawnId);
  if (pawn === undefined) return;
  const at = { x: predicted?.x ?? pawn.x, y: predicted?.y ?? pawn.y };
  const target = scanDoors(statics, snapshot, pawn.frameId, at);
  if (target === null) return;
  sendIntent({ type: 'DOOR', seq: 0, portalId: target.id, wantOpen: !target.open });
  ShipAudioEngine.getInstance().playDoorToggle(at.x, at.y, !target.open);
}

function scanDoors(
  statics: World,
  snapshot: NonNullable<Snapshot>,
  frameId: string,
  at: { x: number; y: number }
): { id: string; open: boolean } | null {
  const states = new Map(snapshot.portals.map((portal) => [portal.id, portal.open]));
  let best: { id: string; open: boolean; dist: number } | null = null;
  for (const edge of Object.values(statics.portals)) {
    const room = statics.rooms[edge.roomA];
    if (room === undefined || room.frameId !== frameId) continue;
    const dist = Math.hypot(
      at.x - (edge.segment.x1 + edge.segment.x2) / 2,
      at.y - (edge.segment.y1 + edge.segment.y2) / 2
    );
    if (dist < 90 && (best === null || dist < best.dist)) {
      best = { id: edge.id, open: states.get(edge.id) ?? false, dist };
    }
  }
  return best === null ? null : { id: best.id, open: best.open };
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

type HarborSocket = ReturnType<typeof useHarborSocket>;
type Predicted = PredictedPawn | null;

function HarborHud({ socket, predicted }: { socket: HarborSocket; predicted: Predicted }) {
  return (
    <>
      <div data-testid="harbor-pawn">{socket.pawnId ?? '-'}</div>
      <HudStatus socket={socket} />
      <div data-testid="harbor-pos">
        {predicted ? `x:${Math.round(predicted.x)} y:${Math.round(predicted.y)}` : 'x:? y:?'}
      </div>
      <HudVitals socket={socket} />
      <HudWatch socket={socket} />
      <HudManifest socket={socket} />
      <div data-testid="harbor-offer">
        {socket.offer === null ? 'offer:-' : `offer:${socket.offer.jobs.join('/')}`}
      </div>
      <div data-testid="harbor-notices">
        {socket.notices.length === 0
          ? 'notices:-'
          : socket.notices.map((notice) => `${notice.title}:${notice.message}`).join(' | ')}
      </div>
    </>
  );
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
        : 'offline'}
    </div>
  );
}

function HudVitals({ socket }: { socket: HarborSocket }) {
  const vitals = socket.vitals?.vitals;
  return (
    <div data-testid="harbor-vitals">
      {vitals === undefined
        ? 'vitals:-'
        : `hp:${Math.round(vitals.health)} hyp:${Math.round(vitals.hypoxia)} suit:${vitals.suitSealed ? 'sealed' : 'open'} hunger:${Math.round(vitals.hunger)} heat:${Math.round(vitals.heat)} mag:${vitals.ammo}/${vitals.reserve} spares:[${vitals.mags.join(',')}]${vitals.reloading ? '(reloading)' : ''} credits:${socket.vitals?.credits ?? 0}`}
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
        : `watch#${watch.watchNo} ${watch.remainingS}s ${watch.grade} tasks:${done}/${watch.checklist.length}`}
    </div>
  );
}

function HudManifest({ socket }: { socket: HarborSocket }) {
  return (
    <div data-testid="harbor-manifest">
      {socket.manifest === null
        ? 'crew:-'
        : `beacon:${socket.manifest.beacon} crew:${socket.manifest.crew.map((entry) => `${entry.callsign}:${entry.role}`).join(',')}`}
    </div>
  );
}

function shortId(id: string): string {
  const dot = id.indexOf('.');
  return dot < 0 ? id : id.slice(dot + 1);
}
