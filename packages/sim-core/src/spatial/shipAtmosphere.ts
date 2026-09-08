/** @deprecated Legacy compartment air model — frozen. The world air authority
 * (world/airAuthority.ts, one air-sim sim per frame bound to the portal table)
 * is the only air truth from M4 on. Deletion with state.ts in M5. */
import {
  AtmosphereSimulation,
  type DragResult,
  GasType,
  Portal,
  PortalType,
  R_GAS,
  Room,
} from '@kybernetes/air-sim';
import type { DoorState, RoomAtmosphereSummary } from '@kybernetes/protocol';
import {
  type DockFrameOffset,
  findWorldRoom,
  getBreachLocation,
  HESPERIA_ROOMS,
  isShipSideRoom,
  isStationRoom,
  normalizeBreachRoomId,
  toShipLocal,
} from './deck';
import { createInitialDoors } from './doors';

export const PX_METERS = 0.05;
export const DECK_HEIGHT_M = 2.6;
export const STANDARD_PRESSURE_PA = 101325;
export const STANDARD_TEMP_K = 294.15;
export const STANDARD_O2_FRAC = 0.209;
export const STANDARD_CO2_FRAC = 0.0004;
export const FULL_BREACH_AREA_M2 = 1.0;
export const PUNCTURE_AREA_M2 = Math.PI * 0.02 * 0.02;
export const PARTITION_HOLE_AREA_M2 = PUNCTURE_AREA_M2;
export const DOOR_HEIGHT_M = 2.0;
export const VENT_PRESSURE_FLOOR_KPA = 0.5;

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

export interface ProbeReading {
  roomId: string;
  xM: number;
  yM: number;
  windXMps: number;
  windYMps: number;
  forceN: number;
  dynamicPressurePa: number;
}

export interface ShipAirState {
  hullId: string;
  sim: AtmosphereSimulation;
  smoke: Record<string, number>;
  probeReadings: Record<string, ProbeReading>;
}

export interface AirSuction {
  roomId: string;
  targetX: number;
  targetY: number;
  strength: number;
}

export interface ShipAirTickResult {
  summaries: Record<string, RoomAtmosphereSummary>;
  ventedRooms: string[];
  suctions: AirSuction[];
  ecsDrainPercent: number;
  survivingFires: string[];
}

export interface HullRoomRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface HullTopology {
  hullId: string;
  kind: 'vessel' | 'station';
  rooms: HullRoomRect[];
  aggregates?: Array<{ id: string; parts: string[] }>;
  links?: Record<string, [string, string]>;
  staticPortals?: Array<{ id: string; a: string; b: string; widthM: number }>;
}

const CORRIDOR_THIRDS: HullRoomRect[] = [
  { id: 'corridor_fwd', x: 120, y: 368, w: 320, h: 64 },
  { id: 'corridor_mid', x: 440, y: 368, w: 320, h: 64 },
  { id: 'corridor_aft', x: 760, y: 368, w: 260, h: 64 },
];

function deckRect(id: string): HullRoomRect {
  const def = HESPERIA_ROOMS.find((r) => r.id === id);
  if (!def) return { id, x: 0, y: 0, w: 100, h: 100 };
  return { id, x: def.x, y: def.y, w: def.width, h: def.height };
}

export const HESPERIA_TOPOLOGY: HullTopology = {
  hullId: 'hesperia',
  kind: 'vessel',
  rooms: [
    ...HESPERIA_ROOMS.filter((r) => isShipSideRoom(r.id) && r.id !== 'corridor').map((r) =>
      deckRect(r.id)
    ),
    ...CORRIDOR_THIRDS,
  ],
  aggregates: [{ id: 'corridor', parts: ['corridor_fwd', 'corridor_mid', 'corridor_aft'] }],
  links: {
    door_spine_fwd: ['corridor_fwd', 'corridor_mid'],
    door_spine_aft: ['corridor_mid', 'corridor_aft'],
  },
};

export const STATION_TOPOLOGY: HullTopology = {
  hullId: 'station',
  kind: 'station',
  rooms: HESPERIA_ROOMS.filter((r) => isStationRoom(r.id)).map((r) => deckRect(r.id)),
  staticPortals: [{ id: 'station_lobby_bay', a: 'station_lobby', b: 'station_bay', widthM: 6 }],
};

export const HULL_TOPOLOGIES: Record<string, HullTopology> = {
  hesperia: HESPERIA_TOPOLOGY,
  station: STATION_TOPOLOGY,
};

export const SHIP_COMPARTMENT_IDS = HESPERIA_TOPOLOGY.rooms.map((r) => r.id);

export const STATION_COMPARTMENT_IDS = STATION_TOPOLOGY.rooms.map((r) => r.id);

export function hullTopology(hullId: string): HullTopology | null {
  return HULL_TOPOLOGIES[hullId] ?? null;
}

export function hullIdForRoomId(roomId: string): string | null {
  for (const topo of Object.values(HULL_TOPOLOGIES)) {
    if (topo.rooms.some((r) => r.id === roomId)) return topo.hullId;
    if (topo.aggregates?.some((a) => a.id === roomId)) return topo.hullId;
  }
  return null;
}

export function locateInTopology(topo: HullTopology, x: number, y: number): string | null {
  for (const r of topo.rooms) {
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return r.id;
  }
  return null;
}

export function roomRectOf(roomId: string): HullRoomRect | null {
  for (const topo of Object.values(HULL_TOPOLOGIES)) {
    const rect = topo.rooms.find((r) => r.id === roomId);
    if (rect) return rect;
  }
  return null;
}

export function getBreachWeldSeconds(breachId: string): number {
  if (breachId.startsWith('puncture_')) return 1.5;
  return 3.0;
}

function standardGas(volumeM3: number): { moles: Record<GasType, number>; temperatureK: number } {
  const total = (STANDARD_PRESSURE_PA * volumeM3) / (R_GAS * STANDARD_TEMP_K);
  return {
    moles: {
      [GasType.Oxygen]: total * STANDARD_O2_FRAC,
      [GasType.Nitrogen]: total * (1 - STANDARD_O2_FRAC - STANDARD_CO2_FRAC),
      [GasType.CarbonDioxide]: total * STANDARD_CO2_FRAC,
    },
    temperatureK: STANDARD_TEMP_K,
  };
}

