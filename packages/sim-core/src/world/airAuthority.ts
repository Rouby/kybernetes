/**
 * Air authority: one air-sim AtmosphereSimulation per frame, bound to the
 * portal table. Closed/sealed doors and windows pass nothing; open and
 * destroyed-to-hole portals flow; exterior holes vent to vacuum.
 * Sims are host-owned (like GameLoop); the world carries plain readings.
 */

import { AtmosphereSimulation, GasType, Portal, PortalType, Room } from '@kybernetes/air-sim';
import type { PortalEdge, RoomNode, Vec2, World } from './types.js';

export const NOMINAL_PRESSURE_KPA = 101.3;
export const NOMINAL_TEMP_C = 21;
export const AIR_SUBSTEP = 0.025;

export interface AirRoomView {
  readonly roomId: string;
  readonly pressureKpa: number;
  readonly tempCelsius: number;
  readonly o2Percent: number;
  readonly co2Ppm: number;
  readonly repressurizing: boolean;
}

export interface WindProbe {
  readonly x: number;
  readonly y: number;
}

export interface FrameAirSim {
  readonly sim: AtmosphereSimulation;
  readonly rooms: Map<string, Room>;
  readonly portals: Map<string, Portal>;
  readonly centers: Map<string, Vec2>;
  readonly axes: Map<string, Vec2>;
  readonly prevKpa: Map<string, number>;
  /** Authority-owned damage ids the portal-table sync must not close. */
  readonly lockedOpen: Set<string>;
}

export interface AirAuthorityState {
  readonly sims: Map<string, FrameAirSim>;
}

export function createAirAuthority(): AirAuthorityState {
  return { sims: new Map() };
}

export function bindAirFrame(
  auth: AirAuthorityState,
  frameId: string,
  rooms: readonly RoomNode[],
  portals: readonly PortalEdge[]
): void {
  const sim = new AtmosphereSimulation();
  const frame: FrameAirSim = {
    sim,
    rooms: new Map(),
    portals: new Map(),
    centers: new Map(),
    axes: new Map(),
    prevKpa: new Map(),
    lockedOpen: new Set(),
  };
  for (const room of rooms) {
    const airRoom = new Room(
      {
        id: room.id,
        x: room.rect.x,
        y: room.rect.y,
        width: Math.max(room.rect.w, 0.1),
        length: Math.max(room.rect.h, 0.1),
        height: airHeight(room),
      },
      standardAir(room.volumeM3)
    );
    sim.addRoom(airRoom);
    frame.rooms.set(room.id, airRoom);
    frame.centers.set(room.id, roomCenter(room));
  }
  for (const portal of portals) {
    const roomA = frame.rooms.get(portal.roomA);
    if (roomA === undefined) continue;
    const airPortal = new Portal({
      id: portal.id,
      type: airPortalType(portal),
      roomA,
      roomB: frame.rooms.get(portal.roomB) ?? null,
      width: Math.max(portal.areaM2, 0.05),
      height: 1,
      openRatio: portalOpenRatio(portal),
      ...portalOrientation(roomA.config, portal),
    });
    sim.addPortal(airPortal);
    frame.portals.set(portal.id, airPortal);
    frame.axes.set(portal.id, flowAxis(frame, portal));
  }
  auth.sims.set(frameId, frame);
}

function airHeight(room: RoomNode): number {
  const footprint = Math.max(room.rect.w, 0.1) * Math.max(room.rect.h, 0.1);
  return Math.max(room.volumeM3 / footprint, 1e-6);
}

function roomCenter(room: RoomNode): Vec2 {
  return { x: room.rect.x + room.rect.w / 2, y: room.rect.y + room.rect.h / 2 };
}

function standardAir(volumeM3: number): {
  moles: Record<GasType, number>;
  temperatureK: number;
} {
  const temperatureK = NOMINAL_TEMP_C + 273.15;
  const total = (NOMINAL_PRESSURE_KPA * 1000 * Math.max(volumeM3, 0.1)) / (8.314 * temperatureK);
  return {
    moles: {
      [GasType.Oxygen]: total * 0.209,
      [GasType.Nitrogen]: total * 0.7904,
      [GasType.CarbonDioxide]: total * 0.0006,
    },
    temperatureK,
  };
}

