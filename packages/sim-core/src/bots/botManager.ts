import type { DoorState, PawnState, StartingRole } from '@kybernetes/protocol';
import { HESPERIA_SPAWNS, HESPERIA_STATIONS } from '../spatial/deck';
import { findNavigationPath, getRoomAt, type NavigationWaypoint } from '../spatial/navigation';

export interface BotPersona {
  role: StartingRole;
  callsign: string;
  name: string;
  badge: string;
  color: string;
  stationIds: string[];
  targetRooms: string[];
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
}

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
    facingAngle: 0,
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
  };
}

export interface BotTelemetryAssistance {
  reactorTempDelta: number;
  o2Delta: number;
}

function moveBotToward(
  pawn: PawnState,
  targetX: number,
  targetY: number,
  dtSeconds: number
): { x: number; y: number; facingAngle: number; reached: boolean } {
  const dx = targetX - pawn.x;
  const dy = targetY - pawn.y;
  const dist = Math.hypot(dx, dy);

  if (dist < 14) {
    return { x: targetX, y: targetY, facingAngle: pawn.facingAngle, reached: true };
  }

  const angle = Math.atan2(dy, dx);
  const speed = 70 * dtSeconds;
  const step = Math.min(speed, dist);

  return {
    x: Number((pawn.x + Math.cos(angle) * step).toFixed(2)),
    y: Number((pawn.y + Math.sin(angle) * step).toFixed(2)),
    facingAngle: angle,
    reached: false,
  };
}

// fallow-ignore-next-line complexity
function checkClosedDoor(
  pawn: PawnState,
  currentWp: NavigationWaypoint | undefined,
  doors?: DoorState[]
): string | undefined {
  if (!doors) return undefined;
  if (currentWp?.doorId) {
    const d = doors.find((door) => door.id === currentWp.doorId);
    if (d && !d.isOpen) return d.id;
  }
  for (const door of doors) {
    if (door.isOpen) continue;
    const midX = (door.x1 + door.x2) / 2;
    const midY = (door.y1 + door.y2) / 2;
    if (Math.hypot(midX - pawn.x, midY - pawn.y) < 42) {
      return door.id;
    }
  }
  return undefined;
}

// fallow-ignore-next-line complexity
function advanceBotMovement(
  bot: BotState,
  targetPos: { x: number; y: number },
  dtSeconds: number,
  doors?: DoorState[]
): {
  x: number;
  y: number;
  facingAngle: number;
  atTarget: boolean;
  path: NavigationWaypoint[];
  pathIndex: number;
  doorToToggle?: string;
} {
  let path = bot.path;
  let pathIndex = bot.pathIndex ?? 0;

  if (!path || path.length === 0 || pathIndex >= path.length) {
    path = findNavigationPath(bot.pawn.x, bot.pawn.y, targetPos.x, targetPos.y);
    pathIndex = 0;
  }

  const currentWp = path[pathIndex];
  if (!currentWp) {
    return {
      x: targetPos.x,
      y: targetPos.y,
      facingAngle: bot.pawn.facingAngle,
      atTarget: true,
      path,
      pathIndex,
    };
  }

  const doorToToggle = checkClosedDoor(bot.pawn, currentWp, doors);
  const move = moveBotToward(bot.pawn, currentWp.x, currentWp.y, dtSeconds);

  if (move.reached) {
    pathIndex++;
  }

  const atTarget = pathIndex >= path.length;
  return {
    x: move.x,
    y: move.y,
    facingAngle: move.facingAngle,
    atTarget,
    path,
    pathIndex,
    doorToToggle,
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

function handleWorkingStation(
  bot: BotState,
  dtSeconds: number,
  assistance: BotTelemetryAssistance
): void {
  bot.pawn.isOperating = true;
  bot.pawn.isResting = false;
  bot.stateTimer -= dtSeconds;

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
  }
}

function handleResting(bot: BotState, dtSeconds: number): void {
  bot.pawn.isResting = true;
  bot.pawn.isOperating = false;
  bot.stateTimer -= dtSeconds;

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
  }
}

function handleBotWalking(
  bot: BotState,
  targetPos: { x: number; y: number },
  dtSeconds: number,
  doors: DoorState[],
  destinationState: 'resting' | 'working_station'
): string | undefined {
  const moveRes = advanceBotMovement(bot, targetPos, dtSeconds, doors);
  bot.pawn.x = moveRes.x;
  bot.pawn.y = moveRes.y;
  bot.pawn.facingAngle = moveRes.facingAngle;
  bot.path = moveRes.path;
  bot.pathIndex = moveRes.pathIndex;

  if (moveRes.atTarget) {
    bot.state = destinationState;
    bot.stateTimer =
      destinationState === 'resting' ? 10 + Math.random() * 5 : 14 + Math.random() * 6;
    bot.pawn.isResting = destinationState === 'resting';
    bot.pawn.isOperating = destinationState === 'working_station';
    bot.path = undefined;
    bot.pathIndex = 0;
  }
  return moveRes.doorToToggle;
}

export function tickBot(
  bot: BotState,
  dtSeconds: number,
  doors: DoorState[],
  now = Date.now()
): { nextBot: BotState; assistance: BotTelemetryAssistance; doorToToggle?: string } {
  const nextBot: BotState = {
    ...bot,
    pawn: { ...bot.pawn },
  };

  const assistance: BotTelemetryAssistance = {
    reactorTempDelta: 0,
    o2Delta: 0,
  };

  tickBotSpeech(nextBot, dtSeconds, now);

  let doorToToggle: string | undefined;

  if (nextBot.state === 'working_station') {
    handleWorkingStation(nextBot, dtSeconds, assistance);
  } else if (nextBot.state === 'walking_to_rest') {
    const isQuarters = nextBot.targetRoomId === 'quarters';
    const restPos = isQuarters ? { x: 480, y: 160 } : { x: 880, y: 160 };
    doorToToggle = handleBotWalking(nextBot, restPos, dtSeconds, doors, 'resting');
  } else if (nextBot.state === 'resting') {
    handleResting(nextBot, dtSeconds);
  } else if (nextBot.state === 'walking_to_station') {
    const st =
      HESPERIA_STATIONS.find((s) => s.id === nextBot.targetStationId) || HESPERIA_STATIONS[0];
    doorToToggle = handleBotWalking(
      nextBot,
      { x: st.x, y: st.y },
      dtSeconds,
      doors,
      'working_station'
    );
  }

  return { nextBot, assistance, doorToToggle };
}
