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

export function createExplorationGrid(width = 1200, height = 800, cellSize = 20): ExplorationGrid {
  const cols = Math.ceil(width / cellSize);
  const rows = Math.ceil(height / cellSize);
  return {
    width,
    height,
    cellSize,
    cols,
    rows,
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
  const minCol = Math.max(0, Math.floor(bb.minX / grid.cellSize));
  const maxCol = Math.min(grid.cols - 1, Math.floor(bb.maxX / grid.cellSize));
  const minRow = Math.max(0, Math.floor(bb.minY / grid.cellSize));
  const maxRow = Math.min(grid.rows - 1, Math.floor(bb.maxY / grid.cellSize));
  const ambientSq = ambientRadius * ambientRadius;

  for (let r = minRow; r <= maxRow; r++) {
    const rowOffset = r * grid.cols;
    const cy = (r + 0.5) * grid.cellSize;
    for (let c = minCol; c <= maxCol; c++) {
      const cx = (c + 0.5) * grid.cellSize;
      const idx = rowOffset + c;
      updateCellVisibility(grid, cx, cy, idx, polygon, pawnPos, ambientSq);
    }
  }
}

export function isWorldPointExplored(grid: ExplorationGrid, x: number, y: number): boolean {
  if (x < 0 || x >= grid.width || y < 0 || y >= grid.height) return false;
  const col = Math.floor(x / grid.cellSize);
  const row = Math.floor(y / grid.cellSize);
  const idx = row * grid.cols + col;
  return grid.cells[idx] !== CELL_UNEXPLORED;
}

export function isWorldPointVisible(grid: ExplorationGrid, x: number, y: number): boolean {
  if (x < 0 || x >= grid.width || y < 0 || y >= grid.height) return false;
  const col = Math.floor(x / grid.cellSize);
  const row = Math.floor(y / grid.cellSize);
  const idx = row * grid.cols + col;
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
