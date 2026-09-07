/**
 * Air authority: binds one AtmosphereSimulation per frame to the portal table.
 * Door/hole/open state maps to effectiveArea; per-tick exposes a
 * RoomAtmosphereSummary-compatible view plus wind/drag probes.
 * M0: area mapping + summary view scaffold. Full stepping lands in M4.
 */

import type { PortalEdge } from './types.js';

export interface AirRoomView {
  readonly roomId: string;
  readonly pressureKpa: number;
  readonly tempCelsius: number;
  readonly o2Percent: number;
  readonly co2Ppm: number;
  readonly repressurizing: boolean;
}

export interface WindProbe {
  readonly x: number;
  readonly y: number;
}

export function portalEffectiveArea(portal: PortalEdge): number {
  if (portal.kind === 'window') return 0;
  if (portal.state === 'sealed') return 0;
  if (portal.state === 'closed') return 0;
  if (portal.state === 'destroyed') return Math.max(portal.areaM2, 1.2);
  if (portal.kind === 'open') return portal.areaM2;
  return portal.areaM2;
}

export function summarizeAirRoom(
  roomId: string,
  pressureKpa: number,
  tempCelsius: number,
  o2Percent: number,
  co2Ppm: number,
  repressurizing: boolean
): AirRoomView {
  return { roomId, pressureKpa, tempCelsius, o2Percent, co2Ppm, repressurizing };
}

export function defaultAirRoom(roomId: string): AirRoomView {
  return summarizeAirRoom(roomId, 101.3, 21, 20.9, 600, false);
}

export function dragForWind(wind: WindProbe, coefficient: number): WindProbe {
  if (!(coefficient > 0)) return { x: 0, y: 0 };
  return { x: wind.x * coefficient, y: wind.y * coefficient };
}
