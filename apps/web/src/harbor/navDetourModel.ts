/** POI detour routing for the nav console: options, button ids, and labels. */
import { CHART_NODES } from '@kybernetes/sim-core';

/** Button id prefix for POI detours (mirrors the cargo `seal:`/`sell:` style). */
export const DETOUR_BUTTON_PREFIX = 'via:';

/** POI ids in chart order; each becomes a docked detour button. */
export function navDetourOptions(): readonly string[] {
  return CHART_NODES.filter((node) => node.kind === 'poi').map((node) => node.id);
}

export function detourButtonId(poiId: string): string {
  return `${DETOUR_BUTTON_PREFIX}${poiId}`;
}

export function detourLabel(poiId: string): string {
  const short = poiId.startsWith('poi_') ? poiId.slice('poi_'.length) : poiId;
  return `VIA ${short.toUpperCase()}`;
}
