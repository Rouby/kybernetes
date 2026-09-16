/** Shared WebGL/document doubles for headless HUD unit tests (node, no DOM). */
import { vi } from 'vitest';

export interface MockGlCalls {
  deletedPrograms: unknown[];
  deletedVaos: unknown[];
  deletedBuffers: unknown[];
  deletedTextures: unknown[];
  texImage2DCalls: number;
  drawArraysCalls: number;
  drawArraysInstancedCalls: number;
  drawArraysInstancedArgs: Array<{ mode: number; first: number; count: number; primcount: number }>;
  bufferDataCalls: number;
  bufferSubDataCalls: number;
}

export function stubDocumentForHud(): void {
  const ctx = {
    textBaseline: '',
    font: '',
    fillStyle: '',
    measureText: (text: string) => ({ width: text.length * 13 }),
    fillText: () => undefined,
    clearRect: () => undefined,
    save: () => undefined,
    restore: () => undefined,
  };
  const canvas = { width: 0, height: 0, getContext: () => ctx };
  vi.stubGlobal('document', { createElement: () => canvas });
}

export function createMockGl(): { gl: WebGL2RenderingContext; calls: MockGlCalls } {
  const calls: MockGlCalls = {
    deletedPrograms: [],
    deletedVaos: [],
    deletedBuffers: [],
    deletedTextures: [],
    texImage2DCalls: 0,
    drawArraysCalls: 0,
    drawArraysInstancedCalls: 0,
    drawArraysInstancedArgs: [],
    bufferDataCalls: 0,
    bufferSubDataCalls: 0,
  };
  let nextHandle = 1;
  const handle = () => ({ __handle: nextHandle++ });
  const gl = {
    VERTEX_SHADER: 35633,
    FRAGMENT_SHADER: 35632,
    ARRAY_BUFFER: 34962,
    STATIC_DRAW: 35044,
    STREAM_DRAW: 35040,
    DYNAMIC_DRAW: 35048,
    TEXTURE_2D: 3553,
    TEXTURE0: 33984,
    TRIANGLES: 4,
    TRIANGLE_STRIP: 5,
    RGBA: 6408,
    UNSIGNED_BYTE: 5121,
    LINEAR: 9729,
    CLAMP_TO_EDGE: 33071,
    BLEND: 3042,
    SRC_ALPHA: 770,
    ONE_MINUS_SRC_ALPHA: 771,
    ONE: 1,
    COLOR_BUFFER_BIT: 16384,
    COMPILE_STATUS: 35713,
    LINK_STATUS: 35714,
    createShader: () => handle(),
    shaderSource: () => undefined,
    compileShader: () => undefined,
    getShaderParameter: () => true,
    getShaderInfoLog: () => '',
    deleteShader: () => undefined,
    createProgram: () => handle(),
    attachShader: () => undefined,
    linkProgram: () => undefined,
    getProgramParameter: () => true,
    getProgramInfoLog: () => '',
    deleteProgram: (program: unknown) => calls.deletedPrograms.push(program),
    createTexture: () => handle(),
    bindTexture: () => undefined,
    deleteTexture: (texture: unknown) => calls.deletedTextures.push(texture),
    texImage2D: () => {
      calls.texImage2DCalls += 1;
    },
    texParameteri: () => undefined,
    activeTexture: () => undefined,
    createBuffer: () => handle(),
    bindBuffer: () => undefined,
    bufferData: () => {
      calls.bufferDataCalls += 1;
    },
    bufferSubData: () => {
      calls.bufferSubDataCalls += 1;
    },
    deleteBuffer: (buffer: unknown) => calls.deletedBuffers.push(buffer),
    createVertexArray: () => handle(),
    bindVertexArray: () => undefined,
    deleteVertexArray: (vao: unknown) => calls.deletedVaos.push(vao),
    enableVertexAttribArray: () => undefined,
    vertexAttribPointer: () => undefined,
    vertexAttribDivisor: () => undefined,
    getAttribLocation: () => 0,
    getUniformLocation: () => ({}),
    useProgram: () => undefined,
    uniformMatrix3fv: () => undefined,
    uniform1f: () => undefined,
    uniform2f: () => undefined,
    uniform4f: () => undefined,
    uniform1i: () => undefined,
    drawArrays: () => {
      calls.drawArraysCalls += 1;
    },
    drawArraysInstanced: (mode: number, first: number, count: number, primcount: number) => {
      calls.drawArraysInstancedCalls += 1;
      calls.drawArraysInstancedArgs.push({ mode, first, count, primcount });
    },
    enable: () => undefined,
    disable: () => undefined,
    blendFunc: () => undefined,
    viewport: () => undefined,
    clearColor: () => undefined,
    clear: () => undefined,
  } as unknown as WebGL2RenderingContext;
  return { gl, calls };
}
