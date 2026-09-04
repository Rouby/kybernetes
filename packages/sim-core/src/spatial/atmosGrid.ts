import type { AtmosOverlayMode, DoorState, RoomAtmosphereSummary } from '@kybernetes/protocol';
import {
  getBreachLocation,
  HESPERIA_ROOMS,
  normalizeBreachRoomId,
  type RoomDefinition,
} from './deck';

export const ATMOS_CELL_SIZE = 20;
export const ATMOS_GRID_COLS = 60; // 1200 / 20
export const ATMOS_GRID_ROWS = 40; // 800 / 20
export const ATMOS_TOTAL_CELLS = ATMOS_GRID_COLS * ATMOS_GRID_ROWS; // 2400

export interface CellAtmosphere {
  pressureKpa: number;
  o2Percent: number;
  co2Ppm: number;
  tempCelsius: number;
  toxicSmokePercent: number;
  velX: number;
  velY: number;
  roomId: string | null;
  condensationPlume?: number;
}

export interface CellularAtmosGrid {
  pressure: Float32Array;
  o2Ratio: Float32Array;
  tempKelvin: Float32Array;
  toxicSmoke: Float32Array;
  velX: Float32Array;
  velY: Float32Array;
  cellRoomId: Array<string | null>;
  isFireActive: Uint8Array;
  condensationPlume: Float32Array;
  ecsDrainPercent?: number;
}

export function cellCoordsToIndex(col: number, row: number): number {
  if (col < 0 || col >= ATMOS_GRID_COLS || row < 0 || row >= ATMOS_GRID_ROWS) return -1;
  return row * ATMOS_GRID_COLS + col;
}

export function worldToCellCoords(x: number, y: number): { col: number; row: number } {
  const col = Math.floor(x / ATMOS_CELL_SIZE);
  const row = Math.floor(y / ATMOS_CELL_SIZE);
  return {
    col: Math.max(0, Math.min(ATMOS_GRID_COLS - 1, col)),
    row: Math.max(0, Math.min(ATMOS_GRID_ROWS - 1, row)),
  };
}

export function worldToIndex(x: number, y: number): number {
  const { col, row } = worldToCellCoords(x, y);
  return cellCoordsToIndex(col, row);
}

function findRoomForWorldPos(x: number, y: number): RoomDefinition | null {
  for (const r of HESPERIA_ROOMS) {
    if (x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height) {
      return r;
    }
  }
  return null;
}

export function createInitialAtmosGrid(): CellularAtmosGrid {
  const grid: CellularAtmosGrid = {
    pressure: new Float32Array(ATMOS_TOTAL_CELLS),
    o2Ratio: new Float32Array(ATMOS_TOTAL_CELLS),
    tempKelvin: new Float32Array(ATMOS_TOTAL_CELLS),
    toxicSmoke: new Float32Array(ATMOS_TOTAL_CELLS),
    velX: new Float32Array(ATMOS_TOTAL_CELLS),
    velY: new Float32Array(ATMOS_TOTAL_CELLS),
    cellRoomId: new Array(ATMOS_TOTAL_CELLS).fill(null),
    isFireActive: new Uint8Array(ATMOS_TOTAL_CELLS),
    condensationPlume: new Float32Array(ATMOS_TOTAL_CELLS),
  };

  for (let r = 0; r < ATMOS_GRID_ROWS; r++) {
    for (let c = 0; c < ATMOS_GRID_COLS; c++) {
      const idx = cellCoordsToIndex(c, r);
      const wx = c * ATMOS_CELL_SIZE + ATMOS_CELL_SIZE / 2;
      const wy = r * ATMOS_CELL_SIZE + ATMOS_CELL_SIZE / 2;
      const room = findRoomForWorldPos(wx, wy);

      if (room) {
        grid.cellRoomId[idx] = room.id;
        grid.pressure[idx] = 101.3;
        grid.o2Ratio[idx] = 0.209;
        grid.tempKelvin[idx] = 294.15; // 21°C
        grid.toxicSmoke[idx] = 0;
      } else {
        grid.cellRoomId[idx] = null;
        grid.pressure[idx] = 0.0;
        grid.o2Ratio[idx] = 0.0;
        grid.tempKelvin[idx] = 3.0; // Space vacuum
        grid.toxicSmoke[idx] = 0;
      }
    }
  }

  return grid;
}

interface VentSourceInfo {
  idx: number;
  col: number;
  row: number;
  kRate: number;
}

function createDoorOpenMap(doors: DoorState[]): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  for (const d of doors) {
    map[d.id] = d.isOpen;
  }
  return map;
}

function addVentDoorCells(
  grid: CellularAtmosGrid,
  breachCells: Set<number>,
  ventSources: VentSourceInfo[],
  c1: number,
  c2: number,
  r1: number,
  r2: number,
  kRate: number
): void {
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      const idx = cellCoordsToIndex(c, r);
      if (idx !== -1) {
        grid.pressure[idx] = 0;
        grid.o2Ratio[idx] = 0;
        grid.tempKelvin[idx] = 3.0;
        breachCells.add(idx);
        ventSources.push({ idx, col: c, row: r, kRate });
      }
    }
  }
}

function addRoomBreachCells(
  grid: CellularAtmosGrid,
  breachCells: Set<number>,
  ventSources: VentSourceInfo[],
  breachRoomId: string
): void {
  const isPuncture = breachRoomId.startsWith('puncture_');
  const actualRoomId = normalizeBreachRoomId(breachRoomId);
  const room = HESPERIA_ROOMS.find((r) => r.id === actualRoomId);
  if (!room) return;

  const kRate = isPuncture ? 0.04 : 25.0;
  const loc = getBreachLocation(breachRoomId);
  let col = Math.floor((room.x + room.width / 2) / ATMOS_CELL_SIZE);
  let r = room.y > 368 ? 28 : 11;
  if (loc) {
    const inX = loc.x - loc.normalX * 6;
    const inY = loc.y - loc.normalY * 6;
    col = Math.max(0, Math.min(ATMOS_GRID_COLS - 1, Math.floor(inX / ATMOS_CELL_SIZE)));
    r = Math.max(0, Math.min(ATMOS_GRID_ROWS - 1, Math.floor(inY / ATMOS_CELL_SIZE)));
  } else if (actualRoomId === 'corridor') {
    r = 19;
    col = 6;
  }

  const c1 = isPuncture ? col : col - 1;
  const c2 = isPuncture ? col : col + 1;
  for (let colIdx = c1; colIdx <= c2; colIdx++) {
    const idx = cellCoordsToIndex(colIdx, r);
    if (idx !== -1 && grid.cellRoomId[idx] === actualRoomId) {
      grid.pressure[idx] = 0;
      grid.o2Ratio[idx] = 0;
      grid.tempKelvin[idx] = 3.0;
      breachCells.add(idx);
      ventSources.push({ idx, col: colIdx, row: r, kRate });
    }
  }
}

function applyVentSources(
  grid: CellularAtmosGrid,
  breaches: string[],
  doorOpenMap: Record<string, boolean>
): { breachCells: Set<number>; ventSources: VentSourceInfo[] } {
  const breachCells = new Set<number>();
  const ventSources: VentSourceInfo[] = [];

  // 1. Open airlocks / exterior doors
  if (doorOpenMap.airlock_stbd_outer) {
    addVentDoorCells(grid, breachCells, ventSources, 47, 49, 10, 11, 25.0);
  }
  if (doorOpenMap.airlock_port_outer) {
    addVentDoorCells(grid, breachCells, ventSources, 18, 20, 28, 29, 25.0);
  }
  if (doorOpenMap.airlock_eng) {
    addVentDoorCells(grid, breachCells, ventSources, 50, 51, 24, 25, 25.0);
  }

  // 2. Hull breaches
  for (const breachRoomId of breaches) {
    addRoomBreachCells(grid, breachCells, ventSources, breachRoomId);
  }

  return { breachCells, ventSources };
}

