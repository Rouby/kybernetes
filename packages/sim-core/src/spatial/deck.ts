import type {
  DeckDefinition,
  StartingRole,
  StationFixture,
  WallSegment,
} from '@kybernetes/protocol';

export interface RoomDefinition {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  tag: string;
}

export const HESPERIA_ROOMS: RoomDefinition[] = [
  { id: 'bridge', name: 'Command Bridge', x: 60, y: 60, width: 320, height: 220, tag: 'DECK-A' },
  { id: 'quarters', name: 'Crew Bunks', x: 400, y: 60, width: 380, height: 220, tag: 'DECK-B' },
  { id: 'mess', name: 'Mess Hall & Galley', x: 800, y: 60, width: 340, height: 220, tag: 'DECK-B' },
  {
    id: 'corridor',
    name: 'Central Transit Conduit',
    x: 60,
    y: 280,
    width: 1080,
    height: 120,
    tag: 'CORRIDOR',
  },
  {
    id: 'armory',
    name: 'Armory & Security',
    x: 60,
    y: 400,
    width: 320,
    height: 340,
    tag: 'DECK-C',
  },
  {
    id: 'cargo',
    name: 'Cargo Bay & Ore Hold',
    x: 400,
    y: 400,
    width: 380,
    height: 340,
    tag: 'DECK-C',
  },
  {
    id: 'engineering',
    name: 'Reactor Engineering',
    x: 800,
    y: 400,
    width: 340,
    height: 340,
    tag: 'DECK-D',
  },
];

export const HESPERIA_WALLS: WallSegment[] = [
  // Outer Hull Enclosure
  { id: 'hull_top', x1: 60, y1: 60, x2: 1140, y2: 60, isOpaque: true, isTraversable: false },
  { id: 'hull_right', x1: 1140, y1: 60, x2: 1140, y2: 740, isOpaque: true, isTraversable: false },
  { id: 'hull_bottom', x1: 1140, y1: 740, x2: 60, y2: 740, isOpaque: true, isTraversable: false },
  { id: 'hull_left', x1: 60, y1: 740, x2: 60, y2: 60, isOpaque: true, isTraversable: false },

  // Bridge Walls
  { id: 'bridge_right', x1: 380, y1: 60, x2: 380, y2: 280, isOpaque: true, isTraversable: false },
  { id: 'bridge_bot_l', x1: 60, y1: 280, x2: 180, y2: 280, isOpaque: true, isTraversable: false },
  { id: 'bridge_bot_r', x1: 260, y1: 280, x2: 380, y2: 280, isOpaque: true, isTraversable: false },

  // Crew Quarters Walls
  { id: 'quarters_left', x1: 400, y1: 60, x2: 400, y2: 280, isOpaque: true, isTraversable: false },
  { id: 'quarters_right', x1: 780, y1: 60, x2: 780, y2: 280, isOpaque: true, isTraversable: false },
  {
    id: 'quarters_bot_l',
    x1: 400,
    y1: 280,
    x2: 550,
    y2: 280,
    isOpaque: true,
    isTraversable: false,
  },
  {
    id: 'quarters_bot_r',
    x1: 630,
    y1: 280,
    x2: 780,
    y2: 280,
    isOpaque: true,
    isTraversable: false,
  },

  // Mess Hall Walls
  { id: 'mess_left', x1: 800, y1: 60, x2: 800, y2: 280, isOpaque: true, isTraversable: false },
  { id: 'mess_bot_l', x1: 800, y1: 280, x2: 930, y2: 280, isOpaque: true, isTraversable: false },
  { id: 'mess_bot_r', x1: 1010, y1: 280, x2: 1140, y2: 280, isOpaque: true, isTraversable: false },

  // Armory Walls
  { id: 'armory_top_l', x1: 60, y1: 400, x2: 180, y2: 400, isOpaque: true, isTraversable: false },
  { id: 'armory_top_r', x1: 260, y1: 400, x2: 380, y2: 400, isOpaque: true, isTraversable: false },
  { id: 'armory_right', x1: 380, y1: 400, x2: 380, y2: 740, isOpaque: true, isTraversable: false },

  // Cargo Hold Walls
  { id: 'cargo_left', x1: 400, y1: 400, x2: 400, y2: 740, isOpaque: true, isTraversable: false },
  { id: 'cargo_top_l', x1: 400, y1: 400, x2: 550, y2: 400, isOpaque: true, isTraversable: false },
  { id: 'cargo_top_r', x1: 630, y1: 400, x2: 780, y2: 400, isOpaque: true, isTraversable: false },
  { id: 'cargo_right', x1: 780, y1: 400, x2: 780, y2: 740, isOpaque: true, isTraversable: false },

  // Engineering Walls
  { id: 'eng_left', x1: 800, y1: 400, x2: 800, y2: 740, isOpaque: true, isTraversable: false },
  { id: 'eng_top_l', x1: 800, y1: 400, x2: 930, y2: 400, isOpaque: true, isTraversable: false },
  { id: 'eng_top_r', x1: 1010, y1: 400, x2: 1140, y2: 400, isOpaque: true, isTraversable: false },
];

