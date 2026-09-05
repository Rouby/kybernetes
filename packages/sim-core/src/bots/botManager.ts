import type { DoorState, PawnState, StartingRole } from '@kybernetes/protocol';
import { HESPERIA_ROOMS, HESPERIA_SPAWNS, HESPERIA_STATIONS } from '../spatial/deck';
import { findNavigationPath, getRoomAt, type NavigationWaypoint } from '../spatial/navigation';

export interface BotPersona {
  role: StartingRole;
  callsign: string;
  name: string;
  badge: string;
  color: string;
  stationIds: string[];
  targetRooms: string[];
  /** Base cruise speed in px/s. Individual bots jitter around this. */
  walkSpeed: number;
  voicelines: {
    working: string[];
    walking: string[];
    resting: string[];
  };
}

export const BOT_PERSONAS: Record<StartingRole, BotPersona> = {
  wiper: {
    role: 'wiper',
    callsign: 'Stoker Vane [ENG-3]',
    name: 'Vane',
    badge: 'ENG-3',
    color: '#ffb000',
    stationIds: ['reactor_primary_console'],
    targetRooms: ['engineering', 'corridor', 'quarters'],
    walkSpeed: 68,
    voicelines: {
      working: [
        'Cycling magnetic bleed valves... watch the plasma backflow.',
        'Scrubbing slag off coil three. Smells like fried circuits.',
        'Core temperature steadying out. Conduit nominal.',
      ],
      walking: [
        'Heading to the lower bilges for leak inspection.',
        'Need to grease the primary heat exchanger seals.',
      ],
      resting: [
        'Five minute breather before the next shift rotation.',
        'Deck plates are shaking less after that purge.',
      ],
    },
  },
  galley_hand: {
    role: 'galley_hand',
    callsign: 'Cook Higgins [LOG-3]',
    name: 'Higgins',
    badge: 'LOG-3',
    color: '#00e5ff',
    stationIds: ['galley_prep_station', 'galley_paste_dispenser', 'galley_water_dispenser'],
    targetRooms: ['mess', 'corridor', 'quarters'],
    walkSpeed: 62,
    voicelines: {
      working: [
        'Another batch of synth-protein cubes ready. Extra salty.',
        'Recaf vat is brewed. Grab a mug before watch shift.',
        'Wiping down the mess tables before watch change.',
      ],
      walking: [
        'Hauling fresh ration crates up from cold storage.',
        'Checking the greywater recycling filters.',
      ],
      resting: [
        'Sitting down for a hot recaf cup.',
        'At least galley duty beats scrubbing the bilges.',
      ],
    },
  },
  security_private: {
    role: 'security_private',
    callsign: 'Marine Ortiz [SEC-3]',
    name: 'Ortiz',
    badge: 'SEC-3',
    color: '#ff2244',
    stationIds: ['armory_tactical_locker'],
    targetRooms: ['armory', 'corridor', 'bridge'],
    walkSpeed: 78,
    voicelines: {
      working: [
        'Perimeter sweeps clear. Blast doors are holding.',
        'Greased the ammo linkages on point-defense chutes.',
        'Locking down armory riot gear lockers.',
      ],
      walking: [
        'Conducting routine patrol sweep along central conduit.',
        'Keep the corridors clear, personnel.',
      ],
      resting: [
        'Standing guard at the bulkhead checkpoint.',
        'Eyes sharp. Radar picked up faint echoes earlier.',
      ],
    },
  },
  hydro_tender: {
    role: 'hydro_tender',
    callsign: 'Tender Chen [BIO-3]',
    name: 'Chen',
    badge: 'BIO-3',
    color: '#00ff66',
    stationIds: ['life_support_scrubber'],
    targetRooms: ['life_support', 'corridor', 'quarters'],
    walkSpeed: 64,
    voicelines: {
      working: [
        'Zeolite scrubbers replaced. Atmospheric CO2 dropping.',
        'Spirulina algae vats bubbling nicely. Peak oxygen yield.',
        'Balancing biosuit nutrient alkalinity.',
      ],
      walking: [
        'Inspecting bio-dome conduit seals for micro-cracks.',
        'Heading to the bridge to report air quality stats.',
      ],
      resting: [
        'Deep breath of scrubbed O2. Beats vacuum.',
        'Quiet shift in the hydroponics bay so far.',
      ],
    },
  },
  stevedore: {
    role: 'stevedore',
    callsign: 'Rigger Kowalski [HLD-3]',
    name: 'Kowalski',
    badge: 'HLD-3',
    color: '#ffaa33',
    stationIds: ['cargo_mag_winch'],
    targetRooms: ['cargo', 'corridor', 'mess'],
    walkSpeed: 58,
    voicelines: {
      working: [
        'Dogging down cargo crate 4-Alpha. High-tensile latch locked.',
        'Winch cable tension looks solid. No slippage.',
        'Sorting magnetic ore fines into bulk containment.',
      ],
      walking: [
        'Checking container mag-locks in cargo bay.',
        'Heading over to mess hall for ration intake.',
      ],
      resting: [
        'Taking a quick break on the cargo pallets.',
        'Heavy ore haul on this run. Vessel feels heavy.',
      ],
    },
  },
};

