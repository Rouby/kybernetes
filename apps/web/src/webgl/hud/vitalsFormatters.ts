import type { PlayerVitals, RoomAtmosphereSummary } from '@kybernetes/protocol';

export interface FormattedSuitStatus {
  visorLabel: string;
  visorColor: string;
  o2Text: string;
  o2Percent: number;
  o2BarColor: [number, number, number];
  integrityText: string;
  isLeaking: boolean;
}

function getO2BarColor(isLowO2: boolean, o2Percent: number): [number, number, number] {
  if (isLowO2) return [1.0, 0.13, 0.27];
  if (o2Percent < 35) return [1.0, 0.69, 0.0];
  return [0.0, 0.9, 1.0];
}

export function formatSuitStatus(vitals: PlayerVitals): FormattedSuitStatus {
  const suit = vitals.suit;
  const isSealed = Boolean(suit?.isSealed);
  const o2Sec = suit?.o2RemainingSeconds ?? 600;
  const maxO2 = suit?.maxO2Seconds || 600;
  const o2Percent = Math.max(0, Math.min(100, (o2Sec / maxO2) * 100));
  const isLowO2 = o2Sec < 60;

  const visorLabel = isSealed ? '[H] VISOR: SEALED' : '[H] VISOR: OPEN';
  const visorColor = isSealed ? '#00e5ff' : '#ffb000';
  const o2Text = `SUIT O2: ${Math.round(o2Sec)}s / ${maxO2}s`;
  const o2BarColor = getO2BarColor(isLowO2, o2Percent);

  const integrity = suit?.integrityPercent ?? 100;
  const isLeaking = integrity < 100;
  const integrityText = isLeaking
    ? `INTEG: ${Math.round(integrity)}% [LEAK]`
    : `INTEG: ${Math.round(integrity)}%`;

  return {
    visorLabel,
    visorColor,
    o2Text,
    o2Percent,
    o2BarColor,
    integrityText,
    isLeaking,
  };
}

export interface FormattedAtmosStatus {
  ambientText: string;
  hazardBanner: string | null;
  isHazard: boolean;
}

export function formatAtmosphereStatus(atmos?: RoomAtmosphereSummary): FormattedAtmosStatus {
  if (!atmos) {
    return {
      ambientText: 'AMB: 101.3 kPa • 20.9% O2 • 21°C',
      hazardBanner: null,
      isHazard: false,
    };
  }

  const p = Math.round(atmos.pressureKpa);
  const o2 = Math.round(atmos.o2Percent);
  const t = Math.round(atmos.tempCelsius);
  const smoke = Math.round(atmos.toxicSmokePercent);

  const ambientText = `AMB: ${p} kPa • ${o2}% O2 • ${t}°C`;
  let hazardBanner: string | null = null;
  let isHazard = false;

  if (atmos.isVenting) {
    hazardBanner = 'VACUUM HAZARD';
    isHazard = true;
  } else if (atmos.isRepressurizing && p < 95) {
    hazardBanner = 'ECS REPRESSURIZING';
    isHazard = false;
  } else if (p < 30) {
    hazardBanner = 'VACUUM HAZARD';
    isHazard = true;
  } else if (o2 < 16) {
    hazardBanner = 'HYPOXIA WARNING';
    isHazard = true;
  } else if (smoke > 10) {
    hazardBanner = 'TOXIC SMOKE';
    isHazard = true;
  } else if (t > 50) {
    hazardBanner = 'EXTREME HEAT';
    isHazard = true;
  } else if (t < 0) {
    hazardBanner = 'FREEZING COLD';
    isHazard = true;
  }

  return { ambientText, hazardBanner, isHazard };
}

export function formatIncapacitatedNotice(vitals: PlayerVitals): string | null {
  if (!vitals.incapacitated?.isIncapacitated) return null;
  const rem = Math.round(vitals.incapacitated.bleedoutSecondsRemaining);
  return `CRITICAL: INCAPACITATED (${vitals.incapacitated.cause.toUpperCase()}) - BLEEDOUT: ${rem}s`;
}
