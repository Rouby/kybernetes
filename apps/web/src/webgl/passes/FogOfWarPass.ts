import { getWorldRooms, type Point2D, ROOM_AMBIENTS } from '@kybernetes/sim-core';
import { createProgram } from '../glUtils';
import { FOW_AMBIENT_FS, FOW_AMBIENT_VS, FOW_STAMP_FS, FOW_STAMP_VS } from '../shaders';
import type { FramebufferManager } from '../systems/FramebufferManager';

/**
 * Shortest edge of the fan triangle (origin, a, b). Long-thin slivers from
 * near-duplicate ray hits read as GPU streaks even when their area is not
 * tiny, so the edge length — not the area — is the skip signal.
 */
export function fanShortEdge(origin: { x: number; y: number }, a: Point2D, b: Point2D): number {
  return Math.min(
    Math.hypot(a.x - origin.x, a.y - origin.y),
    Math.hypot(b.x - origin.x, b.y - origin.y),
    Math.hypot(b.x - a.x, b.y - a.y)
  );
}

export function buildPolygonFanVertices(
  origin: { x: number; y: number },
  poly: Point2D[]
): Float32Array {
  const hasOrigin =
    poly.length > 0 &&
    Math.abs(poly[0].x - origin.x) < 0.01 &&
    Math.abs(poly[0].y - origin.y) < 0.01;
  const ring = hasOrigin ? poly.slice(1) : poly;
  const verts: number[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    if (a === undefined || b === undefined) continue;
    if (fanShortEdge(origin, a, b) < 0.5) continue;
    verts.push(origin.x, origin.y, a.x, a.y, b.x, b.y);
  }
  return new Float32Array(verts);
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
  public renderShipAmbientRooms(
    fboManager: FramebufferManager,
    matrix: Float32Array,
    shipDx = 0,
    shipDy = 0
  ): void {
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
    gl.uniform2f(
      gl.getUniformLocation(this.fowAmbientProg, 'u_worldOrigin'),
      fboManager.fowOriginX,
      fboManager.fowOriginY
    );

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fboManager.getFowTexture());
    gl.uniform1i(gl.getUniformLocation(this.fowAmbientProg, 'u_fowTexture'), 0);

    for (const room of getWorldRooms({ x: shipDx, y: shipDy })) {
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
