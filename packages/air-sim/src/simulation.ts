import { GAMMA, type GasType, R_GAS } from './constants';
import type { Portal } from './portal';
import type { Room } from './room';

const CHOKED_PRESSURE_RATIO = (2 / (GAMMA + 1)) ** (GAMMA / (GAMMA - 1));
const CHOKED_FLOW_FACTOR = Math.sqrt(
  ((2 * GAMMA) / (GAMMA - 1)) *
    (CHOKED_PRESSURE_RATIO ** (2 / GAMMA) - CHOKED_PRESSURE_RATIO ** ((GAMMA + 1) / GAMMA))
);
const MIN_PRESSURE_DIFFERENCE = 0.1; // Pa

interface PortalFlow {
  source: Room;
  target: Room | null;
  molarRate: number; // mol/s
}

interface ActiveFlow extends PortalFlow {
  portal: Portal;
  initialRate: number;
}

interface RoomUpdate {
  moles: Record<GasType, number>;
  thermalContent: number; // n*T; common molar heat capacity cancels when mixing
}

/** One donor's share of a room's outflow within a tick. Debits are split
 *  across these pro-rata so room energy is conserved exactly. */
interface FlowDebit {
  target: RoomUpdate | null;
  moved: number;
}

/** Species leave in start-of-tick proportions, so portal order never matters. */
function moveStartMix(
  sourceUpdate: RoomUpdate,
  targetUpdate: RoomUpdate | null,
  source: Room,
  fraction: number
): void {
  for (const [gas, moles] of Object.entries(source.gas.moles)) {
    const gasType = gas as GasType;
    const transfer = moles * fraction;
    sourceUpdate.moles[gasType] = Math.max(0, sourceUpdate.moles[gasType] - transfer);
    if (targetUpdate) targetUpdate.moles[gasType] = (targetUpdate.moles[gasType] ?? 0) + transfer;
  }
}

/**
 * Moles transferable before source and target pressures cross, accounting
 * for the thermal kick: the source cools along (1-F)^γ while the target
 * absorbs the same debit, so mole-only equalization overshoots once heat
 * is applied. Solved by bisection with the exact outflow-energy formulas
 * settleOutflowEnergy applies, so the stability clamp and the transfer
 * agree by construction. Vacuum targets cannot overshoot and stay uncapped.
 */
function crossingTransferCap(source: Room, target: Room | null): number {
  if (target === null || target.volume <= 0 || source.volume <= 0) {
    return Number.POSITIVE_INFINITY;
  }
  const startMoles = source.totalMoles;
  if (!(startMoles > 0)) return 0;
  const startTemp = source.gas.temperatureK;
  const startContent = startMoles * startTemp;
  const targetContent = target.totalMoles * target.gas.temperatureK;
  const stiffSource = R_GAS / source.volume;
  const stiffTarget = R_GAS / target.volume;
  const gap = (moved: number): number => {
    const fallen = Math.min(1, moved / startMoles);
    const sourcePressure =
      stiffSource * (startMoles - moved) * startTemp * (1 - fallen) ** (GAMMA - 1);
    const targetPressure =
      stiffTarget * (targetContent + startContent * (1 - (1 - fallen) ** GAMMA));
    return sourcePressure - targetPressure;
  };
  if (gap(0) <= 0) return 0;
  const ceiling = startMoles * (1 - 1e-9);
  if (gap(ceiling) > 0) return ceiling;
  let lo = 0;
  let hi = ceiling;
  for (let i = 0; i < 32; i += 1) {
    const mid = (lo + hi) / 2;
    if (gap(mid) > 0) lo = mid;
    else hi = mid;
  }
  return lo;
}

function recordOutflow(
  outflows: Map<Room, FlowDebit[]>,
  source: Room,
  target: RoomUpdate | null,
  moved: number
): void {
  const list = outflows.get(source);
  if (list === undefined) outflows.set(source, [{ target, moved }]);
  else list.push({ target, moved });
}

/** Settle a room's outflow exactly along (1-F)^γ for its total outflow
 *  fraction F, crediting each donor pro-rata. Exact for blowdown, exact
 *  conservation, and identical for every portal order. */
