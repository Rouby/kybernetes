import { drawQuad } from './glUtils';

function setColor(
  gl: WebGL2RenderingContext,
  prog: WebGLProgram,
  r: number,
  g: number,
  b: number,
  a = 1.0
): void {
  gl.uniform4f(gl.getUniformLocation(prog, 'u_color'), r, g, b, a);
}

function drawCrateStack(
  gl: WebGL2RenderingContext,
  buf: WebGLBuffer,
  prog: WebGLProgram,
  x: number,
  y: number
): void {
  setColor(gl, prog, 0.24, 0.18, 0.11, 1.0);
  drawQuad(gl, buf, x, y, 50, 80);
  setColor(gl, prog, 0.32, 0.24, 0.15, 1.0);
  drawQuad(gl, buf, x + 4, y + 6, 42, 20);
  drawQuad(gl, buf, x + 4, y + 30, 42, 20);
  drawQuad(gl, buf, x + 4, y + 54, 42, 20);
  setColor(gl, prog, 0.85, 0.68, 0.08, 1.0);
  drawQuad(gl, buf, x + 2, y + 2, 7, 7);
  drawQuad(gl, buf, x + 41, y + 2, 7, 7);
  drawQuad(gl, buf, x + 2, y + 71, 7, 7);
  drawQuad(gl, buf, x + 41, y + 71, 7, 7);
}

function renderCargoCrates(gl: WebGL2RenderingContext, buf: WebGLBuffer, prog: WebGLProgram): void {
  drawCrateStack(gl, buf, prog, 470, 415);
  drawCrateStack(gl, buf, prog, 680, 415);
}

function renderReactorShielding(
  gl: WebGL2RenderingContext,
  buf: WebGLBuffer,
  prog: WebGLProgram
): void {
  setColor(gl, prog, 0.15, 0.17, 0.22, 1.0);
  drawQuad(gl, buf, 800, 420, 60, 10);
  drawQuad(gl, buf, 800, 455, 60, 10);

  setColor(gl, prog, 0.88, 0.72, 0.08, 0.85);
  drawQuad(gl, buf, 804, 422, 12, 6);
  drawQuad(gl, buf, 842, 422, 12, 6);
  drawQuad(gl, buf, 804, 457, 12, 6);
  drawQuad(gl, buf, 842, 457, 12, 6);

  setColor(gl, prog, 0.0, 0.85, 1.0, 0.9);
  drawQuad(gl, buf, 818, 423, 22, 4);
  drawQuad(gl, buf, 818, 458, 22, 4);
}

function renderAvionicsRacks(
  gl: WebGL2RenderingContext,
  buf: WebGLBuffer,
  prog: WebGLProgram,
  time: number
): void {
  const rackX = [300, 350];
  for (const rx of rackX) {
    setColor(gl, prog, 0.1, 0.12, 0.16, 1.0);
    drawQuad(gl, buf, rx, 235, 45, 20);
    setColor(gl, prog, 0.06, 0.08, 0.11, 1.0);
    drawQuad(gl, buf, rx + 2, 237, 41, 16);

    const blink1 = Math.sin(time * 6.0 + rx) > 0 ? 0.95 : 0.2;
    const blink2 = Math.cos(time * 4.0 + rx) > 0 ? 0.95 : 0.2;
    setColor(gl, prog, 0.0, 0.85, 1.0, blink1);
    drawQuad(gl, buf, rx + 6, 243, 4, 4);
    setColor(gl, prog, 0.1, 0.95, 0.4, blink2);
    drawQuad(gl, buf, rx + 14, 243, 4, 4);
    setColor(gl, prog, 0.95, 0.7, 0.1, blink1);
    drawQuad(gl, buf, rx + 22, 243, 4, 4);
  }
}

function renderLifeSupportVats(
  gl: WebGL2RenderingContext,
  buf: WebGLBuffer,
  prog: WebGLProgram,
  time: number
): void {
  const vatX = [440, 492];
  const pulse = 0.75 + 0.25 * Math.sin(time * 3.0);
  for (const vx of vatX) {
    setColor(gl, prog, 0.12, 0.16, 0.14, 1.0);
    drawQuad(gl, buf, vx, 236, 36, 32);
    setColor(gl, prog, 0.05, 0.75, 0.38, 0.85 * pulse);
    drawQuad(gl, buf, vx + 4, 240, 28, 24);
    setColor(gl, prog, 0.7, 0.5, 0.2, 1.0);
    drawQuad(gl, buf, vx + 14, 234, 8, 3);
  }
}

function renderMessDining(gl: WebGL2RenderingContext, buf: WebGLBuffer, prog: WebGLProgram): void {
  setColor(gl, prog, 0.22, 0.25, 0.32, 1.0);
  drawQuad(gl, buf, 810, 292, 60, 20);
  setColor(gl, prog, 0.14, 0.17, 0.22, 1.0);
  drawQuad(gl, buf, 810, 284, 60, 5);
  drawQuad(gl, buf, 810, 315, 60, 5);

  setColor(gl, prog, 0.45, 0.5, 0.58, 1.0);
  drawQuad(gl, buf, 818, 296, 9, 12);
  drawQuad(gl, buf, 834, 296, 9, 12);
  drawQuad(gl, buf, 850, 296, 9, 12);
}

function renderArmoryRacks(gl: WebGL2RenderingContext, buf: WebGLBuffer, prog: WebGLProgram): void {
  setColor(gl, prog, 0.14, 0.17, 0.13, 1.0);
  drawQuad(gl, buf, 130, 418, 35, 75);
  setColor(gl, prog, 0.25, 0.3, 0.24, 1.0);
  drawQuad(gl, buf, 134, 423, 27, 20);
  drawQuad(gl, buf, 134, 448, 27, 20);
  drawQuad(gl, buf, 134, 473, 27, 15);
  setColor(gl, prog, 0.85, 0.2, 0.2, 1.0);
  drawQuad(gl, buf, 144, 420, 7, 2);
}

/** Outer bounds of each furniture group in ship-local coords, by room.
 * Mirrors the draw calls below; the containment test pins every group
 * inside its room rect so decor never bleeds through bulkheads again. */
export interface FurnitureBounds {
  readonly room: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export const SHIP_FURNITURE_BOUNDS: readonly FurnitureBounds[] = [
  { room: 'cargo', x: 470, y: 415, w: 50, h: 80 },
  { room: 'engineering', x: 680, y: 415, w: 50, h: 80 },
  { room: 'engineering', x: 800, y: 415, w: 60, h: 55 },
  { room: 'avionics', x: 300, y: 235, w: 95, h: 20 },
  { room: 'life_support', x: 440, y: 234, w: 88, h: 34 },
  { room: 'mess', x: 810, y: 284, w: 60, h: 36 },
  { room: 'armory', x: 130, y: 418, w: 35, h: 75 },
];

export function renderDeckFurniture(
  gl: WebGL2RenderingContext,
  dynamicBuffer: WebGLBuffer,
  flatProg: WebGLProgram,
  time: number
): void {
  renderCargoCrates(gl, dynamicBuffer, flatProg);
  renderReactorShielding(gl, dynamicBuffer, flatProg);
  renderAvionicsRacks(gl, dynamicBuffer, flatProg, time);
  renderLifeSupportVats(gl, dynamicBuffer, flatProg, time);
  renderMessDining(gl, dynamicBuffer, flatProg);
  renderArmoryRacks(gl, dynamicBuffer, flatProg);
}