function canCrossOuterHull(
  c1: number,
  r1: number,
  c2: number,
  r2: number,
  inIdx: number,
  doorOpenMap: Record<string, boolean>,
  breachCells: Set<number>
): boolean {
  if (breachCells.has(inIdx)) return true;

  if (doorOpenMap.airlock_stbd_outer && Math.min(r1, r2) === 10 && Math.max(r1, r2) === 11) {
    if (c1 === c2 && c1 >= 47 && c1 <= 49) return true;
  }
  if (doorOpenMap.airlock_port_outer && Math.min(r1, r2) === 28 && Math.max(r1, r2) === 29) {
    if (c1 === c2 && c1 >= 18 && c1 <= 20) return true;
  }
  if (doorOpenMap.airlock_eng && Math.min(c1, c2) === 50 && Math.max(c1, c2) === 51) {
    if (r1 === r2 && r1 >= 24 && r1 <= 25) return true;
  }
  return false;
}

function canCrossUpperDoor(col: number, doorOpenMap: Record<string, boolean>): boolean {
  if (col >= 10 && col <= 11) return Boolean(doorOpenMap.door_bridge);
  if (col >= 18 && col <= 19) return Boolean(doorOpenMap.door_avionics);
  if (col >= 25 && col <= 26) return Boolean(doorOpenMap.door_life_support);
  if (col >= 33 && col <= 34) return Boolean(doorOpenMap.door_quarters);
  if (col >= 41 && col <= 42) return Boolean(doorOpenMap.door_mess);
  if (col >= 47 && col <= 49) return Boolean(doorOpenMap.airlock_stbd_inner);
  return false;
}

function canCrossLowerDoor(col: number, doorOpenMap: Record<string, boolean>): boolean {
  if (col >= 10 && col <= 11) return Boolean(doorOpenMap.door_armory);
  if (col >= 18 && col <= 19) return Boolean(doorOpenMap.airlock_port_inner);
  if (col >= 29 && col <= 30) return Boolean(doorOpenMap.door_cargo);
  if (col >= 43 && col <= 45) return Boolean(doorOpenMap.door_eng);
  return false;
}

function canCrossInteriorDoor(
  c1: number,
  r1: number,
  c2: number,
  r2: number,
  doorOpenMap: Record<string, boolean>
): boolean {
  if (c1 !== c2) return false;
  const minR = Math.min(r1, r2);
  const maxR = Math.max(r1, r2);
  if (minR === 17 && maxR === 18) return canCrossUpperDoor(c1, doorOpenMap);
  if (minR === 21 && maxR === 22) return canCrossLowerDoor(c1, doorOpenMap);
  return false;
}

function isBlockedBySpineDoor(
  c1: number,
  r1: number,
  c2: number,
  r2: number,
  doorOpenMap: Record<string, boolean>
): boolean {
  if (r1 !== r2 || r1 < 18 || r1 > 21) return false;
  const minC = Math.min(c1, c2);
  const maxC = Math.max(c1, c2);
  if (minC === 21 && maxC === 22 && !doorOpenMap.door_spine_fwd) return true;
  if (minC === 37 && maxC === 38 && !doorOpenMap.door_spine_aft) return true;
  return false;
}

function buildPartitionHolePairs(
  holes?: Array<{ x: number; y: number; wallId: string }>
): Map<string, number> {
  const pairs = new Map<string, number>();
  if (!holes || holes.length === 0) return pairs;

  for (const h of holes) {
    let idx1 = -1;
    let idx2 = -1;
    if (h.wallId.startsWith('part_')) {
      const colLeft = Math.round(h.x / ATMOS_CELL_SIZE) - 1;
      const colRight = Math.round(h.x / ATMOS_CELL_SIZE);
      const row = Math.floor(h.y / ATMOS_CELL_SIZE);
      idx1 = cellCoordsToIndex(colLeft, row);
      idx2 = cellCoordsToIndex(colRight, row);
    } else if (h.wallId.startsWith('spine_')) {
      const col = Math.floor(h.x / ATMOS_CELL_SIZE);
      const rowTop = Math.round(h.y / ATMOS_CELL_SIZE) - 1;
      const rowBot = Math.round(h.y / ATMOS_CELL_SIZE);
      idx1 = cellCoordsToIndex(col, rowTop);
      idx2 = cellCoordsToIndex(col, rowBot);
    }
    if (idx1 !== -1 && idx2 !== -1) {
      const key = idx1 < idx2 ? `${idx1}_${idx2}` : `${idx2}_${idx1}`;
      pairs.set(key, (pairs.get(key) || 0) + 1);
    }
  }

  return pairs;
}

function canDiffuse(
  grid: CellularAtmosGrid,
  i: number,
  j: number,
  doorOpenMap: Record<string, boolean>,
  breachCells: Set<number>,
  partitionHolePairs?: Map<string, number> | Set<string>
): boolean {
  const rA = grid.cellRoomId[i];
  const rB = grid.cellRoomId[j];
  if (rA === null && rB === null) return false;

  const c1 = i % ATMOS_GRID_COLS;
  const r1 = Math.floor(i / ATMOS_GRID_COLS);
  const c2 = j % ATMOS_GRID_COLS;
  const r2 = Math.floor(j / ATMOS_GRID_COLS);

  if (rA === null || rB === null) {
    const inIdx = rA !== null ? i : j;
    return canCrossOuterHull(c1, r1, c2, r2, inIdx, doorOpenMap, breachCells);
  }

  if (partitionHolePairs) {
    const pairKey = i < j ? `${i}_${j}` : `${j}_${i}`;
    if (partitionHolePairs.has(pairKey)) return true;
  }

  if (rA !== rB) {
    return canCrossInteriorDoor(c1, r1, c2, r2, doorOpenMap);
  }

  return !isBlockedBySpineDoor(c1, r1, c2, r2, doorOpenMap);
}

// fallow-ignore-next-line complexity
function diffusePair(
  grid: CellularAtmosGrid,
  i: number,
  j: number,
  dt: number,
  dirX: number,
  dirY: number,
  holeCount = 0
): void {
  const isSpaceI = grid.cellRoomId[i] === null;
  const isSpaceJ = grid.cellRoomId[j] === null;
  if (isSpaceI && isSpaceJ) return;

  if (isSpaceI) {
    grid.pressure[i] = 0;
    grid.o2Ratio[i] = 0;
    grid.tempKelvin[i] = 3.0;
  }
  if (isSpaceJ) {
    grid.pressure[j] = 0;
    grid.o2Ratio[j] = 0;
    grid.tempKelvin[j] = 3.0;
  }

  const pDiff = grid.pressure[i] - grid.pressure[j];
  if (Math.abs(pDiff) < 0.05) return;

  const isHole = holeCount > 0;
  const countMultiplier = Math.min(4, Math.max(1, holeCount));
  const baseRate = isHole ? 0.35 * countMultiplier : 8.0;
  const boostFactor = isHole ? 0.02 : 1.0;
  const boost = Math.min(24.0, Math.abs(pDiff) * 0.3);
  const flowRate = (baseRate + boost * boostFactor) * dt;
  const maxTransfer = isHole ? 1.5 * countMultiplier : 50;
  const pTransfer = Math.max(-maxTransfer, Math.min(maxTransfer, pDiff * flowRate));

  if (isSpaceI) {
    grid.pressure[j] = Math.max(0, grid.pressure[j] - Math.abs(pTransfer));
  } else if (isSpaceJ) {
    grid.pressure[i] = Math.max(0, grid.pressure[i] - Math.abs(pTransfer));
  } else {
    grid.pressure[i] -= pTransfer * 0.5;
    grid.pressure[j] += pTransfer * 0.5;
  }

  // Only generate aerodynamic velocity for significant pressure gradients
  if (Math.abs(pDiff) > 1.5) {
    const vMag = isHole ? pTransfer * 1.5 : pTransfer * 10.0;
    grid.velX[i] += dirX * vMag;
    grid.velY[i] += dirY * vMag;
    grid.velX[j] += dirX * vMag;
    grid.velY[j] += dirY * vMag;
  }

  // Advection of O2, smoke, temp
  const advRate = isHole ? flowRate * 0.15 : flowRate * 0.4;
  const gasRatioDiff = grid.o2Ratio[i] - grid.o2Ratio[j];
  grid.o2Ratio[i] -= gasRatioDiff * advRate;
  grid.o2Ratio[j] += gasRatioDiff * advRate;

  const smokeDiff = grid.toxicSmoke[i] - grid.toxicSmoke[j];
  grid.toxicSmoke[i] -= smokeDiff * advRate;
  grid.toxicSmoke[j] += smokeDiff * advRate;

  const tempDiff = grid.tempKelvin[i] - grid.tempKelvin[j];
  const tempRate = isHole ? flowRate * 0.1 : flowRate * 0.25;
  grid.tempKelvin[i] -= tempDiff * tempRate;
  grid.tempKelvin[j] += tempDiff * tempRate;
}

