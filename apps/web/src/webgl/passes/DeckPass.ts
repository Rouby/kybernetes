import type { DoorState } from '@kybernetes/protocol';
import {
  applyShipOffsetToWalls,
  carveBreachedWallSegments,
  getBreachLocation,
  getWorldDoors,
  getWorldRooms,
  HESPERIA_LIGHTS,
  HESPERIA_WALLS,
  isShipSideRoom,
} from '@kybernetes/sim-core';

import { renderDeckFurniture } from '../DeckFurniture';
import {
  addThickSegment,
  bufferAndDraw,
  createProgram,
  drawQuad,
  translateMatrixX,
} from '../glUtils';
import { DECK_FLOOR_FS, DECK_FLOOR_VS } from '../shaders';

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

function renderBreachFractureHoles(
  gl: WebGL2RenderingContext,
  dynamicBuffer: WebGLBuffer,
  flatProg: WebGLProgram,
  breaches: string[],
  timeSec = 0,
  shipDx = 0
): void {
  const glowLines: number[] = [];
  const frostLines: number[] = [];
  const pulse = 0.75 + 0.25 * Math.sin(timeSec * 7);

  for (const b of breaches) {
    const raw = getBreachLocation(b);
    if (!raw) continue;
    const dx = isShipSideRoom(raw.roomId) ? shipDx : 0;
    const loc = { ...raw, x: raw.x + dx };

    const nx = loc.normalX;
    const ny = loc.normalY;
    const tx = -ny;
    const ty = nx;

    // Glowing molten jagged edges along the opening (-9 to +9)
    addThickSegment(
      glowLines,
      loc.x - tx * 9,
      loc.y - ty * 9,
      loc.x - tx * 9 - nx * 4,
      loc.y - ty * 9 - ny * 4,
      3.2
    );
    addThickSegment(
      glowLines,
      loc.x + tx * 9,
      loc.y + ty * 9,
      loc.x + tx * 9 - nx * 4,
      loc.y + ty * 9 - ny * 4,
      3.2
    );
    addThickSegment(glowLines, loc.x - tx * 7, loc.y - ty * 7, loc.x + tx * 7, loc.y + ty * 7, 1.8);

    // Cyan vacuum frost fracture spurs
    addThickSegment(
      frostLines,
      loc.x - tx * 11,
      loc.y - ty * 11,
      loc.x - tx * 14 + nx * 3,
      loc.y - ty * 14 + ny * 3,
      1.5
    );
    addThickSegment(
      frostLines,
      loc.x + tx * 11,
      loc.y + ty * 11,
      loc.x + tx * 14 + nx * 3,
      loc.y + ty * 14 + ny * 3,
      1.5
    );
  }

  if (glowLines.length > 0) {
    gl.uniform4f(gl.getUniformLocation(flatProg, 'u_color'), 1.0, 0.42, 0.12, pulse);
    bufferAndDraw(gl, dynamicBuffer, new Float32Array(glowLines));
  }
  if (frostLines.length > 0) {
    gl.uniform4f(gl.getUniformLocation(flatProg, 'u_color'), 0.2, 0.85, 1.0, 0.8);
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

function renderPartitionHoles(
  gl: WebGL2RenderingContext,
  dynamicBuffer: WebGLBuffer,
  flatProg: WebGLProgram,
  holes: Array<{ x: number; y: number }>
): void {
  if (holes.length === 0) return;
  const scorchVerts: number[] = [];
  const coreVerts: number[] = [];
  const rimVerts: number[] = [];

  for (const h of holes) {
    addThickSegment(scorchVerts, h.x - 3.5, h.y, h.x + 3.5, h.y, 3.5);
    addThickSegment(scorchVerts, h.x, h.y - 3.5, h.x, h.y + 3.5, 3.5);
    addThickSegment(rimVerts, h.x - 2.5, h.y - 1.5, h.x + 2.5, h.y - 1.5, 1.2);
    addThickSegment(coreVerts, h.x - 1.5, h.y, h.x + 1.5, h.y, 2.0);
    addThickSegment(coreVerts, h.x, h.y - 1.5, h.x, h.y + 1.5, 2.0);
  }

  gl.uniform4f(gl.getUniformLocation(flatProg, 'u_color'), 0.08, 0.1, 0.14, 0.95);
  bufferAndDraw(gl, dynamicBuffer, new Float32Array(scorchVerts));

  gl.uniform4f(gl.getUniformLocation(flatProg, 'u_color'), 0.65, 0.72, 0.82, 0.9);
  bufferAndDraw(gl, dynamicBuffer, new Float32Array(rimVerts));

  gl.uniform4f(gl.getUniformLocation(flatProg, 'u_color'), 0.02, 0.02, 0.04, 1.0);
  bufferAndDraw(gl, dynamicBuffer, new Float32Array(coreVerts));
}

export class DeckPass {
  public shipOffset: { x: number; y: number } = { x: 0, y: 0 };
  private gl: WebGL2RenderingContext;
  private deckProg: WebGLProgram;
  private deckVAO: WebGLVertexArrayObject;
  private dynamicBuffer: WebGLBuffer;
  private doorOpenRatios = new Map<string, number>();

  constructor(gl: WebGL2RenderingContext, dynamicBuffer: WebGLBuffer) {
    this.gl = gl;
    this.dynamicBuffer = dynamicBuffer;
    this.deckProg = createProgram(gl, DECK_FLOOR_VS, DECK_FLOOR_FS);

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
    gl.uniformMatrix3fv(gl.getUniformLocation(this.deckProg, 'u_matrix'), false, matrix);
    gl.uniform1f(gl.getUniformLocation(this.deckProg, 'u_time'), time);

    gl.uniform4fv(gl.getUniformLocation(this.deckProg, 'u_projLights'), currentLights);
    gl.uniform3fv(gl.getUniformLocation(this.deckProg, 'u_projColors'), currentLightColors);

    const roomTypeMap: Record<string, number> = {
      bridge: 0,
      quarters: 1,
      mess: 2,
      corridor: 3,
      armory: 4,
      cargo: 5,
      engineering: 6,
      avionics: 7,
      life_support: 8,
      airlock_port: 9,
      airlock_stbd: 10,
      gauntlet: 3,
      station_lobby: 2,
      station_bay: 5,
    };

    for (const room of getWorldRooms(this.shipOffset)) {
      gl.uniform1i(gl.getUniformLocation(this.deckProg, 'u_roomType'), roomTypeMap[room.id] ?? 1);
      gl.uniform4f(
        gl.getUniformLocation(this.deckProg, 'u_roomBounds'),
        room.x,
        room.y,
        room.width,
        room.height
      );

      if (room.id === 'corridor') {
        gl.uniform3f(gl.getUniformLocation(this.deckProg, 'u_floorColor'), 0.12, 0.14, 0.18);
      } else {
        gl.uniform3f(gl.getUniformLocation(this.deckProg, 'u_floorColor'), 0.9, 0.92, 0.95);
      }

      drawQuad(gl, this.dynamicBuffer, room.x, room.y, room.width, room.height);
    }
    gl.bindVertexArray(null);
  }

  public renderBulkheads(
    flatProg: WebGLProgram,
    flatVAO: WebGLVertexArrayObject,
    matrix: Float32Array,
    breaches?: string[],
    timeSec = 0,
    partitionHoles?: Array<{ x: number; y: number }>
  ): void {
    const gl = this.gl;
    gl.useProgram(flatProg);
    gl.bindVertexArray(flatVAO);
    gl.uniformMatrix3fv(gl.getUniformLocation(flatProg, 'u_matrix'), false, matrix);

    const walls = applyShipOffsetToWalls(
      breaches && breaches.length > 0
        ? carveBreachedWallSegments(HESPERIA_WALLS, breaches)
        : HESPERIA_WALLS,
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

    // 5. Active Wall Breach Fracture Holes
    if (breaches && breaches.length > 0) {
      renderBreachFractureHoles(
        gl,
        this.dynamicBuffer,
        flatProg,
        breaches,
        timeSec,
        this.shipOffset.x
      );
    }

    // 6. Partition Bullet Holes (Impact craters)
    if (partitionHoles && partitionHoles.length > 0) {
      renderPartitionHoles(gl, this.dynamicBuffer, flatProg, partitionHoles);
    }

    gl.bindVertexArray(null);
  }

  public renderOuterHull(
    flatProg: WebGLProgram,
    flatVAO: WebGLVertexArrayObject,
    matrix: Float32Array,
    time: number
  ): void {
    const gl = this.bindFlat(flatProg, flatVAO, matrix);

    // Station block hull plate (static south wing)
    gl.uniform4f(gl.getUniformLocation(flatProg, 'u_color'), 0.09, 0.11, 0.16, 1.0);
    drawQuad(gl, this.dynamicBuffer, 110, 640, 920, 320);
    gl.uniform4f(gl.getUniformLocation(flatProg, 'u_color'), 0.22, 0.28, 0.38, 1.0);
    const stationLines: number[] = [];
    addThickSegment(stationLines, 110, 640, 1030, 640, 4);
    addThickSegment(stationLines, 1030, 640, 1030, 960, 4);
    addThickSegment(stationLines, 1030, 960, 110, 960, 4);
    addThickSegment(stationLines, 110, 960, 110, 640, 4);
    bufferAndDraw(gl, this.dynamicBuffer, new Float32Array(stationLines));

    this.bindFlat(flatProg, flatVAO, translateMatrixX(matrix, this.shipOffset.x));

    // Dark armor hull base enclosing the compact submarine ship
    gl.uniform4f(gl.getUniformLocation(flatProg, 'u_color'), 0.07, 0.09, 0.13, 1.0);
    drawQuad(gl, this.dynamicBuffer, 100, 210, 940, 380);
    drawQuad(gl, this.dynamicBuffer, 70, 320, 30, 160);

    // Armor perimeter outline (submarine hull profile)
    gl.uniform4f(gl.getUniformLocation(flatProg, 'u_color'), 0.2, 0.25, 0.35, 1.0);
    const hullLines: number[] = [];
    addThickSegment(hullLines, 70, 400, 100, 210, 4);
    addThickSegment(hullLines, 100, 210, 1040, 210, 4);
    addThickSegment(hullLines, 1040, 210, 1040, 590, 4);
    addThickSegment(hullLines, 1040, 590, 100, 590, 4);
    addThickSegment(hullLines, 100, 590, 70, 400, 4);
    bufferAndDraw(gl, this.dynamicBuffer, new Float32Array(hullLines));

    // Thruster bell housings at aft (aligned to central axis Y=400)
    gl.uniform4f(gl.getUniformLocation(flatProg, 'u_color'), 0.14, 0.17, 0.24, 1.0);
    drawQuad(gl, this.dynamicBuffer, 1036, 300, 16, 20);
    drawQuad(gl, this.dynamicBuffer, 1036, 384, 22, 32);
    drawQuad(gl, this.dynamicBuffer, 1036, 480, 16, 20);

    // Animated rear thruster plasma plumes (3 engines firing aft +X)
    const flicker = 0.8 + 0.2 * Math.sin(time * 15.0);
    gl.uniform4f(gl.getUniformLocation(flatProg, 'u_color'), 0.0, 0.85, 1.0, flicker);
    drawQuad(gl, this.dynamicBuffer, 1050, 302, 42, 16);
    drawQuad(gl, this.dynamicBuffer, 1056, 386, 58, 28);
    drawQuad(gl, this.dynamicBuffer, 1050, 482, 42, 16);

    // Hot white inner thruster core
    gl.uniform4f(gl.getUniformLocation(flatProg, 'u_color'), 0.9, 0.98, 1.0, 0.95);
    drawQuad(gl, this.dynamicBuffer, 1044, 305, 20, 10);
    drawQuad(gl, this.dynamicBuffer, 1048, 392, 28, 16);
    drawQuad(gl, this.dynamicBuffer, 1044, 485, 20, 10);

    gl.bindVertexArray(null);
  }

  public renderFurniture(
    flatProg: WebGLProgram,
    flatVAO: WebGLVertexArrayObject,
    matrix: Float32Array,
    time: number
  ): void {
    this.bindFlat(flatProg, flatVAO, translateMatrixX(matrix, this.shipOffset.x));
    renderDeckFurniture(this.gl, this.dynamicBuffer, flatProg, time);
    this.gl.bindVertexArray(null);
  }

  // fallow-ignore-next-line complexity
  public renderDoors(
    flatProg: WebGLProgram,
    flatVAO: WebGLVertexArrayObject,
    matrix: Float32Array,
    doors: DoorState[],
    dt: number,
    nearestDoorId?: string
  ): void {
    const gl = this.bindFlat(flatProg, flatVAO, matrix);

    for (const door of getWorldDoors(doors, this.shipOffset)) {
      const isHoriz = Math.abs(door.y2 - door.y1) < Math.abs(door.x2 - door.x1);
      const minX = Math.min(door.x1, door.x2);
      const minY = Math.min(door.y1, door.y2);
      const w = isHoriz ? Math.abs(door.x2 - door.x1) : 14;
      const h = isHoriz ? 14 : Math.abs(door.y2 - door.y1);
      const x = isHoriz ? minX : door.x1 - 7;
      const y = isHoriz ? door.y1 - 7 : minY;

      if (nearestDoorId === door.id) {
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
      gl.uniform4f(
        gl.getUniformLocation(flatProg, 'u_color'),
        ledCol[0],
        ledCol[1],
        ledCol[2],
        1.0
      );
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
          drawQuad(gl, this.dynamicBuffer, s2x, s2y + off, slabW, 8);
        }
      }
    }
    gl.bindVertexArray(null);
  }

  // fallow-ignore-next-line complexity
  public renderCorridorLampFixtures(
    flatProg: WebGLProgram,
    flatVAO: WebGLVertexArrayObject,
    matrix: Float32Array,
    time: number
  ): void {
    const gl = this.bindFlat(flatProg, flatVAO, translateMatrixX(matrix, this.shipOffset.x));

    const corridorLights = HESPERIA_LIGHTS.filter((l) => l.room === 'corridor');
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
