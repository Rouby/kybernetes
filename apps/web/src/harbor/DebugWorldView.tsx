/**
 * DebugWorldView: pawn-less observer canvas for the live harbor world plus
 * the authoritative air sim. Fed by the same-port OBSERVE transport, so it
 * never owns a pawn, never sends INPUT, and never evicts the player.
 * Camera defaults to whole-sim overview; click a pawn to follow it, F for
 * overview, O cycles the air overlay. Server TPS + pawn link quality come
 * from SERVER_STATS; docking legibility from DOCK_STATUS.
 */

import type {
  DockStatusBroadcast,
  ServerStatsBroadcast,
  SnapshotBroadcast,
  TelemetryBroadcast,
} from '@kybernetes/protocol';
import { HARBOR_DOCK, type World } from '@kybernetes/sim-core';
import { hudColors, hudTypography } from '@kybernetes/ui-tokens/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  type Camera,
  cameraFor,
  nearestPawn,
  paintDecals,
  paintImpacts,
  paintRoomLabel,
  paintShipMarker,
  toScreen,
} from './debugPaint';
import {
  buildDebugPawns,
  buildDebugPortals,
  buildDebugRooms,
  type DebugOverlayMode,
  type DebugPawn,
  type DebugPortal,
  type DebugRoom,
  portalColor,
  roomOverlayColor,
} from './debugWorld';
import { dockChipText, formatPawnLink, formatServerStats } from './renderState';

const styles = stylex.create({
  root: {
    position: 'relative',
    width: '100vw',
    height: '100vh',
    backgroundColor: hudColors.bgVoid,
    overflow: 'hidden',
  },
  canvas: {
    width: '100%',
    height: '100%',
    display: 'block',
  },
  panel: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: hudColors.bgPanel,
    borderColor: hudColors.borderDim,
    borderWidth: 1,
    borderStyle: 'solid',
    padding: 10,
    fontFamily: hudTypography.fontMono,
    fontSize: 12,
    color: hudColors.textPrimary,
    maxWidth: 380,
  },
  title: {
    color: hudColors.cyanTelemetry,
    fontSize: 13,
    marginBottom: 4,
  },
  row: {
    color: hudColors.textSecondary,
    marginBottom: 2,
  },
  legend: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    color: hudColors.textMuted,
  },
  hint: {
    marginTop: 6,
    color: hudColors.textMuted,
  },
});

export interface DebugWorldViewProps {
  readonly staticWorld: World;
  readonly snapshot: SnapshotBroadcast | null;
  readonly telemetry: TelemetryBroadcast | null;
  readonly stats: ServerStatsBroadcast | null;
  readonly dock: DockStatusBroadcast | null;
}

const OVERLAY_ORDER: readonly DebugOverlayMode[] = ['pressure', 'o2', 'temp'];

export function DebugWorldView(props: DebugWorldViewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [overlay, setOverlay] = useState<DebugOverlayMode>('pressure');
  const [followId, setFollowId] = useState<string | null>(null);
  const rooms = useMemo(
    () => buildDebugRooms(props.staticWorld, props.snapshot, props.telemetry),
    [props.staticWorld, props.snapshot, props.telemetry]
  );
  const portals = useMemo(
    () => buildDebugPortals(props.staticWorld, props.snapshot, props.telemetry),
    [props.staticWorld, props.snapshot, props.telemetry]
  );
  const pawns = useMemo(() => buildDebugPawns(props.snapshot, null), [props.snapshot]);
  useOverlayKeys(setOverlay, setFollowId);
  useDebugPaint(canvasRef, rooms, portals, pawns, props.snapshot, overlay, followId);
  useFollowClick(canvasRef, rooms, pawns, followId, setFollowId);
  return (
    <div {...stylex.props(styles.root)}>
      <canvas ref={canvasRef} data-testid="debug-world-canvas" {...stylex.props(styles.canvas)} />
      <DebugPanel
        snapshot={props.snapshot}
        telemetry={props.telemetry}
        stats={props.stats}
        dock={props.dock}
        rooms={rooms}
        portals={portals}
        overlay={overlay}
        followId={followId}
      />
    </div>
  );
}

function useOverlayKeys(
  setOverlay: (updater: (mode: DebugOverlayMode) => DebugOverlayMode) => void,
  setFollowId: (id: string | null) => void
): void {
  useEffect(() => {
    const onDown = (event: KeyboardEvent): void => {
      const key = event.key.toLowerCase();
      if (key === 'o') setOverlay((mode) => nextOverlay(mode));
      if (key === 'f') setFollowId(null);
    };
    window.addEventListener('keydown', onDown);
    return () => window.removeEventListener('keydown', onDown);
  }, [setOverlay, setFollowId]);
}

function nextOverlay(mode: DebugOverlayMode): DebugOverlayMode {
  const index = OVERLAY_ORDER.indexOf(mode);
  return OVERLAY_ORDER[(index + 1) % OVERLAY_ORDER.length] ?? 'pressure';
}

