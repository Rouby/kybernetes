import type { PawnState, StationFixture } from '@kybernetes/protocol';
import {
  computeVisibilityPolygon,
  HESPERIA_ROOMS,
  HESPERIA_STATIONS,
  HESPERIA_WALLS,
  type RoomDefinition,
} from '@kybernetes/sim-core';
import type React from 'react';
import { useEffect, useRef } from 'react';

const FIXTURE_COLORS: Record<string, string> = {
  bunk: '#ffb000',
  reactor: '#ff2244',
  mess: '#00e5ff',
  armory: '#ff2244',
  hydroponics: '#00ff66',
  cargo: '#ffaa33',
  bridge: '#00e5ff',
};

function drawDeckGrid(ctx: CanvasRenderingContext2D, room: RoomDefinition) {
  ctx.strokeStyle = '#121d2c';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let gx = room.x; gx <= room.x + room.width; gx += 40) {
    ctx.moveTo(gx, room.y);
    ctx.lineTo(gx, room.y + room.height);
  }
  for (let gy = room.y; gy <= room.y + room.height; gy += 40) {
    ctx.moveTo(room.x, gy);
    ctx.lineTo(room.x + room.width, gy);
  }
  ctx.stroke();
}

function drawDeckRoom(ctx: CanvasRenderingContext2D, room: RoomDefinition, isExplored: boolean) {
  ctx.fillStyle = isExplored ? '#0b111a' : '#05070a';
  ctx.fillRect(room.x, room.y, room.width, room.height);
  drawDeckGrid(ctx, room);

  if (isExplored) {
    ctx.font = '10px monospace';
    ctx.fillStyle = '#2c405c';
    ctx.fillText(room.tag, room.x + 8, room.y + 18);
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#40597a';
    ctx.fillText(room.name, room.x + 8, room.y + 34);
  }
}

function drawDeckLayer(ctx: CanvasRenderingContext2D, exploredRooms: Set<string>) {
  for (const room of HESPERIA_ROOMS) {
    drawDeckRoom(ctx, room, exploredRooms.has(room.id));
  }

  ctx.strokeStyle = '#22354c';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const wall of HESPERIA_WALLS) {
    ctx.moveTo(wall.x1, wall.y1);
    ctx.lineTo(wall.x2, wall.y2);
  }
  ctx.stroke();

  ctx.strokeStyle = '#00e5ff33';
  ctx.lineWidth = 2;
  ctx.strokeRect(60, 60, 1080, 680);
}

