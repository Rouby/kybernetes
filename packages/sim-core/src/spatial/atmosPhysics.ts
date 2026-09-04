import type { BreachDescriptor, DoorState } from '@kybernetes/protocol';
import { getBreachLocation, HESPERIA_ROOMS, normalizeBreachRoomId } from './deck';

export const ATMOS_GAMMA = 1.4;
export const ATMOS_R_SPECIFIC = 287.05;
export const ATMOS_MOLAR_MASS_AIR = 0.0289647;
export const ATMOS_CP = 1005;
export const ATMOS_CV = 718;
export const ATMOS_DISCHARGE_COEFFICIENT = 0.65;
export const ATMOS_CHOKED_RATIO = 0.528;
export const ATMOS_STANDARD_PRESSURE_PA = 101325;
export const ATMOS_STANDARD_TEMP_K = 294.15;
export const ATMOS_STANDARD_O2_FRAC = 0.209;

export const ATMOS_DOOR_AREA_M2 = 3.0;
export const ATMOS_PURGE_VENT_AREA_M2 = 4.0;
export const ATMOS_FULL_BREACH_AREA_M2 = 1.0;
export const ATMOS_PUNCTURE_REFERENCE_DIAMETER_MM = 40;
export const ATMOS_PARTITION_HOLE_AREA_M2 = punctureAreaM2(ATMOS_PUNCTURE_REFERENCE_DIAMETER_MM);
export const ATMOS_MAX_PARTITION_HOLES_PER_EDGE = 4;

const PX_METERS = 0.05;
const DECK_HEIGHT_M = 2.6;

export interface CompartmentDef {
  id: string;
  roomId: string;
  c1: number;
  c2: number;
  r1: number;
  r2: number;
  volumeM3: number;
}

function roomVolumeM3(roomId: string, fallbackPxArea: number): number {
  const room = HESPERIA_ROOMS.find((r) => r.id === roomId);
  const pxArea = room ? room.width * room.height : fallbackPxArea;
  return pxArea * PX_METERS * PX_METERS * DECK_HEIGHT_M;
}

function corridorThirdVolumeM3(x1: number, x2: number): number {
  return (x2 - x1) * 64 * PX_METERS * PX_METERS * DECK_HEIGHT_M;
}

export const COMPARTMENT_DEFS: CompartmentDef[] = [
  {
    id: 'bridge',
    roomId: 'bridge',
    c1: 6,
    c2: 15,
    r1: 11,
    r2: 17,
    volumeM3: roomVolumeM3('bridge', 28000),
  },
  {
    id: 'avionics',
    roomId: 'avionics',
    c1: 16,
    c2: 21,
    r1: 11,
    r2: 17,
    volumeM3: roomVolumeM3('avionics', 16800),
  },
  {
    id: 'life_support',
    roomId: 'life_support',
    c1: 22,
    c2: 29,
    r1: 11,
    r2: 17,
    volumeM3: roomVolumeM3('life_support', 22400),
  },
  {
    id: 'quarters',
    roomId: 'quarters',
    c1: 30,
    c2: 37,
    r1: 11,
    r2: 17,
    volumeM3: roomVolumeM3('quarters', 22400),
  },
  {
    id: 'mess',
    roomId: 'mess',
    c1: 38,
    c2: 45,
    r1: 11,
    r2: 17,
    volumeM3: roomVolumeM3('mess', 22400),
  },
  {
    id: 'airlock_stbd',
    roomId: 'airlock_stbd',
    c1: 46,
    c2: 50,
    r1: 11,
    r2: 17,
    volumeM3: roomVolumeM3('airlock_stbd', 14000),
  },
  {
    id: 'armory',
    roomId: 'armory',
    c1: 6,
    c2: 15,
    r1: 22,
    r2: 28,
    volumeM3: roomVolumeM3('armory', 28000),
  },
  {
    id: 'airlock_port',
    roomId: 'airlock_port',
    c1: 16,
    c2: 21,
    r1: 22,
    r2: 28,
    volumeM3: roomVolumeM3('airlock_port', 16800),
  },
  {
    id: 'cargo',
    roomId: 'cargo',
    c1: 22,
    c2: 37,
    r1: 22,
    r2: 28,
    volumeM3: roomVolumeM3('cargo', 44800),
  },
  {
    id: 'engineering',
    roomId: 'engineering',
    c1: 38,
    c2: 50,
    r1: 22,
    r2: 28,
    volumeM3: roomVolumeM3('engineering', 36400),
  },
  {
    id: 'corridor_fwd',
    roomId: 'corridor',
    c1: 6,
    c2: 21,
    r1: 18,
    r2: 21,
    volumeM3: corridorThirdVolumeM3(120, 440),
  },
  {
    id: 'corridor_mid',
    roomId: 'corridor',
    c1: 22,
    c2: 37,
    r1: 18,
    r2: 21,
    volumeM3: corridorThirdVolumeM3(440, 760),
  },
  {
    id: 'corridor_aft',
    roomId: 'corridor',
    c1: 38,
    c2: 50,
    r1: 18,
    r2: 21,
    volumeM3: corridorThirdVolumeM3(760, 1020),
  },
];