export const HESPERIA_STATIONS: StationFixture[] = [
  {
    id: 'bridge_helm',
    deckId: 'deck_a',
    name: 'Command Bridge Helm',
    stationType: 'bridge',
    x: 220,
    y: 160,
    radius: 28,
    prompt: '[E] Access Navigation Helm',
  },
  {
    id: 'crew_bunk_1',
    deckId: 'deck_b',
    name: 'Crew Bunk Alpha',
    stationType: 'bunk',
    x: 480,
    y: 160,
    radius: 28,
    prompt: '[E] Rest in Bunk Alpha',
  },
  {
    id: 'crew_bunk_2',
    deckId: 'deck_b',
    name: 'Crew Bunk Beta',
    stationType: 'bunk',
    x: 680,
    y: 160,
    radius: 28,
    prompt: '[E] Rest in Bunk Beta',
  },
  {
    id: 'mess_prep',
    deckId: 'deck_b',
    name: 'Galley Prep Station',
    stationType: 'mess',
    x: 880,
    y: 160,
    radius: 28,
    prompt: '[E] Prepare Rations',
  },
  {
    id: 'water_dispenser',
    deckId: 'deck_b',
    name: 'Hydration Fountain',
    stationType: 'mess',
    x: 1060,
    y: 140,
    radius: 24,
    prompt: '[E] Drink Water',
  },
  {
    id: 'paste_dispenser',
    deckId: 'deck_b',
    name: 'Nutrient Dispenser',
    stationType: 'mess',
    x: 1060,
    y: 220,
    radius: 24,
    prompt: '[E] Dispense Nutrient Paste',
  },
  {
    id: 'hydro_scrubber',
    deckId: 'deck_b',
    name: 'Bio-Dome Scrubber Console',
    stationType: 'hydroponics',
    x: 590,
    y: 340,
    radius: 28,
    prompt: '[E] Calibrate Scrubbers',
  },
  {
    id: 'armory_sentry',
    deckId: 'deck_c',
    name: 'Armory Weapon Locker',
    stationType: 'armory',
    x: 220,
    y: 570,
    radius: 28,
    prompt: '[E] Swap Weapon Loadout',
  },
  {
    id: 'cargo_winch',
    deckId: 'deck_c',
    name: 'Cargo Mag-Winch Terminal',
    stationType: 'cargo',
    x: 590,
    y: 570,
    radius: 28,
    prompt: '[E] Operate Cargo Winch',
  },
  {
    id: 'reactor_console',
    deckId: 'deck_d',
    name: 'Reactor Core Monitor',
    stationType: 'reactor',
    x: 970,
    y: 570,
    radius: 28,
    prompt: '[E] Access Reactor Console',
  },
];

export const HESPERIA_SPAWNS: Record<StartingRole, { x: number; y: number }> = {
  wiper: { x: 924, y: 570 },
  galley_hand: { x: 880, y: 200 },
  security_private: { x: 220, y: 520 },
  hydro_tender: { x: 550, y: 340 },
  stevedore: { x: 540, y: 570 },
};

