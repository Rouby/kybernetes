import type {
  BoardingTacticsTelemetry,
  DoorState,
  RoomAtmosphereSummary,
} from '@kybernetes/protocol';
import {
  type CellularAtmosGrid,
  HESPERIA_LIGHTS,
  HESPERIA_ROOMS,
  HESPERIA_WALLS,
  sampleAtmosphereAt,
} from '@kybernetes/sim-core';
import { renderDeckFurniture } from '../DeckFurniture';
import { addThickSegment, bufferAndDraw, createProgram, drawQuad } from '../glUtils';
import { DECK_FLOOR_FS, DECK_FLOOR_VS } from '../shaders';

const CORRIDOR_SEGMENTS = [
  { x: 120, y: 368, width: 320, height: 64, sampleX: 280, sampleY: 400 },
  { x: 440, y: 368, width: 320, height: 64, sampleX: 600, sampleY: 400 },
  { x: 760, y: 368, width: 260, height: 64, sampleX: 890, sampleY: 400 },
];

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

export class DeckPass {
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
    currentLightColors: Float32Array,
    atmosGrid?: CellularAtmosGrid,
    roomAtmospheres?: Record<string, RoomAtmosphereSummary>,
    boarding?: BoardingTacticsTelemetry
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
    };

    for (const room of HESPERIA_ROOMS) {
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
        for (const seg of CORRIDOR_SEGMENTS) {
          let isVacuum = false;
          if (atmosGrid) {
            isVacuum = sampleAtmosphereAt(atmosGrid, seg.sampleX, seg.sampleY).pressureKpa < 30.0;
          } else {
            const summary = roomAtmospheres?.corridor;
            isVacuum = Boolean(
              boarding?.ventedRooms?.includes('corridor') ||
                (summary && (summary.pressureKpa < 30.0 || summary.isVenting))
            );
          }
          gl.uniform1f(gl.getUniformLocation(this.deckProg, 'u_isVacuum'), isVacuum ? 1.0 : 0.0);
          drawQuad(gl, this.dynamicBuffer, seg.x, seg.y, seg.width, seg.height);
        }
      } else {
        gl.uniform3f(gl.getUniformLocation(this.deckProg, 'u_floorColor'), 0.9, 0.92, 0.95);
        let isVacuum = false;
        if (atmosGrid) {
          isVacuum =
            sampleAtmosphereAt(atmosGrid, room.x + room.width / 2, room.y + room.height / 2)
              .pressureKpa < 30.0;
        } else {
          const summary = roomAtmospheres?.[room.id];
          isVacuum = Boolean(
            boarding?.ventedRooms?.includes(room.id) ||
              (summary && (summary.pressureKpa < 30.0 || summary.isVenting)) ||
              (boarding?.roomO2?.[room.id] !== undefined && boarding.roomO2[room.id] < 25)
          );
        }
        gl.uniform1f(gl.getUniformLocation(this.deckProg, 'u_isVacuum'), isVacuum ? 1.0 : 0.0);
        drawQuad(gl, this.dynamicBuffer, room.x, room.y, room.width, room.height);
      }
    }
    gl.bindVertexArray(null);
  }

  // fallow-ignore-next-line complexity
  public renderBulkheads(
    flatProg: WebGLProgram,
    flatVAO: WebGLVertexArrayObject,
    matrix: Float32Array
  ): void {
    const gl = this.gl;
    gl.useProgram(flatProg);
    gl.bindVertexArray(flatVAO);
    gl.uniformMatrix3fv(gl.getUniformLocation(flatProg, 'u_matrix'), false, matrix);

    // 1. Soft Wall Drop Shadows cast onto the floor along bottom/right (+4, +5)
    gl.uniform4f(gl.getUniformLocation(flatProg, 'u_color'), 0.0, 0.0, 0.0, 0.42);
    const shadowLines: number[] = [];
    for (const wall of HESPERIA_WALLS) {
      addThickSegment(shadowLines, wall.x1 + 4, wall.y1 + 5, wall.x2 + 4, wall.y2 + 5, 10);
    }
    bufferAndDraw(gl, this.dynamicBuffer, new Float32Array(shadowLines));

    // 2. Heavy Armored Structural Casing Core (7.5px dark charcoal gunmetal)
    gl.uniform4f(gl.getUniformLocation(flatProg, 'u_color'), 0.07, 0.09, 0.13, 1.0);
    const coreLines: number[] = [];
    for (const wall of HESPERIA_WALLS) {
      addThickSegment(coreLines, wall.x1, wall.y1, wall.x2, wall.y2, 7.5);
    }
    bufferAndDraw(gl, this.dynamicBuffer, new Float32Array(coreLines));

    // 3. Metallic Beveled Edge Highlight (2.8px steel blue)
    gl.uniform4f(gl.getUniformLocation(flatProg, 'u_color'), 0.32, 0.38, 0.48, 1.0);
    const bevelLines: number[] = [];
    for (const wall of HESPERIA_WALLS) {
      addThickSegment(bevelLines, wall.x1, wall.y1, wall.x2, wall.y2, 2.8);
    }
    bufferAndDraw(gl, this.dynamicBuffer, new Float32Array(bevelLines));

    // 4. Panel Seams
    gl.uniform4f(gl.getUniformLocation(flatProg, 'u_color'), 0.52, 0.58, 0.7, 1.0);
    const detailLines: number[] = [];
    for (const wall of HESPERIA_WALLS) {
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
    bufferAndDraw(gl, this.dynamicBuffer, new Float32Array(detailLines));
    gl.bindVertexArray(null);
  }

  public renderOuterHull(
    flatProg: WebGLProgram,
    flatVAO: WebGLVertexArrayObject,
    matrix: Float32Array,
    time: number
  ): void {
    const gl = this.bindFlat(flatProg, flatVAO, matrix);

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
    this.bindFlat(flatProg, flatVAO, matrix);
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

    for (const door of doors) {
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
    const gl = this.bindFlat(flatProg, flatVAO, matrix);

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
