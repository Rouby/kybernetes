import { GasType, MOLAR_MASS, R_GAS } from './constants';

export interface GasMixture {
  moles: Record<GasType, number>;
  temperatureK: number; // K
}

export interface RoomConfig {
  id: string;
  x: number;
  y: number;
  width: number; // meters
  length: number; // meters
  height: number; // meters
}

export class Room {
  readonly id: string;
  readonly volume: number; // m^3
  gas: GasMixture;

  constructor(
    readonly config: RoomConfig,
    initialGas?: GasMixture
  ) {
    this.id = config.id;
    this.volume = config.width * config.length * config.height;
    this.gas = initialGas ?? {
      moles: { [GasType.Oxygen]: 0, [GasType.Nitrogen]: 0, [GasType.CarbonDioxide]: 0 },
      temperatureK: 293.15, // 20°C
    };
  }

  get totalMoles(): number {
    return Object.values(this.gas.moles).reduce((sum, m) => sum + m, 0);
  }

  get pressure(): number {
    if (this.volume <= 0) return 0;
    return (this.totalMoles * R_GAS * this.gas.temperatureK) / this.volume;
  }

  get averageMolarMass(): number {
    const total = this.totalMoles;
    if (total <= 0) return MOLAR_MASS[GasType.Nitrogen];
    let weightedMass = 0;
    for (const [gas, moles] of Object.entries(this.gas.moles)) {
      weightedMass += moles * MOLAR_MASS[gas as GasType];
    }
    return weightedMass / total;
  }
}
