import type {
  NavStateBroadcast,
  ShipStatusBroadcast,
  ShipSystemsBroadcast,
} from '@kybernetes/protocol';
import { legDurationSeconds, speedFactor } from '@kybernetes/sim-core';

export type NavPanelPhase = 'docked' | 'spooling' | 'in_transit' | 'docking' | 'unknown';

export interface NavViewModel {
  readonly phase: NavPanelPhase;
  readonly portLabel: string;
  readonly destLabel: string;
  readonly otherHubId: string;
  readonly otherHubLabel: string;
  readonly countdownS: number;
  readonly fuelCells: number;
  readonly canPlot: boolean;
  readonly canCancel: boolean;
  readonly canDistress: boolean;
  readonly etaS: number;
  readonly flameout: boolean;
}

const HUB_LABELS: Readonly<Record<string, string>> = {
  hub_a: 'NEW ANCHORAGE',
  hub_b: 'KEPLER YARD',
};

export function hubLabel(hubId: string | undefined): string {
  if (hubId === undefined) return '—';
  return HUB_LABELS[hubId] ?? hubId.toUpperCase();
}

export function otherHub(portHubId: string): string {
  return portHubId === 'hub_b' ? 'hub_a' : 'hub_b';
}

export function navViewModel(
  nav: NavStateBroadcast | null,
  systems: ShipSystemsBroadcast | null,
  status: ShipStatusBroadcast | null
): NavViewModel {
  const portHubId = nav?.portHubId ?? 'hub_a';
  const other = otherHub(portHubId);
  return {
    phase: navPhase(nav),
    portLabel: hubLabel(portHubId),
    destLabel: hubLabel(nav?.destHubId),
    otherHubId: other,
    otherHubLabel: hubLabel(other),
    countdownS: nav === null ? 0 : Math.max(0, Math.ceil(nav.remainingS)),
    fuelCells: status?.stores.fuelCells ?? 0,
    canPlot: nav?.phase === 'docked',
    canCancel: nav?.phase === 'spooling',
    canDistress: nav?.phase === 'in_transit',
    etaS: estimateEta(status, systems),
    flameout: nav?.flameout ?? false,
  };
}

function navPhase(nav: NavStateBroadcast | null): NavPanelPhase {
  if (nav === null) return 'unknown';
  if (nav.phase === 'docked' || nav.phase === 'spooling') return nav.phase;
  if (nav.phase === 'in_transit' || nav.phase === 'docking') return nav.phase;
  return 'unknown';
}

function estimateEta(
  status: ShipStatusBroadcast | null,
  systems: ShipSystemsBroadcast | null
): number {
  if (status === null || systems === null) return 0;
  const tier = status.engineTier === 1 ? 1 : status.engineTier === 2 ? 2 : 0;
  const factor = speedFactor({ tune: systems.tune, wear: systems.wear });
  if (!(factor > 0)) return 0;
  return Math.round(legDurationSeconds(tier) / factor);
}
