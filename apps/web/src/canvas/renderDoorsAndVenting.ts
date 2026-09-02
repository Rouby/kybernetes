import type { DoorState } from '@kybernetes/protocol';

// fallow-ignore-next-line complexity
function drawInteriorDoor(ctx: CanvasRenderingContext2D, door: DoorState) {
  const { x1, y1, x2, y2, isOpen } = door;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const isHorizontal = Math.abs(y2 - y1) < Math.abs(x2 - x1);

  ctx.save();

  // Outer Doorway Frame
  ctx.fillStyle = '#1e293b';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2;

  if (isHorizontal) {
    const w = Math.abs(x2 - x1);
    const minX = Math.min(x1, x2);
    ctx.fillRect(minX, y1 - 6, w, 12);
    ctx.strokeRect(minX, y1 - 6, w, 12);

    if (isOpen) {
      // Recessed sliding pocket with green light
      ctx.fillStyle = '#334155';
      ctx.fillRect(minX + 4, y1 - 4, w - 8, 8);
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(mx - 3, y1 - 2, 6, 4);
    } else {
      // Closed double steel blast plate with red lock light
      ctx.fillStyle = '#64748b';
      ctx.fillRect(minX + 2, y1 - 5, w - 4, 10);
      ctx.strokeStyle = '#0f172a';
      ctx.strokeRect(minX + 2, y1 - 5, w - 4, 10);

      // Central seam
      ctx.beginPath();
      ctx.moveTo(mx, y1 - 5);
      ctx.lineTo(mx, y1 + 5);
      ctx.stroke();

      // Red status LED
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(mx - 3, y1 - 2, 6, 4);
    }
  } else {
    const h = Math.abs(y2 - y1);
    const minY = Math.min(y1, y2);
    ctx.fillRect(x1 - 6, minY, 12, h);
    ctx.strokeRect(x1 - 6, minY, 12, h);

    if (isOpen) {
      ctx.fillStyle = '#334155';
      ctx.fillRect(x1 - 4, minY + 4, 8, h - 8);
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(x1 - 2, my - 3, 4, 6);
    } else {
      ctx.fillStyle = '#64748b';
      ctx.fillRect(x1 - 5, minY + 2, 10, h - 4);
      ctx.strokeStyle = '#0f172a';
      ctx.strokeRect(x1 - 5, minY + 2, 10, h - 4);

      ctx.beginPath();
      ctx.moveTo(x1 - 5, my);
      ctx.lineTo(x1 + 5, my);
      ctx.stroke();

      ctx.fillStyle = '#ef4444';
      ctx.fillRect(x1 - 2, my - 3, 4, 6);
    }
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

  // Heavy hazard stripe airlock frame
  const minX = Math.min(x1, x2);
  const minY = Math.min(y1, y2);
  const w = isHorizontal ? Math.abs(x2 - x1) : 16;
  const h = isHorizontal ? 16 : Math.abs(y2 - y1);

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(minX - (isHorizontal ? 0 : 8), minY - (isHorizontal ? 8 : 0), w, h);

  if (!isOpen) {
    // Sealed heavy hull blast hatch
    ctx.fillStyle = '#475569';
    ctx.fillRect(minX - (isHorizontal ? 0 : 6), minY - (isHorizontal ? 6 : 0), w, h);
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.strokeRect(minX - (isHorizontal ? 0 : 6), minY - (isHorizontal ? 6 : 0), w, h);

    // Warning text
    ctx.font = 'bold 8px monospace';
    ctx.fillStyle = '#f59e0b';
    ctx.textAlign = 'center';
    ctx.fillText('AIRLOCK', mx, my + 3);
  } else {
    // OPEN AIRLOCK -> Void opening with decompression suction vortex!
    ctx.fillStyle = '#020617';
    ctx.fillRect(minX - (isHorizontal ? 0 : 6), minY - (isHorizontal ? 6 : 0), w, h);

    // Flashing red emergency klaxon around open airlock
    const flash = Math.sin(timeMs / 120) > 0;
    ctx.strokeStyle = flash ? '#ef4444' : '#b91c1c';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(minX - (isHorizontal ? 0 : 6), minY - (isHorizontal ? 6 : 0), w, h);

    // Suction air currents rushing into space (Additive blending)
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) {
      const offset = (timeMs * 0.3 + i * 25) % 80;
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