// fallow-ignore-next-line complexity
function drawStationFixture(
  ctx: CanvasRenderingContext2D,
  station: StationFixture,
  isNear: boolean
) {
  const theme = isNear
    ? { fill: '#142c40', stroke: '#00e5ff', width: 2, text: '#00e5ff' }
    : { fill: '#101a26', stroke: '#23374d', width: 1.5, text: '#6b829e' };

  ctx.fillStyle = theme.fill;
  ctx.strokeStyle = theme.stroke;
  ctx.lineWidth = theme.width;
  ctx.beginPath();
  ctx.arc(station.x, station.y, station.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  const color = FIXTURE_COLORS[station.stationType] || '#00e5ff';
  ctx.fillStyle = color;
  ctx.fillRect(station.x - 6, station.y - 6, 12, 12);

  ctx.font = '10px monospace';
  ctx.fillStyle = theme.text;
  ctx.textAlign = 'center';
  ctx.fillText(station.name, station.x, station.y + station.radius + 14);
}

function getPawnStatus(pawn: PawnState): { text: string; color: string } | null {
  if (pawn.isResting) return { text: '[RESTING]', color: '#ffb000' };
  if (pawn.isOperating) return { text: '[OPERATING]', color: '#00e5ff' };
  return null;
}

// fallow-ignore-next-line complexity
function drawPawn(ctx: CanvasRenderingContext2D, pawn: PawnState) {
  const color = pawn.color || '#ffb000';
  ctx.save();
  ctx.translate(pawn.x, pawn.y);

  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, 14, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#182433';
  ctx.beginPath();
  ctx.arc(0, 0, 12, 0, Math.PI * 2);
  ctx.fill();

  ctx.rotate(pawn.facingAngle);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(12, 0);
  ctx.lineTo(2, -5);
  ctx.lineTo(5, 0);
  ctx.lineTo(2, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.font = '11px sans-serif';
  ctx.fillStyle = '#e0e8f5';
  ctx.textAlign = 'center';
  ctx.fillText(pawn.callsign, pawn.x, pawn.y - 20);

  const status = getPawnStatus(pawn);
  if (status) {
    ctx.font = '9px monospace';
    ctx.fillStyle = status.color;
    ctx.fillText(status.text, pawn.x, pawn.y - 32);
  }
}

function drawLightingPass(ctx: CanvasRenderingContext2D, pawn: PawnState) {
  const visPolygon = computeVisibilityPolygon({ x: pawn.x, y: pawn.y }, 340, HESPERIA_WALLS);

  ctx.save();
  ctx.beginPath();
  if (visPolygon.length > 0) {
    ctx.moveTo(visPolygon[0].x, visPolygon[0].y);
    for (let i = 1; i < visPolygon.length; i++) {
      ctx.lineTo(visPolygon[i].x, visPolygon[i].y);
    }
    ctx.closePath();
  }
  ctx.clip();

  const ambientGrad = ctx.createRadialGradient(pawn.x, pawn.y, 10, pawn.x, pawn.y, 340);
  ambientGrad.addColorStop(0, 'rgba(0, 229, 255, 0.15)');
  ambientGrad.addColorStop(1, 'rgba(0, 0, 0, 0.4)');
  ctx.fillStyle = ambientGrad;
  ctx.fillRect(pawn.x - 350, pawn.y - 350, 700, 700);

  ctx.save();
  ctx.translate(pawn.x, pawn.y);
  ctx.rotate(pawn.facingAngle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, 320, -Math.PI / 4, Math.PI / 4);
  ctx.closePath();
  const flashGrad = ctx.createRadialGradient(0, 0, 20, 0, 0, 320);
  flashGrad.addColorStop(0, 'rgba(255, 255, 255, 0.25)');
  flashGrad.addColorStop(1, 'rgba(0, 229, 255, 0)');
  ctx.fillStyle = flashGrad;
  ctx.fill();
  ctx.restore();

  ctx.restore();
}

function drawPrompt(ctx: CanvasRenderingContext2D, nearestStation: StationFixture) {
  const promptText = nearestStation.prompt || `[E] ${nearestStation.name}`;
  const promptY = nearestStation.y - nearestStation.radius - 12;

  ctx.font = 'bold 11px monospace';
  const textWidth = ctx.measureText(promptText).width;
  const pad = 6;

  ctx.fillStyle = 'rgba(15, 20, 29, 0.9)';
  ctx.strokeStyle = '#00e5ff';
  ctx.lineWidth = 1;
  ctx.fillRect(nearestStation.x - textWidth / 2 - pad, promptY - 12, textWidth + pad * 2, 18);
  ctx.strokeRect(nearestStation.x - textWidth / 2 - pad, promptY - 12, textWidth + pad * 2, 18);

  ctx.fillStyle = '#00e5ff';
  ctx.textAlign = 'center';
  ctx.fillText(promptText, nearestStation.x, promptY + 1);
}

function isInsideRoom(x: number, y: number, r: RoomDefinition): boolean {
  return x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;
}

// fallow-ignore-next-line complexity
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
  onStationClick?: (station: StationFixture) => void;
}

export const VesselCanvas: React.FC<VesselCanvasProps> = ({
  pawn,
  nearestStation,
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

      cameraRef.current.x += (pawn.x - cameraRef.current.x) * 0.12;
      cameraRef.current.y += (pawn.y - cameraRef.current.y) * 0.12;

      ctx.fillStyle = '#06080c';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      ctx.translate(
        Math.round(canvas.width / 2 - cameraRef.current.x),
        Math.round(canvas.height / 2 - cameraRef.current.y)
      );

      drawDeckLayer(ctx, exploredRoomsRef.current);
      for (const st of HESPERIA_STATIONS) {
        drawStationFixture(ctx, st, nearestStation?.id === st.id);
      }
      drawPawn(ctx, pawn);
      drawLightingPass(ctx, pawn);
      if (nearestStation) drawPrompt(ctx, nearestStation);

      ctx.restore();
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [pawn, nearestStation]);

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