function settleOutflowEnergy(room: Room, update: RoomUpdate, list: readonly FlowDebit[]): void {
  const startMoles = Math.max(1e-9, room.totalMoles);
  const moved = list.reduce((sum, out) => sum + out.moved, 0);
  const fallen = Math.min(1, moved / startMoles);
  const startContent = startMoles * room.gas.temperatureK;
  const debit = startContent * (1 - (1 - fallen) ** GAMMA);
  // Subtract: the room may already hold credits as someone else's target.
  update.thermalContent -= debit;
  if (!(moved > 0)) return;
  for (const out of list) {
    if (out.target) out.target.thermalContent += (debit * out.moved) / moved;
  }
}

export interface DragTarget {
  room: Room;
  position: { x: number; y: number };
  velocity?: { x: number; y: number }; // m/s, defaults to (0, 0, 0)
  projectedArea: number; // m^2 (e.g., ~0.6 m^2 for standing human facing wind)
  dragCoefficient?: number; // Cd: ~1.0–1.2 for humans, ~0.47 for spheres, ~1.05 for boxes

  applyDrag?(dragResult: DragResult): void;
}

export interface DragResult {
  force: { x: number; y: number }; // Newtons (N)
  windVelocity: { x: number; y: number }; // Local gas velocity at the target point (m/s)
  dynamicPressure: number; // 0.5 * rho * v^2 (Pa)
}

function molarFlowRate(
  portal: Portal,
  source: Room,
  downstreamPressure: number,
  alignedVelocity: number
): number {
  // Clamp the pressure ratio at the sonic threshold: the compressible subsonic
  // expression then gives a continuous, constant choked flow below that ratio.
  const ratio = Math.max(CHOKED_PRESSURE_RATIO, downstreamPressure / source.pressure);
  const flowFactor = Math.sqrt(
    ((2 * GAMMA) / (GAMMA - 1)) * (ratio ** (2 / GAMMA) - ratio ** ((GAMMA + 1) / GAMMA))
  );
  const denominator = Math.sqrt(R_GAS * source.gas.temperatureK * source.averageMolarMass);
  const baseRate =
    (portal.dischargeCoefficient * portal.effectiveArea * source.pressure) / denominator;

  // Orifice-limited nozzle rate from the local pressure ratio.
  const nozzleRate = baseRate * flowFactor;

  // Momentum-driven bulk flow from the tracked portal velocity.
  // This propagates pressure changes through room networks (e.g. corridor as
  // wind tunnel) even when the local ΔP is small.
  const density = (source.totalMoles * source.averageMolarMass) / source.volume;
  const velocityRate = (density * portal.effectiveArea * alignedVelocity) / source.averageMolarMass;

  // Use the dominant mechanism, capped at the choked orifice limit.
  const chokedRate = baseRate * CHOKED_FLOW_FACTOR;
  return Math.min(Math.max(velocityRate, nozzleRate), chokedRate);
}

function proposeFlow(portal: Portal, dt: number): PortalFlow | null {
  const deltaP = portal.roomA.pressure - (portal.roomB?.pressure ?? 0);
  if (portal.effectiveArea <= 0 || Math.abs(deltaP) < MIN_PRESSURE_DIFFERENCE) {
    // No driving force — let velocity decay via drag.
    portal.velocity *= Math.max(0, 1 - 0.1 * Math.abs(portal.velocity) * dt);
    return null;
  }
  const [source, target] = deltaP > 0 ? [portal.roomA, portal.roomB] : [portal.roomB, portal.roomA];
  if (!source || source.volume === 0) return null;
  // Update the momentum-tracked portal velocity. Velocity is signed relative
  // to the A→B axis; acceleration follows the pressure gradient direction.
  const density = (source.totalMoles * source.averageMolarMass) / source.volume;
  const effectiveDistance = Math.max(1, portal.distance);
  const accel = deltaP / (density * effectiveDistance);
  // Semi-implicit integration: solve  v' = v + (a - k·v'·|v'|)·dt  for v'.
  // Terminal velocity where drag balances acceleration: v_t = sqrt(|a|/k).
  const k = 0.1;
  const terminalSpeed = Math.sqrt(Math.abs(accel) / k);
  const v0 = portal.velocity + accel * dt;
  // Implicit drag step: v' + k·|v'|·v'·dt = v0  →  solve quadratic in |v'|.
  const c = k * dt;
  const absV = (Math.sqrt(1 + 4 * c * Math.abs(v0)) - 1) / (2 * c);
  // Portal throat velocity cannot exceed Mach 1
  const soundSpeed = Math.sqrt((GAMMA * R_GAS * source.gas.temperatureK) / source.averageMolarMass);
  portal.velocity = Math.sign(v0) * Math.min(absV, terminalSpeed, soundSpeed);
  if (Math.abs(deltaP) < 100) {
    // Within 100 Pa of balance
    portal.velocity *= Math.exp(-5 * dt); // Strong damping
  }
  // Only count velocity that is aligned with the current flow direction.
  const alignedVelocity = Math.max(0, portal.velocity * Math.sign(deltaP));
  const molarRate = molarFlowRate(portal, source, target?.pressure ?? 0, alignedVelocity);
  return Number.isFinite(molarRate) && molarRate > 0 ? { source, target, molarRate } : null;
}

