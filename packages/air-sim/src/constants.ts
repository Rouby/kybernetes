export const R_GAS = 8.314; // J / (mol * K)
export const GAMMA = 1.4; // Heat capacity ratio for air

export enum GasType {
  Oxygen = 'O2',
  Nitrogen = 'N2',
  CarbonDioxide = 'CO2',
}

export const MOLAR_MASS: Record<GasType, number> = {
  [GasType.Oxygen]: 0.032, // kg/mol
  [GasType.Nitrogen]: 0.028, // kg/mol
  [GasType.CarbonDioxide]: 0.044, // kg/mol
};
