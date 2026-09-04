import type { AtmosOverlayMode } from '@kybernetes/protocol';

export interface SensorScaleEntry {
  label: string;
  color: [number, number, number];
}

export interface SensorOverlayConfig {
  title: string;
  badgeLabel: string;
  badgeColor: string;
  scaleEntries: SensorScaleEntry[];
}

export function getSensorOverlayConfig(mode: AtmosOverlayMode): SensorOverlayConfig | null {
  if (mode === 'o2') {
    return {
      title: 'TACTICAL SENSOR // OXYGEN AVAILABILITY (O2)',
      badgeLabel: 'O2 CONC',
      badgeColor: '#00e5ff',
      scaleEntries: [
        { label: '<1% VACUUM', color: [0.35, 0.05, 0.45] },
        { label: '<15% HYPOXIC', color: [0.95, 0.15, 0.2] },
        { label: '15-19% LOW', color: [0.95, 0.7, 0.1] },
        { label: '>=20% NOMINAL', color: [0.0, 0.85, 0.7] },
      ],
    };
  }
  if (mode === 'temp') {
    return {
      title: 'TACTICAL SENSOR // THERMAL DISTRIBUTION (TEMP)',
      badgeLabel: 'THERMAL',
      badgeColor: '#ffaa00',
      scaleEntries: [
        { label: '<0 C CRYO', color: [0.1, 0.6, 1.0] },
        { label: '0-16 C COOL', color: [0.1, 0.8, 0.9] },
        { label: '18-24 C NOMINAL', color: [0.1, 0.85, 0.4] },
        { label: '25-45 C WARM', color: [0.95, 0.65, 0.1] },
        { label: '>45 C HAZARD', color: [1.0, 0.2, 0.1] },
      ],
    };
  }
  if (mode === 'pressure') {
    return {
      title: 'TACTICAL SENSOR // BAROMETRIC PRESSURE (ATM)',
      badgeLabel: 'PRESSURE',
      badgeColor: '#00b4ff',
      scaleEntries: [
        { label: '<20 kPa VACUUM', color: [0.35, 0.15, 0.55] },
        { label: '20-75 kPa THIN', color: [0.1, 0.5, 0.85] },
        { label: '95-103 kPa 1.0 ATM', color: [0.0, 0.85, 0.7] },
        { label: '>105 kPa HYPERBARIC', color: [0.8, 0.2, 0.9] },
      ],
    };
  }
  return null;
}