// fallow-ignore-next-line complexity
function applyCellDecompression(
  grid: CellularAtmosGrid,
  idx: number,
  kRate: number,
  dt: number,
  c: number,
  r: number,
  vCol: number,
  vRow: number
): void {
  const pCurrent = grid.pressure[idx];
  if (pCurrent <= 0.05) {
    grid.condensationPlume[idx] = Math.max(0, grid.condensationPlume[idx] - 1.5 * dt);
    return;
  }

  const dropFraction = 1 - Math.exp(-kRate * dt);
  const pDrop = pCurrent * dropFraction;
  let nextP = Math.max(0, pCurrent - pDrop);
  let nextO2 = Math.max(0, grid.o2Ratio[idx] * (1 - dropFraction * 0.95));

  // Hard vacuum cutoff: explosive decompression snaps to true 0.0 kPa quickly
  if ((kRate > 1.0 && nextP < 15.0) || nextP < 1.0) {
    nextP = 0;
    nextO2 = 0;
    grid.tempKelvin[idx] = 3.0;
    grid.toxicSmoke[idx] = 0;
  }

  grid.pressure[idx] = nextP;
  grid.o2Ratio[idx] = nextO2;
  grid.toxicSmoke[idx] = Math.max(0, grid.toxicSmoke[idx] * (1 - dropFraction));

  const dx = (vCol - c) * ATMOS_CELL_SIZE;
  const dy = (vRow - r) * ATMOS_CELL_SIZE;
  const dist = Math.hypot(dx, dy);
  if (dist > 0.1 && nextP > 0) {
    const rateFactor = Math.min(1.0, kRate / 2.0);
    const pullSpeed = Math.min(320, (30.0 + pCurrent * 2.2) * rateFactor);
    grid.velX[idx] += (dx / dist) * pullSpeed * dt * 8.0;
    grid.velY[idx] += (dy / dist) * pullSpeed * dt * 8.0;
  }

  if (pDrop / dt > 15.0 && pCurrent > 12.0) {
    const tDrop = (pDrop / (pCurrent + 0.1)) * grid.tempKelvin[idx] * 0.28;
    grid.tempKelvin[idx] = Math.max(25, grid.tempKelvin[idx] - tDrop);
    grid.condensationPlume[idx] = Math.min(1.0, grid.condensationPlume[idx] + 0.9);
  } else {
    grid.condensationPlume[idx] = Math.max(0, grid.condensationPlume[idx] - 1.5 * dt);
  }
}

interface WaveQueueState {
  visited: Uint8Array;
  queueCol: Int16Array;
  queueRow: Int16Array;
  queueVentCol: Int16Array;
  queueVentRow: Int16Array;
  queueRate: Float32Array;
  tail: number;
}

function queueDecompressionNeighbors(
  grid: CellularAtmosGrid,
  idx: number,
  c: number,
  r: number,
  kRate: number,
  doorOpenMap: Record<string, boolean>,
  breachCells: Set<number>,
  partitionHolePairs: Map<string, number> | Set<string> | undefined,
  q: WaveQueueState
): void {
  const neighbors = [
    { col: c + 1, row: r },
    { col: c - 1, row: r },
    { col: c, row: r + 1 },
    { col: c, row: r - 1 },
  ];

  for (const nb of neighbors) {
    const nIdx = cellCoordsToIndex(nb.col, nb.row);
    if (nIdx !== -1 && q.visited[nIdx] === 0) {
      if (canDiffuse(grid, idx, nIdx, doorOpenMap, breachCells, partitionHolePairs)) {
        const pairKey = idx < nIdx ? `${idx}_${nIdx}` : `${nIdx}_${idx}`;
        const holeCount =
          partitionHolePairs instanceof Map
            ? (partitionHolePairs.get(pairKey) ?? 0)
            : partitionHolePairs?.has(pairKey)
              ? 1
              : 0;
        const isHole = holeCount > 0;
        const holeLimit = Math.min(0.12, 0.035 * Math.min(3, holeCount));
        const stepRate = isHole ? Math.min(kRate, holeLimit) : kRate;

        q.visited[nIdx] = 1;
        q.queueCol[q.tail] = nb.col;
        q.queueRow[q.tail] = nb.row;
        q.queueVentCol[q.tail] = c;
        q.queueVentRow[q.tail] = r;
        q.queueRate[q.tail] = stepRate;
        q.tail++;
      }
    }
  }
}

// fallow-ignore-next-line complexity
function propagateDecompressionWave(
  grid: CellularAtmosGrid,
  ventSources: VentSourceInfo[],
  doorOpenMap: Record<string, boolean>,
  breachCells: Set<number>,
  dt: number,
  partitionHolePairs?: Map<string, number> | Set<string>
): void {
  if (ventSources.length === 0) {
    for (let i = 0; i < ATMOS_TOTAL_CELLS; i++) {
      if (grid.condensationPlume[i] > 0) {
        grid.condensationPlume[i] = Math.max(0, grid.condensationPlume[i] - 1.5 * dt);
      }
      grid.velX[i] = 0;
      grid.velY[i] = 0;
    }
    return;
  }

  const q: WaveQueueState = {
    visited: new Uint8Array(ATMOS_TOTAL_CELLS),
    queueCol: new Int16Array(ATMOS_TOTAL_CELLS),
    queueRow: new Int16Array(ATMOS_TOTAL_CELLS),
    queueVentCol: new Int16Array(ATMOS_TOTAL_CELLS),
    queueVentRow: new Int16Array(ATMOS_TOTAL_CELLS),
    queueRate: new Float32Array(ATMOS_TOTAL_CELLS),
    tail: 0,
  };
  let head = 0;

  for (const vs of ventSources) {
    if (q.visited[vs.idx] === 0) {
      q.visited[vs.idx] = 1;
      q.queueCol[q.tail] = vs.col;
      q.queueRow[q.tail] = vs.row;
      q.queueVentCol[q.tail] = vs.col;
      q.queueVentRow[q.tail] = vs.row;
      q.queueRate[q.tail] = vs.kRate;
      q.tail++;
    }
  }

  while (head < q.tail) {
    const c = q.queueCol[head];
    const r = q.queueRow[head];
    const vCol = q.queueVentCol[head];
    const vRow = q.queueVentRow[head];
    const kRate = q.queueRate[head];
    const idx = cellCoordsToIndex(c, r);
    head++;

    if (idx === -1) continue;

    if (grid.cellRoomId[idx] !== null) {
      applyCellDecompression(grid, idx, kRate, dt, c, r, vCol, vRow);
    }

    queueDecompressionNeighbors(
      grid,
      idx,
      c,
      r,
      kRate,
      doorOpenMap,
      breachCells,
      partitionHolePairs,
      q
    );
  }

  for (let i = 0; i < ATMOS_TOTAL_CELLS; i++) {
    if (q.visited[i] === 0 && grid.condensationPlume[i] > 0) {
      grid.condensationPlume[i] = Math.max(0, grid.condensationPlume[i] - 1.5 * dt);
    }
  }
}

