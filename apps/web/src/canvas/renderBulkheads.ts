import type { WallSegment } from '@kybernetes/protocol';
import type { RoomDefinition } from '@kybernetes/sim-core';

// fallow-ignore-next-line complexity
function drawRoomSubsystemEmblem(ctx: CanvasRenderingContext2D, room: RoomDefinition) {
  const cx = room.x + room.width / 2;
  const cy = room.y + room.height / 2;

  ctx.save();
  ctx.lineWidth = 2;

  if (room.id === 'bridge') {
    // Helm / Navigation Reticle Emblem
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.16)';
    ctx.beginPath();
    ctx.arc(cx, cy, 26, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 32, cy);
    ctx.lineTo(cx + 32, cy);
    ctx.moveTo(cx, cy - 32);
    ctx.lineTo(cx, cy + 32);
    ctx.stroke();
  } else if (room.id === 'engineering') {
    // Reactor Core Atom Emblem
    ctx.strokeStyle = 'rgba(255, 176, 0, 0.16)';
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(cx, cy, 32, 12, Math.PI / 4, 0, Math.PI * 2);
    ctx.ellipse(cx, cy, 32, 12, -Math.PI / 4, 0, Math.PI * 2);
    ctx.stroke();
  } else if (room.id === 'quarters') {
    // Medical / Vital Pulse Wave Emblem
    ctx.strokeStyle = 'rgba(0, 255, 102, 0.16)';
    ctx.beginPath();
    ctx.moveTo(cx - 24, cy);
    ctx.lineTo(cx - 10, cy);
    ctx.lineTo(cx - 4, cy - 14);
    ctx.lineTo(cx + 4, cy + 14);
    ctx.lineTo(cx + 10, cy);
    ctx.lineTo(cx + 24, cy);
    ctx.stroke();
  } else if (room.id === 'armory') {
    // Tactical Security Shield Emblem
    ctx.strokeStyle = 'rgba(255, 34, 68, 0.16)';
    ctx.beginPath();
    ctx.moveTo(cx - 16, cy - 18);
    ctx.lineTo(cx + 16, cy - 18);
    ctx.lineTo(cx + 16, cy);
    ctx.lineTo(cx, cy + 20);
    ctx.lineTo(cx - 16, cy);
    ctx.closePath();
    ctx.stroke();
  } else if (room.id === 'mess') {
    // Life Support / Biosphere Leaf Emblem
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.16)';
    ctx.beginPath();
    ctx.arc(cx, cy, 18, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx - 6, cy, 10, 0, Math.PI);
    ctx.arc(cx + 6, cy, 10, Math.PI, 0);
    ctx.stroke();
  }
  ctx.restore();
}

// fallow-ignore-next-line complexity
export function renderBulkheads(
  ctx: CanvasRenderingContext2D,
  walls: WallSegment[],
  rooms: RoomDefinition[],
  exploredRooms: Set<string>
): void {
  // Draw subsystem emblems for explored rooms
  for (const r of rooms) {
    if (exploredRooms.has(r.id)) {
      drawRoomSubsystemEmblem(ctx, r);
    }
  }

  // Double-lined FTL metallic bulkheads
  ctx.save();
  ctx.lineCap = 'square';

  const passes = [
    { color: '#0e1520', width: 10 },
    { color: '#27384d', width: 6 },
    { color: '#435e80', width: 1.5 },
  ];

  for (const p of passes) {
    ctx.strokeStyle = p.color;
    ctx.lineWidth = p.width;
    ctx.beginPath();
    for (const w of walls) {
      ctx.moveTo(w.x1, w.y1);
      ctx.lineTo(w.x2, w.y2);
    }
    ctx.stroke();
  }

  ctx.restore();
}