function roomVolumeM3(pxW: number, pxH: number): number {
  return pxW * PX_METERS * pxH * PX_METERS * DECK_HEIGHT_M;
}

function makeRoom(rect: HullRoomRect): Room {
  const volume = roomVolumeM3(rect.w, rect.h);
  return new Room(
    {
      id: rect.id,
      x: rect.x * PX_METERS,
      y: rect.y * PX_METERS,
      width: Math.max(0.5, rect.w * PX_METERS),
      length: Math.max(0.5, rect.h * PX_METERS),
      height: DECK_HEIGHT_M,
    },
    standardGas(volume)
  );
}

function doorWidthM(door: DoorState): number {
  const lenPx = Math.hypot(door.x2 - door.x1, door.y2 - door.y1);
  return Math.max(0.4, lenPx * PX_METERS);
}

export function corridorThirdForX(x: number): string {
  const located = locateInTopology(HESPERIA_TOPOLOGY, x, 400);
  return located ?? 'corridor_mid';
}

function subRoomFor(roomId: string, x: number): string {
  if (roomId !== 'corridor') return roomId;
  return corridorThirdForX(x);
}

type DoorSide = { kind: 'room'; roomId: string } | { kind: 'vacuum' } | { kind: 'external' };

function distToRect(px: number, py: number, r: HullRoomRect): number {
  const dx = px < r.x ? r.x - px : px >= r.x + r.w ? px - (r.x + r.w) + 1 : 0;
  const dy = py < r.y ? r.y - py : py >= r.y + r.h ? py - (r.y + r.h) + 1 : 0;
  return Math.hypot(dx, dy);
}

function nearestPartRoom(
  topo: HullTopology,
  parentId: string,
  x: number,
  y: number
): string | null {
  const aggregate = topo.aggregates?.find((a) => a.id === parentId);
  if (!aggregate) return null;
  let best: string | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const part of aggregate.parts) {
    const rect = topo.rooms.find((r) => r.id === part);
    if (!rect) continue;
    const dist = distToRect(x, y, rect);
    if (dist < bestDist) {
      bestDist = dist;
      best = part;
    }
  }
  return best;
}

function resolveDoorSide(topo: HullTopology, roomId: string, x: number, y: number): DoorSide {
  if (roomId === 'vacuum') return { kind: 'vacuum' };
  if (topo.rooms.some((r) => r.id === roomId)) return { kind: 'room', roomId };
  const part = nearestPartRoom(topo, roomId, x, y);
  if (part) return { kind: 'room', roomId: part };
  return { kind: 'external' };
}

export function shipSideOfDoor(door: DoorState): { a: string | null; b: string | null } {
  const midX = (door.x1 + door.x2) / 2;
  const midY = (door.y1 + door.y2) / 2;
  const mapSide = (roomId: string): string | null => {
    const resolved = resolveDoorSide(HESPERIA_TOPOLOGY, roomId, midX, midY);
    return resolved.kind === 'room' ? resolved.roomId : null;
  };
  return { a: mapSide(door.roomA), b: mapSide(door.roomB) };
}

export function doorCorridorSide(door: DoorState): string {
  const midX = (door.x1 + door.x2) / 2;
  return subRoomFor('corridor', midX);
}

function doorMid(door: DoorState): { x: number; y: number } {
  return { x: (door.x1 + door.x2) / 2, y: (door.y1 + door.y2) / 2 };
}

function makeDoorPortal(id: string, roomA: Room, roomB: Room | null, door: DoorState): Portal {
  return new Portal({
    id,
    type: PortalType.Door,
    roomA,
    roomB,
    width: doorWidthM(door),
    height: DOOR_HEIGHT_M,
    openRatio: door.isOpen ? 1 : 0,
    side: 'north',
    position: 0.5,
  });
}

function addLinkedDoor(sim: AtmosphereSimulation, topo: HullTopology, door: DoorState): boolean {
  const pair = topo.links?.[door.id];
  if (!pair) return false;
  const ra = sim.rooms.get(pair[0]);
  const rb = sim.rooms.get(pair[1]);
  if (!ra || !rb) return false;
  sim.addPortal(makeDoorPortal(door.id, ra, rb, door));
  return true;
}

function addResolvedDoor(sim: AtmosphereSimulation, topo: HullTopology, door: DoorState): void {
  if (addLinkedDoor(sim, topo, door)) return;
  const mid = doorMid(door);
  const a = resolveDoorSide(topo, door.roomA, mid.x, mid.y);
  const b = resolveDoorSide(topo, door.roomB, mid.x, mid.y);
  if (a.kind === 'vacuum' && b.kind === 'vacuum') return;
  if (a.kind === 'vacuum' && b.kind === 'room') {
    const room = sim.rooms.get(b.roomId);
    if (room) sim.addPortal(makeDoorPortal(door.id, room, null, door));
    return;
  }
  if (b.kind === 'vacuum' && a.kind === 'room') {
    const room = sim.rooms.get(a.roomId);
    if (room) sim.addPortal(makeDoorPortal(door.id, room, null, door));
    return;
  }
  if (a.kind !== 'room' || b.kind !== 'room' || a.roomId === b.roomId) return;
  const ra = sim.rooms.get(a.roomId);
  const rb = sim.rooms.get(b.roomId);
  if (!ra || !rb) return;
  sim.addPortal(makeDoorPortal(door.id, ra, rb, door));
}

function addStaticPortals(sim: AtmosphereSimulation, topo: HullTopology): void {
  for (const link of topo.staticPortals ?? []) {
    const ra = sim.rooms.get(link.a);
    const rb = sim.rooms.get(link.b);
    if (!ra || !rb || sim.portals.some((p) => p.id === link.id)) continue;
    sim.addPortal(
      new Portal({
        id: link.id,
        type: PortalType.Door,
        roomA: ra,
        roomB: rb,
        width: link.widthM,
        height: DOOR_HEIGHT_M,
        openRatio: 1,
        side: 'north',
        position: 0.5,
      })
    );
  }
}

