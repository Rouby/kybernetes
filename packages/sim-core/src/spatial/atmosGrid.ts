import type { AtmosOverlayMode, DoorState, RoomAtmosphereSummary } from '@kybernetes/protocol';
import { HESPERIA_ROOMS, type RoomDefinition } from './deck';

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
  const actualRoomId = isPuncture ? breachRoomId.replace('puncture_', '') : breachRoomId;
  const room = HESPERIA_ROOMS.find((r) => r.id === actualRoomId);
  if (!room) return;

  const kRate = isPuncture ? 0.04 : 25.0;
  const col = Math.floor((room.x + room.width / 2) / ATMOS_CELL_SIZE);
  let r = 11;
  let c = col;
  if (actualRoomId === 'corridor') {
    r = 19;
    c = 6;
  } else if (room.y > 368) {
    r = 28;
  }

  const c1 = isPuncture ? c : c - 1;
  const c2 = isPuncture ? c : c + 1;
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

function canDiffuse(
  grid: CellularAtmosGrid,
  i: number,
  j: number,
  doorOpenMap: Record<string, boolean>,
  breachCells: Set<number>
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
  dirY: number
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

  const boost = Math.min(24.0, Math.abs(pDiff) * 0.3);
  const flowRate = (8.0 + boost) * dt;
  const pTransfer = Math.max(-50, Math.min(50, pDiff * flowRate));

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
    const vMag = pTransfer * 10.0;
    grid.velX[i] += dirX * vMag;
    grid.velY[i] += dirY * vMag;
    grid.velX[j] += dirX * vMag;
    grid.velY[j] += dirY * vMag;
  }

  // Advection of O2, smoke, temp
  const gasRatioDiff = grid.o2Ratio[i] - grid.o2Ratio[j];
  grid.o2Ratio[i] -= gasRatioDiff * flowRate * 0.4;
  grid.o2Ratio[j] += gasRatioDiff * flowRate * 0.4;

  const smokeDiff = grid.toxicSmoke[i] - grid.toxicSmoke[j];
  grid.toxicSmoke[i] -= smokeDiff * flowRate * 0.4;
  grid.toxicSmoke[j] += smokeDiff * flowRate * 0.4;

  const tempDiff = grid.tempKelvin[i] - grid.tempKelvin[j];
  grid.tempKelvin[i] -= tempDiff * flowRate * 0.25;
  grid.tempKelvin[j] += tempDiff * flowRate * 0.25;
}

// fallow-ignore-next-line complexity
function propagateDecompressionWave(
  grid: CellularAtmosGrid,
  ventSources: VentSourceInfo[],
  doorOpenMap: Record<string, boolean>,
  breachCells: Set<number>,
  dt: number
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

  const visited = new Uint8Array(ATMOS_TOTAL_CELLS);
  const queueCol = new Int16Array(ATMOS_TOTAL_CELLS);
  const queueRow = new Int16Array(ATMOS_TOTAL_CELLS);
  const queueVentCol = new Int16Array(ATMOS_TOTAL_CELLS);
  const queueVentRow = new Int16Array(ATMOS_TOTAL_CELLS);
  const queueRate = new Float32Array(ATMOS_TOTAL_CELLS);
  let head = 0;
  let tail = 0;

  for (const vs of ventSources) {
    if (visited[vs.idx] === 0) {
      visited[vs.idx] = 1;
      queueCol[tail] = vs.col;
      queueRow[tail] = vs.row;
      queueVentCol[tail] = vs.col;
      queueVentRow[tail] = vs.row;
      queueRate[tail] = vs.kRate;
      tail++;
    }
  }

  while (head < tail) {
    const c = queueCol[head];
    const r = queueRow[head];
    const vCol = queueVentCol[head];
    const vRow = queueVentRow[head];
    const kRate = queueRate[head];
    const idx = cellCoordsToIndex(c, r);
    head++;

    if (idx === -1) continue;

    if (grid.cellRoomId[idx] !== null) {
      const pCurrent = grid.pressure[idx];
      if (pCurrent > 0.05) {
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
          const pullSpeed = Math.min(320, 30.0 + pCurrent * 2.2);
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
      } else {
        grid.condensationPlume[idx] = Math.max(0, grid.condensationPlume[idx] - 1.5 * dt);
      }
    }

    const neighbors = [
      { col: c + 1, row: r },
      { col: c - 1, row: r },
      { col: c, row: r + 1 },
      { col: c, row: r - 1 },
    ];

    for (const nb of neighbors) {
      const nIdx = cellCoordsToIndex(nb.col, nb.row);
      if (nIdx !== -1 && visited[nIdx] === 0) {
        if (canDiffuse(grid, idx, nIdx, doorOpenMap, breachCells)) {
          visited[nIdx] = 1;
          queueCol[tail] = nb.col;
          queueRow[tail] = nb.row;
          queueVentCol[tail] = vCol;
          queueVentRow[tail] = vRow;
          queueRate[tail] = kRate;
          tail++;
        }
      }
    }
  }

  for (let i = 0; i < ATMOS_TOTAL_CELLS; i++) {
    if (visited[i] === 0 && grid.condensationPlume[i] > 0) {
      grid.condensationPlume[i] = Math.max(0, grid.condensationPlume[i] - 1.5 * dt);
    }
  }
}