function runCellularDiffusionSubsteps(
  grid: CellularAtmosGrid,
  doorOpenMap: Record<string, boolean>,
  breachCells: Set<number>,
  dt: number,
  partitionHolePairs?: Map<string, number> | Set<string>
): void {
  const SUB_STEPS = 2;
  const subDt = dt / SUB_STEPS;

  for (let step = 0; step < SUB_STEPS; step++) {
    for (let r = 0; r < ATMOS_GRID_ROWS; r++) {
      for (let c = 0; c < ATMOS_GRID_COLS - 1; c++) {
        const i = cellCoordsToIndex(c, r);
        const j = cellCoordsToIndex(c + 1, r);
        if (!canDiffuse(grid, i, j, doorOpenMap, breachCells, partitionHolePairs)) continue;
        const pairKey = i < j ? `${i}_${j}` : `${j}_${i}`;
        const holeCount =
          partitionHolePairs instanceof Map
            ? (partitionHolePairs.get(pairKey) ?? 0)
            : partitionHolePairs?.has(pairKey)
              ? 1
              : 0;
        diffusePair(grid, i, j, subDt, 1, 0, holeCount);
      }
    }

    for (let r = 0; r < ATMOS_GRID_ROWS - 1; r++) {
      for (let c = 0; c < ATMOS_GRID_COLS; c++) {
        const i = cellCoordsToIndex(c, r);
        const j = cellCoordsToIndex(c, r + 1);
        if (!canDiffuse(grid, i, j, doorOpenMap, breachCells, partitionHolePairs)) continue;
        const pairKey = i < j ? `${i}_${j}` : `${j}_${i}`;
        const holeCount =
          partitionHolePairs instanceof Map
            ? (partitionHolePairs.get(pairKey) ?? 0)
            : partitionHolePairs?.has(pairKey)
              ? 1
              : 0;
        diffusePair(grid, i, j, subDt, 0, 1, holeCount);
      }
    }
  }
}

function tickCombustion(grid: CellularAtmosGrid, dt: number): void {
  for (let i = 0; i < ATMOS_TOTAL_CELLS; i++) {
    if (grid.isFireActive[i] === 0) continue;

    // Fire starves if O2 or pressure is too low
    if (grid.o2Ratio[i] < 0.1 || grid.pressure[i] < 15.0) {
      grid.isFireActive[i] = 0;
      continue;
    }

    // Active combustion
    grid.o2Ratio[i] = Math.max(0, grid.o2Ratio[i] - 0.05 * dt);
    grid.toxicSmoke[i] = Math.min(1.0, grid.toxicSmoke[i] + 0.15 * dt);
    grid.tempKelvin[i] = Math.min(850, grid.tempKelvin[i] + 35.0 * dt);

    // Ignition spread to neighbor if hot and has oxygen
    if (grid.tempKelvin[i] > 550) {
      const col = i % ATMOS_GRID_COLS;
      const row = Math.floor(i / ATMOS_GRID_COLS);
      const neighbors = [
        cellCoordsToIndex(col + 1, row),
        cellCoordsToIndex(col - 1, row),
        cellCoordsToIndex(col, row + 1),
        cellCoordsToIndex(col, row - 1),
      ];
      for (const n of neighbors) {
        if (n !== -1 && grid.cellRoomId[n] !== null && grid.o2Ratio[n] > 0.14) {
          if (grid.tempKelvin[n] > 480 && Math.random() < 0.1) {
            grid.isFireActive[n] = 1;
          }
        }
      }
    }
  }
}

interface ZoneDef {
  id: string;
  roomId: string;
  c1: number;
  c2: number;
  r1: number;
  r2: number;
}

const ZONE_DEFS: ZoneDef[] = [
  { id: 'bridge', roomId: 'bridge', c1: 6, c2: 15, r1: 11, r2: 17 },
  { id: 'avionics', roomId: 'avionics', c1: 16, c2: 21, r1: 11, r2: 17 },
  { id: 'life_support', roomId: 'life_support', c1: 22, c2: 29, r1: 11, r2: 17 },
  { id: 'quarters', roomId: 'quarters', c1: 30, c2: 37, r1: 11, r2: 17 },
  { id: 'mess', roomId: 'mess', c1: 38, c2: 45, r1: 11, r2: 17 },
  { id: 'airlock_stbd', roomId: 'airlock_stbd', c1: 46, c2: 50, r1: 11, r2: 17 },
  { id: 'armory', roomId: 'armory', c1: 6, c2: 15, r1: 22, r2: 28 },
  { id: 'airlock_port', roomId: 'airlock_port', c1: 16, c2: 21, r1: 22, r2: 28 },
  { id: 'cargo', roomId: 'cargo', c1: 22, c2: 37, r1: 22, r2: 28 },
  { id: 'engineering', roomId: 'engineering', c1: 38, c2: 50, r1: 22, r2: 28 },
  { id: 'corridor_fwd', roomId: 'corridor', c1: 6, c2: 21, r1: 18, r2: 21 },
  { id: 'corridor_mid', roomId: 'corridor', c1: 22, c2: 37, r1: 18, r2: 21 },
  { id: 'corridor_aft', roomId: 'corridor', c1: 38, c2: 50, r1: 18, r2: 21 },
];

function initZoneCellIndices(): number[][] {
  const list: number[][] = [];
  for (let z = 0; z < ZONE_DEFS.length; z++) {
    const def = ZONE_DEFS[z];
    const indices: number[] = [];
    for (let r = def.r1; r <= def.r2; r++) {
      for (let c = def.c1; c <= def.c2; c++) {
        indices.push(r * ATMOS_GRID_COLS + c);
      }
    }
    list.push(indices);
  }
  return list;
}

const ZONE_CELL_INDICES: number[][] = initZoneCellIndices();

interface ZoneConnection {
  doorId: string;
  zoneA: number;
  zoneB: number;
}

const ZONE_CONNECTIONS: ZoneConnection[] = [
  { doorId: 'door_bridge', zoneA: 0, zoneB: 10 },
  { doorId: 'door_avionics', zoneA: 1, zoneB: 10 },
  { doorId: 'door_armory', zoneA: 6, zoneB: 10 },
  { doorId: 'airlock_port_inner', zoneA: 7, zoneB: 10 },
  { doorId: 'door_spine_fwd', zoneA: 10, zoneB: 11 },
  { doorId: 'door_life_support', zoneA: 2, zoneB: 11 },
  { doorId: 'door_quarters', zoneA: 3, zoneB: 11 },
  { doorId: 'door_cargo', zoneA: 8, zoneB: 11 },
  { doorId: 'door_spine_aft', zoneA: 11, zoneB: 12 },
  { doorId: 'door_mess', zoneA: 4, zoneB: 12 },
  { doorId: 'airlock_stbd_inner', zoneA: 5, zoneB: 12 },
  { doorId: 'door_eng', zoneA: 9, zoneB: 12 },
];

interface ZoneAverage {
  pAvg: number;
  o2Avg: number;
  tempAvg: number;
  smokeAvg: number;
  totalMass: number;
}

function computeZoneAverages(grid: CellularAtmosGrid): ZoneAverage[] {
  const avgs: ZoneAverage[] = [];
  for (let z = 0; z < ZONE_DEFS.length; z++) {
    const indices = ZONE_CELL_INDICES[z];
    const n = indices.length;
    let sumP = 0;
    let sumO2 = 0;
    let sumT = 0;
    let sumSmoke = 0;
    for (let k = 0; k < n; k++) {
      const idx = indices[k];
      sumP += grid.pressure[idx];
      sumO2 += grid.o2Ratio[idx];
      sumT += grid.tempKelvin[idx];
      sumSmoke += grid.toxicSmoke[idx];
    }
    avgs.push({
      pAvg: sumP / n,
      o2Avg: sumO2 / n,
      tempAvg: sumT / n,
      smokeAvg: sumSmoke / n,
      totalMass: sumP,
    });
  }
  return avgs;
}

interface ZoneFlowAccumulator {
  netDeltaMass: Float64Array;
  inflowMass: Float64Array;
  inflowO2Mass: Float64Array;
  inflowTempMass: Float64Array;
  inflowSmokeMass: Float64Array;
}

