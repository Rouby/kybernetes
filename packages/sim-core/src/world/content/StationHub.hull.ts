/**
 * StationHub hull spec: transit concourse, not three empty boxes.
 * Lobby + bay + gauntlet mouth (original M0 scaffold, rects frozen) plus
 * concourse, security nook, overlook gallery with window wall, and bay
 * lounge. Geometry recompiled from spec; visuals reuse StationHub.ts.
 * Physical boarding only: pawns walk bay -> gauntlet -> ship mouth.
 */

import type { HullSpec } from '../hullCompiler.js';

export const STATION_HUB_FRAME_ID = 'station_hub';

export const StationHubSpec: HullSpec = {
  frameId: STATION_HUB_FRAME_ID,
  rooms: [
    { id: 'lobby', rect: { x: 0, y: 0, w: 600, h: 400 }, volumeM3: 720 },
    { id: 'bay', rect: { x: 600, y: 100, w: 300, h: 200 }, volumeM3: 360 },
    { id: 'gauntlet', rect: { x: 900, y: 160, w: 120, h: 80 }, volumeM3: 48 },
    { id: 'concourse', rect: { x: 100, y: 400, w: 400, h: 160 }, volumeM3: 420 },
    { id: 'security', rect: { x: 500, y: 430, w: 100, h: 90 }, volumeM3: 60 },
    { id: 'overlook', rect: { x: 100, y: -140, w: 400, h: 140 }, volumeM3: 280 },
    { id: 'lounge', rect: { x: 600, y: 300, w: 300, h: 100 }, volumeM3: 180 },
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
    {
      id: 'lobby_concourse',
      roomA: 'lobby',
      roomB: 'concourse',
      kind: 'door',
      segment: { x1: 200, y1: 400, x2: 240, y2: 400 },
      areaM2: 2,
    },
    {
      id: 'concourse_security',
      roomA: 'concourse',
      roomB: 'security',
      kind: 'door',
      segment: { x1: 500, y1: 460, x2: 500, y2: 500 },
      areaM2: 1.6,
    },
    {
      id: 'lobby_overlook',
      roomA: 'lobby',
      roomB: 'overlook',
      kind: 'open',
      segment: { x1: 250, y1: 0, x2: 350, y2: 0 },
      areaM2: 3,
    },
    {
      id: 'overlook_window',
      roomA: 'overlook',
      roomB: 'space',
      kind: 'window',
      segment: { x1: 150, y1: -140, x2: 450, y2: -140 },
      areaM2: 0,
      window: true,
    },
    {
      id: 'bay_lounge',
      roomA: 'bay',
      roomB: 'lounge',
      kind: 'door',
      segment: { x1: 650, y1: 300, x2: 690, y2: 300 },
      areaM2: 2,
    },
  ],
  spawns: {
    fresh_spawn: { x: 300, y: 200 },
    bay_entry: { x: 650, y: 200 },
    concourse_spawn: { x: 300, y: 480 },
    overlook_spawn: { x: 300, y: -70 },
    lounge_spawn: { x: 750, y: 350 },
  },
};
