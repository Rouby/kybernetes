import type {
  BoardingTacticsTelemetry,
  DoorState,
  PawnState,
  StationFixture,
  WeaponType,
} from '@kybernetes/protocol';
import {
  HESPERIA_ROOMS,
  HESPERIA_STATIONS,
  HESPERIA_WALLS,
  type RoomDefinition,
} from '@kybernetes/sim-core';
import type React from 'react';
import { useEffect, useRef } from 'react';
import {
  type ActiveInteraction,
  renderAlertOverlay,
  renderBackground,
  renderBoarding,
  renderBulkheads,
  renderDeckFloors,
  renderDoorsAndVenting,
  renderFixture,
  renderHazards,
  renderLighting,
  renderPawn,
  renderProjectiles,
  renderRoundProgressBar,
  renderShipHull,
} from '../canvas';

function drawPrompt(
  ctx: CanvasRenderingContext2D,
  nearestStation: StationFixture,
  actionName?: string
) {
  const promptText = `[E] ${actionName || nearestStation.name}`;
  const promptY = nearestStation.y - nearestStation.radius - 14;

  ctx.font = 'bold 11px monospace';
  const textWidth = ctx.measureText(promptText).width;
  const pad = 8;

  ctx.fillStyle = 'rgba(10, 15, 23, 0.92)';
  ctx.strokeStyle = '#00e5ff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(nearestStation.x - textWidth / 2 - pad, promptY - 14, textWidth + pad * 2, 20, 3);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#00e5ff';
  ctx.textAlign = 'center';
  ctx.fillText(promptText, nearestStation.x, promptY);
}

function isInsideRoom(x: number, y: number, r: RoomDefinition): boolean {
  return x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;
}

function checkRoomExploration(x: number, y: number): string | null {
  const found = HESPERIA_ROOMS.find((r) => isInsideRoom(x, y, r));
  return found ? found.id : null;
}

// fallow-ignore-next-line complexity
function applyCanvasResize(canvas: HTMLCanvasElement, rect: DOMRectReadOnly) {
  const w = Math.round(rect.width);
  const h = Math.round(rect.height);
  if (w <= 0 || h <= 0) return;
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
}