export interface BotState {
  id: string;
  role: StartingRole;
  persona: BotPersona;
  pawn: PawnState;
  state: 'walking_to_station' | 'working_station' | 'walking_to_rest' | 'resting';
  targetStationId?: string;
  targetRoomId: string;
  stateTimer: number;
  speechCooldown: number;
  path?: NavigationWaypoint[];
  pathIndex?: number;
  /** Per-instance speed multiplier (0.92-1.08) so bots don't march in lockstep. */
  speedJitter: number;
  /** Remaining seconds of an idle hesitation pause while walking. */
  pauseTimer: number;
  /** Free-running phase for facing wander and work shuffle. */
  wanderPhase: number;
  /** Doors this bot opened that should be closed once it is clear. */
  openedDoors: string[];
}

/** Request a door open only once the bot is this close (px) to its midpoint. */
export const BOT_DOOR_OPEN_RADIUS = 56;
/** Request a close once the bot is at least this far (px) past a door it opened. */
export const BOT_DOOR_CLOSE_RADIUS = 85;

/** Hull interior guardrail (outer hull x120-1020 / y228-572 minus pawn radius). */
export const BOT_HULL_BOUNDS = { minX: 132, maxX: 1008, minY: 240, maxY: 560 };

export function clampBotToHull(pos: { x: number; y: number }): { x: number; y: number } {
  return {
    x: Math.min(BOT_HULL_BOUNDS.maxX, Math.max(BOT_HULL_BOUNDS.minX, pos.x)),
    y: Math.min(BOT_HULL_BOUNDS.maxY, Math.max(BOT_HULL_BOUNDS.minY, pos.y)),
  };
}

/** Rest spot inside a room (center, pulled clear of walls and door swings). */
export function roomRestSpot(roomId: string): { x: number; y: number } {
  const room = HESPERIA_ROOMS.find((r) => r.id === roomId);
  if (!room) return { x: 840, y: 300 };
  const spot = { x: room.x + room.width / 2, y: room.y + room.height / 2 + 8 };
  return clampBotToHull(spot);
}

const DOOR_BARK_LINES = [
  'Mind the hatch.',
  'Cycling the hatch.',
  'Hatch coming open.',
  'After you — oh, nobody there. Habit.',
];

export function createBotSession(role: StartingRole, initialCooldownOffset = 0): BotState {
  const persona = BOT_PERSONAS[role];
  const spawn = HESPERIA_SPAWNS[role] || { x: 500, y: 350 };
  const targetStationId = persona.stationIds[0] || 'reactor_console';
  const station = HESPERIA_STATIONS.find((s) => s.id === targetStationId);
  const targetRoomId = station ? getRoomAt(station.x, station.y) : 'engineering';

  const pawn: PawnState = {
    id: `bot_${role}`,
    callsign: persona.callsign,
    role,
    x: spawn.x,
    y: spawn.y,
    vx: 0,
    vy: 0,
    facingAngle: Math.random() * Math.PI * 2,
    currentDeck: 'deck_a',
    isOperating: false,
    isResting: false,
    color: persona.color,
    isBot: true,
  };

  return {
    id: pawn.id,
    role,
    persona,
    pawn,
    state: 'working_station',
    targetStationId,
    targetRoomId,
    stateTimer: 12 + Math.random() * 6,
    speechCooldown: 8 + initialCooldownOffset,
    speedJitter: 0.92 + Math.random() * 0.16,
    pauseTimer: 0,
    wanderPhase: Math.random() * Math.PI * 2,
    openedDoors: [],
  };
}

