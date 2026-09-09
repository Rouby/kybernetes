import type { DoorState } from '@kybernetes/protocol';
import {
  applyShipOffsetToWalls,
  BREACH_GLOW_S,
  type BreachRenderModel,
  carveWallsByFrame,
  getWorldRooms,
  HESPERIA_LIGHTS,
  HESPERIA_WALLS,
  isShipSideRoom,
  isStationSideDoor,
  TICKS_PER_S,
} from '@kybernetes/sim-core';
import { deckFloorStyle } from '../DeckFloorStyle';
import { renderDeckFurniture } from '../DeckFurniture';
import {
  addThickSegment,
  bufferAndDraw,
  createProgram,
  drawQuad,
  translateMatrix,
} from '../glUtils';
import { DECK_FLOOR_FS, DECK_FLOOR_VS } from '../shaders';
import { accumulatePit, emptyPitLayers, type PremiumDecal, scorchPalette } from './ImpactDecalPass';

/** Hull plate in ship-local coords; every v2 room rect must sit inside it. */
export const HULL_PLATE = { x: -20, y: -20, w: 260, h: 740 } as const;

/** Drive bell nozzle exits in ship-local coords; the drive deck faces south
 * on the vertical hull, so exhaust streams +Y (main burn pushes north). */
export const THRUSTER_BELLS: ReadonlyArray<{ x: number; y: number }> = [
  { x: 70, y: 716 },
  { x: 120, y: 718 },
  { x: 170, y: 716 },
];

/** Tapered outer armor silhouette in ship-local coords (reference-ship style:
 * chamfered nose, straight mid-body, stepped engineering shoulders, flared
 * drive housing). Pure visuals: collision stays on the hull-compiler rects
 * and HULL_PLATE bounds. Loop order is clockwise from the nose tip. */
export interface HullSilhouettePoint {
  readonly x: number;
  readonly y: number;
}

export const HULL_SILHOUETTE: readonly HullSilhouettePoint[] = [
  { x: 110, y: -56 },
  { x: 148, y: -36 },
  { x: 202, y: -12 },
  { x: 232, y: 8 },
  { x: 234, y: 560 },
  { x: 240, y: 585 },
  { x: 240, y: 660 },
  { x: 238, y: 700 },
  { x: 180, y: 708 },
  { x: 182, y: 732 },
  { x: 38, y: 732 },
  { x: 40, y: 708 },
  { x: -18, y: 700 },
  { x: -20, y: 660 },
  { x: -20, y: 585 },
  { x: -14, y: 560 },
  { x: -14, y: 8 },
  { x: 18, y: -12 },
  { x: 72, y: -36 },
];

