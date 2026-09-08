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
  // The renderer has no temp/pressure sensor view: those modes show no legend.
  return null;
}