function applyUpdates(updates: Map<Room, RoomUpdate>): void {
  for (const [room, update] of updates) {
    const totalMoles = Object.values(update.moles).reduce(
      (sum, moles) => sum + Math.max(0, moles),
      0
    );

    room.gas = {
      moles: update.moles,
      temperatureK:
        totalMoles > 1e-6 ? Math.max(1, update.thermalContent / totalMoles) : room.gas.temperatureK,
    };
  }
}

function roomStiffness(room: Room | null): number {
  if (!room || room.volume <= 0) return 0;
  return (R_GAS * room.gas.temperatureK) / room.volume; // Pa per mole
}

/** Stage 1: baseline physical flow per portal; non-positive rates are dropped. */
function proposeFlows(portals: readonly Portal[], dt: number): ActiveFlow[] {
  const flows: ActiveFlow[] = [];
  for (const portal of portals) {
    const flow = proposeFlow(portal, dt);
    if (flow && flow.molarRate > 0) {
      flows.push({ ...flow, portal, initialRate: flow.molarRate });
    }
  }
  return flows;
}

/**
 * Stage A: pairwise capacity clamp. No single portal may overshoot the
 * two-body equilibrium (mole bound tightened by the thermal crossing cap)
 * within one tick.
 */
function clampPairwiseCapacity(flows: ActiveFlow[], dt: number): void {
  for (const flow of flows) {
    const pTarget = flow.target?.pressure ?? 0;
    const deltaP = flow.source.pressure - pTarget;
    if (deltaP <= 0) {
      flow.molarRate = 0;
      continue;
    }
    const moleCap = deltaP / (roomStiffness(flow.source) + roomStiffness(flow.target));
    const maxPairMoles = Math.min(moleCap, crossingTransferCap(flow.source, flow.target));
    const maxPairRate = (maxPairMoles * 0.9) / dt; // 0.9 to stay strictly below overshoot
    flow.molarRate = Math.min(flow.molarRate, maxPairRate);
  }
}

/** Stage B: no room with multiple exits loses more than 85% of its mass. */
function limitOutflowDepletion(flows: ActiveFlow[], rooms: Iterable<Room>, dt: number): void {
  for (const room of rooms) {
    const roomOutflows = flows.filter((f) => f.source.id === room.id && f.molarRate > 0);
    const totalOutMoles = roomOutflows.reduce((sum, f) => sum + f.molarRate * dt, 0);
    const maxOutMoles = room.totalMoles * 0.85;
    if (totalOutMoles > maxOutMoles && totalOutMoles > 0) {
      const scale = maxOutMoles / totalOutMoles;
      for (const f of roomOutflows) f.molarRate *= scale;
    }
  }
}

/** One relaxation pass: trim inflows that would push a target above a donor. */
function relaxInflowsOnce(
  flows: ActiveFlow[],
  rooms: Iterable<Room>,
  netMoles: Map<string, number>,
  dt: number
): void {
  for (const room of rooms) {
    const incoming = flows.filter((f) => f.target?.id === room.id && f.molarRate > 0);
    if (incoming.length === 0) continue;
    const stiffTarget = roomStiffness(room);
    const targetPredicted = room.pressure + stiffTarget * (netMoles.get(room.id) ?? 0);
    for (const f of incoming) {
      const sourcePredicted =
        f.source.pressure + roomStiffness(f.source) * (netMoles.get(f.source.id) ?? 0);
      if (targetPredicted > sourcePredicted) {
        // Target rose above this donor: subtract only the exact excess moles.
        const excessMoles =
          (targetPredicted - sourcePredicted) / (stiffTarget + roomStiffness(f.source));
        f.molarRate = Math.max(0, f.molarRate - excessMoles / dt);
      }
    }
  }
}