function buildSimFromTopology(topo: HullTopology, doors: DoorState[]): AtmosphereSimulation {
  const sim = new AtmosphereSimulation();
  for (const rect of topo.rooms) sim.addRoom(makeRoom(rect));
  for (const door of doors) addResolvedDoor(sim, topo, door);
  addStaticPortals(sim, topo);
  return sim;
}

export function createHullAir(hullId: string, doors?: DoorState[]): ShipAirState {
  const topo = HULL_TOPOLOGIES[hullId];
  if (!topo) throw new Error(`Unknown hull topology: ${hullId}`);
  const sim = buildSimFromTopology(topo, doors ?? createInitialDoors());
  return { hullId, sim, smoke: {}, probeReadings: {} };
}

export function createInitialHulls(doors?: DoorState[]): Record<string, ShipAirState> {
  const resolved = doors ?? createInitialDoors();
  return Object.fromEntries(
    Object.keys(HULL_TOPOLOGIES).map((hullId) => [hullId, createHullAir(hullId, resolved)])
  );
}

export function doorsForHull(doors: DoorState[], hullId: string): DoorState[] {
  const topo = HULL_TOPOLOGIES[hullId];
  if (!topo) return [];
  const inHull = (s: DoorSide): boolean => s.kind === 'room';
  return doors.filter((door) => {
    if (topo.links?.[door.id]) return true;
    const mid = doorMid(door);
    const a = resolveDoorSide(topo, door.roomA, mid.x, mid.y);
    const b = resolveDoorSide(topo, door.roomB, mid.x, mid.y);
    if (a.kind === 'vacuum' || b.kind === 'vacuum') return inHull(a) || inHull(b);
    return inHull(a) && inHull(b);
  });
}

export function createVesselAir(doors?: DoorState[]): ShipAirState {
  return createHullAir('hesperia', doors);
}

export function createStationAir(doors?: DoorState[]): ShipAirState {
  return createHullAir('station', doors);
}

export function syncDoorsToSim(state: ShipAirState, doors: DoorState[]): void {
  for (const portal of state.sim.portals) {
    if (portal.type !== PortalType.Door) continue;
    const door = doors.find((d) => d.id === portal.id);
    if (door) portal.openRatio = door.isOpen ? 1 : 0;
  }
}

interface ParsedBreach {
  portalId: string;
  roomId: string;
  areaM2: number;
}

function parseBreachForHull(breach: string, topo: HullTopology): ParsedBreach[] {
  const loc = getBreachLocation(breach);
  const norm = normalizeBreachRoomId(breach);
  const isPuncture = breach.startsWith('puncture_');
  const area = isPuncture ? PUNCTURE_AREA_M2 : FULL_BREACH_AREA_M2;
  if (topo.rooms.some((r) => r.id === norm)) {
    return [{ portalId: breach, roomId: norm, areaM2: area }];
  }
  const aggregate = topo.aggregates?.find((a) => a.id === norm);
  if (!aggregate) return [];
  if (loc) {
    const located = locateInTopology(topo, loc.x, loc.y);
    if (located) return [{ portalId: breach, roomId: located, areaM2: area }];
  }
  return aggregate.parts.map((part) => ({
    portalId: `${breach}__${part}`,
    roomId: part,
    areaM2: area / aggregate.parts.length,
  }));
}

function hullTopologyOf(state: ShipAirState): HullTopology | null {
  return HULL_TOPOLOGIES[state.hullId] ?? null;
}

function parseBreachString(breach: string): ParsedBreach[] {
  return Object.values(HULL_TOPOLOGIES).flatMap((topo) => parseBreachForHull(breach, topo));
}

export function breachesForHull(breaches: string[], hullId: string): string[] {
  const topo = HULL_TOPOLOGIES[hullId];
  if (!topo) return [];
  return breaches.filter((b) => parseBreachForHull(b, topo).length > 0);
}

export function firesForHull(fires: string[], hullId: string): string[] {
  return fires.filter((fire) => {
    const hull = hullIdForRoomId(fire);
    return hull === hullId;
  });
}

export function upsertBreachPortal(state: ShipAirState, breach: string): void {
  const parsed = parseBreachString(breach);
  for (const item of parsed) {
    const existing = state.sim.portals.find((p) => p.id === item.portalId);
    if (existing) continue;
    const room = state.sim.rooms.get(item.roomId);
    if (!room) continue;
    const side = Math.sqrt(Math.max(1e-6, item.areaM2));
    state.sim.addPortal(
      new Portal({
        id: item.portalId,
        type: PortalType.Puncture,
        roomA: room,
        roomB: null,
        width: side,
        height: side,
        openRatio: 1,
        side: 'north',
        position: 0.5,
      })
    );
  }
}

export function removeBreachPortal(state: ShipAirState, breach: string): void {
  const parsed = parseBreachString(breach);
  const ids = new Set(parsed.map((p) => p.portalId));
  const prefix = `${breach}__`;
  state.sim.portals.splice(
    0,
    state.sim.portals.length,
    ...state.sim.portals.filter((p) => {
      if (p.type !== PortalType.Puncture || p.roomB !== null) return true;
      if (ids.has(p.id)) return false;
      if (p.id.startsWith(prefix)) return false;
      return true;
    })
  );
}

export function syncBreachPortals(state: ShipAirState, breaches: string[]): void {
  const wanted = new Set<string>();
  for (const b of breaches) {
    for (const item of parseBreachString(b)) wanted.add(item.portalId);
  }
  for (let i = state.sim.portals.length - 1; i >= 0; i--) {
    const p = state.sim.portals[i];
    if (p.type !== PortalType.Puncture || p.roomB !== null) continue;
    if (p.id.startsWith('partition_')) continue;
    if (!wanted.has(p.id)) state.sim.portals.splice(i, 1);
  }
  for (const b of breaches) upsertBreachPortal(state, b);
}