// fallow-ignore-next-line complexity
function drawAimingCrosshair(
  ctx: CanvasRenderingContext2D,
  pawnX: number,
  pawnY: number,
  mouseX: number,
  mouseY: number
) {
  ctx.save();
  // Aiming laser guide
  ctx.strokeStyle = 'rgba(0, 229, 255, 0.28)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(pawnX, pawnY);
  ctx.lineTo(mouseX, mouseY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Crosshair reticle
  ctx.strokeStyle = '#00e5ff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(mouseX, mouseY, 7, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(mouseX - 10, mouseY);
  ctx.lineTo(mouseX - 4, mouseY);
  ctx.moveTo(mouseX + 4, mouseY);
  ctx.lineTo(mouseX + 10, mouseY);
  ctx.moveTo(mouseX, mouseY - 10);
  ctx.lineTo(mouseX, mouseY - 4);
  ctx.moveTo(mouseX, mouseY + 4);
  ctx.lineTo(mouseX, mouseY + 10);
  ctx.stroke();

  ctx.restore();
}

interface VesselCanvasProps {
  pawn: PawnState;
  nearestStation: StationFixture | null;
  activeInteraction?: ActiveInteraction | null;
  promptActionName?: string;
  alertLevel?: 'nominal' | 'yellow' | 'red';
  activeFires?: string[];
  breaches?: string[];
  boarding?: BoardingTacticsTelemetry;
  equippedWeapon?: WeaponType;
  onStationClick?: (station: StationFixture) => void;
  onEngageIntruder?: (intruderId: string) => void;
  onFireWeapon?: (
    originX: number,
    originY: number,
    targetX: number,
    targetY: number,
    weaponType: WeaponType
  ) => void;
  onToggleDoor?: (doorId: string, open: boolean) => void;
}

// fallow-ignore-next-line complexity
function handleCanvasClick(
  e: React.MouseEvent<HTMLCanvasElement>,
  canvas: HTMLCanvasElement | null,
  camera: { x: number; y: number },
  pawn: PawnState,
  equippedWeapon: WeaponType,
  doors: DoorState[] | undefined,
  nearestStation: StationFixture | null,
  onStationClick?: (station: StationFixture) => void,
  onToggleDoor?: (doorId: string, open: boolean) => void,
  onFireWeapon?: (
    originX: number,
    originY: number,
    targetX: number,
    targetY: number,
    weaponType: WeaponType
  ) => void
) {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const clickY = e.clientY - rect.top;
  const worldX = clickX - canvas.width / 2 + camera.x;
  const worldY = clickY - canvas.height / 2 + camera.y;

  // 1. Check if clicked an in-world door
  if (doors && onToggleDoor) {
    const clickedDoor = doors.find((d) => {
      const mx = (d.x1 + d.x2) / 2;
      const my = (d.y1 + d.y2) / 2;
      return Math.hypot(mx - worldX, my - worldY) < 32;
    });
    if (clickedDoor) {
      onToggleDoor(clickedDoor.id, !clickedDoor.isOpen);
      return;
    }
  }

  // 2. Check if clicked nearest station
  if (nearestStation && onStationClick) {
    const distToStation = Math.hypot(nearestStation.x - worldX, nearestStation.y - worldY);
    if (distToStation < nearestStation.radius + 10) {
      onStationClick(nearestStation);
      return;
    }
  }

  // 3. Else: Fire equipped weapon towards mouse click coordinates!
  if (onFireWeapon) {
    onFireWeapon(pawn.x, pawn.y, worldX, worldY, equippedWeapon);
  }
}

// fallow-ignore-next-line complexity
export const VesselCanvas: React.FC<VesselCanvasProps> = ({
  pawn,
  nearestStation,
  activeInteraction,
  promptActionName,
  alertLevel = 'nominal',
  activeFires = [],
  breaches = [],
  boarding,
  equippedWeapon = 'kinetic_carbine',
  onStationClick,
  onFireWeapon,
  onToggleDoor,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraRef = useRef({ x: pawn.x, y: pawn.y });
  const mouseWorldRef = useRef({ x: pawn.x + 50, y: pawn.y });
  const exploredRoomsRef = useRef<Set<string>>(new Set(['engineering', 'corridor']));

  useEffect(() => {
    const roomId = checkRoomExploration(pawn.x, pawn.y);
    if (roomId) exploredRoomsRef.current.add(roomId);
  }, [pawn.x, pawn.y]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas?.parentElement) return;

    const observer = new ResizeObserver((entries) => {
      if (entries[0]) applyCanvasResize(canvas, entries[0].contentRect);
    });

    observer.observe(canvas.parentElement);
    return () => observer.disconnect();
  }, []);

  // Handle Space key to fire towards mouse crosshair
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && onFireWeapon) {
        e.preventDefault();
        onFireWeapon(
          pawn.x,
          pawn.y,
          mouseWorldRef.current.x,
          mouseWorldRef.current.y,
          equippedWeapon
        );
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pawn.x, pawn.y, equippedWeapon, onFireWeapon]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    // fallow-ignore-next-line complexity
    const render = () => {
      if (canvas.width === 0 || canvas.height === 0) {
        animId = requestAnimationFrame(render);
        return;
      }

      // Smooth camera lerp tracking pawn
      cameraRef.current.x += (pawn.x - cameraRef.current.x) * 0.12;
      cameraRef.current.y += (pawn.y - cameraRef.current.y) * 0.12;

      // Layer 0: Deep space starfield & nebula
      renderBackground(ctx, canvas.width, canvas.height, cameraRef.current.x, cameraRef.current.y);

      ctx.save();
      ctx.translate(
        Math.round(canvas.width / 2 - cameraRef.current.x),
        Math.round(canvas.height / 2 - cameraRef.current.y)
      );

      // Layer 1: FTL-style outer ship armor hull & thrusters
      renderShipHull(ctx);

      // Layer 2: Authentic FTL square grid floors & stamped system emblems
      renderDeckFloors(
        ctx,
        HESPERIA_ROOMS,
        exploredRoomsRef.current,
        boarding?.roomO2,
        boarding?.ventedRooms
      );

      // Layer 3: FTL-style bulkheads
      renderBulkheads(ctx, HESPERIA_WALLS, HESPERIA_ROOMS, exploredRoomsRef.current);

      // Layer 3.5: Operable interior blast doors & exterior hull airlocks with venting streams
      if (boarding?.doors) {
        renderDoorsAndVenting(ctx, boarding.doors, performance.now());
      }

      // Layer 4: Detailed Rimworld-style mechanical fixtures
      for (const st of HESPERIA_STATIONS) {
        renderFixture(ctx, st, nearestStation?.id === st.id);
      }

      // Layer 5: Active hazards (multi-particle fires & breach decompression)
      renderHazards(ctx, activeFires, breaches);

      // Layer 5.5: Hostile boarding pods, raiders, and sentry guns
      renderBoarding(ctx, boarding, performance.now());

      // Layer 5.8: Active gun projectiles (cyan lasers and red raider plasma)
      if (boarding?.projectiles) {
        renderProjectiles(ctx, boarding.projectiles);
      }

      // Layer 6: Rimworld-style capsule pawn with directional hands
      renderPawn(ctx, pawn);

      // Aiming crosshair & laser sight
      drawAimingCrosshair(ctx, pawn.x, pawn.y, mouseWorldRef.current.x, mouseWorldRef.current.y);

      // Layer 7: Line of Sight raycast lighting & flashlight beam
      renderLighting(ctx, pawn);

      // Layer 8: Round Progress Bar if an interaction is active; otherwise interaction prompt
      if (activeInteraction) {
        renderRoundProgressBar(ctx, activeInteraction);
      } else if (nearestStation) {
        drawPrompt(ctx, nearestStation, promptActionName);
      }

      ctx.restore();

      // Layer 9: Screen-space alert overlay & klaxon
      renderAlertOverlay(ctx, canvas.width, canvas.height, alertLevel);

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [
    pawn,
    nearestStation,
    activeInteraction,
    promptActionName,
    alertLevel,
    activeFires,
    breaches,
    boarding,
  ]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        display: 'block',
        cursor: 'crosshair',
      }}
      onMouseMove={(e) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;
        mouseWorldRef.current = {
          x: clickX - canvas.width / 2 + cameraRef.current.x,
          y: clickY - canvas.height / 2 + cameraRef.current.y,
        };
      }}
      onClick={(e) =>
        handleCanvasClick(
          e,
          canvasRef.current,
          cameraRef.current,
          pawn,
          equippedWeapon,
          boarding?.doors,
          nearestStation,
          onStationClick,
          onToggleDoor,
          onFireWeapon
        )
      }
    />
  );
};
