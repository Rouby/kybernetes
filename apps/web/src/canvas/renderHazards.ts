import { HESPERIA_ROOMS, type RoomDefinition } from '@kybernetes/sim-core';

// fallow-ignore-next-line complexity
function drawFireFlames(ctx: CanvasRenderingContext2D, room: RoomDefinition, now: number) {
  const cx = room.x + room.width / 2;
  const cy = room.y + room.height / 2;

  // Compartment fire warning ambient glow
  const glow = 0.18 + Math.sin(now * 8) * 0.08;
  ctx.fillStyle = `rgba(255, 68, 0, ${glow})`;
  ctx.fillRect(room.x, room.y, room.width, room.height);

  // Animated Multi-Particle Fire Clustered around room center
  for (let i = 0; i < 6; i++) {
    const ox = ((i * 37 + ((now * 60) % 80)) % 80) - 40;
    const oy = ((i * 43 + ((now * 80) % 70)) % 70) - 35;
    const flameSize = 12 + Math.sin(now * 12 + i) * 5;

    // Outer Orange Flame
    ctx.fillStyle = 'rgba(255, 100, 0, 0.7)';
    ctx.beginPath();
    ctx.arc(cx + ox, cy + oy, flameSize, 0, Math.PI * 2);
    ctx.fill();

    // Hot Yellow Inner Core
    ctx.fillStyle = 'rgba(255, 220, 50, 0.85)';
    ctx.beginPath();
    ctx.arc(cx + ox, cy + oy + 2, flameSize * 0.5, 0, Math.PI * 2);
    ctx.fill();

    // Rising smoke & ember spark
    const emberY = cy + oy - ((now * 50 + i * 15) % 40);
    ctx.fillStyle = 'rgba(255, 200, 100, 0.9)';
    ctx.beginPath();
    ctx.arc(cx + ox + Math.sin(now * 6 + i) * 6, emberY, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Tactical Alert Label
  ctx.fillStyle = '#ff6600';
  ctx.font = 'bold 11px monospace';
  ctx.fillText('[!] COMPARTMENT FIRE', room.x + 12, room.y + room.height - 14);
}

// fallow-ignore-next-line complexity
function drawBreachDecompression(ctx: CanvasRenderingContext2D, room: RoomDefinition, now: number) {
  const cx = room.x + room.width / 2;
  const cy = room.y + room.height / 2;

  // Decompression cold atmosphere glow
  const glow = 0.15 + Math.sin(now * 5) * 0.05;
  ctx.fillStyle = `rgba(0, 229, 255, ${glow})`;
  ctx.fillRect(room.x, room.y, room.width, room.height);

  // Breach hole into the black void
  ctx.fillStyle = '#020408';
  ctx.strokeStyle = '#00e5ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(cx, cy, 22, 14, Math.PI / 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Frost ice fracture lines radiating out
  ctx.strokeStyle = 'rgba(0, 229, 255, 0.45)';
  ctx.lineWidth = 1;
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * 20, cy + Math.sin(a) * 12);
    ctx.lineTo(cx + Math.cos(a) * 45, cy + Math.sin(a) * 32);
    ctx.stroke();
  }

  // Decompression gas rushing towards breach
  for (let p = 0; p < 8; p++) {
    const dist = 80 - ((now * 120 + p * 20) % 80);
    const angle = p * (Math.PI / 4);
    const px = cx + Math.cos(angle) * dist;
    const py = cy + Math.sin(angle) * dist;

    ctx.fillStyle = 'rgba(0, 229, 255, 0.6)';
    ctx.beginPath();
    ctx.arc(px, py, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Tactical Alert Label
  ctx.fillStyle = '#00e5ff';
  ctx.font = 'bold 11px monospace';
  ctx.fillText('[!] HULL BREACH DECOMPRESSION', room.x + 12, room.y + room.height - 30);
}

export function renderHazards(
  ctx: CanvasRenderingContext2D,
  activeFires: string[],
  breaches: string[]
): void {
  const now = Date.now() / 1000;
  for (const room of HESPERIA_ROOMS) {
    if (activeFires.includes(room.id)) {
      drawFireFlames(ctx, room, now);
    }
    if (breaches.includes(room.id)) {
      drawBreachDecompression(ctx, room, now);
    }
  }
}