function airPortalType(portal: PortalEdge): PortalType {
  if (portal.kind === 'window') return PortalType.Window;
  if (portal.kind === 'hole') return PortalType.Puncture;
  return PortalType.Door;
}

function portalOpenRatio(portal: PortalEdge): number {
  return portalEffectiveArea(portal) > 0 ? 1 : 0;
}

function portalOrientation(
  roomConfig: Room['config'],
  portal: PortalEdge
): { side: 'north' | 'south' | 'east' | 'west'; position: number } {
  const horizontal =
    Math.abs(portal.segment.y1 - portal.segment.y2) <=
    Math.abs(portal.segment.x1 - portal.segment.x2);
  if (horizontal) {
    const midY = (portal.segment.y1 + portal.segment.y2) / 2;
    const midX = (portal.segment.x1 + portal.segment.x2) / 2;
    return {
      side: midY <= roomConfig.y + roomConfig.length / 2 ? 'north' : 'south',
      position: clamp01((midX - roomConfig.x) / Math.max(roomConfig.width, 0.1)),
    };
  }
  const midX = (portal.segment.x1 + portal.segment.x2) / 2;
  const midY = (portal.segment.y1 + portal.segment.y2) / 2;
  return {
    side: midX <= roomConfig.x + roomConfig.width / 2 ? 'west' : 'east',
    position: clamp01((midY - roomConfig.y) / Math.max(roomConfig.length, 0.1)),
  };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function flowAxis(frame: FrameAirSim, portal: PortalEdge): Vec2 {
  const mid = {
    x: (portal.segment.x1 + portal.segment.x2) / 2,
    y: (portal.segment.y1 + portal.segment.y2) / 2,
  };
  const from = frame.centers.get(portal.roomA);
  const to = frame.centers.get(portal.roomB);
  const dir = to === undefined ? sub(mid, from ?? mid) : sub(to, from ?? to);
  const len = Math.hypot(dir.x, dir.y);
  return len > 0 ? { x: dir.x / len, y: dir.y / len } : { x: 1, y: 0 };
}

function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function portalEffectiveArea(portal: PortalEdge): number {
  if (portal.kind === 'window') return 0;
  if (portal.state === 'sealed') return 0;
  if (portal.state === 'closed') return 0;
  if (portal.state === 'destroyed') return Math.max(portal.areaM2, 1.2);
  if (portal.kind === 'open') return portal.areaM2;
  return portal.areaM2;
}

export function syncAirAreas(auth: AirAuthorityState, world: World): void {
  for (const frame of auth.sims.values()) {
    for (const [edgeId, airPortal] of frame.portals) {
      if (frame.lockedOpen.has(edgeId)) continue;
      const edge = world.portals[edgeId];
      airPortal.openRatio = edge === undefined ? 0 : portalOpenRatio(edge);
      // Widened breaches keep venting at their birth size unless the throat
      // follows the edge: combat widens areaM2 in place after linking.
      if (edge?.kind === 'hole') airPortal.resizeThroat(Math.max(edge.areaM2, 0.05));
    }
  }
}

export function stepAirAuthority(auth: AirAuthorityState, world: World, dtSeconds: number): void {
  if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) return;
  reconcileAirTopology(auth, world);
  syncAirAreas(auth, world);
  const steps = Math.max(1, Math.ceil(dtSeconds / AIR_SUBSTEP));
  const sub = dtSeconds / steps;
  for (const frame of auth.sims.values()) {
    for (let i = 0; i < steps; i += 1) frame.sim.step(sub);
  }
}