/** Ray-cast point test against HULL_SILHOUETTE (visual containment only). */
export function isPointInHullSilhouette(x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = HULL_SILHOUETTE.length - 1; i < HULL_SILHOUETTE.length; j = i++) {
    const xi = HULL_SILHOUETTE[i].x;
    const yi = HULL_SILHOUETTE[i].y;
    const xj = HULL_SILHOUETTE[j].x;
    const yj = HULL_SILHOUETTE[j].y;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function addHullLoop(verts: number[], thickness: number): void {
  for (let i = 0; i < HULL_SILHOUETTE.length; i++) {
    const a = HULL_SILHOUETTE[i];
    const b = HULL_SILHOUETTE[(i + 1) % HULL_SILHOUETTE.length];
    addThickSegment(verts, a.x, a.y, b.x, b.y, thickness);
  }
}

function renderHullNoseCap(gl: WebGL2RenderingContext, buf: WebGLBuffer): void {
  drawQuad(gl, buf, 72, -38, 76, 20);
  drawQuad(gl, buf, 48, -24, 124, 16);
  drawQuad(gl, buf, -2, -10, 224, 12);
}

function renderHullEngineHousing(
  gl: WebGL2RenderingContext,
  buf: WebGLBuffer,
  prog: WebGLProgram
): void {
  gl.uniform4f(gl.getUniformLocation(prog, 'u_color'), 0.1, 0.12, 0.17, 1.0);
  drawQuad(gl, buf, 38, 700, 144, 32);
  gl.uniform4f(gl.getUniformLocation(prog, 'u_color'), 0.16, 0.19, 0.26, 1.0);
  drawQuad(gl, buf, 34, 726, 152, 8);
}

function renderHullGreebles(
  gl: WebGL2RenderingContext,
  buf: WebGLBuffer,
  prog: WebGLProgram
): void {
  gl.uniform4f(gl.getUniformLocation(prog, 'u_color'), 0.16, 0.19, 0.26, 1.0);
  drawQuad(gl, buf, 102, -44, 16, 8);
  drawQuad(gl, buf, -20, 600, 8, 40);
  drawQuad(gl, buf, 232, 600, 8, 40);
  drawQuad(gl, buf, -14, 120, 6, 26);
  drawQuad(gl, buf, 228, 120, 6, 26);
  gl.uniform4f(gl.getUniformLocation(prog, 'u_color'), 0.32, 0.36, 0.44, 0.9);
  drawQuad(gl, buf, -20, 585, 10, 4);
  drawQuad(gl, buf, 230, 585, 10, 4);
  drawQuad(gl, buf, -20, 656, 10, 4);
  drawQuad(gl, buf, 230, 656, 10, 4);
}

function drawDoorBrackets(
  gl: WebGL2RenderingContext,
  dynamicBuffer: WebGLBuffer,
  flatProg: WebGLProgram,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  gl.uniform4f(gl.getUniformLocation(flatProg, 'u_color'), 0.0, 0.95, 1.0, 0.95);
  const b = 6;
  drawQuad(gl, dynamicBuffer, x - 3, y - 3, b, 1.5);
  drawQuad(gl, dynamicBuffer, x - 3, y - 3, 1.5, b);
  drawQuad(gl, dynamicBuffer, x + w + 3 - b, y - 3, b, 1.5);
  drawQuad(gl, dynamicBuffer, x + w + 1.5, y - 3, 1.5, b);
  drawQuad(gl, dynamicBuffer, x - 3, y + h + 1.5, b, 1.5);
  drawQuad(gl, dynamicBuffer, x - 3, y + h + 3 - b, 1.5, b);
  drawQuad(gl, dynamicBuffer, x + w + 3 - b, y + h + 1.5, b, 1.5);
  drawQuad(gl, dynamicBuffer, x + w + 1.5, y + h + 3 - b, 1.5, b);
}

function renderPanelSeams(
  gl: WebGL2RenderingContext,
  dynamicBuffer: WebGLBuffer,
  flatProg: WebGLProgram,
  walls: Array<{ x1: number; y1: number; x2: number; y2: number }>
): void {
  gl.uniform4f(gl.getUniformLocation(flatProg, 'u_color'), 0.52, 0.58, 0.7, 1.0);
  const detailLines: number[] = [];
  for (const wall of walls) {
    const dx = wall.x2 - wall.x1;
    const dy = wall.y2 - wall.y1;
    const len = Math.hypot(dx, dy);
    if (len > 32) {
      const nx = -dy / len;
      const ny = dx / len;
      const steps = Math.floor(len / 32);
      for (let i = 1; i < steps; i++) {
        const px = wall.x1 + (dx * i) / steps;
        const py = wall.y1 + (dy * i) / steps;
        addThickSegment(
          detailLines,
          px - nx * 3.5,
          py - ny * 3.5,
          px + nx * 3.5,
          py + ny * 3.5,
          1.4
        );
      }
    }
  }
  bufferAndDraw(gl, dynamicBuffer, new Float32Array(detailLines));
}

/** 0 = stone cold, 1 = freshly cut. Molten rims cool into frost. */
function breachGlow(model: BreachRenderModel): number {
  return Math.max(0, Math.min(1, 1 - model.ageTicks / TICKS_PER_S / BREACH_GLOW_S));
}

function breachScale(model: BreachRenderModel): number {
  return Math.max(0.15, Math.min(1, model.areaM2 / 1.5));
}

function breachDxy(model: BreachRenderModel, shipDx: number, shipDy = 0): { x: number; y: number } {
  return model.frameId === 'ship' ? { x: shipDx, y: shipDy } : { x: 0, y: 0 };
}

/** Dark vacuum inset behind the carved gap so holes read as depth. */
function renderBreachVoids(
  gl: WebGL2RenderingContext,
  dynamicBuffer: WebGLBuffer,
  flatProg: WebGLProgram,
  breaches: readonly BreachRenderModel[],
  shipDx: number,
  shipDy = 0
): void {
  const voids: number[] = [];
  for (const breach of breaches) {
    if (breach.sizeClass !== 'breach') continue;
    const { x: dx, y: dy } = breachDxy(breach, shipDx, shipDy);
    const tx = -breach.ny;
    const ty = breach.nx;
    const over = 2;
    const half = breach.lenPx / 2 + over;
    addThickSegment(
      voids,
      breach.cx + dx - tx * half,
      breach.cy + dy - ty * half,
      breach.cx + dx + tx * half,
      breach.cy + dy + ty * half,
      7 + 6 * breachScale(breach)
    );
  }
  if (voids.length === 0) return;
  gl.uniform4f(gl.getUniformLocation(flatProg, 'u_color'), 0.008, 0.012, 0.025, 0.96);
  bufferAndDraw(gl, dynamicBuffer, new Float32Array(voids));
}

function addMoltenLips(
  glowLines: number[],
  breach: BreachRenderModel,
  dx: number,
  dy: number,
  scale: number
): void {
  const tx = -breach.ny;
  const ty = breach.nx;
  const half = breach.lenPx / 2;
  const lip = 4 + 6 * scale;
  const cx = breach.cx + dx;
  const cy = breach.cy + dy;
  addThickSegment(
    glowLines,
    cx - tx * half,
    cy - ty * half,
    cx - tx * half - breach.nx * lip * 0.5,
    cy - ty * half - breach.ny * lip * 0.5,
    2 + 1.6 * scale
  );
  addThickSegment(
    glowLines,
    cx + tx * half,
    cy + ty * half,
    cx + tx * half - breach.nx * lip * 0.5,
    cy + ty * half - breach.ny * lip * 0.5,
    2 + 1.6 * scale
  );
  addThickSegment(
    glowLines,
    cx - tx * half * 0.8,
    cy - ty * half * 0.8,
    cx + tx * half * 0.8,
    cy + ty * half * 0.8,
    1.8
  );
}

function addFrostSpurs(
  frostLines: number[],
  breach: BreachRenderModel,
  dx: number,
  dy: number,
  scale: number,
  glow: number
): void {
  const tx = -breach.ny;
  const ty = breach.nx;
  const half = breach.lenPx / 2;
  const reach = 3 + 5 * (1 - glow) + 3 * scale;
  const cx = breach.cx + dx;
  const cy = breach.cy + dy;
  addThickSegment(
    frostLines,
    cx - tx * (half + 2),
    cy - ty * (half + 2),
    cx - tx * (half + 2 + reach) + breach.nx * 3,
    cy - ty * (half + 2 + reach) + breach.ny * 3,
    1.5
  );
  addThickSegment(
    frostLines,
    cx + tx * (half + 2),
    cy + ty * (half + 2),
    cx + tx * (half + 2 + reach) + breach.nx * 3,
    cy + ty * (half + 2 + reach) + breach.ny * 3,
    1.5
  );
}

/** Molten lips cool into frost: fresh cuts burn, old ones glitter. */
function renderBreachDressing(
  gl: WebGL2RenderingContext,
  dynamicBuffer: WebGLBuffer,
  flatProg: WebGLProgram,
  breaches: readonly BreachRenderModel[],
  timeSec: number,
  shipDx: number,
  shipDy = 0
): void {
  const glowLines: number[] = [];
  const frostLines: number[] = [];
  let glowAlpha = 0;
  let frostAlpha = 0;
  for (const breach of breaches) {
    if (breach.sizeClass !== 'breach') continue;
    const glow = breachGlow(breach);
    const scale = breachScale(breach);
    const { x: dx, y: dy } = breachDxy(breach, shipDx, shipDy);
    glowAlpha = Math.max(glowAlpha, 0.25 + 0.65 * glow);
    frostAlpha = Math.max(frostAlpha, 0.35 + 0.5 * (1 - glow));
    addMoltenLips(glowLines, breach, dx, dy, scale);
    addFrostSpurs(frostLines, breach, dx, dy, scale, glow);
  }
  if (glowLines.length > 0) {
    const flicker = 0.9 + 0.1 * Math.sin(timeSec * 9);
    gl.uniform4f(gl.getUniformLocation(flatProg, 'u_color'), 1.0, 0.42, 0.12, glowAlpha * flicker);
    bufferAndDraw(gl, dynamicBuffer, new Float32Array(glowLines));
  }
  if (frostLines.length > 0) {
    gl.uniform4f(gl.getUniformLocation(flatProg, 'u_color'), 0.2, 0.85, 1.0, frostAlpha);
    bufferAndDraw(gl, dynamicBuffer, new Float32Array(frostLines));
  }
}

function renderWindowGlass(
  gl: WebGL2RenderingContext,
  dynamicBuffer: WebGLBuffer,
  flatProg: WebGLProgram,
  glass: Array<{ x1: number; y1: number; x2: number; y2: number }>
): void {
  if (glass.length === 0) return;
  gl.uniform4f(gl.getUniformLocation(flatProg, 'u_color'), 0.55, 0.68, 0.8, 0.28);
  const paneLines: number[] = [];
  for (const pane of glass) {
    addThickSegment(paneLines, pane.x1, pane.y1, pane.x2, pane.y2, 6);
  }
  bufferAndDraw(gl, dynamicBuffer, new Float32Array(paneLines));
  gl.uniform4f(gl.getUniformLocation(flatProg, 'u_color'), 0.0, 0.9, 1.0, 0.8);
  const frameLines: number[] = [];
  for (const pane of glass) {
    addThickSegment(frameLines, pane.x1 - 3, pane.y1 - 3, pane.x1 + 3, pane.y1 + 3, 2.4);
    addThickSegment(frameLines, pane.x2 - 3, pane.y2 - 3, pane.x2 + 3, pane.y2 + 3, 2.4);
  }
  bufferAndDraw(gl, dynamicBuffer, new Float32Array(frameLines));
}

/**
 * Puncture breaches join the shared pit layers: radius from hole area,
 * cooling from breach age. No carve, no crosses.
 */
function accumulatePuncturePits(
  layers: ReturnType<typeof emptyPitLayers>,
  breaches: readonly BreachRenderModel[],
  shipDx: number,
  shipDy = 0
): void {
  for (const breach of breaches) {
    if (breach.sizeClass !== 'puncture') continue;
    const { x: dx, y: dy } = breachDxy(breach, shipDx, shipDy);
    const radius = 1.2 + Math.min(1, breach.areaM2 / 0.2) * 1.6;
    const cool = Math.min(1, Math.max(0, breach.ageTicks / 200));
    accumulatePit(layers, breach.cx + dx, breach.cy + dy, radius, 'kinetic_carbine', cool);
  }
}

export class DeckPass {
  public shipOffset: { x: number; y: number } = { x: 0, y: 0 };
  private gl: WebGL2RenderingContext;
  private deckProg: WebGLProgram;
  private deckVAO: WebGLVertexArrayObject;
  private dynamicBuffer: WebGLBuffer;
  private doorOpenRatios = new Map<string, number>();
  private uMatrixLoc: WebGLUniformLocation | null = null;
  private uTimeLoc: WebGLUniformLocation | null = null;
  private uProjLightsLoc: WebGLUniformLocation | null = null;
  private uProjColorsLoc: WebGLUniformLocation | null = null;
  private uRoomTypeLoc: WebGLUniformLocation | null = null;
  private uRoomBoundsLoc: WebGLUniformLocation | null = null;
  private uFloorColorLoc: WebGLUniformLocation | null = null;
  private uShipOffsetLoc: WebGLUniformLocation | null = null;
  private uIsShipRoomLoc: WebGLUniformLocation | null = null;

  constructor(gl: WebGL2RenderingContext, dynamicBuffer: WebGLBuffer) {
    this.gl = gl;
    this.dynamicBuffer = dynamicBuffer;
    this.deckProg = createProgram(gl, DECK_FLOOR_VS, DECK_FLOOR_FS);

    this.uMatrixLoc = gl.getUniformLocation(this.deckProg, 'u_matrix');
    this.uTimeLoc = gl.getUniformLocation(this.deckProg, 'u_time');
    this.uProjLightsLoc = gl.getUniformLocation(this.deckProg, 'u_projLights');
    this.uProjColorsLoc = gl.getUniformLocation(this.deckProg, 'u_projColors');
    this.uRoomTypeLoc = gl.getUniformLocation(this.deckProg, 'u_roomType');
    this.uRoomBoundsLoc = gl.getUniformLocation(this.deckProg, 'u_roomBounds');
    this.uFloorColorLoc = gl.getUniformLocation(this.deckProg, 'u_floorColor');
    this.uShipOffsetLoc = gl.getUniformLocation(this.deckProg, 'u_shipOffset');
    this.uIsShipRoomLoc = gl.getUniformLocation(this.deckProg, 'u_isShipRoom');

    this.deckVAO = gl.createVertexArray()!;
    gl.bindVertexArray(this.deckVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dynamicBuffer);
    const deckPos = gl.getAttribLocation(this.deckProg, 'a_position');
    gl.enableVertexAttribArray(deckPos);
    gl.vertexAttribPointer(deckPos, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  private bindFlat(
    flatProg: WebGLProgram,
    flatVAO: WebGLVertexArrayObject,
    matrix: Float32Array
  ): WebGL2RenderingContext {
    const gl = this.gl;
    gl.useProgram(flatProg);
    gl.bindVertexArray(flatVAO);
    gl.uniformMatrix3fv(gl.getUniformLocation(flatProg, 'u_matrix'), false, matrix);
    return gl;
  }

  // fallow-ignore-next-line complexity
  public renderDeckFloors(
    matrix: Float32Array,
    time: number,
    currentLights: Float32Array,
    currentLightColors: Float32Array
  ): void {
    const gl = this.gl;
    gl.useProgram(this.deckProg);
    gl.bindVertexArray(this.deckVAO);
    gl.uniformMatrix3fv(this.uMatrixLoc, false, matrix);
    gl.uniform1f(this.uTimeLoc, time);

    gl.uniform4fv(this.uProjLightsLoc, currentLights);
    gl.uniform3fv(this.uProjColorsLoc, currentLightColors);
    gl.uniform2f(this.uShipOffsetLoc, this.shipOffset.x, this.shipOffset.y);

    for (const room of getWorldRooms(this.shipOffset)) {
      const style = deckFloorStyle(room.id);
      gl.uniform1i(this.uIsShipRoomLoc, isShipSideRoom(room.id) ? 1 : 0);
      gl.uniform1i(this.uRoomTypeLoc, style.type);
      gl.uniform4f(this.uRoomBoundsLoc, room.x, room.y, room.width, room.height);
      gl.uniform3f(this.uFloorColorLoc, style.color[0], style.color[1], style.color[2]);

      drawQuad(gl, this.dynamicBuffer, room.x, room.y, room.width, room.height);
    }
    gl.bindVertexArray(null);
  }

  public renderBulkheads(
    flatProg: WebGLProgram,
    flatVAO: WebGLVertexArrayObject,
    matrix: Float32Array,
    breaches: readonly BreachRenderModel[] = [],
    timeSec = 0,
    decals: readonly PremiumDecal[] = []
  ): void {
    const gl = this.gl;
    gl.useProgram(flatProg);
    gl.bindVertexArray(flatVAO);
    gl.uniformMatrix3fv(gl.getUniformLocation(flatProg, 'u_matrix'), false, matrix);

    const gaps = breaches
      .filter((breach) => breach.sizeClass === 'breach')
      .map(({ frameId, x1, y1, x2, y2, areaM2 }) => ({ frameId, x1, y1, x2, y2, areaM2 }));
    const walls = applyShipOffsetToWalls(
      gaps.length > 0 ? carveWallsByFrame(HESPERIA_WALLS, gaps) : HESPERIA_WALLS,
      this.shipOffset
    );

    const solids = walls.filter((w) => !w.isWindow);
    const glass = walls.filter((w) => w.isWindow);

    // 1. Soft Wall Drop Shadows cast onto the floor along bottom/right (+4, +5)
    gl.uniform4f(gl.getUniformLocation(flatProg, 'u_color'), 0.0, 0.0, 0.0, 0.42);
    const shadowLines: number[] = [];
    for (const wall of solids) {
      addThickSegment(shadowLines, wall.x1 + 4, wall.y1 + 5, wall.x2 + 4, wall.y2 + 5, 10);
    }
    bufferAndDraw(gl, this.dynamicBuffer, new Float32Array(shadowLines));

    // 2. Heavy Armored Structural Casing Core (7.5px dark charcoal gunmetal)
    gl.uniform4f(gl.getUniformLocation(flatProg, 'u_color'), 0.07, 0.09, 0.13, 1.0);
    const coreLines: number[] = [];
    for (const wall of solids) {
      addThickSegment(coreLines, wall.x1, wall.y1, wall.x2, wall.y2, 7.5);
    }
    bufferAndDraw(gl, this.dynamicBuffer, new Float32Array(coreLines));

    // 3. Metallic Beveled Edge Highlight (2.8px steel blue)
    gl.uniform4f(gl.getUniformLocation(flatProg, 'u_color'), 0.32, 0.38, 0.48, 1.0);
    const bevelLines: number[] = [];
    for (const wall of solids) {
      addThickSegment(bevelLines, wall.x1, wall.y1, wall.x2, wall.y2, 2.8);
    }
    bufferAndDraw(gl, this.dynamicBuffer, new Float32Array(bevelLines));

    // 4. Panel Seams
    renderPanelSeams(gl, this.dynamicBuffer, flatProg, solids);

    // 5. Viewport glass: translucent panes with bright frame ticks
    renderWindowGlass(gl, this.dynamicBuffer, flatProg, glass);

    // 5. Vacuum insets behind carved gaps
    renderBreachVoids(
      gl,
      this.dynamicBuffer,
      flatProg,
      breaches,
      this.shipOffset.x,
      this.shipOffset.y
    );

    // 6. Molten lips cooling into frost + puncture impact decals
    renderBreachDressing(
      gl,
      this.dynamicBuffer,
      flatProg,
      breaches,
      timeSec,
      this.shipOffset.x,
      this.shipOffset.y
    );
    this.renderPits(flatProg, breaches, decals, timeSec);

    gl.bindVertexArray(null);
  }

  /**
   * Persistent bullet chips, batched into a handful of draw calls for the
   * whole table: faint halo, lit upper edge, dark pit, hot pixel while
   * fresh, frost tick once cold. Small by design — breaches carry the
   * spectacle through the carve + plume passes.
   */
  /** One shared pit table per frame: punctures plus persistent scorch. */
  public renderPits(
    flatProg: WebGLProgram,
    breaches: readonly BreachRenderModel[],
    decals: readonly PremiumDecal[],
    timeSec: number
  ): void {
    if (breaches.length === 0 && decals.length === 0) return;
    const layers = emptyPitLayers();
    accumulatePuncturePits(layers, breaches, this.shipOffset.x, this.shipOffset.y);
    for (const decal of decals.slice(-64)) {
      accumulatePit(layers, decal.x, decal.y, decal.radius, decal.weapon, decal.cool);
    }
    this.drawPitLayers(flatProg, layers, timeSec);
  }

  private drawPitLayers(
    flatProg: WebGLProgram,
    layers: ReturnType<typeof emptyPitLayers>,
    timeSec: number
  ): void {
    const gl = this.gl;
    const flicker = 0.9 + 0.1 * Math.sin(timeSec * 9);
    const base = scorchPalette('kinetic_carbine');
    if (layers.scorch.length > 0) {
      gl.uniform4f(gl.getUniformLocation(flatProg, 'u_color'), ...base.scorch);
      bufferAndDraw(gl, this.dynamicBuffer, new Float32Array(layers.scorch));
    }
    if (layers.edge.length > 0) {
      gl.uniform4f(gl.getUniformLocation(flatProg, 'u_color'), ...base.rim);
      bufferAndDraw(gl, this.dynamicBuffer, new Float32Array(layers.edge));
    }
    if (layers.core.length > 0) {
      gl.uniform4f(gl.getUniformLocation(flatProg, 'u_color'), ...base.core);
      bufferAndDraw(gl, this.dynamicBuffer, new Float32Array(layers.core));
    }
    for (const [weapon, verts] of layers.glowByWeapon) {
      const palette = scorchPalette(weapon);
      gl.uniform4f(
        gl.getUniformLocation(flatProg, 'u_color'),
        palette.glow[0],
        palette.glow[1],
        palette.glow[2],
        0.8 * flicker
      );
      bufferAndDraw(gl, this.dynamicBuffer, new Float32Array(verts));
    }
    if (layers.frost.length > 0) {
      gl.uniform4f(gl.getUniformLocation(flatProg, 'u_color'), 0.55, 0.9, 1.0, 0.4);
      bufferAndDraw(gl, this.dynamicBuffer, new Float32Array(layers.frost));
    }
  }

  /**
   * Andockschleuse dock tube: while the docked origin holds the corridor
   * mouth at world (1210, 260), a 70px umbilical spans the airlock east
   * face (1140) to the mouth. Sealed otherwise: red ticks on both leaves.
   */
  public renderDockTube(
    flatProg: WebGLProgram,
    flatVAO: WebGLVertexArrayObject,
    matrix: Float32Array,
    dock: { walkable: boolean; phase: string; secondsToSeal: number } | undefined,
    timeSec: number
  ): void {
    const gl = this.bindFlat(flatProg, flatVAO, matrix);
    const walkable = dock?.walkable === true;
    if (walkable) {
      gl.uniform4f(gl.getUniformLocation(flatProg, 'u_color'), 0.16, 0.19, 0.26, 1.0);
      drawQuad(gl, this.dynamicBuffer, 1140, 244, 70, 32);
      gl.uniform4f(gl.getUniformLocation(flatProg, 'u_color'), 0.0, 0.9, 1.0, 0.85);
      const guides: number[] = [];
      addThickSegment(guides, 1140, 244, 1210, 244, 2);
      addThickSegment(guides, 1140, 276, 1210, 276, 2);
      addThickSegment(guides, 1140, 236, 1140, 284, 2.4);
      addThickSegment(guides, 1210, 240, 1210, 280, 2.4);
      bufferAndDraw(gl, this.dynamicBuffer, new Float32Array(guides));
    } else {
      const blink = 0.5 + 0.5 * Math.sin(timeSec * 6);
      gl.uniform4f(gl.getUniformLocation(flatProg, 'u_color'), 0.95, 0.25, 0.2, 0.5 + 0.4 * blink);
      const seals: number[] = [];
      addThickSegment(seals, 1140, 230, 1140, 290, 4);
      bufferAndDraw(gl, this.dynamicBuffer, new Float32Array(seals));
      this.bindFlat(
        flatProg,
        flatVAO,
        translateMatrix(matrix, this.shipOffset.x, this.shipOffset.y)
      );
      gl.uniform4f(gl.getUniformLocation(flatProg, 'u_color'), 0.95, 0.25, 0.2, 0.5 + 0.4 * blink);
      const shipSeals: number[] = [];
      addThickSegment(shipSeals, 0, 320, 0, 360, 4);
      bufferAndDraw(gl, this.dynamicBuffer, new Float32Array(shipSeals));
    }
    gl.bindVertexArray(null);
  }

  public renderOuterHull(
    flatProg: WebGLProgram,
    flatVAO: WebGLVertexArrayObject,
    matrix: Float32Array,
    _time: number
  ): void {
    const gl = this.bindFlat(flatProg, flatVAO, matrix);

    // Station block hull plate backing the live hub footprint
    // (habitat/medizin/sicherheit_nord, corridors, south band, Andock A).
    gl.uniform4f(gl.getUniformLocation(flatProg, 'u_color'), 0.09, 0.11, 0.16, 1.0);
    drawQuad(gl, this.dynamicBuffer, -24, -24, 1188, 528);
    gl.uniform4f(gl.getUniformLocation(flatProg, 'u_color'), 0.22, 0.28, 0.38, 1.0);
    const stationLines: number[] = [];
    addThickSegment(stationLines, -24, -24, 1164, -24, 4);
    addThickSegment(stationLines, 1164, -24, 1164, 504, 4);
    addThickSegment(stationLines, 1164, 504, -24, 504, 4);
    addThickSegment(stationLines, -24, 504, -24, -24, 4);
    bufferAndDraw(gl, this.dynamicBuffer, new Float32Array(stationLines));

    this.bindFlat(flatProg, flatVAO, translateMatrix(matrix, this.shipOffset.x, this.shipOffset.y));

    // Dark armor hull base hugging the vertical room block (x0-220, y0-700)
    // with even margins; the south strip is the engine mount for the bells.
    gl.uniform4f(gl.getUniformLocation(flatProg, 'u_color'), 0.07, 0.09, 0.13, 1.0);
    drawQuad(gl, this.dynamicBuffer, HULL_PLATE.x, HULL_PLATE.y, HULL_PLATE.w, HULL_PLATE.h);
    renderHullNoseCap(gl, this.dynamicBuffer);
    renderHullEngineHousing(gl, this.dynamicBuffer, flatProg);

    // Tapered armor band following HULL_SILHOUETTE (reference-ship read).
    gl.uniform4f(gl.getUniformLocation(flatProg, 'u_color'), 0.1, 0.12, 0.17, 1.0);
    const armorBand: number[] = [];
    addHullLoop(armorBand, 18);
    bufferAndDraw(gl, this.dynamicBuffer, new Float32Array(armorBand));

    // Outer edge highlight tracing the same silhouette loop.
    gl.uniform4f(gl.getUniformLocation(flatProg, 'u_color'), 0.28, 0.34, 0.45, 1.0);
    const hullLines: number[] = [];
    addHullLoop(hullLines, 3);
    bufferAndDraw(gl, this.dynamicBuffer, new Float32Array(hullLines));

    renderHullGreebles(gl, this.dynamicBuffer, flatProg);

    // Thruster bell housings mounted on the drive face (south edge).
    // Plumes are live exhaust particles (see emitThrusterExhaust), not quads,
    // so docked ships idle instead of burning at full scale.
    gl.uniform4f(gl.getUniformLocation(flatProg, 'u_color'), 0.14, 0.17, 0.24, 1.0);
    drawQuad(gl, this.dynamicBuffer, 60, 706, 20, 14);
    drawQuad(gl, this.dynamicBuffer, 110, 706, 20, 14);
    drawQuad(gl, this.dynamicBuffer, 160, 706, 20, 14);

    gl.bindVertexArray(null);
  }

  public renderFurniture(
    flatProg: WebGLProgram,
    flatVAO: WebGLVertexArrayObject,
    matrix: Float32Array,
    time: number
  ): void {
    this.bindFlat(flatProg, flatVAO, translateMatrix(matrix, this.shipOffset.x, this.shipOffset.y));
    renderDeckFurniture(this.gl, this.dynamicBuffer, flatProg, time);
    this.gl.bindVertexArray(null);
  }

  // fallow-ignore-next-line complexity
  private drawSingleDoor(
    gl: WebGL2RenderingContext,
    flatProg: WebGLProgram,
    door: DoorState,
    dt: number,
    isNearest: boolean
  ): void {
    const isHoriz = Math.abs(door.y2 - door.y1) < Math.abs(door.x2 - door.x1);
    const minX = Math.min(door.x1, door.x2);
    const minY = Math.min(door.y1, door.y2);
    const w = isHoriz ? Math.abs(door.x2 - door.x1) : 14;
    const h = isHoriz ? 14 : Math.abs(door.y2 - door.y1);
    const x = isHoriz ? minX : door.x1 - 7;
    const y = isHoriz ? door.y1 - 7 : minY;

    if (isNearest) {
      drawDoorBrackets(gl, this.dynamicBuffer, flatProg, x, y, w, h);
    }

    const targetRatio = door.isOpen ? 1.0 : 0.0;
    const prevRatio = this.doorOpenRatios.get(door.id) ?? targetRatio;
    const newRatio = prevRatio + (targetRatio - prevRatio) * Math.min(1.0, dt * 9.0);
    this.doorOpenRatios.set(door.id, newRatio);

    // 1. Recessed door frame track housing (fixed at jambs)
    gl.uniform4f(gl.getUniformLocation(flatProg, 'u_color'), 0.12, 0.14, 0.18, 1.0);
    if (isHoriz) {
      drawQuad(gl, this.dynamicBuffer, x, y, 7, h);
      drawQuad(gl, this.dynamicBuffer, x + w - 7, y, 7, h);
    } else {
      drawQuad(gl, this.dynamicBuffer, x, y, w, 7);
      drawQuad(gl, this.dynamicBuffer, x, y + h - 7, w, 7);
    }

    // 2. Frame clearance indicator LED (green when open, red when closed)
    const ledCol: [number, number, number] = door.isOpen ? [0.1, 0.95, 0.35] : [0.95, 0.2, 0.2];
    gl.uniform4f(gl.getUniformLocation(flatProg, 'u_color'), ledCol[0], ledCol[1], ledCol[2], 1.0);
    if (isHoriz) {
      drawQuad(gl, this.dynamicBuffer, x + 2, y + 2, 3, 3);
      drawQuad(gl, this.dynamicBuffer, x + w - 5, y + 2, 3, 3);
    } else {
      drawQuad(gl, this.dynamicBuffer, x + 2, y + 2, 3, 3);
      drawQuad(gl, this.dynamicBuffer, x + 2, y + h - 5, 3, 3);
    }

    // 3. Sliding Blast Door Slabs (retract towards jambs as newRatio -> 1.0)
    const slideOffset = (isHoriz ? w * 0.42 : h * 0.42) * newRatio;
    const slabW = isHoriz ? w * 0.5 - 2 : w - 2;
    const slabH = isHoriz ? h - 2 : h * 0.5 - 2;

    const s1x = isHoriz ? x + 1 - slideOffset : x + 1;
    const s1y = isHoriz ? y + 1 : y + 1 - slideOffset;
    const s2x = isHoriz ? x + w * 0.5 + 1 + slideOffset : x + 1;
    const s2y = isHoriz ? y + 1 : y + h * 0.5 + 1 + slideOffset;

    gl.uniform4f(
      gl.getUniformLocation(flatProg, 'u_color'),
      0.88,
      0.68,
      0.05,
      1.0 - newRatio * 0.8
    );
    drawQuad(gl, this.dynamicBuffer, s1x, s1y, slabW, slabH);
    drawQuad(gl, this.dynamicBuffer, s2x, s2y, slabW, slabH);

    gl.uniform4f(
      gl.getUniformLocation(flatProg, 'u_color'),
      0.12,
      0.14,
      0.16,
      1.0 - newRatio * 0.8
    );
    const stripes = isHoriz ? Math.floor(w / 16) : Math.floor(h / 16);
    for (let i = 0; i < stripes; i += 2) {
      const off = i * 16;
      if (isHoriz) {
        drawQuad(gl, this.dynamicBuffer, s1x + off, s1y, 8, slabH);
        drawQuad(gl, this.dynamicBuffer, s2x + off, s2y, 8, slabH);
      } else {
        drawQuad(gl, this.dynamicBuffer, s1x, s1y + off, slabW, 8);
        drawQuad(gl, this.dynamicBuffer, s2x + off, s2y, 8, slabH);
      }
    }
  }

  public renderDoors(
    flatProg: WebGLProgram,
    flatVAO: WebGLVertexArrayObject,
    matrix: Float32Array,
    doors: DoorState[],
    dt: number,
    nearestDoorId?: string
  ): void {
    // Ship doors rendered with GPU translated model matrix
    const glShip = this.bindFlat(
      flatProg,
      flatVAO,
      translateMatrix(matrix, this.shipOffset.x, this.shipOffset.y)
    );
    for (const door of doors) {
      if (isStationSideDoor(door)) continue;
      this.drawSingleDoor(glShip, flatProg, door, dt, nearestDoorId === door.id);
    }

    // Station doors rendered with static base matrix
    const glStation = this.bindFlat(flatProg, flatVAO, matrix);
    for (const door of doors) {
      if (!isStationSideDoor(door)) continue;
      this.drawSingleDoor(glStation, flatProg, door, dt, nearestDoorId === door.id);
    }
    glStation.bindVertexArray(null);
  }

  // fallow-ignore-next-line complexity
  public renderCorridorLampFixtures(
    flatProg: WebGLProgram,
    flatVAO: WebGLVertexArrayObject,
    matrix: Float32Array,
    time: number
  ): void {
    const gl = this.bindFlat(
      flatProg,
      flatVAO,
      translateMatrix(matrix, this.shipOffset.x, this.shipOffset.y)
    );

    const corridorLights = HESPERIA_LIGHTS.filter((l) => l.room === 'korridor_schiff');
    for (const cl of corridorLights) {
      const flicker = cl.flickerSpeed ? 0.95 + 0.05 * Math.sin(time * cl.flickerSpeed) : 1.0;

      gl.uniform4f(gl.getUniformLocation(flatProg, 'u_color'), 0.12, 0.15, 0.2, 1.0);
      drawQuad(gl, this.dynamicBuffer, cl.x - 11, cl.y - 5, 22, 10);

      gl.uniform4f(
        gl.getUniformLocation(flatProg, 'u_color'),
        cl.color[0] * flicker,
        cl.color[1] * flicker,
        cl.color[2] * flicker,
        1.0
      );
      drawQuad(gl, this.dynamicBuffer, cl.x - 7, cl.y - 2.5, 14, 5);

      gl.uniform4f(gl.getUniformLocation(flatProg, 'u_color'), 1.0, 1.0, 1.0, 0.9 * flicker);
      drawQuad(gl, this.dynamicBuffer, cl.x - 2, cl.y - 1, 4, 2);
    }
    gl.bindVertexArray(null);
  }

  public dispose(): void {
    const gl = this.gl;
    gl.deleteVertexArray(this.deckVAO);
    gl.deleteProgram(this.deckProg);
  }
}
