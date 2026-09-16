import type { LegacyStartingRole, PawnState } from '@kybernetes/protocol';
import { isPointInPolygon } from '@kybernetes/sim-core';

export interface CrewDossierInfo {
  callsign: string;
  rank: string;
  department: string;
  status: string;
  bioLine1: string;
  bioLine2: string;
  color: string;
}

interface RoleDossierTemplate {
  rank: string;
  department: string;
  bioLine1: string;
  bioLine2: string;
}

const ROLE_TEMPLATES: Record<LegacyStartingRole, RoleDossierTemplate> = {
  wiper: {
    rank: '3rd Class Reactor Wiper',
    department: 'ENGINEERING [ENG-3]',
    bioLine1: 'Claims the reactor core "sings to him".',
    bioLine2: 'Wiped hot plasma coils with a dirty sock.',
  },
  galley_hand: {
    rank: 'Mess Specialist & Paste Brewer',
    department: 'LOGISTICS [LOG-3]',
    bioLine1: 'Master of reconstituted nutrient mash.',
    bioLine2: 'Insists grey lumps are "flavor granules".',
  },
  security_private: {
    rank: 'Shipboard Marine Private',
    department: 'TACTICAL SECURITY [SEC-3]',
    bioLine1: 'Has shot 14 bulkheads and 0 intruders.',
    bioLine2: 'Sleeps with carbine for "readiness".',
  },
  hydro_tender: {
    rank: 'Biomass & Scrubber Technician',
    department: 'LIFE SUPPORT [BIO-3]',
    bioLine1: 'Talks to hydroponic algae in private.',
    bioLine2: 'Convinced tomatoes hold naval secrets.',
  },
  stevedore: {
    rank: 'Senior Cargo Rigging Specialist',
    department: 'DECK OPERATIONS [HLD-3]',
    bioLine1: 'Fixes cargo jams by kicking them hard.',
    bioLine2: 'Unrivaled arm wrestling champ on Deck-A.',
  },
};

const CADET_TEMPLATE: RoleDossierTemplate = {
  rank: 'Junior Fleet Cadet',
  department: 'GENERAL SERVICE [CAD-1]',
  bioLine1: 'Memorized all 400 safety regulations.',
  bioLine2: 'Panics if oxygen dips below 98%.',
};

function resolveStatus(pawn: PawnState): string {
  if (pawn.isWelding) return '[EMERGENCY ARC WELDING]';
  if (pawn.isOperating) return '[OPERATING STATION CONSOLE]';
  if (pawn.isResting) return '[OFF-WATCH / QUARTERS REST]';
  return '[ON WATCH / CORRIDOR PATROL]';
}

export function resolveCrewDossier(pawn: PawnState): CrewDossierInfo {
  const tpl = ROLE_TEMPLATES[pawn.role] || CADET_TEMPLATE;
  return {
    callsign: pawn.callsign || 'Cadet',
    rank: tpl.rank,
    department: tpl.department,
    status: resolveStatus(pawn),
    bioLine1: tpl.bioLine1,
    bioLine2: tpl.bioLine2,
    color: pawn.color || '#00e5ff',
  };
}

function isVisibleInPoly(p: PawnState, losPoly: readonly { x: number; y: number }[]): boolean {
  return losPoly.length < 3 || isPointInPolygon({ x: p.x, y: p.y }, [...losPoly]);
}

/** Pure hover pick shared by the renderer: remotes in view first, then the hero. */
export function pickHoveredCrew(
  remotes: readonly PawnState[],
  hero: PawnState,
  camera: { x: number; y: number },
  halfW: number,
  halfH: number,
  mouseWorld: { x: number; y: number } | undefined,
  mouseScreen: { x: number; y: number } | undefined,
  zoom: number,
  losPoly: readonly { x: number; y: number }[]
): PawnState | undefined {
  for (const rp of remotes) {
    if (!isVisibleInPoly(rp, losPoly)) continue;
    if (isPawnHovered(rp, camera, halfW, halfH, mouseWorld, mouseScreen, zoom)) return rp;
  }
  if (isPawnHovered(hero, camera, halfW, halfH, mouseWorld, mouseScreen, zoom)) return hero;
  return undefined;
}

function isPawnHovered(
  p: PawnState,
  cam: { x: number; y: number },
  halfW: number,
  halfH: number,
  mouseWorld?: { x: number; y: number },
  mouseScreen?: { x: number; y: number },
  zoom = 1.0
): boolean {
  if (mouseWorld && Math.hypot(p.x - mouseWorld.x, p.y - mouseWorld.y) <= 32) {
    return true;
  }
  if (mouseScreen) {
    const sx = halfW + (p.x - cam.x) * zoom;
    const sy = halfH + (p.y - cam.y) * zoom;
    return Math.hypot(sx - mouseScreen.x, sy - mouseScreen.y) <= 32 * zoom;
  }
  return false;
}