function useDebugPaint(
  canvasRef: { current: HTMLCanvasElement | null },
  rooms: readonly DebugRoom[],
  portals: readonly DebugPortal[],
  pawns: readonly DebugPawn[],
  snapshot: SnapshotBroadcast | null,
  overlay: DebugOverlayMode,
  followId: string | null
): void {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const parent = canvas.parentElement;
    if (parent === null) return;
    fitCanvas(canvas, parent);
    const ctx = canvas.getContext('2d');
    if (ctx === null) return;
    paintDebug(ctx, canvas, rooms, portals, pawns, snapshot, overlay, followId);
  }, [canvasRef, rooms, portals, pawns, snapshot, overlay, followId]);
}

function fitCanvas(canvas: HTMLCanvasElement, parent: HTMLElement): void {
  const w = Math.max(320, Math.floor(parent.clientWidth));
  const h = Math.max(320, Math.floor(parent.clientHeight));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}

function useFollowClick(
  canvasRef: { current: HTMLCanvasElement | null },
  rooms: readonly DebugRoom[],
  pawns: readonly DebugPawn[],
  followId: string | null,
  setFollowId: (id: string | null) => void
): void {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const onClick = (event: MouseEvent): void => {
      const rect = canvas.getBoundingClientRect();
      const sx = (event.clientX - rect.left) * (canvas.width / Math.max(rect.width, 1));
      const sy = (event.clientY - rect.top) * (canvas.height / Math.max(rect.height, 1));
      const camera = cameraFor(canvas, rooms, pawns, followId);
      setFollowId(nearestPawn(pawns, (pawn) => toScreen(canvas, camera, pawn.x, pawn.y), sx, sy));
    };
    canvas.addEventListener('click', onClick);
    return () => canvas.removeEventListener('click', onClick);
  }, [canvasRef, rooms, pawns, followId, setFollowId]);
}

function paintDebug(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  rooms: readonly DebugRoom[],
  portals: readonly DebugPortal[],
  pawns: readonly DebugPawn[],
  snapshot: SnapshotBroadcast | null,
  overlay: DebugOverlayMode,
  followId: string | null
): void {
  const camera = cameraFor(canvas, rooms, pawns, followId);
  ctx.fillStyle = '#07090d';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  paintRooms(ctx, canvas, camera, rooms, overlay);
  paintPortals(ctx, canvas, camera, portals);
  paintWind(ctx, canvas, camera, portals);
  paintImpacts(ctx, canvas, camera, snapshot);
  paintDecals(ctx, canvas, camera, snapshot);
  paintDockLink(ctx, canvas, camera, snapshot);
  paintPawns(ctx, canvas, camera, pawns, followId);
  paintShipMarker(ctx, canvas, rooms, followId);
}

function paintRooms(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  camera: Camera,
  rooms: readonly DebugRoom[],
  overlay: DebugOverlayMode
): void {
  ctx.font = '12px "Courier New", monospace';
  for (const room of rooms) {
    const top = toScreen(canvas, camera, room.x, room.y);
    const w = room.w * camera.scale;
    const h = room.h * camera.scale;
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = roomOverlayColor(room, overlay);
    ctx.fillRect(top.x, top.y, w, h);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = room.venting ? '#f85149' : '#2e415e';
    ctx.lineWidth = room.venting ? 2 : 1;
    ctx.strokeRect(top.x, top.y, w, h);
    paintRoomLabel(ctx, room, top.x, top.y, w);
  }
}

