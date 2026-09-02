export function renderAlertOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  alertLevel: 'nominal' | 'yellow' | 'red'
): void {
  if (alertLevel === 'red') {
    const now = Date.now() / 1000;
    const pulse = 0.12 + Math.sin(now * 5) * 0.08;

    // FTL-style Red Alert emergency klaxon wash
    ctx.fillStyle = `rgba(255, 34, 68, ${pulse})`;
    ctx.fillRect(0, 0, width, height);

    // Glowing emergency hazard border
    ctx.strokeStyle = '#ff2244';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, width - 4, height - 4);
  } else if (alertLevel === 'yellow') {
    ctx.fillStyle = 'rgba(255, 176, 0, 0.05)';
    ctx.fillRect(0, 0, width, height);
  }
}
