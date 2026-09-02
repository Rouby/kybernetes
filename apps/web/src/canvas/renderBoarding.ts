import type { BoardingTacticsTelemetry } from '@kybernetes/protocol';

// fallow-ignore-next-line complexity
export function renderBoarding(
  ctx: CanvasRenderingContext2D,
  boarding: BoardingTacticsTelemetry | undefined,
  timeMs: number
): void {
  if (!boarding) return;

  const { boardingPods, intruders, sentries, lockedBulkheads, ventedRooms } = boarding;

  // 1. Render Vented Room Decompression Wind
  renderVentedAtmosphere(ctx, ventedRooms, timeMs);

  // 2. Render Boarding Pods
  renderBoardingPods(ctx, boardingPods, timeMs);

  // 3. Render Locked Bulkhead Barriers
  renderLockedBulkheads(ctx, lockedBulkheads);

  // 4. Render Automated Sentry Turrets
  renderSentryGuns(ctx, sentries, timeMs);

  // 5. Render Rimworld-style Raiders
  renderIntruderPawns(ctx, intruders, timeMs);
}

// fallow-ignore-next-line complexity
function renderVentedAtmosphere(
  ctx: CanvasRenderingContext2D,
  ventedRooms: string[],
  timeMs: number
): void {
  if (ventedRooms.length === 0) return;

  const ROOM_BOXES: Record<string, { x: number; y: number; w: number; h: number }> = {
    bridge: { x: 60, y: 60, w: 320, h: 220 },
    quarters: { x: 400, y: 60, w: 380, h: 220 },
    mess: { x: 800, y: 60, w: 340, h: 220 },
    corridor: { x: 60, y: 280, w: 1080, h: 120 },
    armory: { x: 60, y: 400, w: 320, h: 340 },
    cargo: { x: 400, y: 400, w: 380, h: 340 },
    engineering: { x: 800, y: 400, w: 340, h: 340 },
  };

  ctx.save();
  for (const roomId of ventedRooms) {
    const box = ROOM_BOXES[roomId];
    if (!box) continue;

    // Cyan vacuum fog overlay
    ctx.fillStyle = 'rgba(0, 229, 255, 0.08)';
    ctx.fillRect(box.x, box.y, box.w, box.h);

    // Streaming decompression wind particles
    ctx.strokeStyle = 'rgba(180, 245, 255, 0.35)';
    ctx.lineWidth = 1.5;
    const count = 12;
    for (let i = 0; i < count; i++) {
      const seed = (i * 97 + Math.floor(timeMs * 0.4)) % box.w;
      const px = box.x + seed;
      const py = box.y + ((i * 37) % box.h);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + 24, py + (i % 2 === 0 ? 3 : -3));
      ctx.stroke();
    }
  }
  ctx.restore();
}

function renderBoardingPods(
  ctx: CanvasRenderingContext2D,
  pods: BoardingTacticsTelemetry['boardingPods'],
  timeMs: number
): void {
  ctx.save();
  for (const pod of pods) {
    const { x, y } = pod;
    // Drill impact crater ring
    ctx.fillStyle = '#0f141c';
    ctx.strokeStyle = '#d32f2f';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Metallic pod hull hatch
    ctx.fillStyle = '#263238';
    ctx.beginPath();
    ctx.arc(x, y, 20, 0, Math.PI * 2);
    ctx.fill();

    // Red klaxon beacon on pod
    const pulse = Math.sin(timeMs * 0.01) > 0;
    ctx.fillStyle = pulse ? '#ff1744' : '#5f0914';
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();

    // Label
    ctx.font = 'bold 9px monospace';
    ctx.fillStyle = '#ff5252';
    ctx.textAlign = 'center';
    ctx.fillText('BOARDING POD', x, y - 32);
  }
  ctx.restore();
}

// fallow-ignore-next-line complexity
function renderLockedBulkheads(ctx: CanvasRenderingContext2D, lockedRooms: string[]): void {
  const DOOR_POS: Record<string, { x: number; y: number; w: number; h: number }> = {
    bridge: { x: 200, y: 275, w: 40, h: 10 },
    cargo: { x: 570, y: 395, w: 40, h: 10 },
    engineering: { x: 950, y: 395, w: 40, h: 10 },
    armory: { x: 200, y: 395, w: 40, h: 10 },
    corridor: { x: 580, y: 335, w: 40, h: 10 },
  };

  ctx.save();
  for (const room of lockedRooms) {
    const d = DOOR_POS[room];
    if (!d) continue;

    // Sealed hazard chevrons
    ctx.fillStyle = '#ffb300';
    ctx.fillRect(d.x, d.y, d.w, d.h);

    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 3;
    for (let x = d.x; x < d.x + d.w; x += 8) {
      ctx.beginPath();
      ctx.moveTo(x, d.y);
      ctx.lineTo(x + 5, d.y + d.h);
      ctx.stroke();
    }

    ctx.font = 'bold 8px monospace';
    ctx.fillStyle = '#ff1744';
    ctx.textAlign = 'center';
    ctx.fillText('LOCKED', d.x + d.w / 2, d.y - 4);
  }
  ctx.restore();
}

