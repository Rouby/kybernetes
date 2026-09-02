import type { DoorState } from '@kybernetes/protocol';

function drawHazardStripes(
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
  ctx.fillStyle = '#18181b';
  ctx.fillRect(x, y, w, h);

  ctx.strokeStyle = '#eab308';
  ctx.lineWidth = 5;
  const step = 11;
  for (let i = -h; i < w + h; i += step) {
    ctx.beginPath();
    ctx.moveTo(x + i, y);
    ctx.lineTo(x + i + h, y + h);
    ctx.stroke();
  }
  ctx.restore();
}

// fallow-ignore-next-line complexity
function drawOpenDoorway(
  ctx: CanvasRenderingContext2D,
  minX: number,
  minY: number,
  w: number,
  h: number,
  mx: number,
  my: number,
  isHorizontal: boolean
) {
  if (isHorizontal) {
    // Left & right door jambs
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;
    ctx.fillRect(minX, minY - 2, 8, h + 4);
    ctx.strokeRect(minX, minY - 2, 8, h + 4);
    ctx.fillRect(minX + w - 8, minY - 2, 8, h + 4);
    ctx.strokeRect(minX + w - 8, minY - 2, 8, h + 4);

    // Green status LEDs on posts
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(minX + 2, my - 2, 4, 4);
    ctx.fillRect(minX + w - 6, my - 2, 4, 4);

    // Open green clearance threshold
    ctx.strokeStyle = 'rgba(34, 197, 94, 0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(minX + 10, my);
    ctx.lineTo(minX + w - 10, my);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = 'bold 7px monospace';
    ctx.fillStyle = '#22c55e';
    ctx.textAlign = 'center';
    ctx.fillText('[OPEN]', mx, my + 2.5);
  } else {
    // Top & bottom door jambs
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;
    ctx.fillRect(minX - 2, minY, w + 4, 8);
    ctx.strokeRect(minX - 2, minY, w + 4, 8);
    ctx.fillRect(minX - 2, minY + h - 8, w + 4, 8);
    ctx.strokeRect(minX - 2, minY + h - 8, w + 4, 8);

    // Green status LEDs on posts
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(mx - 2, minY + 2, 4, 4);
    ctx.fillRect(mx - 2, minY + h - 6, 4, 4);

    // Open green clearance threshold
    ctx.strokeStyle = 'rgba(34, 197, 94, 0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(mx, minY + 10);
    ctx.lineTo(mx, minY + h - 10);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = 'bold 7px monospace';
    ctx.fillStyle = '#22c55e';
    ctx.textAlign = 'center';
    ctx.fillText('[OPEN]', mx, my + 2.5);
  }
}

// fallow-ignore-next-line complexity
function drawClosedDoorway(
  ctx: CanvasRenderingContext2D,
  minX: number,
  minY: number,
  w: number,
  h: number,
  mx: number,
  my: number,
  isHorizontal: boolean
) {
  // Heavy solid steel blast plate spanning the entire width
  const plateX = isHorizontal ? minX : minX - 1;
  const plateY = isHorizontal ? minY - 1 : minY;
  const plateW = isHorizontal ? w : w + 2;
  const plateH = isHorizontal ? h + 2 : h;

  // Yellow & black hazard warning stripes
  drawHazardStripes(ctx, plateX, plateY, plateW, plateH);

  // Outer heavy steel frame border
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(plateX, plateY, plateW, plateH);

  // Central seam
  ctx.beginPath();
  if (isHorizontal) {
    ctx.moveTo(mx, plateY);
    ctx.lineTo(mx, plateY + plateH);
  } else {
    ctx.moveTo(plateX, my);
    ctx.lineTo(plateX + plateW, my);
  }
  ctx.stroke();

  // Red locked status indicator pill
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(mx - 18, my - 5, 36, 10);
  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(mx - 18, my - 5, 36, 10);

  ctx.save();
  ctx.shadowColor = '#ef4444';
  ctx.shadowBlur = 6;
  ctx.font = 'bold 7px monospace';
  ctx.fillStyle = '#ef4444';
  ctx.textAlign = 'center';
  ctx.fillText('LOCKED', mx, my + 2.5);
  ctx.restore();
}

