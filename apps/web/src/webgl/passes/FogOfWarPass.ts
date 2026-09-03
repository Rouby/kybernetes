import { HESPERIA_ROOMS, type Point2D, ROOM_AMBIENTS } from '@kybernetes/sim-core';
import { createProgram } from '../glUtils';
import { FOW_AMBIENT_FS, FOW_AMBIENT_VS, FOW_STAMP_FS, FOW_STAMP_VS } from '../shaders';
import type { FramebufferManager } from '../systems/FramebufferManager';

// fallow-ignore-next-line complexity
export function buildPolygonFanVertices(
  origin: { x: number; y: number },
  poly: Point2D[]
): Float32Array {
  const hasOrigin =
    poly.length > 0 &&
    Math.abs(poly[0].x - origin.x) < 0.01 &&
    Math.abs(poly[0].y - origin.y) < 0.01;

  if (hasOrigin) {
    const count = Math.max(0, poly.length - 2);
    const verts = new Float32Array(count * 6);
    let vIdx = 0;
    for (let i = 1; i < poly.length - 1; i++) {
      verts[vIdx++] = origin.x;
      verts[vIdx++] = origin.y;
      verts[vIdx++] = poly[i].x;
      verts[vIdx++] = poly[i].y;
      verts[vIdx++] = poly[i + 1].x;
      verts[vIdx++] = poly[i + 1].y;
    }
    return verts;
  }

  const verts = new Float32Array(poly.length * 6);
  let vIdx = 0;
  for (let i = 0; i < poly.length; i++) {
    const next = (i + 1) % poly.length;
    verts[vIdx++] = origin.x;
    verts[vIdx++] = origin.y;
    verts[vIdx++] = poly[i].x;
    verts[vIdx++] = poly[i].y;
    verts[vIdx++] = poly[next].x;
    verts[vIdx++] = poly[next].y;
  }
  return verts;
}

export class FogOfWarPass {
  private gl: WebGL2RenderingContext;
  private fowStampProg: WebGLProgram;
  private fowAmbientProg: WebGLProgram;
  private fowStampVAO: WebGLVertexArrayObject;
  private fowAmbientVAO: WebGLVertexArrayObject;
  private dynamicBuffer: WebGLBuffer;
  private lastPlayerLosPoly: Point2D[] = [];

  constructor(gl: WebGL2RenderingContext, dynamicBuffer: WebGLBuffer) {
    this.gl = gl;
    this.dynamicBuffer = dynamicBuffer;

    this.fowStampProg = createProgram(gl, FOW_STAMP_VS, FOW_STAMP_FS);
    this.fowAmbientProg = createProgram(gl, FOW_AMBIENT_VS, FOW_AMBIENT_FS);

    this.fowStampVAO = gl.createVertexArray()!;
    gl.bindVertexArray(this.fowStampVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dynamicBuffer);
    const stampPos = gl.getAttribLocation(this.fowStampProg, 'a_position');
    gl.enableVertexAttribArray(stampPos);
    gl.vertexAttribPointer(stampPos, 2, gl.FLOAT, false, 0, 0);

    this.fowAmbientVAO = gl.createVertexArray()!;
    gl.bindVertexArray(this.fowAmbientVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dynamicBuffer);
    const fowAmbPos = gl.getAttribLocation(this.fowAmbientProg, 'a_position');
    gl.enableVertexAttribArray(fowAmbPos);
    gl.vertexAttribPointer(fowAmbPos, 2, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);
  }

  public getLastPlayerLosPoly(): Point2D[] {
    return this.lastPlayerLosPoly;
  }

  public setLastPlayerLosPoly(poly: Point2D[]): void {
    this.lastPlayerLosPoly = poly;
  }

  // fallow-ignore-next-line complexity
  public stampFowExploration(
    fboManager: FramebufferManager,
    poly: Point2D[],
    pawnPos: { x: number; y: number }
  ): void {
    const gl = this.gl;
    const { fbo } = fboManager.ensureFowFBO();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, fboManager.fowWidth, fboManager.fowHeight);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);

    gl.useProgram(this.fowStampProg);
    gl.bindVertexArray(this.fowStampVAO);

    const stampMatrix = new Float32Array([
      2.0 / fboManager.fowWidth,
      0,
      0,
      0,
      2.0 / fboManager.fowHeight,
      0,
      -1.0,
      -1.0,
      1,
    ]);
    gl.uniformMatrix3fv(gl.getUniformLocation(this.fowStampProg, 'u_matrix'), false, stampMatrix);

    if (poly.length >= 3) {
      const verts = buildPolygonFanVertices(pawnPos, poly);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.dynamicBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STREAM_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, verts.length / 2);
    }

    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // fallow-ignore-next-line complexity
  public renderShipAmbientRooms(fboManager: FramebufferManager, matrix: Float32Array): void {
    const gl = this.gl;
    fboManager.ensureFowFBO();
    gl.useProgram(this.fowAmbientProg);
    gl.bindVertexArray(this.fowAmbientVAO);

    gl.uniformMatrix3fv(gl.getUniformLocation(this.fowAmbientProg, 'u_matrix'), false, matrix);
    gl.uniform2f(
      gl.getUniformLocation(this.fowAmbientProg, 'u_worldBounds'),
      fboManager.fowWidth,
      fboManager.fowHeight
    );

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fboManager.getFowTexture());
    gl.uniform1i(gl.getUniformLocation(this.fowAmbientProg, 'u_fowTexture'), 0);

    for (const room of HESPERIA_ROOMS) {
      const amb = ROOM_AMBIENTS[room.id] ?? [0.2, 0.2, 0.2];
      gl.uniform3f(
        gl.getUniformLocation(this.fowAmbientProg, 'u_roomAmbient'),
        amb[0],
        amb[1],
        amb[2]
      );
      const x2 = room.x + room.width;
      const y2 = room.y + room.height;
      const quadVerts = new Float32Array([
        room.x,
        room.y,
        x2,
        room.y,
        room.x,
        y2,
        room.x,
        y2,
        x2,
        room.y,
        x2,
        y2,
      ]);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.dynamicBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STREAM_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    gl.bindVertexArray(null);
  }

  public dispose(): void {
    const gl = this.gl;
    gl.deleteVertexArray(this.fowStampVAO);
    gl.deleteVertexArray(this.fowAmbientVAO);
    gl.deleteProgram(this.fowStampProg);
    gl.deleteProgram(this.fowAmbientProg);
  }
}
