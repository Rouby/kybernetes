import type { RoomDefinition } from '@kybernetes/sim-core';

// Helper to draw iconic FTL diagonal vacuum warning stripes (pink/red hazard)
function drawFtlVacuumStripes(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  // FTL low-O2 pale red background
  ctx.fillStyle = '#ffcdd2';
  ctx.fillRect(x, y, w, h);

  // FTL diagonal warning stripes
  ctx.strokeStyle = '#ef9a9a';
  ctx.lineWidth = 10;
  for (let sx = x - h; sx < x + w + h; sx += 22) {
    ctx.beginPath();
    ctx.moveTo(sx, y);
    ctx.lineTo(sx + h, y + h);
    ctx.stroke();
  }

  // Warning text in center
  ctx.font = 'bold 12px monospace';
  ctx.fillStyle = '#b71c1c';
  ctx.fillText('⚠ VACUUM / DECOMPRESSED', x + 15, y + 25);

  ctx.restore();
}

// Stamped FTL system floor emblems directly on the grid
// fallow-ignore-next-line complexity
function drawFtlFloorEmblem(ctx: CanvasRenderingContext2D, room: RoomDefinition) {
  const cx = room.x + room.width / 2;
  const cy = room.y + room.height / 2;

  ctx.save();

  if (room.id === 'mess' || room.id === 'lifesupport') {
    // [O2] Emblem
    ctx.fillStyle = 'rgba(2, 132, 199, 0.18)';
    ctx.fillRect(cx - 30, cy - 20, 60, 40);
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cx - 30, cy - 20, 60, 40);
    ctx.font = 'bold 18px monospace';
    ctx.fillStyle = '#0369a1';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('O2', cx, cy);
  } else if (room.id === 'engineering') {
    // [ENG] Emblem
    ctx.fillStyle = 'rgba(234, 88, 12, 0.16)';
    ctx.beginPath();
    ctx.arc(cx, cy, 32, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ea580c';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = '#c2410c';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ENG', cx, cy);
  } else if (room.id === 'armory') {
    // [WPN] Emblem
    ctx.fillStyle = 'rgba(220, 38, 38, 0.16)';
    ctx.fillRect(cx - 28, cy - 20, 56, 40);
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cx - 28, cy - 20, 56, 40);
    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = '#b91c1c';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('WPN', cx, cy);
  } else if (room.id === 'bridge') {
    // [NAV] Emblem
    ctx.fillStyle = 'rgba(14, 165, 233, 0.16)';
    ctx.beginPath();
    ctx.arc(cx, cy, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = '#0369a1';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('NAV', cx, cy);
  } else if (room.id === 'quarters') {
    // [MED] Emblem
    ctx.fillStyle = 'rgba(22, 163, 74, 0.16)';
    ctx.fillRect(cx - 24, cy - 24, 48, 48);
    ctx.strokeStyle = '#16a34a';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cx - 24, cy - 24, 48, 48);
    ctx.fillStyle = '#15803d';
    ctx.fillRect(cx - 5, cy - 16, 10, 32);
    ctx.fillRect(cx - 16, cy - 5, 32, 10);
  } else if (room.id === 'cargo') {
    // [CRG] Emblem
    ctx.fillStyle = 'rgba(180, 83, 9, 0.16)';
    ctx.fillRect(cx - 36, cy - 24, 72, 48);
    ctx.strokeStyle = '#b45309';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cx - 36, cy - 24, 72, 48);
    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = '#92400e';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('CARGO', cx, cy);
  }

  ctx.restore();
}

// Authentic FTL 35px square grid floor tiles
// fallow-ignore-next-line complexity
function drawFtlGridFloor(ctx: CanvasRenderingContext2D, room: RoomDefinition, isVented: boolean) {
  const { x, y, width: w, height: h } = room;

  if (isVented) {
    drawFtlVacuumStripes(ctx, x, y, w, h);
    return;
  }

  // Crisp FTL off-white/light-grey tile background
  ctx.fillStyle = room.id === 'corridor' ? '#e2e6eb' : '#edf0f5';
  ctx.fillRect(x, y, w, h);

  // 35px square grid cells with subtle border lines
  const gridSize = 35;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
  ctx.lineWidth = 1;

  for (let gx = x; gx <= x + w; gx += gridSize) {
    ctx.beginPath();
    ctx.moveTo(gx, y);
    ctx.lineTo(gx, y + h);
    ctx.stroke();
  }
  for (let gy = y; gy <= y + h; gy += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, gy);
    ctx.lineTo(x + w, gy);
    ctx.stroke();
  }

  // Draw stamped system emblem
  drawFtlFloorEmblem(ctx, room);

  // Subtle interior shadow along top & left bulkheads
  const topGrad = ctx.createLinearGradient(x, y, x, y + 8);
  topGrad.addColorStop(0, 'rgba(0, 0, 0, 0.18)');
  topGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = topGrad;
  ctx.fillRect(x, y, w, 8);

  const leftGrad = ctx.createLinearGradient(x, y, x + 8, y);
  leftGrad.addColorStop(0, 'rgba(0, 0, 0, 0.18)');
  leftGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = leftGrad;
  ctx.fillRect(x, y, 8, h);
}

// fallow-ignore-next-line complexity
export function renderDeckFloors(
  ctx: CanvasRenderingContext2D,
  rooms: RoomDefinition[],
  exploredRooms: Set<string>,
  roomO2Levels?: Record<string, number>,
  ventedRooms?: string[]
): void {
  for (const room of rooms) {
    if (exploredRooms.has(room.id)) {
      const o2 = roomO2Levels?.[room.id] ?? 100;
      const isVented = ventedRooms?.includes(room.id) || o2 < 25;

      drawFtlGridFloor(ctx, room, isVented);

      // Clean room label in top-left
      ctx.font = 'bold 9px monospace';
      ctx.fillStyle = isVented ? '#b71c1c' : '#475569';
      ctx.fillText(room.tag, room.x + 8, room.y + 16);
      ctx.font = '11px sans-serif';
      ctx.fillStyle = isVented ? '#7f1d1d' : '#1e293b';
      ctx.fillText(room.name, room.x + 8, room.y + 30);

      if (o2 < 100) {
        ctx.font = 'bold 10px monospace';
        ctx.fillStyle = o2 < 25 ? '#dc2626' : '#ea580c';
        ctx.fillText(`O2: ${Math.round(o2)}%`, room.x + room.width - 60, room.y + 16);
      }
    } else {
      ctx.fillStyle = '#06090e';
      ctx.fillRect(room.x, room.y, room.width, room.height);
    }
  }
}
