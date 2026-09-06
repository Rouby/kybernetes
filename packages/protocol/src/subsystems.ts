export type SubsystemStatus = 'nominal' | 'degraded' | 'critical';

export interface ReactorTelemetry {
  tempKelvin: number;
  maxTempKelvin: number;
  outputMw: number;
  coolantLevelPercent: number;
  status: SubsystemStatus;
}

export interface LifeSupportTelemetry {
  /** Ambient oxygen partial pressure normalized to nominal ship air (100 = healthy). */
  o2LevelPercent: number;
  /** Ambient carbon dioxide concentration in percent. */
  co2LevelPercent: number;
  /** Finite life-support gas reserve, separate from the cabin atmosphere. */
  oxygenReservePercent?: number;
  scrubberEfficiencyPercent: number;
  status: SubsystemStatus;
}

export interface HullTelemetry {
  integrityPercent: number;
  stressPercent: number;
  breaches: string[];
  status: SubsystemStatus;
}

export interface ShieldTelemetry {
  integrityPercent: number;
  chargeMw: number;
  status: SubsystemStatus;
}

export interface DefenseTelemetry {
  pdtAmmo: number;
  pdtReady: boolean;
  status: SubsystemStatus;
}

export type NavalDamageEventType = 'torpedo_run' | 'radiation_burst' | 'micrometeor_storm';
export type NavalDamageEventStatus = 'incoming' | 'impacting' | 'resolved' | 'mitigated';

export interface NavalDamageEvent {
  id: string;
  type: NavalDamageEventType;
  title: string;
  description: string;
  severity: 'minor' | 'moderate' | 'critical';
  timeToImpactSeconds: number;
  status: NavalDamageEventStatus;
  targetRoomId?: string;
}

export interface RoomAtmosphereSummary {
  roomId: string;
  pressureKpa: number;
  o2Percent: number;
  co2Ppm: number;
  tempCelsius: number;
  toxicSmokePercent: number;
  isVenting: boolean;
  isRepressurizing?: boolean;
  activeFires: number;
  activeBreaches: number;
}

export type AtmosOverlayMode = 'off' | 'o2' | 'temp' | 'pressure';

export type BreachKind = 'puncture' | 'breach' | 'door';

export interface BreachDescriptor {
  id: string;
  roomId: string;
  kind: BreachKind;
  areaM2: number;
  x?: number;
  y?: number;
}

export interface CompartmentAtmosphere {
  compartmentId: string;
  roomId: string;
  volumeM3: number;
  pressureKpa: number;
  tempCelsius: number;
  o2Percent: number;
  co2Ppm: number;
  isVenting: boolean;
  isRepressurizing: boolean;
}