// fallow-ignore-next-line complexity
function computeZoneTransfers(
  avgs: ZoneAverage[],
  doorOpenMap: Record<string, boolean>,
  dt: number
): ZoneFlowAccumulator {
  const count = ZONE_DEFS.length;
  const netDeltaMass = new Float64Array(count);
  const inflowMass = new Float64Array(count);
  const inflowO2Mass = new Float64Array(count);
  const inflowTempMass = new Float64Array(count);
  const inflowSmokeMass = new Float64Array(count);

  for (const conn of ZONE_CONNECTIONS) {
    if (!doorOpenMap[conn.doorId]) continue;

    const zA = conn.zoneA;
    const zB = conn.zoneB;
    const pDiff = avgs[zA].pAvg - avgs[zB].pAvg;
    if (Math.abs(pDiff) < 0.1) continue;

    const nA = ZONE_CELL_INDICES[zA].length;
    const nB = ZONE_CELL_INDICES[zB].length;
    const nEff = (nA * nB) / (nA + nB);

    // Fast inter-room pneumatic equalization rate: k = 3.2 s^-1
    const fraction = 1 - Math.exp(-3.2 * dt);
    const deltaM = pDiff * nEff * fraction;

    netDeltaMass[zA] -= deltaM;
    netDeltaMass[zB] += deltaM;

    if (deltaM > 0) {
      inflowMass[zB] += deltaM;
      inflowO2Mass[zB] += deltaM * avgs[zA].o2Avg;
      inflowTempMass[zB] += deltaM * avgs[zA].tempAvg;
      inflowSmokeMass[zB] += deltaM * avgs[zA].smokeAvg;
    } else {
      const absM = -deltaM;
      inflowMass[zA] += absM;
      inflowO2Mass[zA] += absM * avgs[zB].o2Avg;
      inflowTempMass[zA] += absM * avgs[zB].tempAvg;
      inflowSmokeMass[zA] += absM * avgs[zB].smokeAvg;
    }
  }

  return { netDeltaMass, inflowMass, inflowO2Mass, inflowTempMass, inflowSmokeMass };
}

// fallow-ignore-next-line complexity
function applyZoneEqualization(
  grid: CellularAtmosGrid,
  avgs: ZoneAverage[],
  flows: ZoneFlowAccumulator
): void {
  for (let z = 0; z < ZONE_DEFS.length; z++) {
    const indices = ZONE_CELL_INDICES[z];
    const n = indices.length;
    const deltaM = flows.netDeltaMass[z];
    const currentM = avgs[z].totalMass;

    if (Math.abs(deltaM) > 0.001) {
      if (deltaM < 0 && currentM > 0.01) {
        const scale = Math.max(0, (currentM + deltaM) / currentM);
        for (let k = 0; k < n; k++) {
          grid.pressure[indices[k]] *= scale;
        }
      } else {
        const addPerCell = deltaM / n;
        for (let k = 0; k < n; k++) {
          grid.pressure[indices[k]] = Math.max(0, grid.pressure[indices[k]] + addPerCell);
        }
      }
    }

    const inM = flows.inflowMass[z];
    if (inM > 0.01) {
      const inO2 = flows.inflowO2Mass[z] / inM;
      const inT = flows.inflowTempMass[z] / inM;
      const inSmoke = flows.inflowSmokeMass[z] / inM;
      const blend = Math.min(1.0, inM / Math.max(0.1, currentM + inM));

      for (let k = 0; k < n; k++) {
        const idx = indices[k];
        grid.o2Ratio[idx] += (inO2 - grid.o2Ratio[idx]) * blend;
        grid.tempKelvin[idx] += (inT - grid.tempKelvin[idx]) * blend;
        grid.toxicSmoke[idx] += (inSmoke - grid.toxicSmoke[idx]) * blend;
      }
    }
  }
}

function equalizeConnectedZones(
  grid: CellularAtmosGrid,
  doorOpenMap: Record<string, boolean>,
  dt: number
): void {
  const avgs = computeZoneAverages(grid);
  const flows = computeZoneTransfers(avgs, doorOpenMap, dt);
  applyZoneEqualization(grid, avgs, flows);
}

export function getZoneRepressurizeRate(zoneId: string): number {
  if (zoneId === 'airlock_stbd' || zoneId === 'airlock_port' || zoneId === 'avionics') {
    return 25.0; // Small compartments & airlocks: ~3-5s
  }
  if (zoneId === 'cargo' || zoneId === 'engineering') {
    return 6.5; // Large bays: ~12-18s
  }
  return 12.0; // Medium rooms: ~7-10s
}

function repressurizeZoneCells(
  grid: CellularAtmosGrid,
  indices: number[],
  rate: number,
  dt: number
): number {
  let totalPAdded = 0;
  for (let k = 0; k < indices.length; k++) {
    const idx = indices[k];
    const p = grid.pressure[idx];
    if (p < 101.3) {
      const pAdd = Math.min(101.3 - p, rate * dt);
      grid.pressure[idx] = p + pAdd;
      totalPAdded += pAdd;

      const blend = Math.min(1.0, 0.4 * dt + (pAdd / 101.3) * 2);
      grid.tempKelvin[idx] = Math.min(
        294.15,
        grid.tempKelvin[idx] + (294.15 - grid.tempKelvin[idx]) * blend
      );
      grid.o2Ratio[idx] = Math.min(0.209, grid.o2Ratio[idx] + (0.209 - grid.o2Ratio[idx]) * blend);
      grid.toxicSmoke[idx] = Math.max(0, grid.toxicSmoke[idx] * (1 - 0.35 * dt));
    }
  }
  return totalPAdded;
}

export function applyEcsRepressurization(
  grid: CellularAtmosGrid,
  doors?: DoorState[],
  breaches?: string[],
  dtSeconds = 0.05
): number {
  const dt = Math.min(0.1, dtSeconds);
  const portals = collectActiveVentPortals(doors, breaches);
  const connections = getOpenRoomConnections(doors);
  let totalPAdded = 0;

  for (let z = 0; z < ZONE_DEFS.length; z++) {
    const zone = ZONE_DEFS[z];
    if (isSubRoomVentingToVacuum(zone.id, portals, connections)) continue;

    const rate = getZoneRepressurizeRate(zone.id);
    const indices = ZONE_CELL_INDICES[z];
    totalPAdded += repressurizeZoneCells(grid, indices, rate, dt);
  }

  const o2DrainedPercent = (totalPAdded / 81040) * 100 * 0.209;
  return Number(o2DrainedPercent.toFixed(4));
}

export function tickCellularAtmos(
  grid: CellularAtmosGrid,
  doors: DoorState[],
  breaches: string[],
  activeFires: string[],
  dtSeconds: number,
  partitionHoles?: Array<{ x: number; y: number; wallId: string }>
): CellularAtmosGrid {
  const dt = Math.min(0.1, dtSeconds);
  const doorOpenMap = createDoorOpenMap(doors);
  const { breachCells, ventSources } = applyVentSources(grid, breaches, doorOpenMap);
  const partitionHolePairs = buildPartitionHolePairs(partitionHoles);

  // Sync active room fires to grid
  for (const fireRoom of activeFires) {
    const room = HESPERIA_ROOMS.find((r) => r.id === fireRoom);
    if (room) {
      const fIdx = worldToIndex(room.x + room.width / 2, room.y + room.height / 2);
      if (fIdx !== -1 && grid.pressure[fIdx] > 20 && grid.o2Ratio[fIdx] > 0.1) {
        grid.isFireActive[fIdx] = 1;
      }
    }
  }

  tickCombustion(grid, dt);

  // Compressible flow & Sonic Rarefaction Wavefront Decompression
  propagateDecompressionWave(grid, ventSources, doorOpenMap, breachCells, dt, partitionHolePairs);

  // Fast inter-room pneumatic pressure equalization across open blast doors
  equalizeConnectedZones(grid, doorOpenMap, dt);

  // Multi-substep local equalization
  runCellularDiffusionSubsteps(grid, doorOpenMap, breachCells, dt, partitionHolePairs);

  // Automatic Environmental Control System (ECS) Repressurization
  const ecsDrain = applyEcsRepressurization(grid, doors, breaches, dt);
  grid.ecsDrainPercent = ecsDrain;

  // Velocity decay
  const vDecay = Math.max(0, 1 - 4.5 * dt);
  for (let i = 0; i < ATMOS_TOTAL_CELLS; i++) {
    grid.velX[i] *= vDecay;
    grid.velY[i] *= vDecay;
  }

  return grid;
}

