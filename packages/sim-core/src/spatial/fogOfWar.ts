import type { Point2D } from './collision';

export const CELL_UNEXPLORED = 0;
export const CELL_EXPLORED = 1;
export const CELL_VISIBLE = 2;

export interface ExplorationGrid {
  width: number;
  height: number;
  cellSize: number;
  cols: number;
  rows: number;
  /** World-space origin of cell (0,0); lets grids cover off-origin harbors. */
  ox: number;
  oy: number;
  cells: Uint8Array;
  exploredCount: number;
}

/**
 * Jordan curve ray-crossing test to check if a 2D point is inside a polygon.
 */
// fallow-ignore-next-line complexity
export function isPointInPolygon(pt: Point2D, polygon: Point2D[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    const intersect = yi > pt.y !== yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function createExplorationGrid(
  width = 1200,
  height = 800,
  cellSize = 20,
  ox = 0,
  oy = 0
): ExplorationGrid {
  const cols = Math.ceil(width / cellSize);
  const rows = Math.ceil(height / cellSize);
  return {
    width,
    height,
    cellSize,
    cols,
    rows,
    ox,
    oy,
    cells: new Uint8Array(cols * rows),
    exploredCount: 0,
  };
}

function getPolygonBoundingBox(polygon: Point2D[]): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
} {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const pt of polygon) {
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
  }
  return { minX, maxX, minY, maxY };
}

// fallow-ignore-next-line complexity
function updateCellVisibility(
  grid: ExplorationGrid,
  cx: number,
  cy: number,
  idx: number,
  polygon: Point2D[],
  pawnPos: Point2D,
  ambientSq: number
): void {
  const dx = cx - pawnPos.x;
  const dy = cy - pawnPos.y;
  const inAmbient = ambientSq > 0 && dx * dx + dy * dy <= ambientSq;

  if (inAmbient || isPointInPolygon({ x: cx, y: cy }, polygon)) {
    if (grid.cells[idx] === CELL_UNEXPLORED) {
      grid.exploredCount++;
    }
    grid.cells[idx] = CELL_VISIBLE;
  }
}

/**
 * Updates the exploration grid from the active Line of Sight polygon and player position.
 */
// fallow-ignore-next-line complexity
export function updateExplorationGrid(
  grid: ExplorationGrid,
  polygon: Point2D[],
  pawnPos: Point2D,
  ambientRadius = 0
): void {
  // 1. Demote any previously visible cells to explored memory
  for (let i = 0; i < grid.cells.length; i++) {
    if (grid.cells[i] === CELL_VISIBLE) {
      grid.cells[i] = CELL_EXPLORED;
    }
  }

  if (polygon.length < 3) return;

  // 2. Compute bounding cell range
  const bb = getPolygonBoundingBox(polygon);
  const minCol = Math.max(0, Math.floor((bb.minX - grid.ox) / grid.cellSize));
  const maxCol = Math.min(grid.cols - 1, Math.floor((bb.maxX - grid.ox) / grid.cellSize));
  const minRow = Math.max(0, Math.floor((bb.minY - grid.oy) / grid.cellSize));
  const maxRow = Math.min(grid.rows - 1, Math.floor((bb.maxY - grid.oy) / grid.cellSize));
  const ambientSq = ambientRadius * ambientRadius;

  for (let r = minRow; r <= maxRow; r++) {
    const rowOffset = r * grid.cols;
    const cy = grid.oy + (r + 0.5) * grid.cellSize;
    for (let c = minCol; c <= maxCol; c++) {
      const cx = grid.ox + (c + 0.5) * grid.cellSize;
      const idx = rowOffset + c;
      updateCellVisibility(grid, cx, cy, idx, polygon, pawnPos, ambientSq);
    }
  }
}

function cellIndex(grid: ExplorationGrid, x: number, y: number): number {
  const lx = x - grid.ox;
  const ly = y - grid.oy;
  if (lx < 0 || lx >= grid.width || ly < 0 || ly >= grid.height) return -1;
  const col = Math.floor(lx / grid.cellSize);
  const row = Math.floor(ly / grid.cellSize);
  return row * grid.cols + col;
}

export function isWorldPointExplored(grid: ExplorationGrid, x: number, y: number): boolean {
  const idx = cellIndex(grid, x, y);
  if (idx < 0) return false;
  return grid.cells[idx] !== CELL_UNEXPLORED;
}

export function isWorldPointVisible(grid: ExplorationGrid, x: number, y: number): boolean {
  const idx = cellIndex(grid, x, y);
  if (idx < 0) return false;
  return grid.cells[idx] === CELL_VISIBLE;
}

export function getExplorationPercentage(grid: ExplorationGrid): number {
  if (grid.cells.length === 0) return 0;
  return (grid.exploredCount / grid.cells.length) * 100;
}

export function revealAllGrid(grid: ExplorationGrid): void {
  grid.cells.fill(CELL_EXPLORED);
  grid.exploredCount = grid.cells.length;
}

export function resetExplorationGrid(grid: ExplorationGrid): void {
  grid.cells.fill(CELL_UNEXPLORED);
  grid.exploredCount = 0;
}

export const FOW_SERIAL_VERSION = 1;

export interface SerializedExplorationGrid {
  version: number;
  width: number;
  height: number;
  cellSize: number;
  ox: number;
  oy: number;
  cols: number;
  rows: number;
  exploredCount: number;
  cellsB64: string;
}

/**
 * World-space -> FOW framebuffer NDC. Maps (ox,oy)..(ox+W,oy+H) to -1..1.
 * The legacy stamper assumed a zero origin, shifting exploration by the
 * framebuffer origin; always build the matrix through this helper.
 */