export interface BotTelemetryAssistance {
  reactorTempDelta: number;
  o2Delta: number;
}

function doorMidpoint(door: DoorState): { x: number; y: number } {
  return { x: (door.x1 + door.x2) / 2, y: (door.y1 + door.y2) / 2 };
}

function distanceToDoor(pawn: PawnState, door: DoorState): number {
  const mid = doorMidpoint(door);
  return Math.hypot(mid.x - pawn.x, mid.y - pawn.y);
}

function findDoorById(doors: DoorState[], doorId: string): DoorState | undefined {
  return doors.find((door) => door.id === doorId);
}

function waypointDoorIds(path: NavigationWaypoint[] | undefined, pathIndex: number): string[] {
  if (!path) return [];
  const ids: string[] = [];
  const current = path[pathIndex];
  const next = path[pathIndex + 1];
  if (current?.doorId) ids.push(current.doorId);
  if (next?.doorId && next.doorId !== current?.doorId) ids.push(next.doorId);
  return ids;
}

/**
 * Only doors on the bot's immediate route (current + next waypoint) may be
 * opened, and only once the bot is actually at the hatch. This stops bots
 * from popping doors across the room or tripping hatches they walk past.
 */
function findDoorToOpen(
  pawn: PawnState,
  path: NavigationWaypoint[] | undefined,
  pathIndex: number,
  doors: DoorState[]
): string | undefined {
  for (const doorId of waypointDoorIds(path, pathIndex)) {
    const door = findDoorById(doors, doorId);
    if (!door || door.isOpen) continue;
    if (distanceToDoor(pawn, door) <= BOT_DOOR_OPEN_RADIUS) return door.id;
  }
  return undefined;
}

/** Doors this bot opened that it has now walked clear of. */
function collectDoorsToClose(bot: BotState, doors: DoorState[]): string[] {
  const result: string[] = [];
  for (const doorId of bot.openedDoors) {
    const door = findDoorById(doors, doorId);
    if (!door || !door.isOpen) continue;
    if (distanceToDoor(bot.pawn, door) >= BOT_DOOR_CLOSE_RADIUS) result.push(door.id);
  }
  return result;
}

function lerpAngle(from: number, to: number, t: number): number {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return from + delta * Math.min(1, Math.max(0, t));
}

function moveBotToward(
  pawn: PawnState,
  targetX: number,
  targetY: number,
  dtSeconds: number,
  speedPxPerSec: number
): { x: number; y: number; vx: number; vy: number; facingAngle: number; reached: boolean } {
  const dx = targetX - pawn.x;
  const dy = targetY - pawn.y;
  const dist = Math.hypot(dx, dy);

  if (dist < 14) {
    return { x: targetX, y: targetY, vx: 0, vy: 0, facingAngle: pawn.facingAngle, reached: true };
  }

  const angle = Math.atan2(dy, dx);
  const step = Math.min(speedPxPerSec * dtSeconds, dist);
  const clamped = clampBotToHull({
    x: pawn.x + Math.cos(angle) * step,
    y: pawn.y + Math.sin(angle) * step,
  });
  const nx = Number(clamped.x.toFixed(2));
  const ny = Number(clamped.y.toFixed(2));
  const safeDt = Math.max(dtSeconds, 0.001);
  return {
    x: nx,
    y: ny,
    vx: Number(((nx - pawn.x) / safeDt).toFixed(2)),
    vy: Number(((ny - pawn.y) / safeDt).toFixed(2)),
    facingAngle: lerpAngle(pawn.facingAngle, angle, 0.25),
    reached: false,
  };
}