export const DEFAULT_DECK: DeckDefinition = {
  id: 'css_hesperia_main',
  name: 'CSS Hesperia - Primary Deck',
  width: 1200,
  height: 800,
  walls: HESPERIA_WALLS,
  stations: HESPERIA_STATIONS,
  spawnPoints: HESPERIA_SPAWNS,
};

export function createDefaultDeck(): DeckDefinition {
  return { ...DEFAULT_DECK };
}

export interface LightDefinition {
  id: string;
  name: string;
  x: number;
  y: number;
  radius: number;
  intensity: number;
  color: [number, number, number];
  room?: string;
  flickerSpeed?: number;
  flickerAmount?: number;
}

export const HESPERIA_LIGHTS: LightDefinition[] = [
  // Central Corridor Bulkhead Lights (evenly spaced along y=340)
  {
    id: 'light_corr_port',
    name: 'Port Junction Conduit Bulkhead Lamp',
    x: 220,
    y: 340,
    radius: 210,
    intensity: 1.15,
    color: [1.0, 0.85, 0.6],
    room: 'corridor',
    flickerSpeed: 3.5,
    flickerAmount: 0.04,
  },
  {
    id: 'light_corr_mid_w',
    name: 'Mid-West Corridor Fluorescent Strip',
    x: 475,
    y: 340,
    radius: 200,
    intensity: 1.0,
    color: [0.75, 0.9, 1.0],
    room: 'corridor',
    flickerSpeed: 4.2,
    flickerAmount: 0.03,
  },
  {
    id: 'light_corr_mid_e',
    name: 'Mid-East Corridor Fluorescent Strip',
    x: 725,
    y: 340,
    radius: 200,
    intensity: 1.0,
    color: [0.75, 0.9, 1.0],
    room: 'corridor',
    flickerSpeed: 2.8,
    flickerAmount: 0.03,
  },
  {
    id: 'light_corr_stbd',
    name: 'Starboard Junction Conduit Bulkhead Lamp',
    x: 970,
    y: 340,
    radius: 210,
    intensity: 1.15,
    color: [1.0, 0.82, 0.55],
    room: 'corridor',
    flickerSpeed: 5.1,
    flickerAmount: 0.05,
  },

  // Operational Rooms Ceiling Fixtures
  {
    id: 'light_bridge',
    name: 'Command Bridge Helm Array',
    x: 220,
    y: 170,
    radius: 260,
    intensity: 1.0,
    color: [0.35, 0.85, 1.0],
    room: 'bridge',
  },
  {
    id: 'light_quarters',
    name: 'Crew Quarters Ambient Array',
    x: 590,
    y: 170,
    radius: 270,
    intensity: 0.95,
    color: [1.0, 0.9, 0.75],
    room: 'quarters',
  },
  {
    id: 'light_mess',
    name: 'Mess Hall Galley Luminaire',
    x: 970,
    y: 170,
    radius: 270,
    intensity: 1.0,
    color: [1.0, 0.98, 0.92],
    room: 'mess',
  },
  {
    id: 'light_armory',
    name: 'Armory Security Alert Lamp',
    x: 220,
    y: 570,
    radius: 270,
    intensity: 0.95,
    color: [1.0, 0.65, 0.35],
    room: 'armory',
  },
  {
    id: 'light_cargo',
    name: 'Cargo Bay Industrial Floodlight',
    x: 590,
    y: 570,
    radius: 290,
    intensity: 0.9,
    color: [0.9, 0.9, 0.82],
    room: 'cargo',
  },
  {
    id: 'light_engineering',
    name: 'Reactor Chamber Core Glow',
    x: 970,
    y: 570,
    radius: 280,
    intensity: 1.05,
    color: [0.25, 0.9, 1.0],
    room: 'engineering',
    flickerSpeed: 2.5,
    flickerAmount: 0.08,
  },
];

export const ROOM_AMBIENTS: Record<string, [number, number, number]> = {
  corridor: [0.06, 0.07, 0.1],
  bridge: [0.22, 0.28, 0.35],
  quarters: [0.26, 0.24, 0.22],
  mess: [0.3, 0.3, 0.28],
  armory: [0.22, 0.22, 0.26],
  cargo: [0.2, 0.2, 0.2],
  engineering: [0.24, 0.2, 0.2],
};
