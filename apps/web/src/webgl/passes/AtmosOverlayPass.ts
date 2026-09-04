import type { AtmosOverlayMode, DoorState, RoomAtmosphereSummary } from '@kybernetes/protocol';
import {
  ATMOS_CELL_SIZE,
  ATMOS_GRID_COLS,
  ATMOS_TOTAL_CELLS,
  type CellularAtmosGrid,
  createInitialAtmosGrid,
  createInitialDoors,
  getO2OverlayColor,
  getPressureOverlayColor,
  getTempOverlayColor,
  HESPERIA_ROOMS,
  tickCellularAtmos,
} from '@kybernetes/sim-core';
import { createProgram } from '../glUtils';
import { ATMOS_CELL_FS, ATMOS_CELL_VS } from '../shaders';

const INSET = 0.5;
const MAX_DECK_CELLS = 1000;
const FLOATS_PER_VERTEX = 6;
const VERTICES_PER_QUAD = 6;
const FLOATS_PER_QUAD = FLOATS_PER_VERTEX * VERTICES_PER_QUAD;

export class AtmosOverlayPass {
  private gl: WebGL2RenderingContext;
  private cellProg: WebGLProgram;
  private cellVAO: WebGLVertexArrayObject;
  private cellBuffer: WebGLBuffer;
  private uMatrixLoc: WebGLUniformLocation;
  private grid: CellularAtmosGrid;
  private defaultDoors: DoorState[];
  private lastTime = 0;
  private vertArray = new Float32Array(MAX_DECK_CELLS * FLOATS_PER_QUAD);

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.grid = createInitialAtmosGrid();
    this.defaultDoors = createInitialDoors();

    this.cellProg = createProgram(gl, ATMOS_CELL_VS, ATMOS_CELL_FS);
    this.uMatrixLoc = gl.getUniformLocation(this.cellProg, 'u_matrix')!;

    this.cellVAO = gl.createVertexArray()!;
    this.cellBuffer = gl.createBuffer()!;

    gl.bindVertexArray(this.cellVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cellBuffer);