interface BotMoveResult {
  x: number;
  y: number;
  vx: number;
  vy: number;
  facingAngle: number;
  atTarget: boolean;
  path: NavigationWaypoint[];
  pathIndex: number;
  doorToOpen?: string;
  doorsToClose: string[];
  waitingAtDoor: boolean;
  pausing: boolean;
}

function ensurePath(
  bot: BotState,
  targetPos: { x: number; y: number }
): { path: NavigationWaypoint[]; pathIndex: number } {
  let path = bot.path;
  let pathIndex = bot.pathIndex ?? 0;
  if (!path || path.length === 0 || pathIndex >= path.length) {
    path = findNavigationPath(bot.pawn.x, bot.pawn.y, targetPos.x, targetPos.y);
    pathIndex = 0;
  }
  return { path, pathIndex };
}

function maybeStartPause(bot: BotState, dtSeconds: number): boolean {
  if (bot.pauseTimer > 0) {
    bot.pauseTimer = Math.max(0, bot.pauseTimer - dtSeconds);
    return true;
  }
  if (Math.random() < dtSeconds * 0.05) {
    bot.pauseTimer = 0.8 + Math.random() * 1.2;
    return true;
  }
  return false;
}

function advanceBotMovement(
  bot: BotState,
  targetPos: { x: number; y: number },
  dtSeconds: number,
  doors: DoorState[]
): BotMoveResult {
  const safeTarget = clampBotToHull(targetPos);
  const ensured = ensurePath(bot, safeTarget);
  const path = ensured.path;
  let pathIndex = ensured.pathIndex;
  const doorsToClose = collectDoorsToClose(bot, doors);

  const currentWp = path[pathIndex];
  if (!currentWp) {
    return {
      x: safeTarget.x,
      y: safeTarget.y,
      vx: 0,
      vy: 0,
      facingAngle: bot.pawn.facingAngle,
      atTarget: true,
      path,
      pathIndex,
      doorsToClose,
      waitingAtDoor: false,
      pausing: false,
    };
  }

  const doorToOpen = findDoorToOpen(bot.pawn, path, pathIndex, doors);
  if (doorToOpen) {
    // Hold at the hatch for the cycle instead of phasing through it.
    bot.wanderPhase += dtSeconds * 2;
    return {
      x: bot.pawn.x,
      y: bot.pawn.y,
      vx: 0,
      vy: 0,
      facingAngle: bot.pawn.facingAngle,
      atTarget: false,
      path,
      pathIndex,
      doorToOpen,
      doorsToClose,
      waitingAtDoor: true,
      pausing: false,
    };
  }

  if (maybeStartPause(bot, dtSeconds)) {
    bot.wanderPhase += dtSeconds * 1.5;
    const glance = Math.sin(bot.wanderPhase) * 0.6;
    return {
      x: bot.pawn.x,
      y: bot.pawn.y,
      vx: 0,
      vy: 0,
      facingAngle: bot.pawn.facingAngle + glance * dtSeconds,
      atTarget: false,
      path,
      pathIndex,
      doorsToClose,
      waitingAtDoor: false,
      pausing: true,
    };
  }

  const speed = bot.persona.walkSpeed * bot.speedJitter;
  const move = moveBotToward(bot.pawn, currentWp.x, currentWp.y, dtSeconds, speed);
  bot.wanderPhase += dtSeconds * 3;

  if (move.reached) pathIndex += 1;
  return {
    x: move.x,
    y: move.y,
    vx: move.vx,
    vy: move.vy,
    facingAngle: move.facingAngle,
    atTarget: pathIndex >= path.length,
    path,
    pathIndex,
    doorsToClose,
    waitingAtDoor: false,
    pausing: false,
  };
}

function tickBotSpeech(bot: BotState, dtSeconds: number, now: number): void {
  if (bot.pawn.speechBubble && now >= bot.pawn.speechBubble.expiresAt) {
    bot.pawn.speechBubble = undefined;
  }

  bot.speechCooldown -= dtSeconds;
  if (bot.speechCooldown <= 0) {
    const cat =
      bot.state === 'working_station' ? 'working' : bot.state === 'resting' ? 'resting' : 'walking';
    const lines = bot.persona.voicelines[cat];
    bot.pawn.speechBubble = {
      text: lines[Math.floor(Math.random() * lines.length)],
      expiresAt: now + 3500,
    };
    bot.speechCooldown = 20 + Math.random() * 15;
  }
}