export function partitionRoomsForHull(
  hullId: string,
  hole: { x: number; y: number; wallId: string }
): [string, string] | null {
  const topo = HULL_TOPOLOGIES[hullId];
  if (!topo) return null;
  let ax = hole.x;
  let ay = hole.y;
  let bx = hole.x;
  let by = hole.y;
  if (hole.wallId.startsWith('part_')) {
    ax -= 12;
    bx += 12;
  } else if (hole.wallId.startsWith('spine_')) {
    ay -= 12;
    by += 12;
  } else {
    return null;
  }
  const roomA = locateInTopology(topo, ax, ay);
  const roomB = locateInTopology(topo, bx, by);
  if (!roomA || !roomB || roomA === roomB) return null;
  return [roomA, roomB];
}

export function syncPartitionPortals(
  state: ShipAirState,
  holes: Array<{ x: number; y: number; wallId: string }> = []
): void {
  const wanted = new Set<string>();
  for (const h of holes) wanted.add(`partition_${h.x}_${h.y}_${h.wallId}`);
  for (let i = state.sim.portals.length - 1; i >= 0; i--) {
    const p = state.sim.portals[i];
    if (!p.id.startsWith('partition_')) continue;
    if (!wanted.has(p.id)) state.sim.portals.splice(i, 1);
  }
  for (const h of holes) {
    const id = `partition_${h.x}_${h.y}_${h.wallId}`;
    if (state.sim.portals.some((p) => p.id === id)) continue;
    const rooms = partitionRoomsForHull(state.hullId, h);
    if (!rooms) continue;
    const ra = state.sim.rooms.get(rooms[0]);
    const rb = state.sim.rooms.get(rooms[1]);
    if (!ra || !rb) continue;
    const side = Math.sqrt(PARTITION_HOLE_AREA_M2);
    state.sim.addPortal(
      new Portal({
        id,
        type: PortalType.Puncture,
        roomA: ra,
        roomB: rb,
        width: side,
        height: side,
        openRatio: 1,
        side: 'north',
        position: 0.5,
      })
    );
  }
}

function vacuumRooms(state: ShipAirState): Set<string> {
  const direct = new Set<string>();
  for (const p of state.sim.portals) {
    if (p.roomB !== null) continue;
    if (p.effectiveArea <= 0) continue;
    if (p.type === PortalType.Puncture && p.id.startsWith('partition_')) continue;
    direct.add(p.roomA.id);
  }
  return direct;
}

function doorNeighborPair(topo: HullTopology, door: DoorState): [string, string] | null {
  const link = topo.links?.[door.id];
  if (link) return link;
  const mid = doorMid(door);
  const a = resolveDoorSide(topo, door.roomA, mid.x, mid.y);
  const b = resolveDoorSide(topo, door.roomB, mid.x, mid.y);
  if (a.kind !== 'room' || b.kind !== 'room' || a.roomId === b.roomId) return null;
  return [a.roomId, b.roomId];
}

function openNeighbors(state: ShipAirState, doors: DoorState[], roomId: string): string[] {
  const topo = hullTopologyOf(state);
  if (!topo) return [];
  const out: string[] = [];
  for (const d of doors) {
    if (!d.isOpen || d.isAirlock) continue;
    if (d.roomA === 'vacuum' || d.roomB === 'vacuum') continue;
    const pair = doorNeighborPair(topo, d);
    if (!pair) continue;
    if (pair[0] === roomId && pair[1] !== roomId) out.push(pair[1]);
    else if (pair[1] === roomId && pair[0] !== roomId) out.push(pair[0]);
  }
  return out;
}

export function computeVentedRooms(state: ShipAirState, doors: DoorState[]): string[] {
  const seeds = vacuumRooms(state);
  const vented = new Set<string>(seeds);
  const queue = Array.from(seeds);
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    for (const next of openNeighbors(state, doors, current)) {
      if (!state.sim.rooms.has(next)) continue;
      if (!vented.has(next)) {
        vented.add(next);
        queue.push(next);
      }
    }
  }
  const topo = hullTopologyOf(state);
  for (const agg of topo?.aggregates ?? []) {
    if (agg.parts.some((part) => vented.has(part))) vented.add(agg.id);
  }
  return Array.from(vented);
}

function roomO2Percent(room: Room): number {
  const total = room.totalMoles;
  if (total <= 1e-9) return 0;
  return (room.gas.moles[GasType.Oxygen] / total) * 100;
}

function roomCo2Ppm(room: Room): number {
  const total = room.totalMoles;
  if (total <= 1e-9) return 0;
  return Math.round((room.gas.moles[GasType.CarbonDioxide] / total) * 1e6);
}

function expandFireRooms(fires: string[]): string[] {
  const out: string[] = [];
  for (const f of fires) {
    const aggregate = Object.values(HULL_TOPOLOGIES)
      .flatMap((t) => t.aggregates ?? [])
      .find((a) => a.id === f);
    if (aggregate) out.push(...aggregate.parts);
    else out.push(f);
  }
  return out;
}

function applyFirePass(state: ShipAirState, fires: string[], dt: number): string[] {
  const surviving: string[] = [];
  for (const roomId of expandFireRooms(fires)) {
    const room = state.sim.rooms.get(roomId);
    if (!room) continue;
    const total = room.totalMoles;
    const o2Frac = total > 1e-9 ? room.gas.moles[GasType.Oxygen] / total : 0;
    const pressurePa = room.pressure;
    if (o2Frac < 0.1 || pressurePa < 15000) {
      continue;
    }
    surviving.push(roomId);
    const o2Loss = Math.min(room.gas.moles[GasType.Oxygen], total * 0.05 * dt);
    room.gas.moles[GasType.Oxygen] -= o2Loss;
    room.gas.moles[GasType.CarbonDioxide] += o2Loss * 0.5;
    room.gas.temperatureK = Math.min(850, room.gas.temperatureK + 35 * dt);
    const key = room.id;
    state.smoke[key] = Math.min(1, (state.smoke[key] ?? 0) + 0.15 * dt);
  }
  return surviving;
}

function ecsRateKpaPerSec(roomId: string): number {
  if (roomId === 'airlock_stbd' || roomId === 'airlock_port' || roomId === 'avionics') return 25;
  if (roomId === 'cargo' || roomId === 'engineering') return 6.5;
  return 12;
}

