import type { PawnState } from '@kybernetes/protocol';
import { computeVisibilityPolygon, HESPERIA_WALLS } from '@kybernetes/sim-core';

export function renderLighting(ctx: CanvasRenderingContext2D, pawn: PawnState): void {
  const visPolygon = computeVisibilityPolygon({ x: pawn.x, y: pawn.y }, 360, HESPERIA_WALLS);

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

  // Ambient tactical soft light surrounding the pawn
  const ambientGrad = ctx.createRadialGradient(pawn.x, pawn.y, 10, pawn.x, pawn.y, 360);
  ambientGrad.addColorStop(0, 'rgba(0, 229, 255, 0.12)');
  ambientGrad.addColorStop(0.5, 'rgba(0, 100, 200, 0.04)');
  ambientGrad.addColorStop(1, 'rgba(0, 0, 0, 0.35)');
  ctx.fillStyle = ambientGrad;
  ctx.fillRect(pawn.x - 380, pawn.y - 380, 760, 760);

  // Directional flashlight beam
  ctx.save();
  ctx.translate(pawn.x, pawn.y);
  ctx.rotate(pawn.facingAngle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, 340, -Math.PI / 4, Math.PI / 4);
  ctx.closePath();
  const flashGrad = ctx.createRadialGradient(0, 0, 20, 0, 0, 340);
  flashGrad.addColorStop(0, 'rgba(255, 255, 255, 0.22)');
  flashGrad.addColorStop(0.7, 'rgba(0, 229, 255, 0.06)');
  flashGrad.addColorStop(1, 'rgba(0, 229, 255, 0)');
  ctx.fillStyle = flashGrad;
  ctx.fill();
  ctx.restore();

  ctx.restore();
}