function maybeDoorBark(bot: BotState, now: number): void {
  if (bot.pawn.speechBubble) return;
  if (Math.random() < 0.12) {
    bot.pawn.speechBubble = {
      text: DOOR_BARK_LINES[Math.floor(Math.random() * DOOR_BARK_LINES.length)],
      expiresAt: now + 2500,
    };
  }
}

function handleWorkingStation(
  bot: BotState,
  dtSeconds: number,
  assistance: BotTelemetryAssistance,
  now: number
): void {
  bot.pawn.isOperating = true;
  bot.pawn.isResting = false;
  bot.pawn.vx = 0;
  bot.pawn.vy = 0;
  bot.stateTimer -= dtSeconds;
  bot.wanderPhase += dtSeconds * 1.2;

  const station = HESPERIA_STATIONS.find((s) => s.id === bot.targetStationId);
  if (station) {
    const faceStation = Math.atan2(station.y - bot.pawn.y, station.x - bot.pawn.x);
    const sway = Math.sin(bot.wanderPhase) * 0.18;
    bot.pawn.facingAngle = lerpAngle(bot.pawn.facingAngle, faceStation + sway, 0.12);
    // Shuffle around the console like a living tech instead of a statue.
    const shuffleR = 3.5;
    const sx = station.x + Math.cos(bot.wanderPhase * 0.7) * shuffleR;
    const sy = station.y + 14 + Math.sin(bot.wanderPhase * 0.9) * 3;
    const dx = sx - bot.pawn.x;
    const dy = sy - bot.pawn.y;
    if (Math.hypot(dx, dy) > 1.5) {
      const step = Math.min(Math.hypot(dx, dy), 9 * dtSeconds);
      const ang = Math.atan2(dy, dx);
      const clamped = clampBotToHull({
        x: bot.pawn.x + Math.cos(ang) * step,
        y: bot.pawn.y + Math.sin(ang) * step,
      });
      bot.pawn.x = Number(clamped.x.toFixed(2));
      bot.pawn.y = Number(clamped.y.toFixed(2));
    }
  }

  if (bot.role === 'wiper') {
    assistance.reactorTempDelta = -1.2 * dtSeconds;
  } else if (bot.role === 'hydro_tender') {
    assistance.o2Delta = 0.25 * dtSeconds;
  }

  if (bot.stateTimer <= 0) {
    bot.state = 'walking_to_rest';
    bot.targetRoomId = bot.role === 'galley_hand' ? 'quarters' : 'mess';
    bot.pawn.isOperating = false;
    bot.path = undefined;
    bot.pathIndex = 0;
    bot.pauseTimer = 0;
    void now;
  }
}

function handleResting(bot: BotState, dtSeconds: number): void {
  bot.pawn.isResting = true;
  bot.pawn.isOperating = false;
  bot.pawn.vx = 0;
  bot.pawn.vy = 0;
  bot.stateTimer -= dtSeconds;
  bot.wanderPhase += dtSeconds * 0.6;
  // Slow look-around scan while off-duty.
  bot.pawn.facingAngle += Math.sin(bot.wanderPhase) * 0.35 * dtSeconds;

  if (bot.stateTimer <= 0) {
    const sIds = bot.persona.stationIds;
    const stId = sIds[Math.floor(Math.random() * sIds.length)] || 'reactor_console';
    const st = HESPERIA_STATIONS.find((s) => s.id === stId);
    bot.targetStationId = stId;
    bot.targetRoomId = st ? getRoomAt(st.x, st.y) : 'engineering';
    bot.state = 'walking_to_station';
    bot.pawn.isResting = false;
    bot.path = undefined;
    bot.pathIndex = 0;
    bot.pauseTimer = 0;
  }
}

function trackOpenedDoor(bot: BotState, doorId: string | undefined): void {
  if (!doorId) return;
  if (!bot.openedDoors.includes(doorId)) bot.openedDoors.push(doorId);
}