function applyEcsPass(state: ShipAirState, vented: Set<string>, dt: number): number {
  let molesAdded = 0;
  for (const [id, room] of state.sim.rooms) {
    if (vented.has(id)) continue;
    const pressurePa = room.pressure;
    if (pressurePa >= STANDARD_PRESSURE_PA) continue;
    const ratePa = ecsRateKpaPerSec(id) * 1000;
    const addPa = Math.min(STANDARD_PRESSURE_PA - pressurePa, ratePa * dt);
    if (addPa <= 0) continue;
    const addMoles = (addPa * room.volume) / (R_GAS * STANDARD_TEMP_K);
    if (addMoles <= 0) continue;
    room.gas.moles[GasType.Oxygen] += addMoles * STANDARD_O2_FRAC;
    room.gas.moles[GasType.Nitrogen] += addMoles * (1 - STANDARD_O2_FRAC - STANDARD_CO2_FRAC);
    room.gas.moles[GasType.CarbonDioxide] += addMoles * STANDARD_CO2_FRAC;
    const blend = Math.min(1, 0.4 * dt + (addPa / STANDARD_PRESSURE_PA) * 2);
    room.gas.temperatureK += (STANDARD_TEMP_K - room.gas.temperatureK) * blend;
    state.smoke[id] = Math.max(0, (state.smoke[id] ?? 0) * (1 - 0.35 * dt));
    molesAdded += addMoles;
  }
  return Number((molesAdded * 0.00005).toFixed(4));
}

function breachCountFor(roomId: string, breaches: string[]): number {
  let count = 0;
  for (const b of breaches) {
    const norm = normalizeBreachRoomId(b);
    if (norm === roomId) count++;
    else if (roomId.startsWith('corridor_') && norm === 'corridor') count++;
  }
  return count;
}

export function summarizeShipAir(
  state: ShipAirState,
  doors: DoorState[] = [],
  breaches: string[] = [],
  activeFires: string[] = []
): Record<string, RoomAtmosphereSummary> {
  const summary: Record<string, RoomAtmosphereSummary> = {};
  const vented = new Set(computeVentedRooms(state, doors));
  const fireSet = new Set(expandFireRooms(activeFires));
  for (const [id, room] of state.sim.rooms) {
    const pressurePa = room.pressure;
    const rawKpa = pressurePa / 1000;
    const pressureKpa = rawKpa < 1.5 ? 0 : Number(rawKpa.toFixed(1));
    const rawO2 = roomO2Percent(room);
    const o2Percent = pressureKpa === 0 || rawO2 < 0.5 ? 0 : Number(rawO2.toFixed(1));
    const smoke = state.smoke[id] ?? 0;
    const wind = roomWind(state, id, doors);
    summary[id] = {
      roomId: id,
      pressureKpa,
      o2Percent,
      co2Ppm: roomCo2Ppm(room),
      tempCelsius: Number((room.gas.temperatureK - 273.15).toFixed(1)),
      toxicSmokePercent: Number((smoke * 100).toFixed(1)),
      isVenting: vented.has(id) && rawKpa > VENT_PRESSURE_FLOOR_KPA,
      isRepressurizing: !vented.has(id) && pressureKpa < 100.5 && pressureKpa > 0,
      activeFires: fireSet.has(id) ? 1 : 0,
      activeBreaches: breachCountFor(id, breaches),
      windX: wind.vx,
      windY: wind.vy,
    };
  }
  const topo = hullTopologyOf(state);
  for (const agg of topo?.aggregates ?? []) {
    const parts = agg.parts.map((id) => summary[id]).filter(Boolean);
    if (parts.length === 0) continue;
    const avg = (pick: (s: RoomAtmosphereSummary) => number): number =>
      parts.reduce((sum, s) => sum + pick(s), 0) / parts.length;
    summary[agg.id] = {
      roomId: agg.id,
      pressureKpa: Number(avg((s) => s.pressureKpa).toFixed(1)),
      o2Percent: Number(avg((s) => s.o2Percent).toFixed(1)),
      co2Ppm: Math.round(avg((s) => s.co2Ppm)),
      tempCelsius: Number(avg((s) => s.tempCelsius).toFixed(1)),
      toxicSmokePercent: Number(avg((s) => s.toxicSmokePercent).toFixed(1)),
      isVenting: parts.some((s) => s.isVenting),
      isRepressurizing: parts.some((s) => s.isRepressurizing),
      activeFires: parts.reduce((sum, s) => sum + s.activeFires, 0),
      activeBreaches: parts.reduce((sum, s) => sum + s.activeBreaches, 0),
      windX: Number(avg((s) => s.windX ?? 0).toFixed(2)),
      windY: Number(avg((s) => s.windY ?? 0).toFixed(2)),
    };
  }
  return summary;
}

export function roomO2HealthMap(state: ShipAirState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, room] of state.sim.rooms) {
    const pressureKpa = room.pressure / 1000;
    if (pressureKpa < 20) {
      out[id] = 0;
      continue;
    }
    const frac = room.totalMoles > 1e-9 ? room.gas.moles[GasType.Oxygen] / room.totalMoles : 0;
    out[id] = Number(Math.min(100, (frac / STANDARD_O2_FRAC) * 100).toFixed(1));
  }
  const topo = hullTopologyOf(state);
  for (const agg of topo?.aggregates ?? []) {
    const vals = agg.parts.map((id) => out[id] ?? 0);
    out[agg.id] = Number((vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length)).toFixed(1));
  }
  return out;
}

export function roomO2Map(state: ShipAirState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, room] of state.sim.rooms) out[id] = Number(roomO2Percent(room).toFixed(1));
  const summary = summarizeShipAir(state);
  if (summary.corridor) out.corridor = summary.corridor.o2Percent;
  return out;
}

