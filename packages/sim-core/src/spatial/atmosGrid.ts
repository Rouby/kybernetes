import type { AtmosOverlayMode, DoorState, RoomAtmosphereSummary } from '@kybernetes/protocol';
import {
  buildCompartmentGraph,
  COMPARTMENT_DEFS,
  type CompartmentState,
  type CompartmentTickResult,
  tickCompartments,
} from './atmosPhysics';
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

function readCompartmentsFromCells(grid: CellularAtmosGrid): CompartmentState[] {
  return COMPARTMENT_DEFS.map((_def, z) => {
    const indices = ZONE_CELL_INDICES[z];
    let sumP = 0;
    let sumT = 0;
    let sumO2 = 0;
    let sumSmoke = 0;
    for (const idx of indices) {
      sumP += grid.pressure[idx];
      sumT += grid.tempKelvin[idx];
      sumO2 += grid.o2Ratio[idx];
      sumSmoke += grid.toxicSmoke[idx];
    }
    const count = Math.max(1, indices.length);
    return {
      pressurePa: Math.max(0, (sumP / count) * 1000),
      tempK: Math.max(3, sumT / count),
      o2Frac: Math.max(0, Math.min(1, sumO2 / count)),
      co2Frac: Math.max(0, Math.min(1, sumSmoke / count)),
    };
  });
}

function zoneCenterWorld(z: number): { x: number; y: number } {
  const def = COMPARTMENT_DEFS[z];
  return {
    x: ((def.c1 + def.c2 + 1) * ATMOS_CELL_SIZE) / 2,
    y: ((def.r1 + def.r2 + 1) * ATMOS_CELL_SIZE) / 2,
  };
}

// fallow-ignore-next-line complexity
function writeCompartmentResults(
  grid: CellularAtmosGrid,
  results: CompartmentTickResult[],
  doors: DoorState[] | undefined,
  breaches: string[] | undefined,
  dt: number
): void {
  const portals = collectActiveVentPortals(doors, breaches);
  const connections = getOpenRoomConnections(doors);
  for (let z = 0; z < COMPARTMENT_DEFS.length; z++) {
    const res = results[z];
    const def = COMPARTMENT_DEFS[z];
    const indices = ZONE_CELL_INDICES[z];
    const pKpa = res.pressurePa / 1000;
    const ventingFast = res.dpdtPaPerS < -3000 && pKpa > 0.5;
    let velX = 0;
    let velY = 0;
    if (ventingFast && portals.length > 0) {
      const center = zoneCenterWorld(z);
      const route = findVentWaypoint(def.id, center.x, center.y, portals, connections);
      const next = route ? (route.points[0] ?? route.portal) : null;
      if (next) {
        const dx = next.x - center.x;
        const dy = next.y - center.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 2) {
          const ventFactor = Math.min(1, Math.abs(res.dpdtPaPerS) / 50000);
          const speed = Math.min(320, 40 + pKpa * 2.5) * ventFactor;
          velX = (dx / dist) * speed;
          velY = (dy / dist) * speed;
        }
      }
    }
    const plumeUp = res.dpdtPaPerS < -15000 && pKpa > 12;
    for (const idx of indices) {
      if (grid.cellRoomId[idx] === null) continue;
      grid.pressure[idx] = pKpa;
      grid.tempKelvin[idx] = res.tempK;
      grid.o2Ratio[idx] = res.o2Frac;
      grid.toxicSmoke[idx] = res.co2Frac;
      grid.velX[idx] = velX;
      grid.velY[idx] = velY;
      if (plumeUp) {
        grid.condensationPlume[idx] = Math.min(1, grid.condensationPlume[idx] + 0.9);
      } else {
        grid.condensationPlume[idx] = Math.max(0, grid.condensationPlume[idx] - 1.5 * dt);
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
          const hash = ((n * 2654435761) >>> 0) % 1000;
          if (grid.tempKelvin[n] > 480 && hash < 1000 * Math.min(1, dt * 2)) {
            grid.isFireActive[n] = 1;
          }
        }
      }
    }
  }
}

