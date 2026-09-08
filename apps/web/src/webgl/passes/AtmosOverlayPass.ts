import type { AtmosOverlayMode, RoomAtmosphereSummary } from '@kybernetes/protocol';
import { createProgram } from '../glUtils';
import { ATMOS_ROOM_FS, ATMOS_ROOM_VS } from '../shaders';
import { buildOverlayVertices, overlayRoomRects } from './atmosOverlayGeometry';

const MAX_ROOM_QUADS = 64;
const FLOATS_PER_VERTEX = 6;
const VERTICES_PER_QUAD = 6;
const FLOATS_PER_QUAD = FLOATS_PER_VERTEX * VERTICES_PER_QUAD;

export class AtmosOverlayPass {
  private gl: WebGL2RenderingContext;
  private roomProg: WebGLProgram;
  private roomVAO: WebGLVertexArrayObject;
  private roomBuffer: WebGLBuffer;
  private uMatrixLoc: WebGLUniformLocation;
  private vertArray = new Float32Array(MAX_ROOM_QUADS * FLOATS_PER_QUAD);
  private readonly rects = overlayRoomRects();

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;

    this.roomProg = createProgram(gl, ATMOS_ROOM_VS, ATMOS_ROOM_FS);
    this.uMatrixLoc = gl.getUniformLocation(this.roomProg, 'u_matrix')!;

    this.roomVAO = gl.createVertexArray()!;
    this.roomBuffer = gl.createBuffer()!;

    gl.bindVertexArray(this.roomVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.roomBuffer);

    const stride = FLOATS_PER_VERTEX * 4;
    const aPos = gl.getAttribLocation(this.roomProg, 'a_position');
    const aCol = gl.getAttribLocation(this.roomProg, 'a_color');

    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, stride, 0);

    gl.enableVertexAttribArray(aCol);
    gl.vertexAttribPointer(aCol, 4, gl.FLOAT, false, stride, 8);

    gl.bindVertexArray(null);
  }

  public render(
    matrix: Float32Array,
    roomAtmospheres: Record<string, RoomAtmosphereSummary> | undefined,
    mode: AtmosOverlayMode,
    time: number,
    shipDx = 0
  ): void {
    if (mode === 'off') return;

    const pulse = 0.9 + 0.1 * Math.sin(time * 2.5);
    const verts = buildOverlayVertices(this.rects, roomAtmospheres, mode, pulse, shipDx);
    const floats = Math.min(verts.length, MAX_ROOM_QUADS * FLOATS_PER_QUAD);
    const vertexCount = Math.floor(floats / FLOATS_PER_VERTEX);
    if (vertexCount === 0) return;
    this.vertArray.set(verts.slice(0, floats));

    const gl = this.gl;
    gl.useProgram(this.roomProg);
    gl.bindVertexArray(this.roomVAO);
    gl.uniformMatrix3fv(this.uMatrixLoc, false, matrix);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.roomBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.vertArray.subarray(0, floats), gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, vertexCount);

    gl.bindVertexArray(null);
  }

  public dispose(): void {
    const gl = this.gl;
    gl.deleteBuffer(this.roomBuffer);
    gl.deleteVertexArray(this.roomVAO);
    gl.deleteProgram(this.roomProg);
  }
}