export function suctionsFrom(state: ShipAirState, doors: DoorState[] = []): AirSuction[] {
  const out: AirSuction[] = [];
  for (const [id, room] of state.sim.rooms) {
    const mouth = dominantVacuumMouth(state, id, doors);
    if (!mouth) continue;
    if (room.pressure < 500) continue;
    const wind = windAtPointPx(state, id, roomCenterPx(id).x, roomCenterPx(id).y, doors);
    const strength = Math.min(300, Math.round(Math.hypot(wind.vx, wind.vy)));
    if (strength < 1) continue;
    out.push({ roomId: id, targetX: mouth.x, targetY: mouth.y, strength });
  }
  const topo = hullTopologyOf(state);
  for (const agg of topo?.aggregates ?? []) {
    const best = out
      .filter((s) => agg.parts.includes(s.roomId))
      .sort((a, b) => b.strength - a.strength)[0];
    if (best && !out.some((s) => s.roomId === agg.id)) {
      out.push({ ...best, roomId: agg.id });
    }
  }
  return out;
}

function dominantVacuumMouth(
  state: ShipAirState,
  roomId: string,
  doors: DoorState[]
): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestFlow = 0;
  for (const p of state.sim.portals) {
    if (p.roomB !== null || p.roomA.id !== roomId) continue;
    if (p.type === PortalType.Puncture && p.id.startsWith('partition_')) continue;
    const flow = Math.abs(p.velocity) * p.effectiveArea;
    if (flow > bestFlow) {
      bestFlow = flow;
      best = portalMouthPx(p.id, roomId, doors);
    }
  }
  return bestFlow > 0 ? best : null;
}

export function roomCenterPx(roomId: string): { x: number; y: number } {
  const rect = roomRectOf(roomId);
  if (rect) return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
  const room = HESPERIA_ROOMS.find((r) => r.id === roomId);
  if (room) return { x: room.x + room.width / 2, y: room.y + room.height / 2 };
  return { x: 600, y: 400 };
}

export function findShipRoomAt(x: number, y: number): string | null {
  for (const topo of Object.values(HULL_TOPOLOGIES)) {
    const located = locateInTopology(topo, x, y);
    if (located) return located;
  }
  for (const r of HESPERIA_ROOMS) {
    if (x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height) return r.id;
  }
  return null;
}

function portalMouthPx(
  portalId: string,
  roomId: string,
  doors: DoorState[]
): { x: number; y: number } {
  const door = doors.find((d) => d.id === portalId);
  if (door) return { x: (door.x1 + door.x2) / 2, y: (door.y1 + door.y2) / 2 };
  if (portalId.startsWith('partition_')) {
    const parts = portalId.split('_');
    const px = Number(parts[1]);
    const py = Number(parts[2]);
    if (Number.isFinite(px) && Number.isFinite(py)) return { x: px, y: py };
  }
  const loc = getBreachLocation(portalId);
  if (loc) return { x: loc.x, y: loc.y };
  return roomCenterPx(roomId);
}

const PX_PER_M = 1 / PX_METERS;
const WIND_CLAMP_PX = 320;
const SOUND_SPEED_MS = 343;

function portalOutflowForRoom(portal: Portal, roomId: string): boolean {
  if (portal.roomA.id === roomId) return portal.velocity >= 0;
  return portal.velocity < 0;
}

export function windAtPointPx(
  state: ShipAirState,
  roomId: string,
  x: number,
  y: number,
  doors: DoorState[]
): { vx: number; vy: number } {
  let wx = 0;
  let wy = 0;
  for (const portal of state.sim.portals) {
    const touches =
      portal.roomA.id === roomId || (portal.roomB !== null && portal.roomB.id === roomId);
    if (!touches || portal.effectiveArea <= 0) continue;
    const volumetric = Math.abs(portal.velocity) * portal.effectiveArea;
    if (volumetric <= 0) continue;
    const mouth = portalMouthPx(portal.id, roomId, doors);
    const dx = mouth.x - x;
    const dy = mouth.y - y;
    const distM = Math.max(0.5, Math.hypot(dx, dy)) * PX_METERS;
    const section = 2 * Math.PI * distM * distM + portal.effectiveArea;
    const speed = Math.min(volumetric / section, SOUND_SPEED_MS);
    const dist = Math.max(0.5, Math.hypot(dx, dy));
    const dir = portalOutflowForRoom(portal, roomId) ? 1 : -1;
    wx += (dx / dist) * dir * speed * PX_PER_M;
    wy += (dy / dist) * dir * speed * PX_PER_M;
  }
  const mag = Math.hypot(wx, wy);
  if (mag > WIND_CLAMP_PX) {
    wx = (wx / mag) * WIND_CLAMP_PX;
    wy = (wy / mag) * WIND_CLAMP_PX;
  }
  return { vx: Number(wx.toFixed(2)), vy: Number(wy.toFixed(2)) };
}

export function roomWind(
  state: ShipAirState,
  roomId: string,
  doors: DoorState[]
): { vx: number; vy: number } {
  const center = roomCenterPx(roomId);
  return windAtPointPx(state, roomId, center.x, center.y, doors);
}

function captureProbeReading(
  state: ShipAirState,
  id: string,
  roomId: string,
  xM: number,
  yM: number
) {
  return (drag: DragResult): void => {
    state.probeReadings[id] = {
      roomId,
      xM,
      yM,
      windXMps: drag.windVelocity.x,
      windYMps: drag.windVelocity.y,
      forceN: Math.hypot(drag.force.x, drag.force.y),
      dynamicPressurePa: drag.dynamicPressure,
    };
  };
}

export function addWindProbe(
  state: ShipAirState,
  id: string,
  xPx: number,
  yPx: number,
  opts: { projectedAreaM2?: number; dragCoefficient?: number } = {}
): boolean {
  const topo = hullTopologyOf(state);
  const roomId = topo ? locateInTopology(topo, xPx, yPx) : null;
  const room = roomId ? state.sim.rooms.get(roomId) : undefined;
  if (!roomId || !room || state.probeReadings[id]) return false;
  const xM = xPx * PX_METERS;
  const yM = yPx * PX_METERS;
  state.probeReadings[id] = {
    roomId,
    xM,
    yM,
    windXMps: 0,
    windYMps: 0,
    forceN: 0,
    dynamicPressurePa: 0,
  };
  state.sim.addEntity({
    room,
    position: { x: xM, y: yM },
    projectedArea: opts.projectedAreaM2 ?? 0.6,
    dragCoefficient: opts.dragCoefficient ?? 1.1,
    applyDrag: captureProbeReading(state, id, roomId, xM, yM),
  });
  return true;
}

