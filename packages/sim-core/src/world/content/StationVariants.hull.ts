/**
 * Station hull variants: one walkable interior per trade hub. Each variant
 * is a compact diff over the classic harbor: retiled habitat wings plus
 * one signature room (Solace a hangar, Cinder a labor, Vesper an
 * observatory). The dock spine and fixture-bearing rooms (habitat,
 * frachthalle, korridor_mitte) stay geometrically identical, so tube
 * crossings, fixtures, and crowd loops keep working on all four stations.
 */

import type { HullPortalSpec, HullSpec, RoomSpec } from '../hullCompiler.js';
import type { Vec2 } from '../types.js';
import { StationHubSpec } from './StationHub.hull.js';

interface TileDiff {
  readonly rect: RoomSpec['rect'];
  readonly volumeM3: number;
}

interface SegDiff {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

/** Classic spec with retiled rooms, moved door segments, and extra rooms. */
function retile(
  base: HullSpec,
  rooms: Readonly<Record<string, TileDiff>>,
  segs: Readonly<Record<string, SegDiff>>,
  extraRooms: readonly RoomSpec[],
  extraPortals: readonly HullPortalSpec[],
  spawns: Readonly<Record<string, Vec2>>
): HullSpec {
  return {
    frameId: base.frameId,
    rooms: [...base.rooms.map((room) => applyTile(room, rooms[room.id])), ...extraRooms],
    portals: [...base.portals.map((portal) => applySeg(portal, segs[portal.id])), ...extraPortals],
    spawns: { ...base.spawns, ...spawns },
  };
}

function applyTile(room: RoomSpec, diff: TileDiff | undefined): RoomSpec {
  if (diff === undefined) return room;
  return { ...room, rect: { ...diff.rect }, volumeM3: diff.volumeM3 };
}

function applySeg(portal: HullPortalSpec, seg: SegDiff | undefined): HullPortalSpec {
  if (seg === undefined) return portal;
  return { ...portal, segment: { ...seg } };
}

const BASE_SPAWNS: Readonly<Record<string, Vec2>> = {
  fresh_spawn: { x: 100, y: 260 },
  habitat_spawn: { x: 160, y: 100 },
  fracht_spawn: { x: 410, y: 380 },
  andock_spawn: { x: 1080, y: 260 },
  kommando_spawn: { x: 70, y: 380 },
};

/** Solace: wide wings with a hangar under the command wing. */
function solaceHull(): HullSpec {
  return retile(
    StationHubSpec,
    {
      habitat: { rect: { x: 0, y: 0, w: 280, h: 200 }, volumeM3: 340 },
      medizin: { rect: { x: 280, y: 0, w: 320, h: 200 }, volumeM3: 380 },
      sicherheit_nord: { rect: { x: 600, y: 0, w: 320, h: 200 }, volumeM3: 380 },
      kommando: { rect: { x: 0, y: 280, w: 120, h: 200 }, volumeM3: 150 },
      hydroponik: { rect: { x: 120, y: 280, w: 180, h: 200 }, volumeM3: 210 },
      reaktorraum: { rect: { x: 520, y: 280, w: 160, h: 200 }, volumeM3: 330 },
      sicherheit_sued: { rect: { x: 680, y: 280, w: 240, h: 200 }, volumeM3: 280 },
    },
    {
      medizin_korridor: { x1: 420, y1: 200, x2: 460, y2: 200 },
      sicherheit_nord_korridor: { x1: 700, y1: 200, x2: 740, y2: 200 },
      kommando_hydroponik: { x1: 120, y1: 350, x2: 120, y2: 390 },
      reaktor_korridor: { x1: 580, y1: 280, x2: 620, y2: 280 },
      reaktor_sued: { x1: 680, y1: 350, x2: 680, y2: 390 },
      sued_korridor: { x1: 760, y1: 280, x2: 800, y2: 280 },
      sued_window: { x1: 740, y1: 480, x2: 860, y2: 480 },
    },
    [{ id: 'hangar', rect: { x: 0, y: 480, w: 140, h: 120 }, volumeM3: 340 }],
    [
      {
        id: 'kommando_hangar',
        roomA: 'kommando',
        roomB: 'hangar',
        kind: 'door',
        segment: { x1: 40, y1: 480, x2: 80, y2: 480 },
        areaM2: 2.4,
      },
    ],
    {
      ...BASE_SPAWNS,
      medizin_spawn: { x: 440, y: 100 },
      reaktor_spawn: { x: 600, y: 380 },
      sued_spawn: { x: 800, y: 380 },
    }
  );
}

/** Cinder: the medical wing splits into clinic plus labor. */
function cinderHull(): HullSpec {
  return retile(
    StationHubSpec,
    {
      medizin: { rect: { x: 320, y: 0, w: 150, h: 200 }, volumeM3: 180 },
      reaktorraum: { rect: { x: 520, y: 280, w: 240, h: 200 }, volumeM3: 470 },
      sicherheit_sued: { rect: { x: 760, y: 280, w: 160, h: 200 }, volumeM3: 200 },
    },
    {
      medizin_korridor: { x1: 370, y1: 200, x2: 410, y2: 200 },
      reaktor_korridor: { x1: 600, y1: 280, x2: 640, y2: 280 },
      reaktor_sued: { x1: 760, y1: 350, x2: 760, y2: 390 },
      sued_korridor: { x1: 810, y1: 280, x2: 850, y2: 280 },
      sued_window: { x1: 790, y1: 480, x2: 890, y2: 480 },
    },
    [{ id: 'labor', rect: { x: 470, y: 0, w: 170, h: 200 }, volumeM3: 200 }],
    [
      {
        id: 'labor_korridor',
        roomA: 'labor',
        roomB: 'korridor_mitte',
        kind: 'door',
        segment: { x1: 520, y1: 200, x2: 560, y2: 200 },
        areaM2: 2,
      },
    ],
    {
      ...BASE_SPAWNS,
      medizin_spawn: { x: 390, y: 100 },
      labor_spawn: { x: 555, y: 100 },
      reaktor_spawn: { x: 620, y: 380 },
      sued_spawn: { x: 830, y: 380 },
    }
  );
}

/** Vesper: classic wings with an observatory on the west stub. */
function vesperHull(): HullSpec {
  return retile(
    StationHubSpec,
    {
      medizin: { rect: { x: 320, y: 0, w: 240, h: 200 }, volumeM3: 290 },
      sicherheit_nord: { rect: { x: 560, y: 0, w: 360, h: 200 }, volumeM3: 420 },
    },
    {
      medizin_korridor: { x1: 420, y1: 200, x2: 460, y2: 200 },
      sicherheit_nord_korridor: { x1: 700, y1: 200, x2: 740, y2: 200 },
    },
    [{ id: 'observatorium', rect: { x: -160, y: 280, w: 160, h: 200 }, volumeM3: 190 }],
    [
      {
        id: 'observatorium_kommando',
        roomA: 'observatorium',
        roomB: 'kommando',
        kind: 'door',
        segment: { x1: 0, y1: 350, x2: 0, y2: 390 },
        areaM2: 2,
      },
      {
        id: 'observatorium_window',
        roomA: 'observatorium',
        roomB: 'space',
        kind: 'window',
        segment: { x1: -160, y1: 340, x2: -160, y2: 420 },
        areaM2: 0,
        window: true,
      },
    ],
    {
      ...BASE_SPAWNS,
      medizin_spawn: { x: 440, y: 100 },
      reaktor_spawn: { x: 620, y: 380 },
      sued_spawn: { x: 820, y: 380 },
    }
  );
}

/** Walkable interior per trade hub; Meridian keeps the classic harbor. */
export function stationHullFor(hubId: string): HullSpec {
  if (hubId === 'hub_b') return solaceHull();
  if (hubId === 'hub_c') return cinderHull();
  if (hubId === 'hub_d') return vesperHull();
  return StationHubSpec;
}
