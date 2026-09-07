/**
 * StationHub hull spec (M0 scaffold). Static frame at world origin.
 * Lobby + bay + window wall + schedule board + gauntlet mouth.
 * Geometry recompiled from spec; visuals reuse StationHub.ts.
 */

import type { HullSpec } from '../hullCompiler.js';

export const STATION_HUB_FRAME_ID = 'station_hub';

export const StationHubSpec: HullSpec = {
  frameId: STATION_HUB_FRAME_ID,
  rooms: [
    { id: 'lobby', rect: { x: 0, y: 0, w: 600, h: 400 }, volumeM3: 720 },
    { id: 'bay', rect: { x: 600, y: 100, w: 300, h: 200 }, volumeM3: 360 },
    { id: 'gauntlet', rect: { x: 900, y: 160, w: 120, h: 80 }, volumeM3: 48 },
  ],
  portals: [
    {
      id: 'lobby_bay',
      roomA: 'lobby',
      roomB: 'bay',
      kind: 'door',
      segment: { x1: 600, y1: 160, x2: 600, y2: 240 },
      areaM2: 2,
    },
    {
      id: 'bay_gauntlet',
      roomA: 'bay',
      roomB: 'gauntlet',
      kind: 'airlock',
      segment: { x1: 900, y1: 170, x2: 900, y2: 230 },
      areaM2: 2.4,
    },
    {
      id: 'lobby_window',
      roomA: 'lobby',
      roomB: 'space',
      kind: 'window',
      segment: { x1: 100, y1: 0, x2: 500, y2: 0 },
      areaM2: 0,
      window: true,
    },
  ],
  spawns: {
    fresh_spawn: { x: 300, y: 200 },
    bay_entry: { x: 650, y: 200 },
  },
};
