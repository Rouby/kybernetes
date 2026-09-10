/**
 * Trade-hub ports (TRANSFORM M3). The solo loop sails between fixed hubs;
 * each hub names its station frame and dock link. Station frames are static
 * world geometry; the vessel teleports between dock mouths on arrival
 * (abstract transit, no flyable ship). Dependency-free on purpose: schedule,
 * dockStatus, and systems all read this table without import cycles.
 */

export const HUB_A = 'hub_a';
export const HUB_B = 'hub_b';

export interface HubPort {
  readonly hubId: string;
  readonly stationFrame: string;
  readonly dockId: string;
}

export const HUB_PORTS: Readonly<Record<string, HubPort>> = {
  [HUB_A]: { hubId: HUB_A, stationFrame: 'station', dockId: 'harbor' },
  [HUB_B]: { hubId: HUB_B, stationFrame: 'hub_b', dockId: 'hub_b_harbor' },
};

export function isHubId(value: unknown): value is string {
  return typeof value === 'string' && HUB_PORTS[value] !== undefined;
}

export function hubPortForStation(stationFrame: string): HubPort | undefined {
  for (const port of Object.values(HUB_PORTS)) {
    if (port.stationFrame === stationFrame) return port;
  }
  return undefined;
}