function initZoneCellIndices(): number[][] {
  const list: number[][] = [];
  for (let z = 0; z < COMPARTMENT_DEFS.length; z++) {
    const def = COMPARTMENT_DEFS[z];
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

  for (let z = 0; z < COMPARTMENT_DEFS.length; z++) {
    const zone = COMPARTMENT_DEFS[z];
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

  // Compartment orifice model: venting to vacuum plus interior equalization.
  // Mass-conserving isentropic flow replaces the legacy wavefront/diffusion passes.
  const graph = buildCompartmentGraph(doors, breaches, partitionHoles);
  const inputs = readCompartmentsFromCells(grid);
  const results = tickCompartments(inputs, graph, dt);
  writeCompartmentResults(grid, results, doors, breaches, dt);

  tickCombustion(grid, dt);

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

  const isVacuum = grid.pressure[idx] < 1.5;
  return {
    pressureKpa: Number(grid.pressure[idx].toFixed(1)),
    o2Percent: isVacuum ? 0 : Number((grid.o2Ratio[idx] * 100).toFixed(1)),
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
  nx: number;
  ny: number;
}

function portalOutwardNormal(
  midX: number,
  midY: number,
  centerX: number,
  centerY: number,
  fallbackX: number,
  fallbackY: number
): { nx: number; ny: number } {
  const dx = midX - centerX;
  const dy = midY - centerY;
  const len = Math.hypot(dx, dy);
  if (len > 0.01) return { nx: dx / len, ny: dy / len };
  return { nx: fallbackX, ny: fallbackY };
}

function roomCenterForPortal(roomId: string, midX: number): { x: number; y: number } {
  if (roomId === 'corridor' || roomId.startsWith('corridor_')) return { x: midX, y: 400 };
  const room = HESPERIA_ROOMS.find((r) => r.id === roomId);
  if (!room) return { x: midX, y: 400 };
  return { x: room.x + room.width / 2, y: room.y + room.height / 2 };
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
      const midY = (d.y1 + d.y2) / 2;
      const center = roomCenterForPortal(rId, midX);
      const normal = portalOutwardNormal(midX, midY, center.x, center.y, 0, -1);
      portals.push({
        roomId: getSubRoomId(rId, midX),
        x: midX,
        y: midY,
        kRate: 25.0,
        nx: normal.nx,
        ny: normal.ny,
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
        nx: loc.normalX,
        ny: loc.normalY,
      });
    } else if (room) {
      const midX = rId === 'corridor' ? 130 : room.x + room.width / 2;
      const targetY = room.y > 368 ? room.y + room.height : room.y;
      const center = roomCenterForPortal(rId, midX);
      const normal = portalOutwardNormal(
        midX,
        targetY,
        center.x,
        center.y,
        0,
        targetY < center.y ? -1 : 1
      );
      portals.push({
        roomId: getSubRoomId(rId, midX),
        x: midX,
        y: targetY,
        kRate,
        nx: normal.nx,
        ny: normal.ny,
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

interface VentRoute {
  points: Array<{ x: number; y: number }>;
  portal: VentPortal;
}

function nearestPortal(portals: VentPortal[], px: number, py: number): VentPortal {
  let best = portals[0];
  let bestDist = Math.hypot(best.x - px, best.y - py);
  for (let i = 1; i < portals.length; i++) {
    const dist = Math.hypot(portals[i].x - px, portals[i].y - py);
    if (dist < bestDist) {
      best = portals[i];
      bestDist = dist;
    }
  }
  return best;
}

// fallow-ignore-next-line complexity
function findVentWaypoint(
  currentRoomId: string,
  px: number,
  py: number,
  portals: VentPortal[],
  connections: Map<string, DoorConnection[]>
): VentRoute | null {
  const direct = portals.filter((p) => p.roomId === currentRoomId);
  if (direct.length > 0) {
    return { points: [], portal: nearestPortal(direct, px, py) };
  }

  const visited = new Set<string>([currentRoomId]);
  const queue: Array<{ roomId: string; path: Array<{ x: number; y: number }> }> = [];
  const startConns = connections.get(currentRoomId) ?? [];
  for (const conn of startConns) {
    visited.add(conn.targetRoom);
    queue.push({ roomId: conn.targetRoom, path: [{ x: conn.doorX, y: conn.doorY }] });
  }

  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) break;
    const match = portals.find((p) => p.roomId === item.roomId);
    if (match) {
      return { points: item.path, portal: match };
    }
    for (const nc of connections.get(item.roomId) ?? []) {
      if (!visited.has(nc.targetRoom)) {
        visited.add(nc.targetRoom);
        queue.push({
          roomId: nc.targetRoom,
          path: [...item.path, { x: nc.doorX, y: nc.doorY }],
        });
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
  const route = findVentWaypoint(currentSubRoom, x, y, portals, connections);
  if (!route) return { u: 0, v: 0 };

  // Follow the route past doors the pawn already reached: flow never stalls inside a doorway.
  const ARRIVAL_RADIUS = 8;
  let targetX = route.portal.x;
  let targetY = route.portal.y;
  for (const point of route.points) {
    if (Math.hypot(point.x - x, point.y - y) > ARRIVAL_RADIUS) {
      targetX = point.x;
      targetY = point.y;
      break;
    }
    targetX = route.portal.x;
    targetY = route.portal.y;
  }

  let dx = targetX - x;
  let dy = targetY - y;
  let dist = Math.hypot(dx, dy);
  if (dist < 2.0) {
    // Pawn sits on the vent itself: push along the opening's outward normal.
    dx = route.portal.nx * 40;
    dy = route.portal.ny * 40;
    dist = Math.hypot(dx, dy);
    if (dist < 2.0) return { u: 0, v: 0 };
  }

  const baseSpeed = route.portal.kRate > 1.0 ? 220 : 45;
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
  for (let zoneIndex = 0; zoneIndex < COMPARTMENT_DEFS.length; zoneIndex++) {
    const zone = COMPARTMENT_DEFS[zoneIndex];
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