// fallow-ignore-next-line complexity
function drawInteriorDoor(ctx: CanvasRenderingContext2D, door: DoorState) {
  const { x1, y1, x2, y2, isOpen } = door;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const isHorizontal = Math.abs(y2 - y1) < Math.abs(x2 - x1);

  const minX = Math.min(x1, x2);
  const minY = Math.min(y1, y2);
  const w = isHorizontal ? Math.abs(x2 - x1) : 12;
  const h = isHorizontal ? 12 : Math.abs(y2 - y1);
  const startX = isHorizontal ? minX : x1 - 6;
  const startY = isHorizontal ? y1 - 6 : minY;

  ctx.save();
  if (isOpen) {
    drawOpenDoorway(ctx, startX, startY, w, h, mx, my, isHorizontal);
  } else {
    drawClosedDoorway(ctx, startX, startY, w, h, mx, my, isHorizontal);
  }
  ctx.restore();
}

// fallow-ignore-next-line complexity
function drawExteriorAirlock(ctx: CanvasRenderingContext2D, airlock: DoorState, timeMs: number) {
  const { x1, y1, x2, y2, isOpen } = airlock;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const isHorizontal = Math.abs(y2 - y1) < Math.abs(x2 - x1);

  ctx.save();

  const minX = Math.min(x1, x2);
  const minY = Math.min(y1, y2);
  const w = isHorizontal ? Math.abs(x2 - x1) : 18;
  const h = isHorizontal ? 18 : Math.abs(y2 - y1);
  const startX = isHorizontal ? minX : x1 - 9;
  const startY = isHorizontal ? y1 - 9 : minY;

  if (!isOpen) {
    // Sealed heavy hull blast hatch
    drawHazardStripes(ctx, startX, startY, w, h);
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.strokeRect(startX, startY, w, h);

    // Warning text
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(mx - 22, my - 5, 44, 10);
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1;
    ctx.strokeRect(mx - 22, my - 5, 44, 10);

    ctx.font = 'bold 7px monospace';
    ctx.fillStyle = '#f59e0b';
    ctx.textAlign = 'center';
    ctx.fillText('AIRLOCK', mx, my + 2.5);
  } else {
    // OPEN AIRLOCK -> Void opening into deep space!
    ctx.fillStyle = '#020617';
    ctx.fillRect(startX, startY, w, h);

    // Tiny stars in the open breach
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(mx - 4, my - 3, 1.5, 1.5);
    ctx.fillRect(mx + 5, my + 2, 1, 1);
    ctx.fillRect(mx - 2, my + 4, 1, 1);

    // Flashing red emergency klaxon around open airlock
    const flash = Math.sin(timeMs / 120) > 0;
    ctx.strokeStyle = flash ? '#ef4444' : '#7f1d1d';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(startX, startY, w, h);

    // Warning badge
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(mx - 24, my - 5, 48, 10);
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1;
    ctx.strokeRect(mx - 24, my - 5, 48, 10);

    ctx.font = 'bold 7px monospace';
    ctx.fillStyle = '#ef4444';
    ctx.textAlign = 'center';
    ctx.fillText('⚠ VACUUM', mx, my + 2.5);

    // Suction air currents rushing into space (Additive blending)
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) {
      const offset = (timeMs * 0.35 + i * 22) % 80;
      const alpha = Math.max(0, 1 - offset / 80);
      ctx.strokeStyle = `rgba(56, 189, 248, ${alpha})`;
      ctx.lineWidth = 2;

      ctx.beginPath();
      if (isHorizontal) {
        const spread = (i - 2.5) * 8;
        ctx.moveTo(mx + spread, my - (40 - offset * 0.5));
        ctx.lineTo(mx + spread * 0.5, my + offset * 0.6);
      } else {
        const spread = (i - 2.5) * 8;
        ctx.moveTo(mx + (40 - offset * 0.5), my + spread);
        ctx.lineTo(mx - offset * 0.6, my + spread * 0.5);
      }
      ctx.stroke();
    }
  }

  ctx.restore();
}

// fallow-ignore-next-line complexity
export function renderDoorsAndVenting(
  ctx: CanvasRenderingContext2D,
  doors: DoorState[],
  timeMs: number
): void {
  for (const door of doors) {
    if (door.isAirlock) {
      drawExteriorAirlock(ctx, door, timeMs);
    } else {
      drawInteriorDoor(ctx, door);
    }
  }
}
