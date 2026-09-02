import type { PawnState } from '@kybernetes/protocol';

// fallow-ignore-next-line complexity
function getPawnStatusBadge(pawn: PawnState): { text: string; color: string } | null {
  if (pawn.isResting) return { text: '[RESTING]', color: '#ffb000' };
  if (pawn.isOperating) return { text: '[OPERATING]', color: '#00e5ff' };
  return null;
}

// fallow-ignore-next-line complexity
export function renderPawn(ctx: CanvasRenderingContext2D, pawn: PawnState): void {
  const { x, y, facingAngle, callsign, color = '#ffb000', isOperating, isResting } = pawn;
  const now = Date.now() / 1000;

  // Walking bob / breathing bounce
  const isMoving = !isOperating && !isResting;
  const walkBob = isMoving ? Math.sin(now * 10) * 1.5 : Math.sin(now * 2) * 0.5;

  ctx.save();
  ctx.translate(x, y + walkBob);

  // 1. Soft grounded elliptical drop shadow (Rimworld signature grounding)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.beginPath();
  ctx.ellipse(0, 10, 14, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // 2. Rotated Pawn Body & Hands
  ctx.save();
  ctx.rotate(facingAngle);

  // Torso (Pill / Capsule Shape)
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, 0, 11, 14, 0, 0, Math.PI * 2);
  ctx.fill();

  // Uniform collar & protective vest
  ctx.fillStyle = '#1c2838';
  ctx.beginPath();
  ctx.ellipse(0, 1, 8, 10, 0, 0, Math.PI * 2);
  ctx.fill();

  // Head (Circle with helmet / visor)
  ctx.fillStyle = '#f0f4fa';
  ctx.beginPath();
  ctx.arc(2, 0, 8, 0, Math.PI * 2);
  ctx.fill();

  // Tactical Visor / Directional Eye Stripe
  ctx.fillStyle = '#00e5ff';
  ctx.beginPath();
  ctx.arc(5, 0, 4, -Math.PI / 3, Math.PI / 3);
  ctx.lineTo(5, 0);
  ctx.closePath();
  ctx.fill();

  // Floating Detached Hands (Rimworld style)
  const handSway = isMoving ? Math.sin(now * 10) * 2 : 0;
  ctx.fillStyle = color;
  ctx.strokeStyle = '#101722';
  ctx.lineWidth = 1;

  // Right hand
  ctx.beginPath();
  ctx.arc(8, 11 + handSway, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Left hand
  ctx.beginPath();
  ctx.arc(8, -11 - handSway, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.restore(); // restore rotation

  ctx.restore(); // restore translation

  // 3. Pawn Callsign Label & Status Pill
  ctx.font = 'bold 11px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(callsign, x, y - 22);

  const status = getPawnStatusBadge(pawn);
  if (status) {
    ctx.font = '9px monospace';
    ctx.fillStyle = status.color;
    ctx.fillText(status.text, x, y - 34);
  }
}