    const stride = FLOATS_PER_VERTEX * 4;
    const aPos = gl.getAttribLocation(this.cellProg, 'a_position');
    const aCol = gl.getAttribLocation(this.cellProg, 'a_color');

    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, stride, 0);

    gl.enableVertexAttribArray(aCol);
    gl.vertexAttribPointer(aCol, 4, gl.FLOAT, false, stride, 8);

    gl.bindVertexArray(null);
  }

  // fallow-ignore-next-line complexity
  private syncRoomAverages(
    roomAtmospheres: Record<string, RoomAtmosphereSummary>,
    blendRate: number
  ): void {
    for (const r of HESPERIA_ROOMS) {
      const summary = roomAtmospheres[r.id];
      if (!summary) continue;

      const targetO2 = summary.o2Percent / 100;
      const targetT = summary.tempCelsius + 273.15;
      const targetP = summary.pressureKpa;

      const c1 = Math.floor(r.x / ATMOS_CELL_SIZE);
      const c2 = Math.ceil((r.x + r.width) / ATMOS_CELL_SIZE);
      const r1 = Math.floor(r.y / ATMOS_CELL_SIZE);
      const r2 = Math.ceil((r.y + r.height) / ATMOS_CELL_SIZE);

      for (let row = r1; row < r2; row++) {
        for (let col = c1; col < c2; col++) {
          const idx = row * ATMOS_GRID_COLS + col;
          if (idx >= 0 && idx < ATMOS_TOTAL_CELLS && this.grid.cellRoomId[idx] === r.id) {
            if (targetP <= 1.0) {
              this.grid.pressure[idx] = 0;
              this.grid.o2Ratio[idx] = 0;
              this.grid.tempKelvin[idx] = 3.0;
            } else {
              this.grid.o2Ratio[idx] += (targetO2 - this.grid.o2Ratio[idx]) * blendRate;
              this.grid.tempKelvin[idx] += (targetT - this.grid.tempKelvin[idx]) * blendRate;
              this.grid.pressure[idx] += (targetP - this.grid.pressure[idx]) * blendRate;
            }
          }
        }
      }
    }
  }

  private getCellColor(mode: AtmosOverlayMode, idx: number): [number, number, number, number] {
    let base: [number, number, number, number] = [0, 0, 0, 0];
    if (mode === 'o2') {
      base = getO2OverlayColor(this.grid.o2Ratio[idx] * 100);
    } else if (mode === 'temp') {
      base = getTempOverlayColor(this.grid.tempKelvin[idx] - 273.15);
    } else if (mode === 'pressure') {
      base = getPressureOverlayColor(this.grid.pressure[idx]);
    }

    const plume = this.grid.condensationPlume[idx];
    if (plume > 0.05) {
      const pAlpha = plume * 0.48;
      return [
        base[0] * (1 - pAlpha) + 0.9 * pAlpha,
        base[1] * (1 - pAlpha) + 0.95 * pAlpha,
        base[2] * (1 - pAlpha) + 1.0 * pAlpha,
        Math.min(0.85, base[3] + pAlpha),
      ];
    }
    return base;
  }

  private hasActiveCondensationPlume(): boolean {
    for (let i = 0; i < ATMOS_TOTAL_CELLS; i++) {
      if (this.grid.condensationPlume[i] > 0.08) return true;
    }
    return false;
  }

  private writeCellVertices(
    offset: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: [number, number, number, number]
  ): void {
    const [r, g, b, a] = color;
    const v = this.vertArray;
    // Tri 1: (x1, y1), (x2, y1), (x1, y2)
    v[offset] = x1;
    v[offset + 1] = y1;
    v[offset + 2] = r;
    v[offset + 3] = g;
    v[offset + 4] = b;
    v[offset + 5] = a;
    v[offset + 6] = x2;
    v[offset + 7] = y1;
    v[offset + 8] = r;
    v[offset + 9] = g;
    v[offset + 10] = b;
    v[offset + 11] = a;
    v[offset + 12] = x1;
    v[offset + 13] = y2;
    v[offset + 14] = r;
    v[offset + 15] = g;
    v[offset + 16] = b;
    v[offset + 17] = a;
    // Tri 2: (x1, y2), (x2, y1), (x2, y2)
    v[offset + 18] = x1;
    v[offset + 19] = y2;
    v[offset + 20] = r;
    v[offset + 21] = g;
    v[offset + 22] = b;
    v[offset + 23] = a;
    v[offset + 24] = x2;
    v[offset + 25] = y1;
    v[offset + 26] = r;
    v[offset + 27] = g;
    v[offset + 28] = b;
    v[offset + 29] = a;
    v[offset + 30] = x2;
    v[offset + 31] = y2;
    v[offset + 32] = r;
    v[offset + 33] = g;
    v[offset + 34] = b;
    v[offset + 35] = a;
  }

  // fallow-ignore-next-line complexity
  private buildCellVertices(mode: AtmosOverlayMode, pulse: number): number {
    let offset = 0;
    let quadCount = 0;

    for (let idx = 0; idx < ATMOS_TOTAL_CELLS; idx++) {
      if (this.grid.cellRoomId[idx] === null) continue;
      if (quadCount >= MAX_DECK_CELLS) break;

      const col = idx % ATMOS_GRID_COLS;
      const row = Math.floor(idx / ATMOS_GRID_COLS);
      const x1 = col * ATMOS_CELL_SIZE + INSET;
      const y1 = row * ATMOS_CELL_SIZE + INSET;
      const x2 = x1 + ATMOS_CELL_SIZE - INSET * 2;
      const y2 = y1 + ATMOS_CELL_SIZE - INSET * 2;

      const [r, g, b, a] = this.getCellColor(mode, idx);
      if (a <= 0) continue;

      this.writeCellVertices(offset, x1, y1, x2, y2, [r, g, b, a * pulse]);
      offset += FLOATS_PER_QUAD;
      quadCount++;
    }

    return quadCount;
  }

  public render(
    matrix: Float32Array,
    doors: DoorState[] | undefined,
    breaches: string[] | undefined,
    activeFires: string[] | undefined,
    roomAtmospheres: Record<string, RoomAtmosphereSummary> | undefined,
    mode: AtmosOverlayMode,
    time: number
  ): void {
    const dt = this.lastTime === 0 ? 0.05 : Math.min(0.1, Math.max(0.001, time - this.lastTime));
    this.lastTime = time;

    const activeDoors = doors && doors.length > 0 ? doors : this.defaultDoors;
    tickCellularAtmos(this.grid, activeDoors, breaches ?? [], activeFires ?? [], dt);

    if (roomAtmospheres) {
      this.syncRoomAverages(roomAtmospheres, Math.min(1.0, dt * 15.0));
    }

    const hasPlume = this.hasActiveCondensationPlume();
    if (mode === 'off' && !hasPlume) return;

    const pulse = 0.9 + 0.1 * Math.sin(time * 2.5);
    const quadCount = this.buildCellVertices(mode, pulse);
    if (quadCount === 0) return;

    const gl = this.gl;
    gl.useProgram(this.cellProg);
    gl.bindVertexArray(this.cellVAO);
    gl.uniformMatrix3fv(this.uMatrixLoc, false, matrix);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.cellBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      this.vertArray.subarray(0, quadCount * FLOATS_PER_QUAD),
      gl.DYNAMIC_DRAW
    );
    gl.drawArrays(gl.TRIANGLES, 0, quadCount * VERTICES_PER_QUAD);

    gl.bindVertexArray(null);
  }

  public dispose(): void {
    const gl = this.gl;
    gl.deleteBuffer(this.cellBuffer);
    gl.deleteVertexArray(this.cellVAO);
    gl.deleteProgram(this.cellProg);
  }
}