function paintPortals(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  camera: Camera,
  portals: readonly DebugPortal[]
): void {
  ctx.lineWidth = 3;
  for (const portal of portals) {
    const a = toScreen(canvas, camera, portal.x1, portal.y1);
    const b = toScreen(canvas, camera, portal.x2, portal.y2);
    ctx.strokeStyle = portalColor(portal.state);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}

function paintWind(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  camera: Camera,
  portals: readonly DebugPortal[]
): void {
  ctx.strokeStyle = '#00e5ff';
  ctx.fillStyle = '#00e5ff';
  ctx.lineWidth = 1.5;
  for (const portal of portals) {
    if (Math.abs(portal.velocityMps) < 0.5) continue;
    paintArrow(ctx, canvas, camera, portal);
  }
}

function paintArrow(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  camera: Camera,
  portal: DebugPortal
): void {
  const mid = toScreen(canvas, camera, portal.midX, portal.midY);
  const length = Math.min(8 + Math.abs(portal.velocityMps) * 1.5, 44);
  const dir = portal.velocityMps >= 0 ? 1 : -1;
  const dx = portal.axisX * dir * length;
  const dy = portal.axisY * dir * length;
  ctx.beginPath();
  ctx.moveTo(mid.x, mid.y);
  ctx.lineTo(mid.x + dx, mid.y + dy);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(mid.x + dx, mid.y + dy, 2.5, 0, Math.PI * 2);
  ctx.fill();
}

/** Solid seamless tube: station tube mouth to ship mouth in world space. */
function paintDockLink(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  camera: Camera,
  snapshot: SnapshotBroadcast | null
): void {
  if (snapshot === null) return;
  const mouth = HARBOR_DOCK.mouthWorld;
  const a = toScreen(canvas, camera, mouth.x1, mouth.y1);
  const b = toScreen(canvas, camera, mouth.x2, mouth.y2);
  ctx.save();
  ctx.strokeStyle = '#3a4a63';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#00e5ff';
  for (const pt of [a, b]) {
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function paintPawns(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  camera: Camera,
  pawns: readonly DebugPawn[],
  followId: string | null
): void {
  for (const pawn of pawns) {
    const at = toScreen(canvas, camera, pawn.x, pawn.y);
    const radius = Math.max(4, 12 * camera.scale);
    ctx.fillStyle = pawn.color;
    ctx.beginPath();
    ctx.arc(at.x, at.y, radius, 0, Math.PI * 2);
    ctx.fill();
    paintFacing(ctx, at, pawn.facing, radius);
    if (pawn.id === followId) ringFollowed(ctx, at, radius);
  }
}

function paintFacing(
  ctx: CanvasRenderingContext2D,
  at: { x: number; y: number },
  facing: number,
  radius: number
): void {
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(at.x, at.y);
  ctx.lineTo(at.x + Math.cos(facing) * (radius + 8), at.y + Math.sin(facing) * (radius + 8));
  ctx.stroke();
}

function ringFollowed(
  ctx: CanvasRenderingContext2D,
  at: { x: number; y: number },
  radius: number
): void {
  ctx.strokeStyle = '#00e5ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(at.x, at.y, radius + 5, 0, Math.PI * 2);
  ctx.stroke();
}

function debugTickLine(snapshot: SnapshotBroadcast | null): string {
  if (snapshot === null) return 'offline';
  return `tick:${snapshot.tick} pawns:${snapshot.pawns.length} decals:${snapshot.decals?.length ?? 0}`;
}

function debugDockLine(dock: DockStatusBroadcast | null): string {
  if (dock === null) return 'dock:?';
  return `${dockChipText(dock)} phase:${dock.phase} seals:${dock.secondsToSeal}s`;
}

function debugAirLine(
  rooms: readonly DebugRoom[],
  portals: readonly DebugPortal[],
  overlay: DebugOverlayMode,
  followId: string | null
): string {
  const vents = rooms.filter((room) => room.venting).length;
  const winds = portals.filter((portal) => Math.abs(portal.velocityMps) >= 0.5).length;
  const follow = followId === null ? 'overview' : `follow:${followId}`;
  return `rooms:${rooms.length} vents:${vents} winds:${winds} overlay:${overlay} ${follow}`;
}

function debugLinksLine(links: ServerStatsBroadcast['pawns']): string {
  if (links.length === 0) return 'links:-';
  return links.map((link) => formatPawnLink(link)).join(' | ');
}

function DebugPanel(props: {
  readonly snapshot: SnapshotBroadcast | null;
  readonly telemetry: TelemetryBroadcast | null;
  readonly stats: ServerStatsBroadcast | null;
  readonly dock: DockStatusBroadcast | null;
  readonly rooms: readonly DebugRoom[];
  readonly portals: readonly DebugPortal[];
  readonly overlay: DebugOverlayMode;
  readonly followId: string | null;
}): React.JSX.Element {
  const links = props.stats?.pawns ?? [];
  return (
    <div {...stylex.props(styles.panel)} data-testid="debug-world-panel">
      <div {...stylex.props(styles.title)}>WORLD + AIR DEBUG · OBSERVER</div>
      <div {...stylex.props(styles.row)} data-testid="debug-world-tick">
        {debugTickLine(props.snapshot)}
      </div>
      <div {...stylex.props(styles.row)} data-testid="debug-world-server">
        {formatServerStats(props.stats)}
      </div>
      <div {...stylex.props(styles.row)} data-testid="debug-world-dock">
        {debugDockLine(props.dock)}
      </div>
      <div {...stylex.props(styles.row)} data-testid="debug-world-air">
        {debugAirLine(props.rooms, props.portals, props.overlay, props.followId)}
      </div>
      <div {...stylex.props(styles.row)} data-testid="debug-world-links">
        {debugLinksLine(links)}
      </div>
      <div {...stylex.props(styles.legend)}>
        <LegendDot color="#3fb950" label="nominal" />
        <LegendDot color="#d29922" label="low" />
        <LegendDot color="#f85149" label="vent" />
        <LegendDot color="#00e5ff" label="wind" />
      </div>
      <div {...stylex.props(styles.hint)}>
        O overlay · F overview · click pawn to follow · read-only OBSERVE
      </div>
    </div>
  );
}

function LegendDot(props: { readonly color: string; readonly label: string }): React.JSX.Element {
  return (
    <span {...stylex.props(styles.legendItem)}>
      <span style={{ width: 10, height: 10, borderRadius: 5, background: props.color }} />
      {props.label}
    </span>
  );
}
