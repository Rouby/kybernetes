import type { ProjectileState } from '@kybernetes/protocol';

// fallow-ignore-next-line complexity
export function renderProjectiles(
  ctx: CanvasRenderingContext2D,
  projectiles: ProjectileState[]
): void {
  if (!projectiles || projectiles.length === 0) return;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  for (const p of projectiles) {
    const angle = Math.atan2(p.vy, p.vx);
    const length = p.fromPlayer ? 14 : 12;

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(angle);

    // Multi-stage radial bloom shader effect
    const bloomGrad = ctx.createRadialGradient(0, 0, 1, 0, 0, 8);
    bloomGrad.addColorStop(0, '#ffffff');
    bloomGrad.addColorStop(0.4, p.color);
    bloomGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = bloomGrad;
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fill();

    // High-speed energy tracer bolt
    ctx.strokeStyle = p.color;
    ctx.lineWidth = p.fromPlayer ? 3.5 : 3;
    ctx.beginPath();
    ctx.moveTo(-length, 0);
    ctx.lineTo(2, 0);
    ctx.stroke();

    // Intense white core
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-length + 4, 0);
    ctx.lineTo(2, 0);
    ctx.stroke();

    ctx.restore();
  }

  ctx.restore();
}