export function buildFowStampMatrix(
  fowWidth: number,
  fowHeight: number,
  originX: number,
  originY: number
): Float32Array {
  const sx = 2.0 / fowWidth;
  const sy = 2.0 / fowHeight;
  const tx = -1 - (2 * originX) / fowWidth;
  const ty = -1 - (2 * originY) / fowHeight;
  return new Float32Array([sx, 0, 0, 0, sy, 0, tx, ty, 1]);
}

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function b64Value(charCode: number): number {
  if (charCode >= 65 && charCode <= 90) return charCode - 65;
  if (charCode >= 97 && charCode <= 122) return charCode - 71;
  if (charCode >= 48 && charCode <= 57) return charCode + 4;
  if (charCode === 43) return 62;
  if (charCode === 47) return 63;
  return -1;
}

export function encodeGridCells(cells: Uint8Array): string {
  let out = '';
  for (let i = 0; i < cells.length; i += 3) {
    const b0 = cells[i] ?? 0;
    const b1 = i + 1 < cells.length ? (cells[i + 1] ?? 0) : 0;
    const b2 = i + 2 < cells.length ? (cells[i + 2] ?? 0) : 0;
    const triple = (b0 << 16) | (b1 << 8) | b2;
    out += B64_ALPHABET[(triple >> 18) & 63];
    out += B64_ALPHABET[(triple >> 12) & 63];
    out += i + 1 < cells.length ? B64_ALPHABET[(triple >> 6) & 63] : '=';
    out += i + 2 < cells.length ? B64_ALPHABET[triple & 63] : '=';
  }
  return out;
}

function quadPadding(b64: string): number {
  if (b64.endsWith('==')) return 2;
  if (b64.endsWith('=')) return 1;
  return 0;
}

function decodeQuad(b64: string, at: number): number | null {
  const c0 = b64Value(b64.charCodeAt(at));
  const c1 = b64Value(b64.charCodeAt(at + 1));
  const c2 = b64.charAt(at + 2) === '=' ? 0 : b64Value(b64.charCodeAt(at + 2));
  const c3 = b64.charAt(at + 3) === '=' ? 0 : b64Value(b64.charCodeAt(at + 3));
  if (c0 < 0 || c1 < 0 || c2 < 0 || c3 < 0) return null;
  return (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;
}

function appendTriple(out: Uint8Array, pos: number, triple: number): number {
  let next = pos;
  if (next < out.length) out[next++] = (triple >> 16) & 255;
  if (next < out.length) out[next++] = (triple >> 8) & 255;
  if (next < out.length) out[next++] = triple & 255;
  return next;
}

export function decodeGridCells(b64: string): Uint8Array | null {
  if (b64.length === 0 || b64.length % 4 !== 0) return null;
  const outLen = (b64.length / 4) * 3 - quadPadding(b64);
  if (outLen < 0) return null;
  const out = new Uint8Array(outLen);
  let pos = 0;
  for (let i = 0; i < b64.length; i += 4) {
    const triple = decodeQuad(b64, i);
    if (triple === null) return null;
    pos = appendTriple(out, pos, triple);
  }
  return out;
}

function demoteVisibleCopy(cells: Uint8Array): Uint8Array {
  const copy = new Uint8Array(cells.length);
  for (let i = 0; i < cells.length; i++) {
    copy[i] = cells[i] === CELL_VISIBLE ? CELL_EXPLORED : (cells[i] ?? CELL_UNEXPLORED);
  }
  return copy;
}

/** Snapshot for storage: transient VISIBLE demotes to EXPLORED memory. */
export function serializeExplorationGrid(grid: ExplorationGrid): SerializedExplorationGrid {
  return {
    version: FOW_SERIAL_VERSION,
    width: grid.width,
    height: grid.height,
    cellSize: grid.cellSize,
    ox: grid.ox,
    oy: grid.oy,
    cols: grid.cols,
    rows: grid.rows,
    exploredCount: grid.exploredCount,
    cellsB64: encodeGridCells(demoteVisibleCopy(grid.cells)),
  };
}

function gridDimsValid(data: SerializedExplorationGrid): boolean {
  return (
    Number.isFinite(data.cols) &&
    Number.isFinite(data.rows) &&
    data.cols > 0 &&
    data.rows > 0 &&
    data.cols * data.rows < 1_000_000
  );
}

function isValidSerializedGrid(data: SerializedExplorationGrid): boolean {
  return (
    data.version === FOW_SERIAL_VERSION &&
    Number.isFinite(data.width) &&
    Number.isFinite(data.height) &&
    Number.isFinite(data.cellSize) &&
    data.cellSize > 0 &&
    gridDimsValid(data)
  );
}

/** Returns null for any corrupt/foreign payload instead of throwing. */
export function deserializeExplorationGrid(data: unknown): ExplorationGrid | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Partial<SerializedExplorationGrid>;
  if (typeof d.cellsB64 !== 'string') return null;
  const full = d as SerializedExplorationGrid;
  if (!isValidSerializedGrid(full)) return null;
  const cells = decodeGridCells(full.cellsB64);
  if (cells === null || cells.length !== full.cols * full.rows) return null;
  let exploredCount = 0;
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] !== CELL_UNEXPLORED && cells[i] !== CELL_EXPLORED && cells[i] !== CELL_VISIBLE) {
      return null;
    }
    if (cells[i] !== CELL_UNEXPLORED) exploredCount++;
  }
  return {
    width: full.width,
    height: full.height,
    cellSize: full.cellSize,
    cols: full.cols,
    rows: full.rows,
    ox: full.ox,
    oy: full.oy,
    cells,
    exploredCount,
  };
}