function forgetClosedDoors(bot: BotState, doors: DoorState[], closedIds: string[]): void {
  void doors;
  if (closedIds.length === 0) return;
  bot.openedDoors = bot.openedDoors.filter((id) => !closedIds.includes(id));
}

function handleBotWalking(
  bot: BotState,
  targetPos: { x: number; y: number },
  dtSeconds: number,
  doors: DoorState[],
  destinationState: 'resting' | 'working_station',
  now: number
): { doorToOpen?: string; doorsToClose: string[] } {
  const moveRes = advanceBotMovement(bot, targetPos, dtSeconds, doors);
  bot.pawn.x = moveRes.x;
  bot.pawn.y = moveRes.y;
  bot.pawn.vx = moveRes.vx;
  bot.pawn.vy = moveRes.vy;
  bot.pawn.facingAngle = moveRes.facingAngle;
  bot.path = moveRes.path;
  bot.pathIndex = moveRes.pathIndex;

  trackOpenedDoor(bot, moveRes.doorToOpen);
  if (moveRes.doorToOpen) maybeDoorBark(bot, now);
  forgetClosedDoors(bot, doors, moveRes.doorsToClose);

  if (moveRes.atTarget) {
    bot.state = destinationState;
    bot.stateTimer =
      destinationState === 'resting' ? 10 + Math.random() * 5 : 14 + Math.random() * 6;
    bot.pawn.isResting = destinationState === 'resting';
    bot.pawn.isOperating = destinationState === 'working_station';
    bot.pawn.vx = 0;
    bot.pawn.vy = 0;
    bot.path = undefined;
    bot.pathIndex = 0;
    bot.pauseTimer = 0;
  }
  return { doorToOpen: moveRes.doorToOpen, doorsToClose: moveRes.doorsToClose };
}

export interface BotTickResult {
  nextBot: BotState;
  assistance: BotTelemetryAssistance;
  /** Door on the bot's route to open now (bot is waiting at the hatch). */
  doorToOpen?: string;
  /** Doors the bot opened earlier and has now walked clear of. */
  doorsToClose: string[];
  /** @deprecated alias for doorToOpen. */
  doorToToggle?: string;
}

export function tickBot(
  bot: BotState,
  dtSeconds: number,
  doors: DoorState[],
  now = Date.now()
): BotTickResult {
  const nextBot: BotState = {
    ...bot,
    pawn: { ...bot.pawn },
    openedDoors: [...bot.openedDoors],
  };

  const assistance: BotTelemetryAssistance = {
    reactorTempDelta: 0,
    o2Delta: 0,
  };

  tickBotSpeech(nextBot, dtSeconds, now);

  let doorToOpen: string | undefined;
  let doorsToClose: string[] = [];

  if (nextBot.state === 'working_station') {
    handleWorkingStation(nextBot, dtSeconds, assistance, now);
    // Even while on station duty, close hatches left open behind the bot.
    doorsToClose = collectDoorsToClose(nextBot, doors);
    forgetClosedDoors(nextBot, doors, doorsToClose);
  } else if (nextBot.state === 'walking_to_rest') {
    const restPos = roomRestSpot(nextBot.targetRoomId);
    const res = handleBotWalking(nextBot, restPos, dtSeconds, doors, 'resting', now);
    doorToOpen = res.doorToOpen;
    doorsToClose = res.doorsToClose;
  } else if (nextBot.state === 'resting') {
    handleResting(nextBot, dtSeconds);
    doorsToClose = collectDoorsToClose(nextBot, doors);
    forgetClosedDoors(nextBot, doors, doorsToClose);
  } else if (nextBot.state === 'walking_to_station') {
    const st =
      HESPERIA_STATIONS.find((s) => s.id === nextBot.targetStationId) || HESPERIA_STATIONS[0];
    const res = handleBotWalking(
      nextBot,
      { x: st.x, y: st.y },
      dtSeconds,
      doors,
      'working_station',
      now
    );
    doorToOpen = res.doorToOpen;
    doorsToClose = res.doorsToClose;
  }

  return { nextBot, assistance, doorToOpen, doorsToClose, doorToToggle: doorToOpen };
}
