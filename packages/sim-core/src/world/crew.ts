/**
 * Hire loop: talk to the captain for a two-job offer, hire aboard as one of
 * the four roles, fill unchosen jobs with NPC crew, and depart. Fresh pawns
 * carry no role until hired; captains are permanent NPC crew per vessel.
 */

import type { Role } from '@kybernetes/protocol';
import { spawnPawn } from './assemble.js';
import { departVessel } from './schedule.js';
import type { World } from './types.js';

export interface CrewRecord {
  readonly pawnId: string;
  readonly role: Role | 'captain';
  readonly credits: number;
  readonly clearance: number;
  readonly xp: number;
}

export interface HireOfferRecord {
  readonly offerId: string;
  readonly vesselId: string;
  readonly jobs: readonly Role[];
  readonly createdTick: number;
}

export const CREW_ROLES: readonly Role[] = ['engineer', 'deckhand', 'cook', 'security'];

export function captainIdFor(vesselId: string): string {
  return `captain:${vesselId}`;
}

export function ensureCaptain(world: World, vesselId: string): World {
  const captainId = captainIdFor(vesselId);
  if (world.pawns[captainId] !== undefined) return world;
  const point = vesselSpawnPoint(world, vesselId);
  if (point === undefined) return world;
  const withPawn = spawnPawn(world, {
    id: captainId,
    owner: `npc:${vesselId}:captain`,
    frameId: vesselId,
    roomId: point.roomId,
    x: point.x,
    y: point.y,
    color: '#ffd166',
  });
  return {
    ...withPawn,
    crew: {
      ...withPawn.crew,
      [captainId]: { pawnId: captainId, role: 'captain', credits: 0, clearance: 3, xp: 0 },
    },
  };
}

export function vesselSpawnPoint(
  world: World,
  vesselId: string
): { roomId: string; x: number; y: number } | undefined {
  const spawnId = Object.keys(world.spawns)
    .filter((id) => id.startsWith(`${vesselId}.`))
    .sort()[0];
  if (spawnId !== undefined) {
    const spawn = world.spawns[spawnId];
    if (spawn !== undefined) {
      const roomId = roomContainingPoint(world, vesselId, spawn.x, spawn.y);
      if (roomId !== undefined) return { roomId, x: spawn.x, y: spawn.y };
    }
  }
  const roomId = Object.values(world.rooms)
    .filter((room) => room.frameId === vesselId)
    .sort((a, b) => (a.id < b.id ? -1 : 1))[0]?.id;
  if (roomId === undefined) return undefined;
  const room = world.rooms[roomId];
  if (room === undefined) return undefined;
  return { roomId, x: room.rect.x + room.rect.w / 2, y: room.rect.y + room.rect.h / 2 };
}

export function roomContainingPoint(
  world: World,
  frameId: string,
  x: number,
  y: number
): string | undefined {
  for (const room of Object.values(world.rooms)) {
    if (room.frameId !== frameId) continue;
    if (
      x >= room.rect.x &&
      x <= room.rect.x + room.rect.w &&
      y >= room.rect.y &&
      y <= room.rect.y + room.rect.h
    ) {
      return room.id;
    }
  }
  return undefined;
}

export function talkToCaptain(
  world: World,
  npcId: string,
  rng01: () => number
): { world: World; offer: HireOfferRecord | undefined } {
  const npc = world.pawns[npcId];
  const record = world.crew[npcId];
  const vessel = npc === undefined ? undefined : world.vessels[npc.frameId];
  if (npc === undefined || vessel === undefined || record?.role !== 'captain') {
    return { world, offer: undefined };
  }
  if (vessel.schedule !== 'docked') return { world, offer: undefined };
  const offer: HireOfferRecord = {
    offerId: `offer_${vessel.id}_${world.tick}`,
    vesselId: vessel.id,
    jobs: pickTwoJobs(rng01),
    createdTick: world.tick,
  };
  return { world: { ...world, offers: { ...world.offers, [offer.offerId]: offer } }, offer };
}

function pickTwoJobs(rng01: () => number): readonly [Role, Role] {
  const first =
    CREW_ROLES[Math.floor(rng01() * CREW_ROLES.length) % CREW_ROLES.length] ?? 'engineer';
  const second =
    CREW_ROLES[(CREW_ROLES.indexOf(first) + 1 + Math.floor(rng01() * 3)) % CREW_ROLES.length] ??
    'deckhand';
  return [first, second];
}

export function hireAboard(
  world: World,
  vesselId: string,
  pawnId: string,
  job: Role,
  offerId: string
): { world: World; hired: boolean } {
  const offer = world.offers[offerId];
  const pawn = world.pawns[pawnId];
  if (offer === undefined || pawn === undefined) return { world, hired: false };
  if (offer.vesselId !== vesselId || !offer.jobs.includes(job)) return { world, hired: false };
  const prior = world.crew[pawnId];
  const offers = { ...world.offers };
  delete offers[offerId];
  let next: World = {
    ...world,
    offers,
    crew: {
      ...world.crew,
      [pawnId]: {
        pawnId,
        role: job,
        credits: prior?.credits ?? 0,
        clearance: prior?.clearance ?? 1,
        xp: prior?.xp ?? 0,
      },
    },
  };
  next = fillCrew(next, vesselId, job);
  return { world: departVessel(next, vesselId), hired: true };
}

function fillCrew(world: World, vesselId: string, taken: Role): World {
  let next = world;
  for (const role of CREW_ROLES) {
    if (role === taken || crewRoleAboard(next, vesselId, role)) continue;
    const point = vesselSpawnPoint(next, vesselId);
    if (point === undefined) continue;
    const id = `npc:${vesselId}:${role}`;
    next = spawnPawn(next, {
      id,
      owner: id,
      frameId: vesselId,
      roomId: point.roomId,
      x: point.x,
      y: point.y,
      color: '#9fb4c8',
    });
    next = {
      ...next,
      crew: { ...next.crew, [id]: { pawnId: id, role, credits: 0, clearance: 1, xp: 0 } },
    };
  }
  return next;
}

function crewRoleAboard(world: World, vesselId: string, role: Role): boolean {
  return Object.values(world.crew).some((record) => {
    if (record.role !== role) return false;
    return world.pawns[record.pawnId]?.frameId === vesselId;
  });
}
