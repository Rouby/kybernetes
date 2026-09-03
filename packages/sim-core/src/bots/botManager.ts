import type { DoorState, PawnState, StartingRole } from '@kybernetes/protocol';
import { HESPERIA_SPAWNS, HESPERIA_STATIONS } from '../spatial/deck';
import { findWaypointPath } from '../spatial/navigation';

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
    stationIds: ['reactor_console'],
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
    stationIds: ['mess_prep', 'paste_dispenser', 'water_dispenser'],
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
    stationIds: ['armory_sentry'],
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
    stationIds: ['hydro_scrubber'],
    targetRooms: ['corridor', 'quarters', 'bridge'],
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
    stationIds: ['cargo_winch'],
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
}

export function createBotSession(role: StartingRole, initialCooldownOffset = 0): BotState {
  const persona = BOT_PERSONAS[role];
  const spawn = HESPERIA_SPAWNS[role] || { x: 500, y: 350 };
  const targetStationId = persona.stationIds[0] || 'reactor_console';
  const station = HESPERIA_STATIONS.find((s) => s.id === targetStationId);
  const targetRoomId = station?.stationType === 'reactor' ? 'engineering' : 'corridor';

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

// fallow-ignore-next-line complexity
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
  const speed = 55 * dtSeconds;
  const step = Math.min(speed, dist);

  return {
    x: Number((pawn.x + Math.cos(angle) * step).toFixed(2)),
    y: Number((pawn.y + Math.sin(angle) * step).toFixed(2)),
    facingAngle: angle,
    reached: false,
  };
}

// fallow-ignore-next-line complexity
function advanceBotMovement(
  bot: BotState,
  targetRoomId: string,
  targetPos: { x: number; y: number },
  dtSeconds: number
): { x: number; y: number; facingAngle: number; atTarget: boolean } {
  const path = findWaypointPath(bot.pawn.x, bot.pawn.y, targetRoomId);
  if (path.length <= 1) {
    // Already in room or close to destination
    const res = moveBotToward(bot.pawn, targetPos.x, targetPos.y, dtSeconds);
    return { x: res.x, y: res.y, facingAngle: res.facingAngle, atTarget: res.reached };
  }

  const nextWp = path[0];
  const wpDist = Math.hypot(nextWp.x - bot.pawn.x, nextWp.y - bot.pawn.y);

  if (wpDist < 16 && path.length > 1) {
    const followingWp = path[1];
    const res = moveBotToward(bot.pawn, followingWp.x, followingWp.y, dtSeconds);
    return { x: res.x, y: res.y, facingAngle: res.facingAngle, atTarget: false };
  }

  const res = moveBotToward(bot.pawn, nextWp.x, nextWp.y, dtSeconds);
  return { x: res.x, y: res.y, facingAngle: res.facingAngle, atTarget: false };
}

// fallow-ignore-next-line complexity
export function tickBot(
  bot: BotState,
  dtSeconds: number,
  _doors: DoorState[],
  now = Date.now()
): { nextBot: BotState; assistance: BotTelemetryAssistance } {
  const nextBot: BotState = {
    ...bot,
    pawn: { ...bot.pawn },
  };

  const assistance: BotTelemetryAssistance = {
    reactorTempDelta: 0,
    o2Delta: 0,
  };

  // 1. Speech bubble expiration and cooldown
  if (nextBot.pawn.speechBubble && now >= nextBot.pawn.speechBubble.expiresAt) {
    nextBot.pawn.speechBubble = undefined;
  }

  nextBot.speechCooldown -= dtSeconds;
  if (nextBot.speechCooldown <= 0) {
    const speechCategory =
      nextBot.state === 'working_station'
        ? 'working'
        : nextBot.state === 'resting'
          ? 'resting'
          : 'walking';
    const lines = nextBot.persona.voicelines[speechCategory];
    const chosen = lines[Math.floor(Math.random() * lines.length)];

    nextBot.pawn.speechBubble = {
      text: chosen,
      expiresAt: now + 3500,
    };
    nextBot.speechCooldown = 20 + Math.random() * 15;
  }

  // 2. State machine
  if (nextBot.state === 'working_station') {
    nextBot.pawn.isOperating = true;
    nextBot.pawn.isResting = false;
    nextBot.stateTimer -= dtSeconds;

    // Functional assistance while operating:
    if (nextBot.role === 'wiper') {
      assistance.reactorTempDelta = -1.2 * dtSeconds; // Wiper gently bleeds heat
    } else if (nextBot.role === 'hydro_tender') {
      assistance.o2Delta = 0.25 * dtSeconds; // Hydro tender optimizes scrubbers
    }

    if (nextBot.stateTimer <= 0) {
      // Finished chore, walk to rest
      nextBot.state = 'walking_to_rest';
      nextBot.targetRoomId = nextBot.role === 'galley_hand' ? 'quarters' : 'mess';
      nextBot.pawn.isOperating = false;
    }
  } else if (nextBot.state === 'walking_to_rest') {
    const restStation = HESPERIA_STATIONS.find((s) => s.id === 'mess_prep') || HESPERIA_STATIONS[0];
    const targetPos = { x: restStation.x, y: restStation.y };
    const moveRes = advanceBotMovement(nextBot, nextBot.targetRoomId, targetPos, dtSeconds);

    nextBot.pawn.x = moveRes.x;
    nextBot.pawn.y = moveRes.y;
    nextBot.pawn.facingAngle = moveRes.facingAngle;

    if (moveRes.atTarget) {
      nextBot.state = 'resting';
      nextBot.stateTimer = 10 + Math.random() * 5;
      nextBot.pawn.isResting = true;
    }
  } else if (nextBot.state === 'resting') {
    nextBot.pawn.isResting = true;
    nextBot.pawn.isOperating = false;
    nextBot.stateTimer -= dtSeconds;

    if (nextBot.stateTimer <= 0) {
      // Rest over, walk back to station
      const stId =
        nextBot.persona.stationIds[Math.floor(Math.random() * nextBot.persona.stationIds.length)] ||
        'reactor_console';
      nextBot.targetStationId = stId;
      const st = HESPERIA_STATIONS.find((s) => s.id === stId);
      nextBot.targetRoomId = st?.stationType === 'reactor' ? 'engineering' : 'corridor';
      nextBot.state = 'walking_to_station';
      nextBot.pawn.isResting = false;
    }
  } else if (nextBot.state === 'walking_to_station') {
    const st =
      HESPERIA_STATIONS.find((s) => s.id === nextBot.targetStationId) || HESPERIA_STATIONS[0];
    const targetPos = { x: st.x, y: st.y };
    const moveRes = advanceBotMovement(nextBot, nextBot.targetRoomId, targetPos, dtSeconds);

    nextBot.pawn.x = moveRes.x;
    nextBot.pawn.y = moveRes.y;
    nextBot.pawn.facingAngle = moveRes.facingAngle;

    if (moveRes.atTarget) {
      nextBot.state = 'working_station';
      nextBot.stateTimer = 14 + Math.random() * 6;
      nextBot.pawn.isOperating = true;
    }
  }

  return { nextBot, assistance };
}
