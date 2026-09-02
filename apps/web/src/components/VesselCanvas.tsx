import type { PawnState, StationFixture } from '@kybernetes/protocol';
import {
  HESPERIA_ROOMS,
  HESPERIA_STATIONS,
  HESPERIA_WALLS,
  type RoomDefinition,
} from '@kybernetes/sim-core';
import type React from 'react';
import { useEffect, useRef } from 'react';
import {
  renderAlertOverlay,
  renderBackground,
  renderBulkheads,
  renderDeckFloors,
  renderFixture,
  renderHazards,
  renderLighting,
  renderPawn,
  renderShipHull,
} from '../canvas';

function drawPrompt(ctx: CanvasRenderingContext2D, nearestStation: StationFixture) {
  const promptText = nearestStation.prompt || `[E] ${nearestStation.name}`;
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

interface VesselCanvasProps {
  pawn: PawnState;
  nearestStation: StationFixture | null;
  alertLevel?: 'nominal' | 'yellow' | 'red';
  activeFires?: string[];
  breaches?: string[];
  onStationClick?: (station: StationFixture) => void;
}

// fallow-ignore-next-line complexity
export const VesselCanvas: React.FC<VesselCanvasProps> = ({
  pawn,
  nearestStation,
  alertLevel = 'nominal',
  activeFires = [],
  breaches = [],
  onStationClick,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraRef = useRef({ x: pawn.x, y: pawn.y });
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

      // Layer 2: Room-specific floor plates & ambient occlusion shadows
      renderDeckFloors(ctx, HESPERIA_ROOMS, exploredRoomsRef.current);

      // Layer 3: FTL-style bulkheads and room subsystem emblems
      renderBulkheads(ctx, HESPERIA_WALLS, HESPERIA_ROOMS, exploredRoomsRef.current);

      // Layer 4: Detailed Rimworld-style mechanical fixtures
      for (const st of HESPERIA_STATIONS) {
        renderFixture(ctx, st, nearestStation?.id === st.id);
      }

      // Layer 5: Active hazards (multi-particle fires & breach decompression)
      renderHazards(ctx, activeFires, breaches);

      // Layer 6: Rimworld-style capsule pawn with directional hands
      renderPawn(ctx, pawn);

      // Layer 7: Line of Sight raycast lighting & flashlight beam
      renderLighting(ctx, pawn);

      // Layer 8: In-world interaction prompt
      if (nearestStation) drawPrompt(ctx, nearestStation);

      ctx.restore();

      // Layer 9: Screen-space alert overlay & klaxon
      renderAlertOverlay(ctx, canvas.width, canvas.height, alertLevel);

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [pawn, nearestStation, alertLevel, activeFires, breaches]);

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
        cursor: nearestStation ? 'pointer' : 'crosshair',
      }}
      onClick={() => {
        if (nearestStation && onStationClick) {
          onStationClick(nearestStation);
        }
      }}
    />
  );
};
