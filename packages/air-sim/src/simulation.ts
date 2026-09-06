import { GAMMA, type GasType, R_GAS } from './constants';
import type { Portal } from './portal';
import type { Room } from './room';

const CHOKED_PRESSURE_RATIO = (2 / (GAMMA + 1)) ** (GAMMA / (GAMMA - 1));
const MIN_PRESSURE_DIFFERENCE = 0.1; // Pa

interface PortalFlow {
  source: Room;
  target: Room | null;
  molarRate: number; // mol/s
}

interface RoomUpdate {
  moles: Record<GasType, number>;
  thermalContent: number; // n*T; common molar heat capacity cancels when mixing
}

function molarFlowRate(portal: Portal, source: Room, downstreamPressure: number): number {
  // Clamp the pressure ratio at the sonic threshold: the compressible subsonic
  // expression then gives a continuous, constant choked flow below that ratio.
  const ratio = Math.max(CHOKED_PRESSURE_RATIO, downstreamPressure / source.pressure);
  const flowFactor = Math.sqrt(
    ((2 * GAMMA) / (GAMMA - 1)) * (ratio ** (2 / GAMMA) - ratio ** ((GAMMA + 1) / GAMMA))
  );
  const denominator = Math.sqrt(R_GAS * source.gas.temperatureK * source.averageMolarMass);
  return (
    (portal.dischargeCoefficient * portal.effectiveArea * source.pressure * flowFactor) /
    denominator
  );
}

function proposeFlow(portal: Portal): PortalFlow | null {
  const deltaP = portal.roomA.pressure - (portal.roomB?.pressure ?? 0);
  if (portal.effectiveArea <= 0 || Math.abs(deltaP) < MIN_PRESSURE_DIFFERENCE) return null;
  const source = deltaP > 0 ? portal.roomA : portal.roomB;
  const target = deltaP > 0 ? portal.roomB : portal.roomA;
  if (!source || source.volume <= 0 || (target && target.volume <= 0)) return null;
  const molarRate = molarFlowRate(portal, source, target?.pressure ?? 0);
  return Number.isFinite(molarRate) && molarRate > 0 ? { source, target, molarRate } : null;
}

function flowDurations(flows: PortalFlow[], dt: number): Map<Room, number> {
  const responseRates = new Map<Room, number>();
  for (const { source, target, molarRate } of flows) {
    const deltaP = source.pressure - (target?.pressure ?? 0);
    const coupling = (molarRate * R_GAS * source.gas.temperatureK) / deltaP;
    for (const room of [source, target]) {
      if (room) responseRates.set(room, (responseRates.get(room) ?? 0) + coupling / room.volume);
    }
  }
  // Include incoming AND outgoing edges so small receivers cannot overpressurize.
  // A total pressure-response weight <= 0.5 keeps pressures within the previous
  // neighboring extrema and also limits donor inventory loss to 50%. Limit time
  // before multiplying by flow rate, avoiding overflow for very large finite dt.
  return new Map([...responseRates].map(([room, rate]) => [room, Math.min(dt, 0.5 / rate)]));
}

function getRoomUpdate(updates: Map<Room, RoomUpdate>, room: Room): RoomUpdate {
  let update = updates.get(room);
  if (!update) {
    update = {
      moles: { ...room.gas.moles },
      thermalContent: room.totalMoles * room.gas.temperatureK,
    };
    updates.set(room, update);
  }
  return update;
}

function accumulateFlow(updates: Map<Room, RoomUpdate>, flow: PortalFlow, duration: number): void {
  const { source, target, molarRate } = flow;
  const movedMoles = molarRate * duration;
  const fraction = movedMoles / source.totalMoles;
  const sourceUpdate = getRoomUpdate(updates, source);
  const targetUpdate = target ? getRoomUpdate(updates, target) : null;
  for (const [gas, moles] of Object.entries(source.gas.moles)) {
    const gasType = gas as GasType;
    const transfer = moles * fraction;
    sourceUpdate.moles[gasType] -= transfer;
    if (targetUpdate) targetUpdate.moles[gasType] += transfer;
  }
  const thermalContent = movedMoles * source.gas.temperatureK;
  sourceUpdate.thermalContent -= thermalContent;
  if (targetUpdate) targetUpdate.thermalContent += thermalContent;
}

function applyUpdates(updates: Map<Room, RoomUpdate>): void {
  for (const [room, update] of updates) {
    const totalMoles = Object.values(update.moles).reduce((sum, moles) => sum + moles, 0);
    room.gas = {
      moles: update.moles,
      temperatureK: totalMoles > 0 ? update.thermalContent / totalMoles : room.gas.temperatureK,
    };
  }
}

export class AtmosphereSimulation {
  readonly rooms = new Map<string, Room>();
  readonly portals: Portal[] = [];

  addRoom(room: Room): void {
    this.rooms.set(room.id, room);
  }

  addPortal(portal: Portal): void {
    this.portals.push(portal);
  }

  step(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const flows: PortalFlow[] = [];
    for (const portal of this.portals) {
      const flow = proposeFlow(portal);
      if (flow) flows.push(flow);
    }
    const durations = flowDurations(flows, dt);
    const updates = new Map<Room, RoomUpdate>();
    for (const flow of flows) {
      const sourceDt = durations.get(flow.source) ?? dt;
      const targetDt = flow.target ? (durations.get(flow.target) ?? dt) : dt;
      accumulateFlow(updates, flow, Math.min(sourceDt, targetDt));
    }
    // Every transfer reads start-of-tick gas; commit only after all fluxes are accumulated.
    applyUpdates(updates);
  }
}