export function punctureAreaM2(diameterMm: number): number {
  const r = diameterMm / 2000;
  return Math.PI * r * r;
}

export function parseBreachDescriptors(breaches: string[]): BreachDescriptor[] {
  const out: BreachDescriptor[] = [];
  for (const b of breaches) {
    const roomId = normalizeBreachRoomId(b);
    if (b.startsWith('puncture_')) {
      const loc = getBreachLocation(b);
      out.push({
        id: b,
        roomId,
        kind: 'puncture',
        areaM2: punctureAreaM2(ATMOS_PUNCTURE_REFERENCE_DIAMETER_MM),
        x: loc?.x,
        y: loc?.y,
      });
    } else {
      const loc = getBreachLocation(b);
      out.push({
        id: b,
        roomId,
        kind: 'breach',
        areaM2: ATMOS_FULL_BREACH_AREA_M2,
        x: loc?.x,
        y: loc?.y,
      });
    }
  }
  return out;
}

export interface FlowEdge {
  a: number;
  b: number;
  areaM2: number;
}

export interface VacuumEdge {
  comp: number;
  areaM2: number;
}

export function subCompartmentId(roomId: string, x: number): string {
  if (roomId !== 'corridor') return roomId;
  if (x <= 440) return 'corridor_fwd';
  if (x < 760) return 'corridor_mid';
  return 'corridor_aft';
}

export function compartmentIndex(id: string): number {
  return COMPARTMENT_DEFS.findIndex((c) => c.id === id);
}

function roomAt(x: number, y: number): string | null {
  for (const r of HESPERIA_ROOMS) {
    if (x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height) return r.id;
  }
  return null;
}

export interface PartitionHoleInput {
  x: number;
  y: number;
  wallId: string;
}

function partitionHoleEdge(hole: PartitionHoleInput): FlowEdge | null {
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
  const roomA = roomAt(ax, ay);
  const roomB = roomAt(bx, by);
  if (!roomA || !roomB || roomA === roomB) {
    if (roomA && roomB && roomA === roomB) return null;
    if (!roomA || !roomB) return null;
  }
  const compA = compartmentIndex(subCompartmentId(roomA as string, ax));
  const compB = compartmentIndex(subCompartmentId(roomB as string, bx));
  if (compA === -1 || compB === -1 || compA === compB) return null;
  return {
    a: Math.min(compA, compB),
    b: Math.max(compA, compB),
    areaM2: ATMOS_PARTITION_HOLE_AREA_M2,
  };
}

export interface CompartmentGraph {
  interiorEdges: FlowEdge[];
  vacuumEdges: VacuumEdge[];
}

function doorVacuumEdge(d: DoorState, midX: number): VacuumEdge | null {
  const roomId = d.roomA === 'vacuum' ? d.roomB : d.roomA;
  const comp = compartmentIndex(subCompartmentId(roomId, midX));
  if (comp === -1) return null;
  const area = d.id === 'airlock_eng' ? ATMOS_PURGE_VENT_AREA_M2 : ATMOS_DOOR_AREA_M2;
  return { comp, areaM2: area };
}

function doorInteriorEdge(d: DoorState, midX: number): FlowEdge | null {
  let compA = -1;
  let compB = -1;
  if (d.id === 'door_spine_fwd') {
    compA = compartmentIndex('corridor_fwd');
    compB = compartmentIndex('corridor_mid');
  } else if (d.id === 'door_spine_aft') {
    compA = compartmentIndex('corridor_mid');
    compB = compartmentIndex('corridor_aft');
  } else {
    compA = compartmentIndex(subCompartmentId(d.roomA, midX));
    compB = compartmentIndex(subCompartmentId(d.roomB, midX));
  }
  if (compA === -1 || compB === -1 || compA === compB) return null;
  return {
    a: Math.min(compA, compB),
    b: Math.max(compA, compB),
    areaM2: ATMOS_DOOR_AREA_M2,
  };
}

function collectPartitionEdges(holes: PartitionHoleInput[] | undefined, out: FlowEdge[]): void {
  if (!holes) return;
  const edgeCounts = new Map<string, number>();
  for (const hole of holes) {
    const edge = partitionHoleEdge(hole);
    if (!edge) continue;
    const key = `${edge.a}_${edge.b}`;
    const count = edgeCounts.get(key) ?? 0;
    if (count >= ATMOS_MAX_PARTITION_HOLES_PER_EDGE) continue;
    edgeCounts.set(key, count + 1);
    out.push(edge);
  }
}

