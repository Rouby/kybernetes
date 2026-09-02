// Starfield background with subtle twinkling stars and deep-space nebular dust

interface Star {
  x: number;
  y: number;
  radius: number;
  baseAlpha: number;
  phase: number;
}

const STARS: Star[] = (() => {
  const stars: Star[] = [];
  let seed = 42;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (let i = 0; i < 180; i++) {
    stars.push({
      x: Math.floor(rand() * 2400) - 600,
      y: Math.floor(rand() * 1800) - 400,
      radius: rand() > 0.85 ? 1.5 : rand() > 0.4 ? 1.0 : 0.75,
      baseAlpha: 0.3 + rand() * 0.6,
      phase: rand() * Math.PI * 2,
    });
  }
  return stars;
})();

export function renderBackground(
  ctx: CanvasRenderingContext2D,
  viewWidth: number,
  viewHeight: number,
  cameraX: number,
  cameraY: number
): void {
  // Deep space void base
  ctx.fillStyle = '#04070d';
  ctx.fillRect(-viewWidth, -viewHeight, viewWidth * 3, viewHeight * 3);

  // Subtle nebula clouds (FTL deep space feel)
  const nebula1 = ctx.createRadialGradient(200, 200, 50, 200, 200, 700);
  nebula1.addColorStop(0, 'rgba(15, 40, 70, 0.18)');
  nebula1.addColorStop(0.6, 'rgba(10, 20, 45, 0.08)');
  nebula1.addColorStop(1, 'rgba(4, 7, 13, 0)');
  ctx.fillStyle = nebula1;
  ctx.fillRect(-500, -500, 1400, 1400);

  const nebula2 = ctx.createRadialGradient(900, 600, 40, 900, 600, 600);
  nebula2.addColorStop(0, 'rgba(40, 20, 60, 0.14)');
  nebula2.addColorStop(0.5, 'rgba(15, 10, 35, 0.06)');
  nebula2.addColorStop(1, 'rgba(4, 7, 13, 0)');
  ctx.fillStyle = nebula2;
  ctx.fillRect(300, 0, 1200, 1200);

  // Twinkling stars with subtle parallax
  const now = Date.now() / 1000;
  for (const s of STARS) {
    const px = s.x - cameraX * 0.03;
    const py = s.y - cameraY * 0.03;
    const alpha = s.baseAlpha + Math.sin(now * 2 + s.phase) * 0.2;

    ctx.fillStyle = `rgba(200, 225, 255, ${Math.max(0.1, Math.min(1, alpha))})`;
    ctx.beginPath();
    ctx.arc(px, py, s.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}