export function windProbeReading(state: ShipAirState, id: string): ProbeReading | null {
  return state.probeReadings[id] ?? null;
}

export function applySuctionToPosition(
  x: number,
  y: number,
  suctions: AirSuction[],
  currentRoomId: string,
  dtSeconds: number
): { x: number; y: number } {
  const suction = suctions.find((s) => s.roomId === currentRoomId);
  if (!suction || dtSeconds <= 0) return { x, y };
  const dx = suction.targetX - x;
  const dy = suction.targetY - y;
  const dist = Math.hypot(dx, dy);
  if (dist < 10) return { x, y };
  const pull = suction.strength * dtSeconds;
  const step = Math.min(pull, dist);
  const angle = Math.atan2(dy, dx);
  return {
    x: Number((x + Math.cos(angle) * step).toFixed(2)),
    y: Number((y + Math.sin(angle) * step).toFixed(2)),
  };
}

function aggregatePartsOf(roomId: string): string[] | null {
  for (const topo of Object.values(HULL_TOPOLOGIES)) {
    const agg = topo.aggregates?.find((a) => a.id === roomId);
    if (agg) return agg.parts;
  }
  return null;
}

export function tickShipAir(
  state: ShipAirState,
  doors: DoorState[],
  breaches: string[],
  activeFires: string[],
  dtSeconds: number,
  partitionHoles: Array<{ x: number; y: number; wallId: string }> = []
): ShipAirTickResult {
  const hullDoors = doorsForHull(doors, state.hullId);
  const hullBreaches = breachesForHull(breaches, state.hullId);
  const hullFires = firesForHull(activeFires, state.hullId);
  const hullHoles = partitionHoles.filter((h) => partitionRoomsForHull(state.hullId, h) !== null);
  if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) {
    const summaries = summarizeShipAir(state, hullDoors, hullBreaches, hullFires);
    return {
      summaries,
      ventedRooms: computeVentedRooms(state, hullDoors),
      suctions: suctionsFrom(state, hullDoors),
      ecsDrainPercent: 0,
      survivingFires: [...hullFires],
    };
  }
  const dt = Math.min(0.1, dtSeconds);
  syncDoorsToSim(state, hullDoors);
  syncBreachPortals(state, hullBreaches);
  syncPartitionPortals(state, hullHoles);
  const steps = Math.max(1, Math.ceil(dt / 0.05));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) state.sim.step(h);
  const survivingDetailed = applyFirePass(state, hullFires, dt);
  const vented = computeVentedRooms(state, hullDoors);
  const ecsDrainPercent = applyEcsPass(state, new Set(vented), dt);
  const survivingTopLevel = activeFires.filter((f) => {
    const parts = aggregatePartsOf(f);
    if (parts) return survivingDetailed.some((s) => parts.includes(s));
    return survivingDetailed.includes(f);
  });
  const summaries = summarizeShipAir(state, hullDoors, hullBreaches, survivingTopLevel);
  return {
    summaries,
    ventedRooms: vented,
    suctions: suctionsFrom(state, hullDoors),
    ecsDrainPercent,
    survivingFires: survivingTopLevel,
  };
}

export function sampleShipAirAt(state: ShipAirState, x: number, y: number): CellAtmosphere {
  let roomId: string | null = null;
  for (const r of HESPERIA_ROOMS) {
    if (x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height) {
      roomId = r.id;
      break;
    }
  }
  if (roomId === 'corridor') roomId = subRoomFor('corridor', x);
  if (!roomId || roomId === 'gauntlet' || roomId === 'station_lobby' || roomId === 'station_bay') {
    return {
      pressureKpa: 0,
      o2Percent: 0,
      co2Ppm: 0,
      tempCelsius: -270,
      toxicSmokePercent: 0,
      velX: 0,
      velY: 0,
      roomId,
      condensationPlume: 0,
    };
  }
  const room = state.sim.rooms.get(roomId);
  if (!room) {
    return {
      pressureKpa: 0,
      o2Percent: 0,
      co2Ppm: 0,
      tempCelsius: -270,
      toxicSmokePercent: 0,
      velX: 0,
      velY: 0,
      roomId,
      condensationPlume: 0,
    };
  }
  const pressurePa = room.pressure;
  const rawKpa = pressurePa / 1000;
  const isVacuum = rawKpa < 1.5;
  return {
    pressureKpa: Number(rawKpa.toFixed(1)),
    o2Percent: isVacuum ? 0 : Number(roomO2Percent(room).toFixed(1)),
    co2Ppm: roomCo2Ppm(room),
    tempCelsius: Number((room.gas.temperatureK - 273.15).toFixed(1)),
    toxicSmokePercent: Number(((state.smoke[roomId] ?? 0) * 100).toFixed(1)),
    velX: 0,
    velY: 0,
    roomId,
    condensationPlume: 0,
  };
}

export const STATION_AMBIENT_ATMOS: CellAtmosphere = {
  pressureKpa: 101.3,
  o2Percent: 20.9,
  co2Ppm: 400,
  tempCelsius: 21.0,
  toxicSmokePercent: 0,
  velX: 0,
  velY: 0,
  roomId: 'station_lobby',
  condensationPlume: 0,
};

export const SPACE_VACUUM_ATMOS: CellAtmosphere = {
  pressureKpa: 0,
  o2Percent: 0,
  co2Ppm: 0,
  tempCelsius: -270.0,
  toxicSmokePercent: 0,
  velX: 0,
  velY: 0,
  roomId: null,
  condensationPlume: 0,
};

export interface RoutedHull {
  hullId: string;
  air: ShipAirState;
  roomId: string;
}

export function routeHullForWorld(
  hulls: Record<string, ShipAirState>,
  worldX: number,
  worldY: number,
  offset: DockFrameOffset
): RoutedHull | null {
  const roomId = findWorldRoom(worldX, worldY, offset);
  if (!roomId) return null;
  const hullId = hullIdForRoomId(roomId);
  if (!hullId) return null;
  const air = hulls[hullId];
  if (!air) return null;
  return { hullId, air, roomId };
}