export function buildCompartmentGraph(
  doors: DoorState[],
  breaches: string[],
  partitionHoles?: PartitionHoleInput[]
): CompartmentGraph {
  const interiorEdges: FlowEdge[] = [];
  const vacuumEdges: VacuumEdge[] = [];

  for (const d of doors) {
    if (!d.isOpen) continue;
    const midX = (d.x1 + d.x2) / 2;
    if (d.roomA === 'vacuum' || d.roomB === 'vacuum') {
      const edge = doorVacuumEdge(d, midX);
      if (edge) vacuumEdges.push(edge);
      continue;
    }
    const edge = doorInteriorEdge(d, midX);
    if (edge) interiorEdges.push(edge);
  }

  for (const desc of parseBreachDescriptors(breaches)) {
    const comp = compartmentIndex(subCompartmentId(desc.roomId, desc.x ?? 0));
    if (comp === -1) continue;
    vacuumEdges.push({ comp, areaM2: desc.areaM2 });
  }

  collectPartitionEdges(partitionHoles, interiorEdges);

  return { interiorEdges, vacuumEdges };
}

export function orificeMassFlowKgPerS(
  pUpPa: number,
  tUpK: number,
  pDownPa: number,
  areaM2: number
): number {
  if (pUpPa <= 0 || tUpK <= 0 || areaM2 <= 0) return 0;
  if (pDownPa >= pUpPa) return 0;
  const eta = pDownPa / pUpPa;
  const cdA = ATMOS_DISCHARGE_COEFFICIENT * areaM2;
  if (eta <= ATMOS_CHOKED_RATIO) {
    const chokeFactor =
      (1 + (ATMOS_GAMMA - 1) / 2) ** (-(ATMOS_GAMMA + 1) / (2 * (ATMOS_GAMMA - 1)));
    return cdA * pUpPa * Math.sqrt(ATMOS_GAMMA / (ATMOS_R_SPECIFIC * tUpK)) * chokeFactor;
  }
  const term = eta ** (2 / ATMOS_GAMMA) - eta ** ((ATMOS_GAMMA + 1) / ATMOS_GAMMA);
  if (term <= 0) return 0;
  const factor = Math.sqrt((2 * ATMOS_GAMMA) / ((ATMOS_GAMMA - 1) * ATMOS_R_SPECIFIC * tUpK));
  return cdA * pUpPa * factor * Math.sqrt(term);
}

export interface CompartmentState {
  pressurePa: number;
  tempK: number;
  o2Frac: number;
  co2Frac: number;
}

export interface CompartmentTickResult extends CompartmentState {
  dpdtPaPerS: number;
  venting: boolean;
}

export function createNominalCompartmentState(): CompartmentState {
  return {
    pressurePa: ATMOS_STANDARD_PRESSURE_PA,
    tempK: ATMOS_STANDARD_TEMP_K,
    o2Frac: ATMOS_STANDARD_O2_FRAC,
    co2Frac: 0.0004,
  };
}

interface MolePool {
  n: number;
  e: number;
  o2: number;
  co2: number;
}

interface FlowContext {
  moles: MolePool[];
  volumes: number[];
  subDt: number;
}

function pressureAt(ctx: FlowContext, i: number): number {
  const m = ctx.moles[i];
  if (m.n <= 1e-9) return 0;
  return (m.n * 8.314462618 * (m.e / (ATMOS_CV * m.n))) / ctx.volumes[i];
}

function tempAt(ctx: FlowContext, i: number): number {
  const m = ctx.moles[i];
  if (m.n <= 1e-9) return 3.0;
  return m.e / (ATMOS_CV * m.n);
}

function fractionsAt(ctx: FlowContext, i: number): { o2: number; co2: number } {
  const m = ctx.moles[i];
  if (m.n <= 1e-12) return { o2: ATMOS_STANDARD_O2_FRAC, co2: 0.0004 };
  return { o2: m.o2 / m.n, co2: m.co2 / m.n };
}

function moveMoles(ctx: FlowContext, from: number, to: number, dn: number, tUp: number): void {
  if (dn <= 0) return;
  const frac = fractionsAt(ctx, from);
  const src = ctx.moles[from];
  src.n -= dn;
  src.e -= ATMOS_CP * tUp * dn;
  src.o2 -= frac.o2 * dn;
  src.co2 -= frac.co2 * dn;
  if (to >= 0) {
    const dst = ctx.moles[to];
    dst.n += dn;
    dst.e += ATMOS_CP * tUp * dn;
    dst.o2 += frac.o2 * dn;
    dst.co2 += frac.co2 * dn;
  }
  if (src.n < 0) src.n = 0;
  if (src.o2 < 0) src.o2 = 0;
  if (src.co2 < 0) src.co2 = 0;
}

