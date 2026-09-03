function createShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Failed to create WebGL shader');
  gl.shaderSource(shader, source.trim());
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${info}`);
  }
  return shader;
}

export function createProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string
): WebGLProgram {
  const vs = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fs = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);

  const program = gl.createProgram();
  if (!program) throw new Error('Failed to create WebGL program');
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program link error: ${info}`);
  }
  return program;
}

export function createCameraMatrix(
  width: number,
  height: number,
  cameraX: number,
  cameraY: number,
  zoom = 1.0
): Float32Array {
  const sx = (2 / width) * zoom;
  const sy = (-2 / height) * zoom;
  const tx = -cameraX * sx;
  const ty = -cameraY * sy;

  // Column-major 3x3 matrix
  return new Float32Array([sx, 0, 0, 0, sy, 0, tx, ty, 1]);
}

export function createScreenMatrix(width: number, height: number): Float32Array {
  const sx = 2 / width;
  const sy = -2 / height;
  // Column-major 3x3 matrix mapping [0..width, 0..height] to [-1..1, 1..-1]
  return new Float32Array([sx, 0, 0, 0, sy, 0, -1, 1, 1]);
}