/**
 * Stage C: multi-inflow excess relaxation. Recomputes net transfers a few
 * times so shared targets settle instead of overshooting one donor.
 */
function relaxMultiInflow(flows: ActiveFlow[], rooms: Iterable<Room>, dt: number): void {
  for (let pass = 0; pass < 3; pass += 1) {
    const netMoles = new Map<string, number>();
    for (const room of rooms) netMoles.set(room.id, 0);
    for (const f of flows) {
      if (f.molarRate <= 0) continue;
      const moles = f.molarRate * dt;
      netMoles.set(f.source.id, (netMoles.get(f.source.id) ?? 0) - moles);
      if (f.target) netMoles.set(f.target.id, (netMoles.get(f.target.id) ?? 0) + moles);
    }
    relaxInflowsOnce(flows, rooms, netMoles, dt);
  }
}

/** Stage 5: scale tracked portal momentum down to the clamped flow. */
function reconcilePortalMomentum(flows: ActiveFlow[]): void {
  for (const flow of flows) {
    if (flow.initialRate > 0) {
      const ratio = Math.max(0, Math.min(1, flow.molarRate / flow.initialRate));
      flow.portal.velocity *= ratio;
    } else {
      flow.portal.velocity = 0;
    }
  }
}

interface TransferMaps {
  roomFlows: Map<string, (ActiveFlow & { isOutflow: boolean })[]>;
  updates: Map<Room, RoomUpdate>;
}

/**
 * Stage 6: move species in start-of-tick proportions and settle outflow
 * energy exactly. Returns staged updates plus the per-room flow lists the
 * drag probes read; the caller applies updates after probing.
 */
function stageTransfers(flows: readonly ActiveFlow[], dt: number): TransferMaps {
  const updates = new Map<Room, RoomUpdate>();
  const getUpdate = (room: Room): RoomUpdate => {
    let staged = updates.get(room);
    if (!staged) {
      staged = {
        moles: { ...room.gas.moles },
        thermalContent: room.totalMoles * room.gas.temperatureK,
      };
      updates.set(room, staged);
    }
    return staged;
  };
  const roomFlows = new Map<string, (ActiveFlow & { isOutflow: boolean })[]>();
  const outflows = new Map<Room, FlowDebit[]>();
  for (const flow of flows) {
    const { source, target, molarRate } = flow;
    if (molarRate <= 0) continue;
    if (!roomFlows.has(source.id)) roomFlows.set(source.id, []);
    // biome-ignore lint/style/noNonNullAssertion: guaranteed by set
    roomFlows.get(source.id)!.push({ ...flow, isOutflow: true });
    if (target) {
      if (!roomFlows.has(target.id)) roomFlows.set(target.id, []);
      // biome-ignore lint/style/noNonNullAssertion: guaranteed by set
      roomFlows.get(target.id)!.push({ ...flow, isOutflow: false });
    }
    const sourceUpdate = getUpdate(source);
    const targetUpdate = target ? getUpdate(target) : null;
    const moved = molarRate * dt;
    const fraction = Math.min(1, moved / Math.max(1e-6, source.totalMoles));
    moveStartMix(sourceUpdate, targetUpdate, source, fraction);
    recordOutflow(outflows, source, targetUpdate, moved);
  }
  for (const [room, list] of outflows) settleOutflowEnergy(room, getUpdate(room), list);
  return { roomFlows, updates };
}

function portalPosition(portal: Portal) {
  const { x, y, width, length: depth } = portal.roomA.config;
  const horizontal = portal.side === 'north' || portal.side === 'south';
  const wallLength = horizontal ? width : depth;
  // Approximate a square aperture for drawing; never shrink a closed door to zero.
  const length = Math.min(Math.max(0, portal.width), wallLength);
  const offset = Math.max(
    0,
    Math.min(wallLength - length, wallLength * portal.position - length / 2)
  );

  // return center of opening
  return {
    x: x + (horizontal ? offset : portal.side === 'east' ? width : 0) + length / 2,
    y: y + (horizontal ? (portal.side === 'south' ? depth : 0) : offset) + length / 2,
  };
}

export class AtmosphereSimulation {
  readonly rooms = new Map<string, Room>();
  readonly portals: Portal[] = [];
  readonly entities: DragTarget[] = [];

