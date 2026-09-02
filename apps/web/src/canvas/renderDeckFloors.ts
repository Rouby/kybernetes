import type { RoomDefinition } from '@kybernetes/sim-core';

// Helper to draw yellow/black diagonal hazard stripes
function drawHazardStripes(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  ctx.fillStyle = '#ffb000';
  ctx.fillRect(x, y, w, h);

  ctx.strokeStyle = '#1a1805';
  ctx.lineWidth = 6;
  for (let sx = x - h; sx < x + w + h; sx += 14) {
    ctx.beginPath();
    ctx.moveTo(sx, y);
    ctx.lineTo(sx + h, y + h);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBridgeFloor(ctx: CanvasRenderingContext2D, room: RoomDefinition) {
  const { x, y, width: w, height: h } = room;
  ctx.fillStyle = '#0a121c';
  ctx.fillRect(x, y, w, h);

  ctx.strokeStyle = '#142133';
  ctx.lineWidth = 1;
  for (let gx = x + 30; gx < x + w; gx += 50) {
    ctx.beginPath();
    ctx.moveTo(gx, y);
    ctx.lineTo(gx, y + h);
    ctx.stroke();
  }
  for (let gy = y + 25; gy < y + h; gy += 45) {
    ctx.beginPath();
    ctx.moveTo(x, gy);
    ctx.lineTo(x + w, gy);
    ctx.stroke();
  }

  // Glowing cyan command ring around bridge helm
  ctx.strokeStyle = 'rgba(0, 229, 255, 0.22)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x + 160, y + 100, 70, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0, 229, 255, 0.12)';
  ctx.strokeRect(x + 15, y + 15, w - 30, h - 30);
}

function drawEngineeringFloor(ctx: CanvasRenderingContext2D, room: RoomDefinition) {
  const { x, y, width: w, height: h } = room;
  ctx.fillStyle = '#0d131b';
  ctx.fillRect(x, y, w, h);

  ctx.strokeStyle = '#182433';
  ctx.lineWidth = 1;
  for (let gx = x + 25; gx < x + w; gx += 35) {
    ctx.beginPath();
    ctx.moveTo(gx, y);
    ctx.lineTo(gx, y + h);
    ctx.stroke();
  }
  for (let gy = y + 25; gy < y + h; gy += 35) {
    ctx.beginPath();
    ctx.moveTo(x, gy);
    ctx.lineTo(x + w, gy);
    ctx.stroke();
  }

  drawHazardStripes(ctx, x + 80, y + 120, 180, 10);
  drawHazardStripes(ctx, x + 80, y + 230, 180, 10);

  ctx.strokeStyle = 'rgba(0, 229, 255, 0.4)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x + 20, y + 175);
  ctx.lineTo(x + 80, y + 175);
  ctx.moveTo(x + 260, y + 175);
  ctx.lineTo(x + w - 20, y + 175);
  ctx.stroke();
}

function drawQuartersFloor(ctx: CanvasRenderingContext2D, room: RoomDefinition) {
  const { x, y, width: w, height: h } = room;
  ctx.fillStyle = '#0f1724';
  ctx.fillRect(x, y, w, h);

  ctx.fillStyle = '#162234';
  ctx.fillRect(x + 20, y + 90, w - 40, 50);

  ctx.strokeStyle = '#22344d';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 20, y + 90, w - 40, 50);
}

function drawMessFloor(ctx: CanvasRenderingContext2D, room: RoomDefinition) {
  const { x, y, width: w, height: h } = room;
  ctx.fillStyle = '#0c131d';
  ctx.fillRect(x, y, w, h);

  const tileSize = 30;
  ctx.fillStyle = '#111b29';
  for (let tx = x; tx < x + w; tx += tileSize * 2) {
    for (let ty = y; ty < y + h; ty += tileSize * 2) {
      ctx.fillRect(tx, ty, tileSize, tileSize);
      ctx.fillRect(tx + tileSize, ty + tileSize, tileSize, tileSize);
    }
  }
  ctx.strokeStyle = '#182538';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
}

function drawArmoryFloor(ctx: CanvasRenderingContext2D, room: RoomDefinition) {
  const { x, y, width: w, height: h } = room;
  ctx.fillStyle = '#12161f';
  ctx.fillRect(x, y, w, h);

  ctx.strokeStyle = '#1f2735';
  ctx.lineWidth = 2;
  for (let gx = x + 40; gx < x + w; gx += 60) {
    ctx.beginPath();
    ctx.moveTo(gx, y);
    ctx.lineTo(gx, y + h);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(255, 34, 68, 0.25)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 20, y + 20, w - 40, h - 40);
}

function drawCargoFloor(ctx: CanvasRenderingContext2D, room: RoomDefinition) {
  const { x, y, width: w, height: h } = room;
  ctx.fillStyle = '#0e141d';
  ctx.fillRect(x, y, w, h);

  ctx.strokeStyle = '#16202e';
  ctx.lineWidth = 1;
  for (let gx = x + 35; gx < x + w; gx += 40) {
    ctx.beginPath();
    ctx.moveTo(gx, y);
    ctx.lineTo(gx, y + h);
    ctx.stroke();
  }
  for (let gy = y + 35; gy < y + h; gy += 40) {
    ctx.beginPath();
    ctx.moveTo(x, gy);
    ctx.lineTo(x + w, gy);
    ctx.stroke();
  }

  ctx.strokeStyle = '#ffb00088';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 30, y + 40, 140, 120);
  ctx.strokeRect(x + 210, y + 40, 140, 120);

  ctx.font = 'bold 9px monospace';
  ctx.fillStyle = '#ffb00088';
  ctx.fillText('BAY-01', x + 40, y + 60);
  ctx.fillText('BAY-02', x + 220, y + 60);
}

