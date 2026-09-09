/**
 * HesperiaV2 vertical Lynx hull spec (screenshot remake).
 * North-to-south spine: bridge, north cabin, south cabin, vertical
 * corridor, reactor \u0026 drive. The west mouth on the corridor mates
 * with station Andockschleuse A while the vessel holds the docked origin.
 */

import type { HullSpec } from '../hullCompiler.js';

export const HESPERIA_V2_FRAME_ID = 'hesperia_v2';

export const HesperiaV2Spec: HullSpec = {
  frameId: HESPERIA_V2_FRAME_ID,
  rooms: [
    { id: 'korridor_schiff', rect: { x: 0, y: 0, w: 60, h: 700 }, volumeM3: 100 },
    { id: 'bruecke', rect: { x: 60, y: 0, w: 160, h: 130 }, volumeM3: 130 },
    { id: 'kajute_nord', rect: { x: 60, y: 130, w: 160, h: 150 }, volumeM3: 140 },
    { id: 'kajute_sued', rect: { x: 60, y: 280, w: 160, h: 150 }, volumeM3: 140 },
    { id: 'reaktor_antrieb', rect: { x: 60, y: 430, w: 160, h: 270 }, volumeM3: 320 },
  ],
  portals: [
    {
      id: 'bruecke_korridor',
      roomA: 'bruecke',
      roomB: 'korridor_schiff',
      kind: 'door',
      segment: { x1: 60, y1: 50, x2: 60, y2: 90 },
      areaM2: 2,
    },
    {
      id: 'kajute_nord_korridor',
      roomA: 'kajute_nord',
      roomB: 'korridor_schiff',
      kind: 'door',
      segment: { x1: 60, y1: 180, x2: 60, y2: 220 },
      areaM2: 2,
    },
    {
      id: 'kajute_sued_korridor',
      roomA: 'kajute_sued',
      roomB: 'korridor_schiff',
      kind: 'door',
      segment: { x1: 60, y1: 330, x2: 60, y2: 370 },
      areaM2: 2,
    },
    {
      id: 'reaktor_korridor',
      roomA: 'reaktor_antrieb',
      roomB: 'korridor_schiff',
      kind: 'door',
      segment: { x1: 60, y1: 540, x2: 60, y2: 580 },
      areaM2: 2.4,
    },
    {
      // West boarding mouth on the corridor: mates with Andockschleuse A
      // while the vessel holds the docked origin.
      id: 'schiff_mund',
      roomA: 'korridor_schiff',
      roomB: 'space',
      kind: 'airlock',
      segment: { x1: 0, y1: 320, x2: 0, y2: 360 },
      areaM2: 2.4,
    },
  ],
  spawns: {
    bridge_spawn: { x: 140, y: 65 },
    kajute_spawn: { x: 140, y: 205 },
    korridor_spawn: { x: 30, y: 350 },
    reaktor_spawn: { x: 140, y: 565 },
  },
};
