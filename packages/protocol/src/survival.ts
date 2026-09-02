export interface PlayerVitals {
  hunger: number;     // 0 - 100 (100 = sated, 0 = starving)
  thirst: number;     // 0 - 100 (100 = hydrated, 0 = dehydrated)
  fatigue: number;    // 0 - 100 (0 = rested, 100 = exhausted)
  stamina: number;    // 0 - 100
  maxStamina: number; // dynamically affected by hunger/thirst/fatigue
  health: number;     // 0 - 100
}

export interface MacroCrewSupplies {
  rations: number;
  waterLitres: number;
  oxygenPercent: number;
  morale: number;     // 0 - 100
  mutinyRisk: number; // 0 - 100
}