function drawCorridorFloor(ctx: CanvasRenderingContext2D, room: RoomDefinition) {
  const { x, y, width: w, height: h } = room;
  ctx.fillStyle = '#090e15';
  ctx.fillRect(x, y, w, h);

  ctx.strokeStyle = '#141e2b';
  ctx.lineWidth = 1;
  for (let gx = x; gx < x + w; gx += 40) {
    ctx.beginPath();
    ctx.moveTo(gx, y);
    ctx.lineTo(gx, y + h);
    ctx.stroke();
  }

  for (let lx = x + 30; lx < x + w; lx += 45) {
    ctx.fillStyle = 'rgba(0, 229, 255, 0.4)';
    ctx.beginPath();
    ctx.arc(lx, y + h / 2, 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

const FLOOR_RENDERERS: Record<
  string,
  (ctx: CanvasRenderingContext2D, room: RoomDefinition) => void
> = {
  bridge: drawBridgeFloor,
  engineering: drawEngineeringFloor,
  quarters: drawQuartersFloor,
  mess: drawMessFloor,
  armory: drawArmoryFloor,
  cargo: drawCargoFloor,
  corridor: drawCorridorFloor,
};

// Rimworld-style ambient occlusion: soft drop shadows on top and left walls
function drawAmbientOcclusion(ctx: CanvasRenderingContext2D, room: RoomDefinition) {
  const { x, y, width: w, height: h } = room;

  const topGrad = ctx.createLinearGradient(x, y, x, y + 14);
  topGrad.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
  topGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = topGrad;
  ctx.fillRect(x, y, w, 14);

  const leftGrad = ctx.createLinearGradient(x, y, x + 14, y);
  leftGrad.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
  leftGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = leftGrad;
  ctx.fillRect(x, y, 14, h);
}

export function renderDeckFloors(
  ctx: CanvasRenderingContext2D,
  rooms: RoomDefinition[],
  exploredRooms: Set<string>
): void {
  for (const room of rooms) {
    if (exploredRooms.has(room.id)) {
      const renderer = FLOOR_RENDERERS[room.id] || drawCorridorFloor;
      renderer(ctx, room);
      drawAmbientOcclusion(ctx, room);

      ctx.font = 'bold 10px monospace';
      ctx.fillStyle = '#2c405c';
      ctx.fillText(room.tag, room.x + 10, room.y + 20);
      ctx.font = '12px sans-serif';
      ctx.fillStyle = '#4a658a';
      ctx.fillText(room.name, room.x + 10, room.y + 36);
    } else {
      ctx.fillStyle = '#04070c';
      ctx.fillRect(room.x, room.y, room.width, room.height);
    }
  }
}
