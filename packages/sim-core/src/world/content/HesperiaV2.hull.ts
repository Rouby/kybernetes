/**
 * HesperiaV2 reference ship hull spec (M0 scaffold).
 * Bridge, avionics, life-support, berthing, mess/galley, airlocks,
 * armory, cargo, engineering, corridor spine. Same feel as today,
 * rebuilt as room adjacency + door/window annotations.
 */

import type { HullSpec } from '../hullCompiler.js';

export const HESPERIA_V2_FRAME_ID = 'hesperia_v2';

export const HesperiaV2Spec: HullSpec = {
  frameId: HESPERIA_V2_FRAME_ID,
  rooms: [
    { id: 'bridge', rect: { x: 100, y: 200, w: 160, h: 120 }, volumeM3: 120 },
    { id: 'avionics', rect: { x: 280, y: 200, w: 120, h: 120 }, volumeM3: 90 },
    { id: 'life_support', rect: { x: 420, y: 200, w: 120, h: 120 }, volumeM3: 90 },
    { id: 'berthing', rect: { x: 560, y: 200, w: 160, h: 120 }, volumeM3: 120 },
    { id: 'mess', rect: { x: 740, y: 200, w: 140, h: 120 }, volumeM3: 105 },
    { id: 'corridor', rect: { x: 100, y: 320, w: 780, h: 80 }, volumeM3: 140 },
    { id: 'armory', rect: { x: 100, y: 400, w: 140, h: 100 }, volumeM3: 84 },
    { id: 'cargo', rect: { x: 260, y: 400, w: 280, h: 100 }, volumeM3: 280 },
    { id: 'engineering', rect: { x: 560, y: 400, w: 320, h: 100 }, volumeM3: 320 },
  ],
  portals: [
    {
      id: 'door_bridge',
      roomA: 'bridge',
      roomB: 'corridor',
      kind: 'door',
      segment: { x1: 160, y1: 320, x2: 200, y2: 320 },
      areaM2: 2,
    },
    {
      id: 'door_avionics',
      roomA: 'avionics',
      roomB: 'corridor',
      kind: 'door',
      segment: { x1: 320, y1: 320, x2: 360, y2: 320 },
      areaM2: 2,
    },
    {
      id: 'door_life_support',
      roomA: 'life_support',
      roomB: 'corridor',
      kind: 'door',
      segment: { x1: 460, y1: 320, x2: 500, y2: 320 },
      areaM2: 2,
    },
    {
      id: 'door_berthing',
      roomA: 'berthing',
      roomB: 'corridor',
      kind: 'door',
      segment: { x1: 620, y1: 320, x2: 660, y2: 320 },
      areaM2: 2,
    },
    {
      id: 'door_mess',
      roomA: 'mess',
      roomB: 'corridor',
      kind: 'door',
      segment: { x1: 780, y1: 320, x2: 820, y2: 320 },
      areaM2: 2,
    },
    {
      id: 'door_armory',
      roomA: 'armory',
      roomB: 'corridor',
      kind: 'door',
      segment: { x1: 150, y1: 400, x2: 190, y2: 400 },
      areaM2: 2,
    },
    {
      id: 'door_cargo',
      roomA: 'cargo',
      roomB: 'corridor',
      kind: 'door',
      segment: { x1: 380, y1: 400, x2: 420, y2: 400 },
      areaM2: 2.4,
    },
    {
      id: 'door_engineering',
      roomA: 'engineering',
      roomB: 'corridor',
      kind: 'door',
      segment: { x1: 700, y1: 400, x2: 740, y2: 400 },
      areaM2: 2.4,
    },
    {
      // Stern boarding ramp on the corridor west wall: mates with the
      // station gauntlet when the vessel holds the docked origin.
      id: 'ship_mouth',
      roomA: 'corridor',
      roomB: 'space',
      kind: 'airlock',
      segment: { x1: 100, y1: 340, x2: 100, y2: 380 },
      areaM2: 2.4,
    },
  ],
  spawns: {
    bridge_spawn: { x: 180, y: 260 },
    corridor_spawn: { x: 480, y: 370 },
    engineering_spawn: { x: 720, y: 470 },
  },
};