export function hullLocalCoords(
  hullId: string,
  worldX: number,
  worldY: number,
  offset: DockFrameOffset
): { x: number; y: number } {
  const topo = HULL_TOPOLOGIES[hullId];
  if (topo && topo.kind === 'vessel') return toShipLocal(worldX, worldY, offset);
  return { x: worldX, y: worldY };
}

export function sampleHullAirAt(
  air: ShipAirState,
  hullId: string,
  worldX: number,
  worldY: number,
  offset: DockFrameOffset
): CellAtmosphere {
  const local = hullLocalCoords(hullId, worldX, worldY, offset);
  const topo = HULL_TOPOLOGIES[hullId];
  const roomId = topo ? locateInTopology(topo, local.x, local.y) : null;
  const room = roomId ? air.sim.rooms.get(roomId) : undefined;
  if (roomId && room) return roomToCellAtmos(air, roomId, room);
  if (roomId && isStationRoom(roomId)) return { ...STATION_AMBIENT_ATMOS, roomId };
  return SPACE_VACUUM_ATMOS;
}

function roomToCellAtmos(air: ShipAirState, roomId: string, room: Room): CellAtmosphere {
  const rawKpa = room.pressure / 1000;
  return {
    pressureKpa: Number(rawKpa.toFixed(1)),
    o2Percent: Number(roomO2Percent(room).toFixed(1)),
    co2Ppm: roomCo2Ppm(room),
    tempCelsius: Number((room.gas.temperatureK - 273.15).toFixed(1)),
    toxicSmokePercent: Number(((air.smoke[roomId] ?? 0) * 100).toFixed(1)),
    velX: 0,
    velY: 0,
    roomId,
    condensationPlume: 0,
  };
}

export function resolveAtmosphereAt(
  hulls: Record<string, ShipAirState>,
  worldX: number,
  worldY: number,
  offset: DockFrameOffset
): CellAtmosphere {
  const routed = routeHullForWorld(hulls, worldX, worldY, offset);
  if (!routed) return SPACE_VACUUM_ATMOS;
  return sampleHullAirAt(routed.air, routed.hullId, worldX, worldY, offset);
}

export interface DecompressionAirflowSource {
  roomId: string;
  x: number;
  y: number;
  u: number;
  v: number;
  intensity: number;
}

function summaryPressure(
  roomId: string,
  atmospheres?: Record<string, RoomAtmosphereSummary>
): number {
  if (!atmospheres) return 101.3;
  const direct = atmospheres[roomId];
  if (direct) return direct.pressureKpa;
  if (roomId === 'corridor') {
    const parts = ['corridor_fwd', 'corridor_mid', 'corridor_aft'].map((id) => atmospheres[id]);
    const pressures = parts.filter(Boolean).map((s) => (s as RoomAtmosphereSummary).pressureKpa);
    if (pressures.length > 0) return Math.max(...pressures);
  }
  return 101.3;
}

function roomWindMagnitude(
  roomId: string,
  atmospheres?: Record<string, RoomAtmosphereSummary>
): number {
  const summary = atmospheres?.[roomId];
  if (!summary) return 0;
  return Math.hypot(summary.windX ?? 0, summary.windY ?? 0);
}

function openingSource(
  roomId: string,
  x: number,
  y: number,
  nx: number,
  ny: number,
  pressureKpa: number,
  windMag: number
): DecompressionAirflowSource | undefined {
  if (pressureKpa <= 0.5) return undefined;
  const ratio = Math.min(1, pressureKpa / 101.3);
  const speed = windMag > 1 ? Math.min(300, windMag) : 160 + 140 * ratio;
  return { roomId, x, y, u: nx * speed, v: ny * speed, intensity: ratio };
}

export function getDecompressionAirflowSources(
  doors: DoorState[],
  breaches?: string[],
  atmospheres?: Record<string, RoomAtmosphereSummary>
): DecompressionAirflowSource[] {
  const sources: DecompressionAirflowSource[] = [];
  for (const d of doors) {
    if (!d.isOpen) continue;
    if (d.roomA === 'vacuum' || d.roomB === 'vacuum') {
      const roomId = d.roomA === 'vacuum' ? d.roomB : d.roomA;
      const pressure = summaryPressure(roomId, atmospheres);
      const midX = (d.x1 + d.x2) / 2;
      const midY = (d.y1 + d.y2) / 2;
      const room = HESPERIA_ROOMS.find((r) => r.id === roomId);
      const cx = room ? room.x + room.width / 2 : midX;
      const cy = room ? room.y + room.height / 2 : midY;
      const len = Math.hypot(midX - cx, midY - cy) || 1;
      const windMag = roomWindMagnitude(roomId, atmospheres);
      const s = openingSource(
        roomId,
        midX,
        midY,
        (midX - cx) / len,
        (midY - cy) / len,
        pressure,
        windMag
      );
      if (s) sources.push(s);
    }
  }
  for (const b of breaches ?? []) {
    const roomId = normalizeBreachRoomId(b);
    const pressure = summaryPressure(roomId, atmospheres);
    const loc = getBreachLocation(b);
    if (loc) {
      const windMag = roomWindMagnitude(roomId, atmospheres);
      const s = openingSource(roomId, loc.x, loc.y, loc.normalX, loc.normalY, pressure, windMag);
      if (s) sources.push(s);
    }
  }
  return sources;
}

export function getAirflowDragVector(
  x: number,
  y: number,
  _doors: DoorState[],
  _breaches?: string[],
  atmospheres?: Record<string, RoomAtmosphereSummary>
): { u: number; v: number } {
  const roomId = findShipRoomAt(x, y);
  if (!roomId || !atmospheres) return { u: 0, v: 0 };
  const summary = atmospheres[roomId];
  if (!summary) return { u: 0, v: 0 };
  return { u: summary.windX ?? 0, v: summary.windY ?? 0 };
}

export function sampleAirflowVelocityAt(
  state: ShipAirState,
  x: number,
  y: number,
  doors: DoorState[] = []
): { vx: number; vy: number } {
  const roomId = findShipRoomAt(x, y);
  if (!roomId || !state.sim.rooms.has(roomId)) return { vx: 0, vy: 0 };
  return windAtPointPx(state, roomId, x, y, doors);
}