  addRoom(room: Room): void {
    this.rooms.set(room.id, room);
  }

  addPortal(portal: Portal): void {
    this.portals.push(portal);
  }

  addEntity(entity: DragTarget): void {
    this.entities.push(entity);
  }

  step(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const flows = proposeFlows(this.portals, dt);
    if (flows.length === 0) return;
    clampPairwiseCapacity(flows, dt);
    limitOutflowDepletion(flows, this.rooms.values(), dt);
    relaxMultiInflow(flows, this.rooms.values(), dt);
    reconcilePortalMomentum(flows);
    const { roomFlows, updates } = stageTransfers(flows, dt);
    for (const entity of this.entities) {
      const drag = this.calculateRoomDragForce(entity, roomFlows.get(entity.room.id) ?? []);
      if (drag && entity.applyDrag) {
        entity.applyDrag(drag);
      }
    }
    applyUpdates(updates);
  }

  private calculateRoomDragForce(
    target: DragTarget,
    activeFlows: (ActiveFlow & { isOutflow: boolean })[]
  ): DragResult {
    const room = target.room;
    const targetVel = target.velocity ?? { x: 0, y: 0 };
    const cd = target.dragCoefficient ?? 1.1;

    // 1. Thermodynamic properties of bulk gas
    const totalMoles = Math.max(1e-6, room.totalMoles);
    const gasMass = totalMoles * room.averageMolarMass; // kg
    const density = gasMass / Math.max(0.001, room.volume); // kg/m^3

    const soundSpeed = Math.sqrt((GAMMA * R_GAS * room.gas.temperatureK) / room.averageMolarMass);

    // 2. Superposition of velocity fields generated by active portals (sink/source model)
    const netWind = { x: 0, y: 0 };

    for (const { portal, molarRate, isOutflow } of activeFlows) {
      if (molarRate <= 0 || portal.effectiveArea <= 0) continue;

      // Volumetric flow rate through portal: Q = (n_dot * M) / rho (m^3/s)
      const volumetricRate = (molarRate * room.averageMolarMass) / Math.max(1e-6, density);

      // Vector from target position to portal center
      const { x, y } = portalPosition(portal);
      const dx = x - target.position.x;
      const dy = y - target.position.y;
      const distSq = dx * dx + dy * dy;
      const distance = Math.sqrt(distSq);

      // Hemispherical sink model:
      // Far-field area = 2 * π * r^2
      // Near-field smoothly transitions to portal orifice area (prevents singularity at r=0)
      const flowCrossSection = 2 * Math.PI * distSq + portal.effectiveArea;
      let localSpeed = volumetricRate / flowCrossSection;

      // Throat velocity cannot exceed local Mach 1
      localSpeed = Math.min(localSpeed, soundSpeed);

      if (distance > 1e-4) {
        // Outflow pulls gas toward portal; inflow pushes gas away into the room
        const dirSign = isOutflow ? 1 : -1;
        const ux = (dx / distance) * dirSign;
        const uy = (dy / distance) * dirSign;

        netWind.x += ux * localSpeed;
        netWind.y += uy * localSpeed;
      } else {
        // Entity is at portal location, distance = 0
        const dirSign = isOutflow ? 1 : -1;
        const ux = portal.side === 'east' ? 1 : portal.side === 'west' ? -1 : 0;
        const uy = portal.side === 'south' ? 1 : portal.side === 'north' ? -1 : 0;
        netWind.x += ux * localSpeed * dirSign;
        netWind.y += uy * localSpeed * dirSign;
      }
    }

    // 3. Compute relative wind velocity (v_rel = v_wind - v_object)
    const relVx = netWind.x - targetVel.x;
    const relVy = netWind.y - targetVel.y;
    const relSpeedSq = relVx * relVx + relVy * relVy;
    const relSpeed = Math.sqrt(relSpeedSq);

    // 4. Aerodynamic Drag: F = 0.5 * rho * v_rel^2 * Cd * A
    const dynamicPressure = 0.5 * density * relSpeedSq;
    const forceMagnitude = dynamicPressure * cd * target.projectedArea;

    const force = { x: 0, y: 0 };
    if (relSpeed > 1e-5) {
      force.x = forceMagnitude * (relVx / relSpeed);
      force.y = forceMagnitude * (relVy / relSpeed);
    }

    return {
      force,
      windVelocity: netWind,
      dynamicPressure,
    };
  }
}