export function sampleAtmosphereAt(grid: CellularAtmosGrid, x: number, y: number): CellAtmosphere {
  const idx = worldToIndex(x, y);
  if (idx === -1) {
    return {
      pressureKpa: 0,
      o2Percent: 0,
      co2Ppm: 0,
      tempCelsius: -270,
      toxicSmokePercent: 0,
      velX: 0,
      velY: 0,
      roomId: null,
      condensationPlume: 0,
    };
  }

  return {
    pressureKpa: Number(grid.pressure[idx].toFixed(1)),
    o2Percent: Number((grid.o2Ratio[idx] * 100).toFixed(1)),
    co2Ppm: Math.round(400 + grid.toxicSmoke[idx] * 8000),
    tempCelsius: Number((grid.tempKelvin[idx] - 273.15).toFixed(1)),
    toxicSmokePercent: Number((grid.toxicSmoke[idx] * 100).toFixed(1)),
    velX: Number(grid.velX[idx].toFixed(1)),
    velY: Number(grid.velY[idx].toFixed(1)),
    roomId: grid.cellRoomId[idx],
    condensationPlume: Number(grid.condensationPlume[idx].toFixed(2)),
  };
}

export function sampleAirflowVelocityAt(
  grid: CellularAtmosGrid,
  x: number,
  y: number
): { vx: number; vy: number } {
  const idx = worldToIndex(x, y);
  if (idx === -1) return { vx: 0, vy: 0 };
  return {
    vx: Number(grid.velX[idx].toFixed(2)),
    vy: Number(grid.velY[idx].toFixed(2)),
  };
}

interface VentPortal {
  roomId: string;
  x: number;
  y: number;
  kRate: number;
}

function getSubRoomId(roomId: string, x: number): string {
  if (roomId !== 'corridor') return roomId;
  if (x <= 440) return 'corridor_fwd';
  if (x < 760) return 'corridor_mid';
  return 'corridor_aft';
}

function addDoorVentPortals(doors: DoorState[] | undefined, portals: VentPortal[]): void {
  if (!doors) return;
  for (const d of doors) {
    if ((d.isAirlock || d.roomA === 'vacuum' || d.roomB === 'vacuum') && d.isOpen) {
      const rId = d.roomA !== 'vacuum' ? d.roomA : d.roomB;
      const midX = (d.x1 + d.x2) / 2;
      portals.push({
        roomId: getSubRoomId(rId, midX),
        x: midX,
        y: (d.y1 + d.y2) / 2,
        kRate: 25.0,
      });
    }
  }
}

function addBreachVentPortals(breaches: string[] | undefined, portals: VentPortal[]): void {
  if (!breaches) return;
  for (const breach of breaches) {
    const loc = getBreachLocation(breach);
    const isPuncture = breach.startsWith('puncture_');
    const rId = normalizeBreachRoomId(breach);
    const room = HESPERIA_ROOMS.find((r) => r.id === rId);
    const kRate = isPuncture ? 0.04 : 25.0;
    if (loc) {
      portals.push({
        roomId: getSubRoomId(rId, loc.x),
        x: loc.x,
        y: loc.y,
        kRate,
      });
    } else if (room) {
      const midX = rId === 'corridor' ? 130 : room.x + room.width / 2;
      const targetY = room.y > 368 ? room.y + room.height : room.y;
      portals.push({
        roomId: getSubRoomId(rId, midX),
        x: midX,
        y: targetY,
        kRate,
      });
    }
  }
}

function collectActiveVentPortals(doors?: DoorState[], breaches?: string[]): VentPortal[] {
  const portals: VentPortal[] = [];
  addDoorVentPortals(doors, portals);
  addBreachVentPortals(breaches, portals);
  return portals;
}

interface DoorConnection {
  targetRoom: string;
  doorX: number;
  doorY: number;
}

function getOpenRoomConnections(doors?: DoorState[]): Map<string, DoorConnection[]> {
  const map = new Map<string, DoorConnection[]>();
  const addConn = (rA: string, rB: string, x: number, y: number) => {
    if (!map.has(rA)) map.set(rA, []);
    if (!map.has(rB)) map.set(rB, []);
    map.get(rA)?.push({ targetRoom: rB, doorX: x, doorY: y });
    map.get(rB)?.push({ targetRoom: rA, doorX: x, doorY: y });
  };

  if (!doors) return map;
  for (const d of doors) {
    if (!d.isOpen || d.isAirlock) continue;
    const cx = (d.x1 + d.x2) / 2;
    const cy = (d.y1 + d.y2) / 2;

    if (d.id === 'door_spine_fwd') {
      addConn('corridor_fwd', 'corridor_mid', cx, cy);
    } else if (d.id === 'door_spine_aft') {
      addConn('corridor_mid', 'corridor_aft', cx, cy);
    } else {
      const subA = getSubRoomId(d.roomA, cx);
      const subB = getSubRoomId(d.roomB, cx);
      addConn(subA, subB, cx, cy);
    }
  }
  return map;
}

// fallow-ignore-next-line complexity
function findVentWaypoint(
  currentRoomId: string,
  px: number,
  py: number,
  portals: VentPortal[],
  connections: Map<string, DoorConnection[]>
): { targetX: number; targetY: number; kRate: number } | null {
  const direct = portals.filter((p) => p.roomId === currentRoomId);
  if (direct.length > 0) {
    let best = direct[0];
    let bestDist = Math.hypot(best.x - px, best.y - py);
    for (let i = 1; i < direct.length; i++) {
      const dist = Math.hypot(direct[i].x - px, direct[i].y - py);
      if (dist < bestDist) {
        best = direct[i];
        bestDist = dist;
      }
    }
    return { targetX: best.x, targetY: best.y, kRate: best.kRate };
  }

  const visited = new Set<string>([currentRoomId]);
  const queue: Array<{ roomId: string; firstDoor: { x: number; y: number } }> = [];
  const startConns = connections.get(currentRoomId) ?? [];
  for (const conn of startConns) {
    visited.add(conn.targetRoom);
    queue.push({ roomId: conn.targetRoom, firstDoor: { x: conn.doorX, y: conn.doorY } });
  }

  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) break;
    const match = portals.find((p) => p.roomId === item.roomId);
    if (match) {
      return { targetX: item.firstDoor.x, targetY: item.firstDoor.y, kRate: match.kRate };
    }
    for (const nc of connections.get(item.roomId) ?? []) {
      if (!visited.has(nc.targetRoom)) {
        visited.add(nc.targetRoom);
        queue.push({ roomId: nc.targetRoom, firstDoor: item.firstDoor });
      }
    }
  }

  return null;
}

export function getAirflowDragVector(
  x: number,
  y: number,
  doors?: DoorState[],
  breaches?: string[],
  roomAtmospheres?: Record<string, RoomAtmosphereSummary>
): { u: number; v: number } {
  const portals = collectActiveVentPortals(doors, breaches);
  if (portals.length === 0) return { u: 0, v: 0 };

  const room = findRoomForWorldPos(x, y);
  if (!room) return { u: 0, v: 0 };

  const summary = roomAtmospheres ? roomAtmospheres[room.id] : undefined;
  const currentP = summary ? summary.pressureKpa : 101.3;
  if (currentP <= 0.2) return { u: 0, v: 0 };

  const currentSubRoom = getSubRoomId(room.id, x);
  const connections = getOpenRoomConnections(doors);
  const waypoint = findVentWaypoint(currentSubRoom, x, y, portals, connections);
  if (!waypoint) return { u: 0, v: 0 };

  const dx = waypoint.targetX - x;
  const dy = waypoint.targetY - y;
  const dist = Math.hypot(dx, dy);
  if (dist < 2.0) return { u: 0, v: 0 };

  const baseSpeed = waypoint.kRate > 1.0 ? 220 : 45;
  const pressureFactor = Math.min(1.0, currentP / 75.0);
  const speed = baseSpeed * pressureFactor;

  return {
    u: Number(((dx / dist) * speed).toFixed(2)),
    v: Number(((dy / dist) * speed).toFixed(2)),
  };
}

