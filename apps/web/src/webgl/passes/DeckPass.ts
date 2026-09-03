import type { BoardingTacticsTelemetry, DoorState } from '@kybernetes/protocol';
import { HESPERIA_LIGHTS, HESPERIA_ROOMS, HESPERIA_WALLS } from '@kybernetes/sim-core';
import { addThickSegment, createProgram } from '../glUtils';
import { DECK_FLOOR_FS, DECK_FLOOR_VS } from '../shaders';

function bufferAndDraw(
  gl: WebGL2RenderingContext,
  dynamicBuffer: WebGLBuffer,
  verts: Float32Array,
  mode?: number
): void {
  gl.bindBuffer(gl.ARRAY_BUFFER, dynamicBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STREAM_DRAW);
  gl.drawArrays(mode ?? gl.TRIANGLES, 0, verts.length / 2);
}

function drawQuad(
  gl: WebGL2RenderingContext,
  dynamicBuffer: WebGLBuffer,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  const x2 = x + w;
  const y2 = y + h;
  const verts = new Float32Array([x, y, x2, y, x, y2, x, y2, x2, y, x2, y2]);
  bufferAndDraw(gl, dynamicBuffer, verts);
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

  // fallow-ignore-next-line complexity
  public renderDeckFloors(
    matrix: Float32Array,
    time: number,
    currentLights: Float32Array,
    currentLightColors: Float32Array,
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
    };

    for (const room of HESPERIA_ROOMS) {
      const o2 = boarding?.roomO2?.[room.id] ?? 100;
      const isVented = Boolean(boarding?.ventedRooms?.includes(room.id) || o2 < 25);

      gl.uniform1f(gl.getUniformLocation(this.deckProg, 'u_isVacuum'), isVented ? 1.0 : 0.0);
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
    const gl = this.gl;
    gl.useProgram(flatProg);
    gl.bindVertexArray(flatVAO);
    gl.uniformMatrix3fv(gl.getUniformLocation(flatProg, 'u_matrix'), false, matrix);

    // Dark armor hull base enclosing the ship
    gl.uniform4f(gl.getUniformLocation(flatProg, 'u_color'), 0.07, 0.09, 0.13, 1.0);
    drawQuad(gl, this.dynamicBuffer, 380, 170, 730, 600);
    drawQuad(gl, this.dynamicBuffer, 200, 270, 200, 400);

    // Armor perimeter outline
    gl.uniform4f(gl.getUniformLocation(flatProg, 'u_color'), 0.2, 0.25, 0.35, 1.0);
    const hullLines: number[] = [];
    addThickSegment(hullLines, 200, 270, 380, 170, 4);
    addThickSegment(hullLines, 380, 170, 1110, 170, 4);
    addThickSegment(hullLines, 1110, 170, 1110, 770, 4);
    addThickSegment(hullLines, 1110, 770, 380, 770, 4);
    addThickSegment(hullLines, 380, 770, 200, 670, 4);
    addThickSegment(hullLines, 200, 670, 200, 270, 4);
    bufferAndDraw(gl, this.dynamicBuffer, new Float32Array(hullLines));

    // Animated rear thruster plasma plumes (3 engines)
    const flicker = 0.8 + 0.2 * Math.sin(time * 15.0);
    gl.uniform4f(gl.getUniformLocation(flatProg, 'u_color'), 0.0, 0.85, 1.0, flicker);
    drawQuad(gl, this.dynamicBuffer, 160, 330, 40, 18);
    drawQuad(gl, this.dynamicBuffer, 160, 410, 40, 18);
    drawQuad(gl, this.dynamicBuffer, 160, 490, 40, 18);

    // Hot white inner thruster core
    gl.uniform4f(gl.getUniformLocation(flatProg, 'u_color'), 0.9, 0.98, 1.0, 0.95);
    drawQuad(gl, this.dynamicBuffer, 175, 334, 25, 10);
    drawQuad(gl, this.dynamicBuffer, 175, 414, 25, 10);
    drawQuad(gl, this.dynamicBuffer, 175, 494, 25, 10);

    gl.bindVertexArray(null);
  }

  // fallow-ignore-next-line complexity
  public renderDoors(
    flatProg: WebGLProgram,
    flatVAO: WebGLVertexArrayObject,
    matrix: Float32Array,
    doors: DoorState[],
    dt: number
  ): void {
    const gl = this.gl;
    gl.useProgram(flatProg);
    gl.bindVertexArray(flatVAO);
    gl.uniformMatrix3fv(gl.getUniformLocation(flatProg, 'u_matrix'), false, matrix);

    for (const door of doors) {
      const isHoriz = Math.abs(door.y2 - door.y1) < Math.abs(door.x2 - door.x1);
      const minX = Math.min(door.x1, door.x2);
      const minY = Math.min(door.y1, door.y2);
      const w = isHoriz ? Math.abs(door.x2 - door.x1) : 14;
      const h = isHoriz ? 14 : Math.abs(door.y2 - door.y1);
      const x = isHoriz ? minX : door.x1 - 7;
      const y = isHoriz ? door.y1 - 7 : minY;

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
    const gl = this.gl;
    gl.useProgram(flatProg);
    gl.bindVertexArray(flatVAO);
    gl.uniformMatrix3fv(gl.getUniformLocation(flatProg, 'u_matrix'), false, matrix);

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
