import type { StationFixture } from '@kybernetes/protocol';

// fallow-ignore-next-line complexity
function drawBunkFixture(ctx: CanvasRenderingContext2D, x: number, y: number) {
  // Cot base frame
  ctx.fillStyle = '#172230';
  ctx.strokeStyle = '#2d4057';
  ctx.lineWidth = 1.5;
  ctx.fillRect(x - 16, y - 24, 32, 48);
  ctx.strokeRect(x - 16, y - 24, 32, 48);

  // Pillow
  ctx.fillStyle = '#d0dce8';
  ctx.fillRect(x - 12, y - 21, 24, 10);

  // Folded blanket (navy blue)
  ctx.fillStyle = '#1e3857';
  ctx.fillRect(x - 14, y - 6, 28, 28);
  ctx.strokeStyle = '#325780';
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 14, y - 6, 28, 28);

  // Biometric headboard vitals monitor
  ctx.fillStyle = '#00ff66';
  ctx.fillRect(x - 10, y - 23, 6, 2);
}

// fallow-ignore-next-line complexity
function drawReactorFixture(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const now = Date.now() / 1000;
  // Multi-tier cylindrical reactor housing
  ctx.fillStyle = '#1a222d';
  ctx.strokeStyle = '#ffb000';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Pulsing plasma containment core
  const pulse = 10 + Math.sin(now * 4) * 3;
  const coreGrad = ctx.createRadialGradient(x, y, 2, x, y, pulse);
  coreGrad.addColorStop(0, '#ffffff');
  coreGrad.addColorStop(0.4, '#ffb000');
  coreGrad.addColorStop(1, 'rgba(255, 34, 68, 0)');

  ctx.fillStyle = coreGrad;
  ctx.beginPath();
  ctx.arc(x, y, pulse, 0, Math.PI * 2);
  ctx.fill();

  // Coolant manifold pipes entering from sides
  ctx.fillStyle = '#00e5ff';
  ctx.fillRect(x - 28, y - 4, 8, 8);
  ctx.fillRect(x + 20, y - 4, 8, 8);
}

// fallow-ignore-next-line complexity
function drawHelmFixture(ctx: CanvasRenderingContext2D, x: number, y: number) {
  // Curved command desk
  ctx.fillStyle = '#131e2c';
  ctx.strokeStyle = '#00e5ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 22, -Math.PI * 0.8, Math.PI * 0.8);
  ctx.lineTo(x + 10, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Glowing holographic tactical displays
  ctx.fillStyle = 'rgba(0, 229, 255, 0.7)';
  ctx.fillRect(x - 14, y - 10, 8, 5);
  ctx.fillRect(x - 4, y - 16, 8, 5);
  ctx.fillRect(x + 6, y - 10, 8, 5);

  // Captain's swivel chair behind helm
  ctx.fillStyle = '#202f42';
  ctx.beginPath();
  ctx.arc(x + 12, y, 8, 0, Math.PI * 2);
  ctx.fill();
}

// fallow-ignore-next-line complexity
function drawDispenserFixture(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  isWater: boolean
) {
  // Industrial wall unit
  ctx.fillStyle = '#182433';
  ctx.strokeStyle = isWater ? '#00e5ff' : '#ffb000';
  ctx.lineWidth = 1.5;
  ctx.fillRect(x - 14, y - 14, 28, 28);
  ctx.strokeRect(x - 14, y - 14, 28, 28);

  // Reservoir chamber
  ctx.fillStyle = isWater ? 'rgba(0, 229, 255, 0.4)' : 'rgba(255, 176, 0, 0.4)';
  ctx.fillRect(x - 10, y - 10, 20, 12);

  // Dispense nozzle and tray
  ctx.fillStyle = '#0f1722';
  ctx.fillRect(x - 8, y + 4, 16, 6);
  ctx.fillStyle = '#00ff66';
  ctx.beginPath();
  ctx.arc(x + 8, y - 11, 2, 0, Math.PI * 2);
  ctx.fill();
}

// fallow-ignore-next-line complexity
function drawScrubberFixture(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const now = Date.now() / 1000;
  // Ventilation circular turbine housing
  ctx.fillStyle = '#141e2b';
  ctx.strokeStyle = '#00ff66';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Spinning fan blades
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(now * 3);
  ctx.fillStyle = '#2d435c';
  for (let i = 0; i < 4; i++) {
    ctx.rotate(Math.PI / 2);
    ctx.beginPath();
    ctx.ellipse(8, 0, 8, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// fallow-ignore-next-line complexity
function drawCargoFixture(ctx: CanvasRenderingContext2D, x: number, y: number) {
  // Heavy freight cargo container
  ctx.fillStyle = '#3a2d18';
  ctx.strokeStyle = '#ffb000';
  ctx.lineWidth = 1.5;
  ctx.fillRect(x - 18, y - 16, 36, 32);
  ctx.strokeRect(x - 18, y - 16, 36, 32);

  // Reinforcement straps and hazard decal
  ctx.fillStyle = '#ffb000';
  ctx.fillRect(x - 18, y - 2, 36, 4);
}

// fallow-ignore-next-line complexity
function drawArmoryFixture(ctx: CanvasRenderingContext2D, x: number, y: number) {
  // Locked weapon rack
  ctx.fillStyle = '#1a1820';
  ctx.strokeStyle = '#ff2244';
  ctx.lineWidth = 1.5;
  ctx.fillRect(x - 18, y - 16, 36, 32);
  ctx.strokeRect(x - 18, y - 16, 36, 32);

  // Rifle silhouettes in rack
  ctx.fillStyle = '#424957';
  for (let rx = x - 12; rx <= x + 12; rx += 8) {
    ctx.fillRect(rx, y - 10, 3, 20);
  }
}

// fallow-ignore-next-line complexity
export function renderFixture(
  ctx: CanvasRenderingContext2D,
  station: StationFixture,
  isNear: boolean
): void {
  const { x, y, stationType, id, name } = station;

  // Draw specific detailed sprite based on station ID and type
  if (stationType === 'bunk') {
    drawBunkFixture(ctx, x, y);
  } else if (stationType === 'reactor') {
    drawReactorFixture(ctx, x, y);
  } else if (stationType === 'bridge') {
    drawHelmFixture(ctx, x, y);
  } else if (id === 'water_dispenser') {
    drawDispenserFixture(ctx, x, y, true);
  } else if (id === 'paste_dispenser' || stationType === 'mess') {
    drawDispenserFixture(ctx, x, y, false);
  } else if (id === 'hydro_scrubber' || stationType === 'hydroponics') {
    drawScrubberFixture(ctx, x, y);
  } else if (stationType === 'cargo') {
    drawCargoFixture(ctx, x, y);
  } else if (stationType === 'armory') {
    drawArmoryFixture(ctx, x, y);
  } else {
    // Default high-tech terminal console
    ctx.fillStyle = '#14202e';
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 1.5;
    ctx.fillRect(x - 14, y - 14, 28, 28);
    ctx.strokeRect(x - 14, y - 14, 28, 28);
  }

  // Holographic interaction ring when nearby
  if (isNear) {
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(x, y, station.radius + 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Station nameplate label
  ctx.font = '10px monospace';
  ctx.fillStyle = isNear ? '#00e5ff' : '#6b829e';
  ctx.textAlign = 'center';
  ctx.fillText(name, x, y + station.radius + 16);
}
