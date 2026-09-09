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

function renderBridgeConsoles(
  gl: WebGL2RenderingContext,
  buf: WebGLBuffer,
  prog: WebGLProgram,
  time: number
): void {
  const rackX = [100, 145];
  for (const rx of rackX) {
    setColor(gl, prog, 0.1, 0.12, 0.16, 1.0);
    drawQuad(gl, buf, rx, 40, 40, 20);
    setColor(gl, prog, 0.06, 0.08, 0.11, 1.0);
    drawQuad(gl, buf, rx + 2, 42, 36, 16);
    const blink1 = Math.sin(time * 6.0 + rx) > 0 ? 0.95 : 0.2;
    const blink2 = Math.cos(time * 4.0 + rx) > 0 ? 0.95 : 0.2;
    setColor(gl, prog, 0.0, 0.85, 1.0, blink1);
    drawQuad(gl, buf, rx + 6, 48, 4, 4);
    setColor(gl, prog, 0.1, 0.95, 0.4, blink2);
    drawQuad(gl, buf, rx + 14, 48, 4, 4);
    setColor(gl, prog, 0.95, 0.7, 0.1, blink1);
    drawQuad(gl, buf, rx + 22, 48, 4, 4);
  }
}

function renderCabinBunks(
  gl: WebGL2RenderingContext,
  buf: WebGLBuffer,
  prog: WebGLProgram,
  y: number
): void {
  for (const bx of [100, 145]) {
    setColor(gl, prog, 0.18, 0.2, 0.26, 1.0);
    drawQuad(gl, buf, bx, y, 40, 44);
    setColor(gl, prog, 0.72, 0.76, 0.84, 1.0);
    drawQuad(gl, buf, bx + 3, y + 3, 34, 38);
    setColor(gl, prog, 0.35, 0.45, 0.6, 1.0);
    drawQuad(gl, buf, bx + 3, y + 22, 34, 19);
  }
}

function renderDriveShielding(
  gl: WebGL2RenderingContext,
  buf: WebGLBuffer,
  prog: WebGLProgram
): void {
  setColor(gl, prog, 0.15, 0.17, 0.22, 1.0);
  drawQuad(gl, buf, 100, 540, 80, 10);
  drawQuad(gl, buf, 100, 590, 80, 10);
  setColor(gl, prog, 0.88, 0.72, 0.08, 0.85);
  drawQuad(gl, buf, 104, 542, 12, 6);
  drawQuad(gl, buf, 164, 542, 12, 6);
  drawQuad(gl, buf, 104, 592, 12, 6);
  drawQuad(gl, buf, 164, 592, 12, 6);
  setColor(gl, prog, 0.0, 0.85, 1.0, 0.9);
  drawQuad(gl, buf, 120, 543, 40, 4);
  drawQuad(gl, buf, 120, 593, 40, 4);
}

function renderSpineLights(
  gl: WebGL2RenderingContext,
  buf: WebGLBuffer,
  prog: WebGLProgram,
  time: number
): void {
  const pulse = 0.7 + 0.3 * Math.sin(time * 3.0);
  setColor(gl, prog, 0.12, 0.15, 0.2, 1.0);
  drawQuad(gl, buf, 14, 310, 32, 60);
  setColor(gl, prog, 0.0, 0.85, 1.0, 0.8 * pulse);
  drawQuad(gl, buf, 18, 318, 24, 6);
  drawQuad(gl, buf, 18, 330, 24, 6);
  drawQuad(gl, buf, 18, 342, 24, 6);
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
  { room: 'bruecke', x: 90, y: 30, w: 100, h: 40 },
  { room: 'kajute_nord', x: 90, y: 160, w: 100, h: 60 },
  { room: 'kajute_sued', x: 90, y: 310, w: 100, h: 60 },
  { room: 'reaktor_antrieb', x: 90, y: 520, w: 100, h: 100 },
  { room: 'korridor_schiff', x: 10, y: 300, w: 40, h: 80 },
];

export function renderDeckFurniture(
  gl: WebGL2RenderingContext,
  dynamicBuffer: WebGLBuffer,
  flatProg: WebGLProgram,
  time: number
): void {
  renderBridgeConsoles(gl, dynamicBuffer, flatProg, time);
  renderCabinBunks(gl, dynamicBuffer, flatProg, 165);
  renderCabinBunks(gl, dynamicBuffer, flatProg, 315);
  renderDriveShielding(gl, dynamicBuffer, flatProg);
  renderSpineLights(gl, dynamicBuffer, flatProg, time);
}