export function isRoomVentingToVacuum(
  roomId: string,
  doors?: DoorState[],
  breaches?: string[]
): boolean {
  const portals = collectActiveVentPortals(doors, breaches);
  if (portals.length === 0) return false;

  const startRooms =
    roomId === 'corridor' ? ['corridor_fwd', 'corridor_mid', 'corridor_aft'] : [roomId];

  const connections = getOpenRoomConnections(doors);
  for (const start of startRooms) {
    if (isSubRoomVentingToVacuum(start, portals, connections)) return true;
  }

  return false;
}

function isSubRoomVentingToVacuum(
  roomId: string,
  portals: VentPortal[],
  connections: Map<string, DoorConnection[]>
): boolean {
  const visited = new Set<string>([roomId]);
  const queue: string[] = [roomId];

  while (queue.length > 0) {
    const currentRoomId = queue.shift();
    if (!currentRoomId) continue;
    if (portals.some((portal) => portal.roomId === currentRoomId)) return true;
    for (const connection of connections.get(currentRoomId) ?? []) {
      if (!visited.has(connection.targetRoom)) {
        visited.add(connection.targetRoom);
        queue.push(connection.targetRoom);
      }
    }
  }

  return false;
}

export function summarizeRoomAtmospheres(
  grid: CellularAtmosGrid,
  doors?: DoorState[],
  breaches?: string[]
): Record<string, RoomAtmosphereSummary> {
  const summary: Record<string, RoomAtmosphereSummary> = {};

  for (const r of HESPERIA_ROOMS) {
    let sumP = 0;
    let sumO2 = 0;
    let sumSmoke = 0;
    let sumT = 0;
    let count = 0;
    let activeFires = 0;

    const c1 = Math.floor(r.x / ATMOS_CELL_SIZE);
    const c2 = Math.ceil((r.x + r.width) / ATMOS_CELL_SIZE);
    const r1 = Math.floor(r.y / ATMOS_CELL_SIZE);
    const r2 = Math.ceil((r.y + r.height) / ATMOS_CELL_SIZE);

    for (let row = r1; row < r2; row++) {
      for (let col = c1; col < c2; col++) {
        const idx = cellCoordsToIndex(col, row);
        if (idx === -1 || grid.cellRoomId[idx] !== r.id) continue;
        sumP += grid.pressure[idx];
        sumO2 += grid.o2Ratio[idx];
        sumSmoke += grid.toxicSmoke[idx];
        sumT += grid.tempKelvin[idx];
        if (grid.isFireActive[idx]) activeFires++;
        count++;
      }
    }

    const rawAvgP = count > 0 ? sumP / count : 0;
    const avgP = rawAvgP < 1.5 ? 0 : rawAvgP;
    const rawAvgO2 = count > 0 ? (sumO2 / count) * 100 : 0;
    const avgO2 = avgP === 0 || rawAvgO2 < 0.5 ? 0 : rawAvgO2;
    const avgSmoke = count > 0 ? sumSmoke / count : 0;
    const avgT = count > 0 ? sumT / count : 294.15;

    const isVenting = isRoomVentingToVacuum(r.id, doors, breaches) && rawAvgP > 0.5;
    const isRepressurizing =
      !isVenting && avgP < 100.5 && !isRoomVentingToVacuum(r.id, doors, breaches);
    const activeBreaches = breaches
      ? breaches.filter(
          (b) => b === r.id || b === `puncture_${r.id}` || b.startsWith(`puncture_${r.id}_`)
        ).length
      : 0;

    summary[r.id] = {
      roomId: r.id,
      pressureKpa: Number(avgP.toFixed(1)),
      o2Percent: Number(avgO2.toFixed(1)),
      co2Ppm: Math.round(400 + avgSmoke * 8000),
      tempCelsius: Number((avgT - 273.15).toFixed(1)),
      toxicSmokePercent: Number((avgSmoke * 100).toFixed(1)),
      isVenting,
      isRepressurizing,
      activeFires,
      activeBreaches,
    };
  }

  const portals = collectActiveVentPortals(doors, breaches);
  const connections = getOpenRoomConnections(doors);
  for (let zoneIndex = 0; zoneIndex < ZONE_DEFS.length; zoneIndex++) {
    const zone = ZONE_DEFS[zoneIndex];
    if (zone.id === zone.roomId) continue;

    const indices = ZONE_CELL_INDICES[zoneIndex];
    let sumP = 0;
    let sumO2 = 0;
    let sumSmoke = 0;
    let sumT = 0;
    let activeFires = 0;

    for (const idx of indices) {
      sumP += grid.pressure[idx];
      sumO2 += grid.o2Ratio[idx];
      sumSmoke += grid.toxicSmoke[idx];
      sumT += grid.tempKelvin[idx];
      if (grid.isFireActive[idx]) activeFires++;
    }

    const count = indices.length;
    const rawAvgP = sumP / count;
    const avgP = rawAvgP < 1.5 ? 0 : rawAvgP;
    const rawAvgO2 = (sumO2 / count) * 100;
    const avgO2 = avgP === 0 || rawAvgO2 < 0.5 ? 0 : rawAvgO2;
    const avgSmoke = sumSmoke / count;
    const avgT = sumT / count;
    const isSubVenting = isSubRoomVentingToVacuum(zone.id, portals, connections);

    summary[zone.id] = {
      roomId: zone.id,
      pressureKpa: Number(avgP.toFixed(1)),
      o2Percent: Number(avgO2.toFixed(1)),
      co2Ppm: Math.round(400 + avgSmoke * 8000),
      tempCelsius: Number((avgT - 273.15).toFixed(1)),
      toxicSmokePercent: Number((avgSmoke * 100).toFixed(1)),
      isVenting: isSubVenting && rawAvgP > 0.5,
      isRepressurizing: !isSubVenting && avgP < 100.5,
      activeFires,
      activeBreaches: zone.id === 'corridor_fwd' && breaches?.includes('corridor') ? 1 : 0,
    };
  }

  return summary;
}

export function getO2OverlayColor(o2: number): [number, number, number, number] {
  if (o2 < 1.0) return [0.35, 0.05, 0.45, 0.55];
  if (o2 < 15.0) return [0.95, 0.15, 0.2, 0.5];
  if (o2 < 19.5) return [0.95, 0.7, 0.1, 0.38];
  return [0.0, 0.85, 0.7, 0.28];
}

export function getTempOverlayColor(temp: number): [number, number, number, number] {
  if (temp < 0) return [0.1, 0.6, 1.0, 0.48];
  if (temp < 17) return [0.1, 0.8, 0.9, 0.32];
  if (temp <= 25) return [0.1, 0.85, 0.4, 0.25];
  if (temp <= 45) return [0.95, 0.65, 0.1, 0.38];
  return [1.0, 0.2, 0.1, 0.55];
}

export function getPressureOverlayColor(pressure: number): [number, number, number, number] {
  if (pressure < 20) return [0.35, 0.15, 0.55, 0.5];
  if (pressure < 75) return [0.1, 0.5, 0.85, 0.38];
  if (pressure <= 105) return [0.0, 0.85, 0.7, 0.25];
  return [0.8, 0.2, 0.9, 0.45];
}

export function getAtmosOverlayColor(
  mode: AtmosOverlayMode,
  summary?: RoomAtmosphereSummary
): [number, number, number, number] {
  if (mode === 'o2') {
    return getO2OverlayColor(summary?.o2Percent ?? 20.9);
  }
  if (mode === 'temp') {
    return getTempOverlayColor(summary?.tempCelsius ?? 21.0);
  }
  if (mode === 'pressure') {
    return getPressureOverlayColor(summary?.pressureKpa ?? 101.3);
  }
  return [0, 0, 0, 0];
}