function equilibriumMoles(
  ctx: FlowContext,
  donor: number,
  recip: number,
  pDonor: number,
  pRecip: number
): number {
  const tDonor = tempAt(ctx, donor);
  const tRecip = Math.max(tempAt(ctx, recip), 3);
  const denom = 8.314462618 * (tDonor / ctx.volumes[donor] + tRecip / ctx.volumes[recip]);
  return (pDonor - pRecip) / denom;
}

function relaxInteriorEdge(ctx: FlowContext, e: FlowEdge): void {
  let donor = e.a;
  let recip = e.b;
  if (pressureAt(ctx, recip) > pressureAt(ctx, donor)) {
    donor = e.b;
    recip = e.a;
  }
  const pDonor = pressureAt(ctx, donor);
  const pRecip = pressureAt(ctx, recip);
  if (pDonor <= pRecip + 1e-6 || ctx.moles[donor].n <= 1e-9) return;
  const tDonor = tempAt(ctx, donor);
  const mdot = orificeMassFlowKgPerS(pDonor, tDonor, pRecip, e.areaM2);
  if (mdot <= 0) return;
  const dnEq = equilibriumMoles(ctx, donor, recip, pDonor, pRecip);
  let dn = (mdot / ATMOS_MOLAR_MASS_AIR) * ctx.subDt;
  if (dnEq > 0 && dn > dnEq * 0.5) dn = dnEq * 0.5;
  dn = Math.min(dn, ctx.moles[donor].n * 0.25);
  moveMoles(ctx, donor, recip, dn, tDonor);
}

function ventVacuumEdge(ctx: FlowContext, v: VacuumEdge): void {
  const m = ctx.moles[v.comp];
  if (m.n <= 1e-9) return;
  const pUp = pressureAt(ctx, v.comp);
  if (pUp <= 1) return;
  const tUp = tempAt(ctx, v.comp);
  const mdot = orificeMassFlowKgPerS(pUp, tUp, 0, v.areaM2);
  if (mdot <= 0) return;
  const dn = Math.min((mdot / ATMOS_MOLAR_MASS_AIR) * ctx.subDt, m.n * 0.25);
  moveMoles(ctx, v.comp, -1, dn, tUp);
}

function runFlowSubstep(ctx: FlowContext, graph: CompartmentGraph): void {
  for (const e of graph.interiorEdges) relaxInteriorEdge(ctx, e);
  for (const v of graph.vacuumEdges) ventVacuumEdge(ctx, v);
}

function stateToMoles(s: CompartmentState, volumeM3: number): MolePool {
  const n = (s.pressurePa * volumeM3) / (8.314462618 * s.tempK);
  return { n, e: ATMOS_CV * n * s.tempK, o2: n * s.o2Frac, co2: n * s.co2Frac };
}

export function tickCompartments(
  states: CompartmentState[],
  graph: CompartmentGraph,
  dtSeconds: number
): CompartmentTickResult[] {
  const volumes = COMPARTMENT_DEFS.map((c) => c.volumeM3);
  const p0 = states.map((s) => s.pressurePa);
  const subSteps = 4;
  const ctx: FlowContext = {
    moles: states.map((s, i) => stateToMoles(s, volumes[i])),
    volumes,
    subDt: Math.min(0.1, dtSeconds) / subSteps,
  };

  for (let step = 0; step < subSteps; step++) {
    runFlowSubstep(ctx, graph);
  }

  const dt = Math.min(0.1, dtSeconds);
  return states.map((_s, i) => {
    const m = ctx.moles[i];
    let pPa = 0;
    let tK = 3.0;
    let o2Frac = 0;
    let co2Frac = 0;
    if (m.n > 1e-9) {
      tK = Math.max(3, Math.min(1200, m.e / (ATMOS_CV * m.n)));
      pPa = (m.n * 8.314462618 * tK) / volumes[i];
      o2Frac = Math.max(0, Math.min(1, m.o2 / m.n));
      co2Frac = Math.max(0, Math.min(1, m.co2 / m.n));
    }
    return {
      pressurePa: pPa,
      tempK: tK,
      o2Frac,
      co2Frac,
      dpdtPaPerS: dt > 0 ? (pPa - p0[i]) / dt : 0,
      venting: pPa > 500 && pPa < p0[i] - 50,
    };
  });
}

export function getBreachWeldSeconds(breachId: string): number {
  if (breachId.startsWith('puncture_')) return 3.0;
  return 8.0;
}