// fallow-ignore-next-line complexity
function renderSentryGuns(
  ctx: CanvasRenderingContext2D,
  sentries: BoardingTacticsTelemetry['sentries'],
  timeMs: number
): void {
  ctx.save();
  for (const sentry of sentries) {
    const { x, y, facingAngle, isFiring, ammo } = sentry;

    // Tripod Base
    ctx.fillStyle = '#37474f';
    ctx.beginPath();
    ctx.arc(x, y, 14, 0, Math.PI * 2);
    ctx.fill();

    // Turret Swivel
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(facingAngle);

    // Twin Gun Barrels
    ctx.fillStyle = '#212121';
    ctx.fillRect(4, -5, 16, 3);
    ctx.fillRect(4, 2, 16, 3);

    // Turret Dome
    ctx.fillStyle = '#00e5ff';
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fill();

    // Muzzle flash when firing
    if (isFiring && Math.sin(timeMs * 0.05) > 0) {
      ctx.fillStyle = '#ffea00';
      ctx.beginPath();
      ctx.arc(22, -3.5, 5, 0, Math.PI * 2);
      ctx.arc(22, 3.5, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Ammo bar
    ctx.font = 'bold 8px monospace';
    ctx.fillStyle = ammo > 20 ? '#00e5ff' : '#ff1744';
    ctx.textAlign = 'center';
    ctx.fillText(`SENTRY [${ammo}]`, x, y - 18);
  }
  ctx.restore();
}

// fallow-ignore-next-line complexity
function renderIntruderPawns(
  ctx: CanvasRenderingContext2D,
  intruders: BoardingTacticsTelemetry['intruders'],
  timeMs: number
): void {
  ctx.save();
  for (const intruder of intruders) {
    const { x, y, facingAngle, health, maxHealth, state, sabotageSecondsRemaining } = intruder;

    if (state === 'neutralized') {
      // Fallen raider corpse
      ctx.fillStyle = 'rgba(40, 10, 15, 0.6)';
      ctx.beginPath();
      ctx.ellipse(x, y, 14, 8, facingAngle, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '8px monospace';
      ctx.fillStyle = '#78909c';
      ctx.textAlign = 'center';
      ctx.fillText('NEUTRALIZED', x, y - 10);
      continue;
    }

    // Walking animation bob
    const bob = Math.sin(timeMs * 0.012 + x) * 2;
    const cy = y + bob;

    // Grounded Drop Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(x, y + 10, 13, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Raider Body: Rimworld-style Crimson Pill Capsule
    ctx.fillStyle = '#b71c1c';
    ctx.strokeStyle = '#d32f2f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x - 10, cy - 14, 20, 24, 10);
    ctx.fill();
    ctx.stroke();

    // Charcoal Combat Vest & Straps
    ctx.fillStyle = '#212121';
    ctx.fillRect(x - 8, cy - 6, 16, 10);

    // Glowing Menacing Visor
    const eyeX = x + Math.cos(facingAngle) * 5;
    const eyeY = cy - 7 + Math.sin(facingAngle) * 4;
    ctx.fillStyle = '#ff1744';
    ctx.beginPath();
    ctx.arc(eyeX, eyeY, 3, 0, Math.PI * 2);
    ctx.fill();

    // Directional Floating Hands with Weapon
    const handDist = 14;
    const hx = x + Math.cos(facingAngle) * handDist;
    const hy = cy + Math.sin(facingAngle) * handDist;
    ctx.fillStyle = '#37474f';
    ctx.beginPath();
    ctx.arc(hx, hy, 4, 0, Math.PI * 2);
    ctx.fill();

    // Weapon Barrel
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx + Math.cos(facingAngle) * 8, hy + Math.sin(facingAngle) * 8);
    ctx.stroke();

    // Overhead Health Bar
    const barW = 28;
    const barH = 4;
    const barX = x - barW / 2;
    const barY = cy - 24;
    const pct = Math.max(0, health / maxHealth);

    ctx.fillStyle = '#10141a';
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = pct > 0.4 ? '#ff5252' : '#d50000';
    ctx.fillRect(barX, barY, barW * pct, barH);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barW, barH);

    // Sabotaging alert banner
    if (state === 'sabotaging') {
      ctx.font = 'bold 9px monospace';
      ctx.fillStyle = '#ff1744';
      ctx.textAlign = 'center';
      ctx.fillText(`SABOTAGE: ${sabotageSecondsRemaining}s`, x, barY - 6);
    } else {
      ctx.font = 'bold 8px monospace';
      ctx.fillStyle = '#ff8a80';
      ctx.textAlign = 'center';
      ctx.fillText(intruder.name.toUpperCase(), x, barY - 4);
    }
  }
  ctx.restore();
}