export function formatAtmosOverlayValue(
  mode: AtmosOverlayMode,
  summary?: RoomAtmosphereSummary
): string {
  if (mode === 'o2') {
    return `${(summary?.o2Percent ?? 20.9).toFixed(1)}% O₂`;
  }
  if (mode === 'temp') {
    return `${(summary?.tempCelsius ?? 21.0).toFixed(1)}°C`;
  }
  if (mode === 'pressure') {
    return `${(summary?.pressureKpa ?? 101.3).toFixed(1)} kPa`;
  }
  return '';
}

export interface DecompressionAirflowSource {
  x: number;
  y: number;
  u: number;
  v: number;
  intensity: number;
}

function getRoomPressure(
  roomId: string,
  atmospheres?: Record<string, RoomAtmosphereSummary>
): number {
  if (!atmospheres) return 101.3;
  if (atmospheres[roomId]) return atmospheres[roomId].pressureKpa;
  if (roomId === 'corridor') {
    const fwd = atmospheres.corridor_fwd?.pressureKpa;
    const mid = atmospheres.corridor_mid?.pressureKpa;
    const aft = atmospheres.corridor_aft?.pressureKpa;
    if (fwd !== undefined || mid !== undefined || aft !== undefined) {
      return Math.max(fwd ?? 0, mid ?? 0, aft ?? 0);
    }
  }
  return 101.3;
}

function getOpenNeighborId(door: DoorState, roomId: string): string | null {
  if (!door.isOpen) return null;
  if (door.roomA === roomId && door.roomB !== 'vacuum') return door.roomB;
  if (door.roomB === roomId && door.roomA !== 'vacuum') return door.roomA;
  return null;
}

function getConnectedVentingPressure(
  roomId: string,
  doors: DoorState[],
  atmospheres?: Record<string, RoomAtmosphereSummary>
): number {
  let pressure = getRoomPressure(roomId, atmospheres);
  if (pressure > 0.5 || !atmospheres) return pressure;

  for (const d of doors) {
    const neighbor = getOpenNeighborId(d, roomId);
    if (neighbor) {
      pressure = Math.max(pressure, getRoomPressure(neighbor, atmospheres));
    }
  }
  return pressure;
}

function getRoomCenter(roomId: string, nearX: number, nearY: number): { x: number; y: number } {
  if (roomId === 'corridor') {
    return { x: nearX, y: 400 };
  }
  const room = HESPERIA_ROOMS.find((r) => r.id === roomId);
  return room
    ? { x: room.x + room.width / 2, y: room.y + room.height / 2 }
    : { x: nearX, y: nearY };
}

function getInternalDoorAirflowSource(
  door: DoorState,
  atmospheres?: Record<string, RoomAtmosphereSummary>
): DecompressionAirflowSource | undefined {
  if (!door.isOpen || door.roomA === 'vacuum' || door.roomB === 'vacuum') return undefined;

  const pA = getRoomPressure(door.roomA, atmospheres);
  const pB = getRoomPressure(door.roomB, atmospheres);
  const deltaP = Math.abs(pA - pB);
  if (deltaP < 10.0 || Math.min(pA, pB) > 40.0) return undefined;

  const highRoom = pA > pB ? door.roomA : door.roomB;
  const lowRoom = pA > pB ? door.roomB : door.roomA;
  const midX = (door.x1 + door.x2) / 2;
  const midY = (door.y1 + door.y2) / 2;

  const highCenter = getRoomCenter(highRoom, midX, midY);
  const lowCenter = getRoomCenter(lowRoom, midX, midY);

  const len = Math.hypot(lowCenter.x - highCenter.x, lowCenter.y - highCenter.y);
  if (len < 0.001) return undefined;

  const dirX = (lowCenter.x - highCenter.x) / len;
  const dirY = (lowCenter.y - highCenter.y) / len;
  const pressureRatio = Math.min(1.0, deltaP / 101.3);
  const ventSpeed = 160 + 140 * pressureRatio;

  return {
    x: midX,
    y: midY,
    u: dirX * ventSpeed,
    v: dirY * ventSpeed,
    intensity: pressureRatio,
  };
}

function createAirflowSource(
  roomId: string,
  openingX: number,
  openingY: number,
  pressureKpa: number
): DecompressionAirflowSource | undefined {
  if (pressureKpa <= 0.5) return undefined;
  const room = HESPERIA_ROOMS.find((candidate) => candidate.id === roomId);
  if (!room) return undefined;

  const deltaX = openingX - (room.x + room.width / 2);
  const deltaY = openingY - (room.y + room.height / 2);
  const distance = Math.hypot(deltaX, deltaY);
  if (distance === 0) return undefined;

  const pressureRatio = Math.min(1.0, pressureKpa / 101.3);
  const ventSpeed = 160 + 140 * pressureRatio;
  const dirX = deltaX / distance;
  const dirY = deltaY / distance;

  return {
    x: openingX - dirX * 24,
    y: openingY - dirY * 24,
    u: dirX * ventSpeed,
    v: dirY * ventSpeed,
    intensity: pressureRatio,
  };
}

function getDoorAirflowSource(
  door: DoorState,
  doors: DoorState[],
  atmospheres?: Record<string, RoomAtmosphereSummary>
): DecompressionAirflowSource | undefined {
  if (!door.isOpen) return undefined;
  if (door.roomA === 'vacuum' || door.roomB === 'vacuum') {
    const roomId = door.roomA === 'vacuum' ? door.roomB : door.roomA;
    const pressure = getConnectedVentingPressure(roomId, doors, atmospheres);
    return createAirflowSource(roomId, (door.x1 + door.x2) / 2, (door.y1 + door.y2) / 2, pressure);
  }
  return getInternalDoorAirflowSource(door, atmospheres);
}

function getBreachCoordinates(
  breach: string,
  room: { x: number; y: number; width: number; height: number }
): { x: number; y: number } {
  const loc = getBreachLocation(breach);
  if (loc) {
    return { x: loc.x, y: loc.y };
  }
  const roomId = normalizeBreachRoomId(breach);
  if (roomId === 'corridor') {
    return { x: room.x, y: room.y + room.height / 2 };
  }
  const openingY = room.y < 368 ? room.y : room.y + room.height;
  return { x: room.x + room.width / 2, y: openingY };
}

function getBreachAirflowSource(
  breach: string,
  doors: DoorState[],
  atmospheres?: Record<string, RoomAtmosphereSummary>
): DecompressionAirflowSource | undefined {
  const roomId = normalizeBreachRoomId(breach);
  const room = HESPERIA_ROOMS.find((c) => c.id === roomId);
  if (!room) return undefined;
  const pressure = getConnectedVentingPressure(roomId, doors, atmospheres);
  if (pressure <= 0.5) return undefined;

  const loc = getBreachLocation(breach);
  const pressureRatio = Math.min(1.0, pressure / 101.3);
  const ventSpeed = 160 + 140 * pressureRatio;

  if (loc) {
    const dirX = loc.normalX;
    const dirY = loc.normalY;
    return {
      x: loc.x - dirX * 4,
      y: loc.y - dirY * 4,
      u: dirX * ventSpeed,
      v: dirY * ventSpeed,
      intensity: pressureRatio,
    };
  }

  const { x, y } = getBreachCoordinates(breach, room);
  return createAirflowSource(roomId, x, y, pressure);
}

export function getDecompressionAirflowSources(
  doors: DoorState[],
  breaches: string[] | undefined,
  atmospheres?: Record<string, RoomAtmosphereSummary>
): DecompressionAirflowSource[] {
  const sources: DecompressionAirflowSource[] = [];
  for (const door of doors) {
    const s = getDoorAirflowSource(door, doors, atmospheres);
    if (s) sources.push(s);
  }
  for (const breach of breaches ?? []) {
    const s = getBreachAirflowSource(breach, doors, atmospheres);
    if (s) sources.push(s);
  }
  return sources;
}