/** Links new portal-table edges (combat breaches) into their frame sim. */
export function reconcileAirTopology(auth: AirAuthorityState, world: World): void {
  for (const frame of auth.sims.values()) {
    for (const edge of Object.values(world.portals)) {
      if (frame.portals.has(edge.id) || !frame.rooms.has(edge.roomA)) continue;
      const roomA = frame.rooms.get(edge.roomA);
      if (roomA === undefined) continue;
      const airPortal = new Portal({
        id: edge.id,
        type: airPortalType(edge),
        roomA,
        roomB: frame.rooms.get(edge.roomB) ?? null,
        width: Math.max(edge.areaM2, 0.05),
        height: 1,
        openRatio: portalOpenRatio(edge),
        ...portalOrientation(roomA.config, edge),
      });
      frame.sim.addPortal(airPortal);
      frame.portals.set(edge.id, airPortal);
      frame.axes.set(edge.id, flowAxis(frame, edge));
    }
  }
}

export function readAirRooms(auth: AirAuthorityState, frameId: string): AirRoomView[] {
  const frame = auth.sims.get(frameId);
  if (frame === undefined) return [];
  return [...frame.rooms.keys()].map((roomId) => readAirRoom(frame, roomId));
}

export function readAllAir(auth: AirAuthorityState): Record<string, AirRoomView> {
  const views: Record<string, AirRoomView> = {};
  for (const frame of auth.sims.values()) {
    for (const roomId of frame.rooms.keys()) views[roomId] = readAirRoom(frame, roomId);
  }
  return views;
}

function readAirRoom(frame: FrameAirSim, roomId: string): AirRoomView {
  const room = frame.rooms.get(roomId);
  if (room === undefined) {
    return {
      roomId,
      pressureKpa: 0,
      tempCelsius: 0,
      o2Percent: 0,
      co2Ppm: 0,
      repressurizing: false,
    };
  }
  const pressureKpa = room.pressure / 1000;
  const depleted = pressureKpa < NOMINAL_PRESSURE_KPA * 0.95;
  const repressurizing = depleted && !ventsToVacuum(frame, roomId);
  frame.prevKpa.set(roomId, pressureKpa);
  return buildAirRoomView(room, roomId, pressureKpa, repressurizing);
}

function ventsToVacuum(frame: FrameAirSim, roomId: string): boolean {
  for (const airPortal of frame.portals.values()) {
    if (airPortal.openRatio <= 0 || airPortal.roomB !== null) continue;
    if (airPortal.roomA.id === roomId) return true;
  }
  return false;
}

function buildAirRoomView(
  room: Room,
  roomId: string,
  pressureKpa: number,
  repressurizing: boolean
): AirRoomView {
  const total = room.totalMoles;
  return {
    roomId,
    pressureKpa,
    tempCelsius: room.gas.temperatureK - 273.15,
    o2Percent: total <= 0 ? 0 : (100 * room.gas.moles[GasType.Oxygen]) / total,
    co2Ppm: total <= 0 ? 0 : (1_000_000 * room.gas.moles[GasType.CarbonDioxide]) / total,
    repressurizing,
  };
}

export function refreshAtmos(
  auth: AirAuthorityState,
  world: World,
  dtSeconds: number
): Record<string, AirRoomView> {
  stepAirAuthority(auth, world, dtSeconds);
  return readAllAir(auth);
}

export interface AirFlowReading {
  readonly portalId: string;
  readonly velocityMps: number;
}

/** Complete portal wind table for the debug view (raw m/s, signed on the A->B axis). */
export function readAirFlows(auth: AirAuthorityState): AirFlowReading[] {
  const flows: AirFlowReading[] = [];
  for (const frame of auth.sims.values()) {
    for (const [portalId, airPortal] of frame.portals) {
      if (!Number.isFinite(airPortal.velocity)) continue;
      flows.push({ portalId, velocityMps: airPortal.velocity });
    }
  }
  flows.sort((a, b) => (a.portalId < b.portalId ? -1 : a.portalId > b.portalId ? 1 : 0));
  return flows;
}

