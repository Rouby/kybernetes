export type SubsystemStatus = 'nominal' | 'degraded' | 'critical';

export interface ReactorTelemetry {
  tempKelvin: number;
  maxTempKelvin: number;
  outputMw: number;
  coolantLevelPercent: number;
  status: SubsystemStatus;
}

export interface LifeSupportTelemetry {
  o2LevelPercent: number;
  co2LevelPercent: number;
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