function runCellularDiffusionSubsteps(
  grid: CellularAtmosGrid,
  doorOpenMap: Record<string, boolean>,
  breachCells: Set<number>,
  dt: number
): void {
  const SUB_STEPS = 2;
  const subDt = dt / SUB_STEPS;

  for (let step = 0; step < SUB_STEPS; step++) {
    for (let r = 0; r < ATMOS_GRID_ROWS; r++) {
      for (let c = 0; c < ATMOS_GRID_COLS - 1; c++) {
        const i = cellCoordsToIndex(c, r);
        const j = cellCoordsToIndex(c + 1, r);
        if (!canDiffuse(grid, i, j, doorOpenMap, breachCells)) continue;
        diffusePair(grid, i, j, subDt, 1, 0);
      }
    }

    for (let r = 0; r < ATMOS_GRID_ROWS - 1; r++) {
      for (let c = 0; c < ATMOS_GRID_COLS; c++) {
        const i = cellCoordsToIndex(c, r);
        const j = cellCoordsToIndex(c, r + 1);
        if (!canDiffuse(grid, i, j, doorOpenMap, breachCells)) continue;
        diffusePair(grid, i, j, subDt, 0, 1);
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

export function tickCellularAtmos(
  grid: CellularAtmosGrid,
  doors: DoorState[],
  breaches: string[],
  activeFires: string[],
  dtSeconds: number
): CellularAtmosGrid {
  const dt = Math.min(0.1, dtSeconds);
  const doorOpenMap = createDoorOpenMap(doors);
  const { breachCells, ventSources } = applyVentSources(grid, breaches, doorOpenMap);

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
  propagateDecompressionWave(grid, ventSources, doorOpenMap, breachCells, dt);

  // Fast inter-room pneumatic pressure equalization across open blast doors
  equalizeConnectedZones(grid, doorOpenMap, dt);

  // Multi-substep local equalization
  runCellularDiffusionSubsteps(grid, doorOpenMap, breachCells, dt);

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

function collectActiveVentPortals(doors?: DoorState[], breaches?: string[]): VentPortal[] {
  const portals: VentPortal[] = [];
  if (doors) {
    for (const d of doors) {
      if ((d.isAirlock || d.roomA === 'vacuum' || d.roomB === 'vacuum') && d.isOpen) {
        portals.push({
          roomId: d.roomA !== 'vacuum' ? d.roomA : d.roomB,
          x: (d.x1 + d.x2) / 2,
          y: (d.y1 + d.y2) / 2,
          kRate: 25.0,
        });
      }
    }
  }
  if (breaches) {
    for (const breach of breaches) {
      const isPuncture = breach.startsWith('puncture_');
      const rId = isPuncture ? breach.replace('puncture_', '') : breach;
      const room = HESPERIA_ROOMS.find((r) => r.id === rId);
      if (room) {
        portals.push({
          roomId: rId,
          x: room.x + room.width / 2,
          y: room.y + 10,
          kRate: isPuncture ? 0.04 : 25.0,
        });
      }
    }
  }
  return portals;
}

interface DoorConnection {
  targetRoom: string;
  doorX: number;
  doorY: number;
}

function getOpenRoomConnections(doors?: DoorState[]): Map<string, DoorConnection[]> {
  const map = new Map<string, DoorConnection[]>();
  if (!doors) return map;
  for (const d of doors) {
    if (!d.isOpen || d.isAirlock) continue;
    const cx = (d.x1 + d.x2) / 2;
    const cy = (d.y1 + d.y2) / 2;
    if (!map.has(d.roomA)) map.set(d.roomA, []);
    if (!map.has(d.roomB)) map.set(d.roomB, []);
    map.get(d.roomA)?.push({ targetRoom: d.roomB, doorX: cx, doorY: cy });
    map.get(d.roomB)?.push({ targetRoom: d.roomA, doorX: cx, doorY: cy });
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

  const connections = getOpenRoomConnections(doors);
  const waypoint = findVentWaypoint(room.id, x, y, portals, connections);
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
  if (portals.some((p) => p.roomId === roomId)) return true;

  const connections = getOpenRoomConnections(doors);
  const visited = new Set<string>([roomId]);
  const queue: string[] = [roomId];

  while (queue.length > 0) {
    const curr = queue.shift();
    if (!curr) break;
    if (portals.some((p) => p.roomId === curr)) return true;
    for (const conn of connections.get(curr) ?? []) {
      if (!visited.has(conn.targetRoom)) {
        visited.add(conn.targetRoom);
        queue.push(conn.targetRoom);
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
    const activeBreaches = breaches
      ? breaches.filter((b) => b === r.id || b === `puncture_${r.id}`).length
      : 0;

    summary[r.id] = {
      roomId: r.id,
      pressureKpa: Number(avgP.toFixed(1)),
      o2Percent: Number(avgO2.toFixed(1)),
      co2Ppm: Math.round(400 + avgSmoke * 8000),
      tempCelsius: Number((avgT - 273.15).toFixed(1)),
      toxicSmokePercent: Number((avgSmoke * 100).toFixed(1)),
      isVenting,
      activeFires,
      activeBreaches,
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
