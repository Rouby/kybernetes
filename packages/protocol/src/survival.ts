export interface SuitTelemetry {
  isSealed: boolean;
  o2RemainingSeconds: number; // 0 - 600s
  maxO2Seconds: number;
  integrityPercent: number; // 0 - 100%, punctures leak O2
  batteryPercent: number; // 0 - 100%, thermal regulator
}

export interface IncapacitatedState {
  isIncapacitated: boolean;
  cause: 'hypoxia' | 'decompression' | 'thermal' | 'combat';
  bleedoutSecondsRemaining: number; // 45s critical timer
}

export interface PlayerVitals {
  hunger: number; // 0 - 100 (100 = sated, 0 = starving)
  thirst: number; // 0 - 100 (100 = hydrated, 0 = dehydrated)
  fatigue: number; // 0 - 100 (0 = rested, 100 = exhausted)
  stamina: number; // 0 - 100
  maxStamina: number; // dynamically affected by hunger/thirst/fatigue
  health: number; // 0 - 100
  suit: SuitTelemetry;
  incapacitated: IncapacitatedState;
  bodyTempCelsius: number; // 37 nominal
  hypoxiaPercent: number; // 0 - 100%
}

export interface MacroCrewSupplies {
  rations: number;
  waterLitres: number;
  oxygenPercent: number;
  morale: number; // 0 - 100
  mutinyRisk: number; // 0 - 100
  biomassStock?: number;
  greywaterLitres?: number;
}
