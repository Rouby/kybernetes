import { TelemetryDeltaBroadcast, MacroCrewSupplies } from '@kybernetes/protocol';

export interface VesselSimulationState {
  shipName: string;
  reactorTemp: number;
  reactorMaxTemp: number;
  reactorOutputMw: number;
  oxygenLevelPercent: number;
  hullIntegrityPercent: number;
  shieldIntegrityPercent: number;
  alertLevel: 'nominal' | 'yellow' | 'red';
  supplies: MacroCrewSupplies;
}

export function createInitialVesselState(): VesselSimulationState {
  return {
    shipName: 'CSS Hesperia',
    reactorTemp: 320,
    reactorMaxTemp: 1200,
    reactorOutputMw: 45.5,
    oxygenLevelPercent: 99.4,
    hullIntegrityPercent: 100,
    shieldIntegrityPercent: 100,
    alertLevel: 'nominal',
    supplies: {
      rations: 450,
      waterLitres: 1200,
      oxygenPercent: 99.4,
      morale: 85,
      mutinyRisk: 5,
    },
  };
}

export function tickVesselState(
  state: VesselSimulationState,
  dtSeconds: number
): VesselSimulationState {
  // Natural cooling toward equilibrium (300K)
  const coolingRate = 0.05;
  const targetTemp = 300;
  const tempDiff = state.reactorTemp - targetTemp;
  const newTemp = Math.max(300, state.reactorTemp - tempDiff * coolingRate * dtSeconds);

  // Oxygen scrubber consumption
  const o2ConsumptionRate = 0.001;
  const newO2 = Math.max(0, state.oxygenLevelPercent - o2ConsumptionRate * dtSeconds);

  return {
    ...state,
    reactorTemp: Number(newTemp.toFixed(2)),
    oxygenLevelPercent: Number(newO2.toFixed(2)),
  };
}

export function stateToTelemetryBroadcast(
  state: VesselSimulationState
): TelemetryDeltaBroadcast {
  return {
    type: 'TELEMETRY_DELTA',
    timestamp: Date.now(),
    ...state,
  };
}
