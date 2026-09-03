import { createProgram } from '../glUtils';
import { STARFIELD_FS, STARFIELD_VS } from '../shaders';

export class StarfieldPass {
  private gl: WebGL2RenderingContext;
  private starProg: WebGLProgram;
  private starVAO: WebGLVertexArrayObject;
  private quadBuffer: WebGLBuffer;

  constructor(gl: WebGL2RenderingContext, quadBuffer: WebGLBuffer) {
    this.gl = gl;
    this.quadBuffer = quadBuffer;
    this.starProg = createProgram(gl, STARFIELD_VS, STARFIELD_FS);

    this.starVAO = gl.createVertexArray()!;
    gl.bindVertexArray(this.starVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    const starPos = gl.getAttribLocation(this.starProg, 'a_position');
    gl.enableVertexAttribArray(starPos);
    gl.vertexAttribPointer(starPos, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  public render(
    width: number,
    height: number,
    camera: { x: number; y: number },
    time: number
  ): void {
    const gl = this.gl;
    gl.useProgram(this.starProg);
    gl.bindVertexArray(this.starVAO);

    gl.uniform2f(gl.getUniformLocation(this.starProg, 'u_resolution'), width, height);
    gl.uniform2f(gl.getUniformLocation(this.starProg, 'u_camera'), camera.x, camera.y);
    gl.uniform1f(gl.getUniformLocation(this.starProg, 'u_time'), time);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
  }

  public dispose(): void {
    const gl = this.gl;
    gl.deleteVertexArray(this.starVAO);
    gl.deleteProgram(this.starProg);
  }
}