export function portalWind(
  auth: AirAuthorityState,
  frameId: string,
  portalId: string
): Vec2 | undefined {
  const frame = auth.sims.get(frameId);
  const airPortal = frame?.portals.get(portalId);
  const axis = frame?.axes.get(portalId);
  if (frame === undefined || airPortal === undefined || axis === undefined) return undefined;
  return { x: axis.x * airPortal.velocity, y: axis.y * airPortal.velocity };
}

export function sampleRoomWind(auth: AirAuthorityState, frameId: string, roomId: string): Vec2 {
  const frame = auth.sims.get(frameId);
  if (frame === undefined) return { x: 0, y: 0 };
  let x = 0;
  let y = 0;
  let count = 0;
  for (const [portalId, airPortal] of frame.portals) {
    const touches = airPortal.roomA.id === roomId || airPortal.roomB?.id === roomId;
    if (!touches) continue;
    const wind = portalWind(auth, frameId, portalId);
    if (wind === undefined) continue;
    x += wind.x;
    y += wind.y;
    count += 1;
  }
  return count === 0 ? { x: 0, y: 0 } : { x: x / count, y: y / count };
}

export function roomAirDensity(
  auth: AirAuthorityState,
  frameId: string,
  roomId: string
): number | undefined {
  const room = auth.sims.get(frameId)?.rooms.get(roomId);
  if (room === undefined || room.volume <= 0) return undefined;
  return (room.totalMoles * room.averageMolarMass) / room.volume;
}

export function addPuncture(
  auth: AirAuthorityState,
  frameId: string,
  roomId: string,
  areaM2: number
): string | undefined {
  const frame = auth.sims.get(frameId);
  const room = frame?.rooms.get(roomId);
  const center = frame?.centers.get(roomId);
  if (frame === undefined || room === undefined || center === undefined) return undefined;
  const id = `puncture.${roomId}.${frame.portals.size}`;
  const airPortal = new Portal({
    id,
    type: PortalType.Puncture,
    roomA: room,
    roomB: null,
    width: Math.max(areaM2, 0.05),
    height: 1,
    openRatio: 1,
    side: 'north',
    position: 0.5,
  });
  frame.sim.addPortal(airPortal);
  frame.portals.set(id, airPortal);
  frame.lockedOpen.add(id);
  const outward = sub({ x: room.config.x, y: room.config.y }, center);
  const len = Math.hypot(outward.x, outward.y);
  frame.axes.set(id, len > 0 ? { x: outward.x / len, y: outward.y / len } : { x: 0, y: -1 });
  return id;
}

export function ventedRooms(
  views: Record<string, AirRoomView>,
  thresholdKpa = NOMINAL_PRESSURE_KPA / 2
): string[] {
  return Object.values(views)
    .filter((view) => view.pressureKpa < thresholdKpa)
    .map((view) => view.roomId);
}

export function dragForceNewtons(wind: Vec2, densityKgM3: number, areaM2 = 0.6, cd = 1.1): Vec2 {
  const speed = Math.hypot(wind.x, wind.y);
  if (!(speed > 0) || !Number.isFinite(densityKgM3) || densityKgM3 <= 0) return { x: 0, y: 0 };
  const force = 0.5 * densityKgM3 * speed * speed * cd * areaM2;
  return { x: (wind.x / speed) * force, y: (wind.y / speed) * force };
}

export function summarizeAirRoom(
  roomId: string,
  pressureKpa: number,
  tempCelsius: number,
  o2Percent: number,
  co2Ppm: number,
  repressurizing: boolean
): AirRoomView {
  return { roomId, pressureKpa, tempCelsius, o2Percent, co2Ppm, repressurizing };
}

export function defaultAirRoom(roomId: string): AirRoomView {
  return summarizeAirRoom(roomId, 101.3, 21, 20.9, 600, false);
}

export function dragForWind(wind: WindProbe, coefficient: number): WindProbe {
  if (!(coefficient > 0)) return { x: 0, y: 0 };
  return { x: wind.x * coefficient, y: wind.y * coefficient };
}
