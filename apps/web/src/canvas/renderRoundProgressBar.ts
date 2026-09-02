export interface ActiveInteraction {
  stationId: string;
  stationName: string;
  actionName: string;
  verb: string;
  type: 'duty' | 'rest' | 'paste' | 'water' | 'coolant';
  dutyId?: string;
  progress: number; // 0..1
  durationSeconds: number;
  worldX: number;
  worldY: number;
  color?: string;
}

// fallow-ignore-next-line complexity
export function renderRoundProgressBar(
  ctx: CanvasRenderingContext2D,
  interaction: ActiveInteraction
): void {
  const { worldX, worldY, verb, progress, color = '#00e5ff' } = interaction;
  const radius = 22;
  const cy = worldY - 40;
  const cx = worldX;

  ctx.save();

  // Background circular plate
  ctx.fillStyle = 'rgba(8, 14, 22, 0.94)';
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 4, 0, Math.PI * 2);
  ctx.fill();

  // Outer track ring
  ctx.strokeStyle = '#182538';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  // Active round progress arc
  const startAngle = -Math.PI / 2;
  const endAngle = startAngle + progress * Math.PI * 2;
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, radius, startAngle, endAngle);
  ctx.stroke();

  // Inner percentage text
  ctx.font = 'bold 10px monospace';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${Math.round(progress * 100)}%`, cx, cy);

  // Floating Action Verb Pill Badge above the round progress ring
  const pillY = cy - radius - 14;
  const labelText = verb.toUpperCase();
  ctx.font = 'bold 9px monospace';
  const tw = ctx.measureText(labelText).width;
  const pad = 6;

  ctx.fillStyle = 'rgba(10, 16, 26, 0.96)';
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(cx - tw / 2 - pad, pillY - 9, tw + pad * 2, 18, 3);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.fillText(labelText, cx, pillY);

  ctx.restore();
}
