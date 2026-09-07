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

interface RoomUpdate {
  moles: Record<GasType, number>;
  thermalContent: number; // n*T; common molar heat capacity cancels when mixing
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
  portal.velocity = Math.sign(v0) * Math.min(absV, terminalSpeed);
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
      const flow = proposeFlow(portal, dt);
      if (flow) flows.push(flow);
    }

    const connections = this.portals.flatMap((portal) => [
      `${portal.roomA.id}->${portal.roomB?.id ?? 'Space'}`,
      `${portal.roomB?.id ?? 'Space'}->${portal.roomA.id}`,
    ]);

    for (const room of this.rooms.values()) {
      const incomming =
        flows
          .filter((flow) => flow.target?.id === room.id)
          .reduce((acc, flow) => acc + flow.molarRate, 0) * dt;

      const outgoing =
        flows
          .filter((flow) => flow.source.id === room.id)
          .reduce((acc, flow) => acc + flow.molarRate, 0) * dt;

      const delta = incomming - outgoing;

      if (delta > 0) {
        // check if delta puts room above any neighbor
        const nextPressure = room.predictPressure(delta);
        const neighbors = Array.from(this.rooms.values()).filter((neighbor) =>
          connections.includes(`${neighbor.id}->${room.id}`)
        );
        const maxNeighborPressure = neighbors.reduce((max, neighbor) => {
          return Math.max(max, neighbor.pressure);
        }, 0);

        if (nextPressure > maxNeighborPressure) {
          flows
            .filter((flow) => flow.target?.id === room.id)
            .forEach((flow) => {
              const sourceStiffness = (R_GAS * flow.source.gas.temperatureK) / flow.source.volume;
              const targetStiffness = flow.target
                ? (R_GAS * flow.target.gas.temperatureK) / flow.target.volume
                : 0;
              const totalStiffness = sourceStiffness + targetStiffness;

              const deltaP = flow.source.pressure - (flow.target?.pressure ?? 0);
              const maxEqualizingMoles = Math.max(0, deltaP / totalStiffness);

              // Clamp flow rate so dt * molarRate never exceeds maxEqualizingMoles
              const safeMolarRate = Math.min(flow.molarRate, (maxEqualizingMoles * 0.5) / dt); // 0.5 for under-relaxation

              flow.molarRate = safeMolarRate;
            });
        }
      }
    }

    // Accumulate all portal flows into per-room deltas, reading start-of-tick
    // gas state for species fractions and temperatures.
    const updates = new Map<Room, RoomUpdate>();
    const getUpdate = (room: Room): RoomUpdate => {
      let u = updates.get(room);
      if (!u) {
        u = {
          moles: { ...room.gas.moles },
          thermalContent: room.totalMoles * room.gas.temperatureK,
        };
        updates.set(room, u);
      }
      return u;
    };

    for (const flow of flows) {
      const { source, target, molarRate } = flow;

      const movedMoles = molarRate * dt;
      const fraction = Math.min(1, movedMoles / source.totalMoles);

      const sourceUpdate = getUpdate(source);
      const targetUpdate = target ? getUpdate(target) : null;

      // Transfer gas using the SOURCE room's species composition.
      for (const [gas, moles] of Object.entries(source.gas.moles)) {
        const gasType = gas as GasType;
        const transfer = moles * fraction;
        sourceUpdate.moles[gasType] -= transfer;
        if (targetUpdate) targetUpdate.moles[gasType] += transfer;
      }

      // Enthalpy transport: flowing gas carries Cp·T per mole (= γ·Cv·T).
      const transferredThermal = source.totalMoles * source.gas.temperatureK * fraction;
      sourceUpdate.thermalContent -= transferredThermal;
      if (targetUpdate) targetUpdate.thermalContent += transferredThermal;
    }

    // Commit all accumulated deltas in one pass.
    applyUpdates(updates);
  }
}
