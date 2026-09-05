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
  { id: 'bridge', name: 'Command Bridge', x: 120, y: 228, width: 200, height: 140, tag: 'DECK-A' },
  {
    id: 'avionics',
    name: 'Avionics & Sensor Matrix',
    x: 320,
    y: 228,
    width: 120,
    height: 140,
    tag: 'DECK-A',
  },
  {
    id: 'life_support',
    name: 'Life Support & Recycler Bay',
    x: 440,
    y: 228,
    width: 160,
    height: 140,
    tag: 'DECK-B',
  },
  {
    id: 'quarters',
    name: 'Crew Berthing Pods',
    x: 600,
    y: 228,
    width: 160,
    height: 140,
    tag: 'DECK-B',
  },
  {
    id: 'mess',
    name: 'Mess Hall & Galley',
    x: 760,
    y: 228,
    width: 160,
    height: 140,
    tag: 'DECK-B',
  },
  {
    id: 'airlock_stbd',
    name: 'Starboard Airlock Vestibule',
    x: 920,
    y: 228,
    width: 100,
    height: 140,
    tag: 'DECK-B',
  },
  {
    id: 'corridor',
    name: 'Central Catwalk Spine',
    x: 120,
    y: 368,
    width: 900,
    height: 64,
    tag: 'CORRIDOR',
  },
  {
    id: 'armory',
    name: 'Tactical Armory & Security',
    x: 120,
    y: 432,
    width: 200,
    height: 140,
    tag: 'DECK-C',
  },
  {
    id: 'airlock_port',
    name: 'Port Airlock Vestibule',
    x: 320,
    y: 432,
    width: 120,
    height: 140,
    tag: 'DECK-C',
  },
  {
    id: 'cargo',
    name: 'Cargo Bay & Ore Hold',
    x: 440,
    y: 432,
    width: 320,
    height: 140,
    tag: 'DECK-C',
  },
  {
    id: 'engineering',
    name: 'Reactor Engineering',
    x: 760,
    y: 432,
    width: 260,
    height: 140,
    tag: 'DECK-D',
  },
  {
    id: 'gauntlet',
    name: 'Docking Gauntlet',
    x: 580,
    y: 572,
    width: 40,
    height: 78,
    tag: 'GAUNTLET',
  },
  {
    id: 'station_lobby',
    name: 'Station Lobby',
    x: 120,
    y: 650,
    width: 900,
    height: 150,
    tag: 'STATION',
  },
  {
    id: 'station_bay',
    name: 'Station Docking Bay',
    x: 120,
    y: 800,
    width: 900,
    height: 150,
    tag: 'STATION',
  },
];

export const STATION_BAY_SPAWN = { x: 560, y: 875 };

export const HESPERIA_WALLS: WallSegment[] = [
  // Outer Hull Enclosure (Top Y=228, Bottom Y=572, Left X=120, Right X=1020)
  { id: 'hull_top_l', x1: 120, y1: 228, x2: 950, y2: 228, isOpaque: true, isTraversable: false },
  { id: 'hull_top_r', x1: 990, y1: 228, x2: 1020, y2: 228, isOpaque: true, isTraversable: false },
  {
    id: 'hull_right_upper',
    x1: 1020,
    y1: 228,
    x2: 1020,
    y2: 368,
    isOpaque: true,
    isTraversable: false,
  },
  // South station block outer enclosure (x120 -> x1020, y650 -> y950)
  {
    id: 'st_hull_top_west',
    x1: 120,
    y1: 650,
    x2: 500,
    y2: 650,
    isOpaque: true,
    isTraversable: false,
  },
  {
    id: 'st_win_dock_west',
    x1: 500,
    y1: 650,
    x2: 560,
    y2: 650,
    isOpaque: false,
    isTraversable: false,
    isWindow: true,
  },
  {
    id: 'st_hull_top_port',
    x1: 560,
    y1: 650,
    x2: 580,
    y2: 650,
    isOpaque: true,
    isTraversable: false,
  },
  {
    id: 'st_hull_top_stbd',
    x1: 620,
    y1: 650,
    x2: 640,
    y2: 650,
    isOpaque: true,
    isTraversable: false,
  },
  {
    id: 'st_win_dock_east',
    x1: 640,
    y1: 650,
    x2: 700,
    y2: 650,
    isOpaque: false,
    isTraversable: false,
    isWindow: true,
  },
  {
    id: 'st_hull_top_east',
    x1: 700,
    y1: 650,
    x2: 1020,
    y2: 650,
    isOpaque: true,
    isTraversable: false,
  },
  {
    id: 'st_hull_left_south',
    x1: 120,
    y1: 650,
    x2: 120,
    y2: 665,
    isOpaque: true,
    isTraversable: false,
  },
  {
    id: 'st_win_west_alpha',
    x1: 120,
    y1: 665,
    x2: 120,
    y2: 705,
    isOpaque: false,
    isTraversable: false,
    isWindow: true,
  },
  {
    id: 'st_hull_left_mid',
    x1: 120,
    y1: 705,
    x2: 120,
    y2: 745,
    isOpaque: true,
    isTraversable: false,
  },
  {
    id: 'st_win_west_beta',
    x1: 120,
    y1: 745,
    x2: 120,
    y2: 785,
    isOpaque: false,
    isTraversable: false,
    isWindow: true,
  },
  {
    id: 'st_hull_left_north',
    x1: 120,
    y1: 785,
    x2: 120,
    y2: 950,
    isOpaque: true,
    isTraversable: false,
  },
  {
    id: 'st_hull_right_south',
    x1: 1020,
    y1: 650,
    x2: 1020,
    y2: 665,
    isOpaque: true,
    isTraversable: false,
  },
  {
    id: 'st_win_east_alpha',
    x1: 1020,
    y1: 665,
    x2: 1020,
    y2: 705,
    isOpaque: false,
    isTraversable: false,
    isWindow: true,
  },
  {
    id: 'st_hull_right_mid',
    x1: 1020,
    y1: 705,
    x2: 1020,
    y2: 745,
    isOpaque: true,
    isTraversable: false,
  },
  {
    id: 'st_win_east_beta',
    x1: 1020,
    y1: 745,
    x2: 1020,
    y2: 785,
    isOpaque: false,
    isTraversable: false,
    isWindow: true,
  },
  {
    id: 'st_hull_right_north',
    x1: 1020,
    y1: 785,
    x2: 1020,
    y2: 950,
    isOpaque: true,
    isTraversable: false,
  },
  {
    id: 'st_hull_bottom',
    x1: 120,
    y1: 950,
    x2: 1020,
    y2: 950,
    isOpaque: true,
    isTraversable: false,
  },
  // Station lobby/bay partition with open arch (gap x630 -> x670, no door)
  { id: 'st_part_west', x1: 120, y1: 800, x2: 630, y2: 800, isOpaque: true, isTraversable: false },
  { id: 'st_part_east', x1: 670, y1: 800, x2: 1020, y2: 800, isOpaque: true, isTraversable: false },
  // Vertical docking gauntlet tube (x580 -> x620, y572 -> y650)
  {
    id: 'gauntlet_tube_west',
    x1: 580,
    y1: 572,
    x2: 580,
    y2: 650,
    isOpaque: true,
    isTraversable: false,
  },
  {
    id: 'gauntlet_tube_east',
    x1: 620,
    y1: 572,
    x2: 620,
    y2: 650,
    isOpaque: true,
    isTraversable: false,
  },
  {
    id: 'hull_right_mid',
    x1: 1020,
    y1: 368,
    x2: 1020,
    y2: 432,
    isOpaque: true,
    isTraversable: false,
  },
  {
    id: 'hull_right_lower_1',
    x1: 1020,
    y1: 432,
    x2: 1020,
    y2: 480,
    isOpaque: true,
    isTraversable: false,
  },
  {
    id: 'hull_right_lower_2',
    x1: 1020,
    y1: 520,
    x2: 1020,
    y2: 572,
    isOpaque: true,
    isTraversable: false,
  },
  {
    id: 'hull_bottom_r_east',
    x1: 1020,
    y1: 572,
    x2: 700,
    y2: 572,
    isOpaque: true,
    isTraversable: false,
  },
  {
    id: 'hull_win_cargo_east',
    x1: 700,
    y1: 572,
    x2: 640,
    y2: 572,
    isOpaque: false,
    isTraversable: false,
    isWindow: true,
  },
  {
    id: 'hull_bottom_gauntlet_east',
    x1: 640,
    y1: 572,
    x2: 620,
    y2: 572,
    isOpaque: true,
    isTraversable: false,
  },
  {
    id: 'hull_bottom_gauntlet_west',
    x1: 580,
    y1: 572,
    x2: 560,
    y2: 572,
    isOpaque: true,
    isTraversable: false,
  },
  {
    id: 'hull_win_cargo_west',
    x1: 560,
    y1: 572,
    x2: 500,
    y2: 572,
    isOpaque: false,
    isTraversable: false,
    isWindow: true,
  },
  {
    id: 'hull_bottom_r_west',
    x1: 500,
    y1: 572,
    x2: 400,
    y2: 572,
    isOpaque: true,
    isTraversable: false,
  },
  { id: 'hull_bottom_l', x1: 360, y1: 572, x2: 120, y2: 572, isOpaque: true, isTraversable: false },
  { id: 'hull_left', x1: 120, y1: 572, x2: 120, y2: 228, isOpaque: true, isTraversable: false },

  // Upper Deck Partitions (Vertical Y: 228 -> 368)
  {
    id: 'part_bridge_avionics',
    x1: 320,
    y1: 228,
    x2: 320,
    y2: 368,
    isOpaque: true,
    isTraversable: false,
  },
  {
    id: 'part_avionics_life',
    x1: 440,
    y1: 228,
    x2: 440,
    y2: 368,
    isOpaque: true,
    isTraversable: false,
  },
  {
    id: 'part_life_quarters',
    x1: 600,
    y1: 228,
    x2: 600,
    y2: 368,
    isOpaque: true,
    isTraversable: false,
  },
  {
    id: 'part_quarters_mess',
    x1: 760,
    y1: 228,
    x2: 760,
    y2: 368,
    isOpaque: true,
    isTraversable: false,
  },
  {
    id: 'part_mess_stbd',
    x1: 920,
    y1: 228,
    x2: 920,
    y2: 368,
    isOpaque: true,
    isTraversable: false,
  },

  // Upper Deck / Spine Horizontal Boundary (Y = 368)
  {
    id: 'spine_top_bridge_1',
    x1: 120,
    y1: 368,
    x2: 200,
    y2: 368,
    isOpaque: true,
    isTraversable: false,
  },
  {
    id: 'spine_top_bridge_2',
    x1: 240,
    y1: 368,
    x2: 320,
    y2: 368,
    isOpaque: true,
    isTraversable: false,
  },
  {
    id: 'spine_top_avionics_1',
    x1: 320,
    y1: 368,
    x2: 360,
    y2: 368,
    isOpaque: true,
    isTraversable: false,
  },
  {
    id: 'spine_top_avionics_2',
    x1: 400,
    y1: 368,
    x2: 440,
    y2: 368,
    isOpaque: true,
    isTraversable: false,
  },
  {
    id: 'spine_top_life_1',
    x1: 440,
    y1: 368,
    x2: 500,
    y2: 368,
    isOpaque: true,
    isTraversable: false,
  },
  {
    id: 'spine_top_life_2',
    x1: 540,
    y1: 368,
    x2: 600,
    y2: 368,
    isOpaque: true,
    isTraversable: false,
  },
  {
    id: 'spine_top_quarters_1',
    x1: 600,
    y1: 368,
    x2: 660,
    y2: 368,
    isOpaque: true,
    isTraversable: false,
  },
  {
    id: 'spine_top_quarters_2',
    x1: 700,
    y1: 368,
    x2: 760,
    y2: 368,
    isOpaque: true,
    isTraversable: false,
  },
  {
    id: 'spine_top_mess_1',
    x1: 760,
    y1: 368,
    x2: 820,
    y2: 368,
    isOpaque: true,
    isTraversable: false,
  },
  {
    id: 'spine_top_mess_2',
    x1: 860,
    y1: 368,
    x2: 920,
    y2: 368,
    isOpaque: true,
    isTraversable: false,
  },
  {
    id: 'spine_top_stbd_1',
    x1: 920,
    y1: 368,
    x2: 950,
    y2: 368,
    isOpaque: true,
    isTraversable: false,
  },
  {
    id: 'spine_top_stbd_2',
    x1: 990,
    y1: 368,
    x2: 1020,
    y2: 368,
    isOpaque: true,
    isTraversable: false,
  },

  // Lower Deck Partitions (Vertical Y: 432 -> 572)
  {
    id: 'part_armory_port',
    x1: 320,
    y1: 432,
    x2: 320,
    y2: 572,
    isOpaque: true,
    isTraversable: false,
  },
  {
    id: 'part_port_cargo',
    x1: 440,
    y1: 432,
    x2: 440,
    y2: 572,
    isOpaque: true,
    isTraversable: false,
  },
  {
    id: 'part_cargo_eng',
    x1: 760,
    y1: 432,
    x2: 760,
    y2: 572,
    isOpaque: true,
    isTraversable: false,
  },

  // Lower Deck / Spine Horizontal Boundary (Y = 432)
  {
    id: 'spine_bot_armory_1',
    x1: 120,
    y1: 432,
    x2: 200,
    y2: 432,
    isOpaque: true,
    isTraversable: false,
  },
  {
    id: 'spine_bot_armory_2',
    x1: 240,
    y1: 432,
    x2: 320,
    y2: 432,
    isOpaque: true,
    isTraversable: false,
  },
  {
    id: 'spine_bot_port_1',
    x1: 320,
    y1: 432,
    x2: 360,
    y2: 432,
    isOpaque: true,
    isTraversable: false,
  },
  {
    id: 'spine_bot_port_2',
    x1: 400,
    y1: 432,
    x2: 440,
    y2: 432,
    isOpaque: true,
    isTraversable: false,
  },
  {
    id: 'spine_bot_cargo_1',
    x1: 440,
    y1: 432,
    x2: 580,
    y2: 432,
    isOpaque: true,
    isTraversable: false,
  },
  {
    id: 'spine_bot_cargo_2',
    x1: 620,
    y1: 432,
    x2: 760,
    y2: 432,
    isOpaque: true,
    isTraversable: false,
  },
  {
    id: 'spine_bot_eng_1',
    x1: 760,
    y1: 432,
    x2: 870,
    y2: 432,
    isOpaque: true,
    isTraversable: false,
  },
  {
    id: 'spine_bot_eng_2',
    x1: 910,
    y1: 432,
    x2: 1020,
    y2: 432,
    isOpaque: true,
    isTraversable: false,
  },

  // Cargo Bay Mag-Clamp Container Stacks (Solid Freight Blocks)
  {
    id: 'crate_west_top',
    x1: 470,
    y1: 460,
    x2: 520,
    y2: 460,
    isOpaque: true,
    isTraversable: false,
  },
  {
    id: 'crate_west_bot',
    x1: 470,
    y1: 540,
    x2: 520,
    y2: 540,
    isOpaque: true,
    isTraversable: false,
  },
  {
    id: 'crate_west_left',
    x1: 470,
    y1: 460,
    x2: 470,
    y2: 540,
    isOpaque: true,
    isTraversable: false,
  },
  {
    id: 'crate_west_right',
    x1: 520,
    y1: 460,
    x2: 520,
    y2: 540,
    isOpaque: true,
    isTraversable: false,
  },

  {
    id: 'crate_east_top',
    x1: 680,
    y1: 460,
    x2: 730,
    y2: 460,
    isOpaque: true,
    isTraversable: false,
  },
  {
    id: 'crate_east_bot',
    x1: 680,
    y1: 540,
    x2: 730,
    y2: 540,
    isOpaque: true,
    isTraversable: false,
  },
  {
    id: 'crate_east_left',
    x1: 680,
    y1: 460,
    x2: 680,
    y2: 540,
    isOpaque: true,
    isTraversable: false,
  },
  {
    id: 'crate_east_right',
    x1: 730,
    y1: 460,
    x2: 730,
    y2: 540,
    isOpaque: true,
    isTraversable: false,
  },

  // Engineering Reactor Containment Shroud Barriers
  {
    id: 'reactor_shield_north',
    x1: 860,
    y1: 465,
    x2: 920,
    y2: 465,
    isOpaque: true,
    isTraversable: false,
  },
  {
    id: 'reactor_shield_south',
    x1: 860,
    y1: 555,
    x2: 920,
    y2: 555,
    isOpaque: true,
    isTraversable: false,
  },
];

export const HESPERIA_STATIONS: StationFixture[] = [
  {
    id: 'bridge_helm_console',
    deckId: 'deck_a',
    name: 'Command Bridge Helm',
    stationType: 'bridge',
    x: 220,
    y: 290,
    radius: 28,
    prompt: '[E] Access Navigation Helm',
  },
  {
    id: 'avionics_terminal',
    deckId: 'deck_a',
    name: 'Avionics & Sensor Matrix',
    stationType: 'avionics',
    x: 380,
    y: 290,
    radius: 24,
    prompt: '[E] Calibrate Sensor Array',
  },
  {
    id: 'life_support_scrubber',
    deckId: 'deck_b',
    name: 'Bio-Dome Scrubber Console',
    stationType: 'hydroponics',
    x: 520,
    y: 290,
    radius: 28,
    prompt: '[E] Calibrate Scrubbers',
  },
  {
    id: 'berth_pod_alpha',
    deckId: 'deck_b',
    name: 'Crew Bunk Alpha',
    stationType: 'bunk',
    x: 650,
    y: 265,
    radius: 24,
    prompt: '[E] Rest in Bunk Alpha',
  },
  {
    id: 'berth_pod_beta',
    deckId: 'deck_b',
    name: 'Crew Bunk Beta',
    stationType: 'bunk',
    x: 710,
    y: 265,
    radius: 24,
    prompt: '[E] Rest in Bunk Beta',
  },
  {
    id: 'galley_prep_station',
    deckId: 'deck_b',
    name: 'Galley Prep Station',
    stationType: 'mess',
    x: 810,
    y: 290,
    radius: 28,
    prompt: '[E] Prepare Rations',
  },
  {
    id: 'galley_water_dispenser',
    deckId: 'deck_b',
    name: 'Hydration Fountain',
    stationType: 'mess',
    x: 890,
    y: 260,
    radius: 24,
    prompt: '[E] Drink Water',
  },
  {
    id: 'galley_paste_dispenser',
    deckId: 'deck_b',
    name: 'Nutrient Dispenser',
    stationType: 'mess',
    x: 890,
    y: 320,
    radius: 24,
    prompt: '[E] Dispense Nutrient Paste',
  },
  {
    id: 'airlock_stbd_console',
    deckId: 'deck_b',
    name: 'Starboard Airlock Cycling Unit',
    stationType: 'airlock',
    x: 970,
    y: 290,
    radius: 24,
    prompt: '[E] Cycle Starboard Airlock',
  },
  {
    id: 'armory_tactical_locker',
    deckId: 'deck_c',
    name: 'Armory Weapon Locker',
    stationType: 'armory',
    x: 220,
    y: 510,
    radius: 28,
    prompt: '[E] Swap Weapon Loadout',
  },
  {
    id: 'airlock_port_console',
    deckId: 'deck_c',
    name: 'Port Airlock Cycling Unit',
    stationType: 'airlock',
    x: 380,
    y: 510,
    radius: 24,
    prompt: '[E] Cycle Port Airlock',
  },
  {
    id: 'cargo_mag_winch',
    deckId: 'deck_c',
    name: 'Cargo Mag-Winch Terminal',
    stationType: 'cargo',
    x: 600,
    y: 510,
    radius: 28,
    prompt: '[E] Operate Cargo Winch',
  },
  {
    id: 'lobby_job_board',
    deckId: 'station',
    name: 'Station Job Board',
    stationType: 'job_board',
    x: 300,
    y: 700,
    radius: 24,
  },
  {
    id: 'reactor_primary_console',
    deckId: 'deck_d',
    name: 'Reactor Core Monitor',
    stationType: 'reactor',
    x: 890,
    y: 510,
    radius: 28,
    prompt: '[E] Access Reactor Console',
  },
];

export const HESPERIA_SPAWNS: Record<StartingRole, { x: number; y: number }> = {
  wiper: { x: 850, y: 510 },
  galley_hand: { x: 810, y: 330 },
  security_private: { x: 220, y: 470 },
  hydro_tender: { x: 520, y: 330 },
  stevedore: { x: 560, y: 510 },
};

export const DEFAULT_DECK: DeckDefinition = {
  id: 'css_hesperia_main',
  name: 'CSS Hesperia - Primary Deck',
  width: 1200,
  height: 1000,
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
  // Central Catwalk Spine Bulkhead Lamps (spaced along y=400)
  {
    id: 'light_corr_fwd',
    name: 'Forward Spine Catwalk Bulkhead Lamp',
    x: 280,
    y: 400,
    radius: 180,
    intensity: 1.15,
    color: [1.0, 0.85, 0.6],
    room: 'corridor',
    flickerSpeed: 3.5,
    flickerAmount: 0.04,
  },
  {
    id: 'light_corr_mid',
    name: 'Midship Spine Fluorescent Strip',
    x: 600,
    y: 400,
    radius: 190,
    intensity: 1.0,
    color: [0.75, 0.9, 1.0],
    room: 'corridor',
    flickerSpeed: 4.2,
    flickerAmount: 0.03,
  },
  {
    id: 'light_corr_aft',
    name: 'Aft Engineering Catwalk Lamp',
    x: 890,
    y: 400,
    radius: 180,
    intensity: 1.15,
    color: [1.0, 0.82, 0.55],
    room: 'corridor',
    flickerSpeed: 2.8,
    flickerAmount: 0.04,
  },

  // Upper Deck Room Fixtures (Y = 295)
  {
    id: 'light_bridge',
    name: 'Command Bridge Helm Array',
    x: 220,
    y: 295,
    radius: 180,
    intensity: 1.0,
    color: [0.35, 0.85, 1.0],
    room: 'bridge',
  },
  {
    id: 'light_avionics',
    name: 'Avionics Matrix Server Rack Glow',
    x: 380,
    y: 295,
    radius: 150,
    intensity: 0.95,
    color: [0.2, 0.7, 1.0],
    room: 'avionics',
    flickerSpeed: 6.0,
    flickerAmount: 0.05,
  },
  {
    id: 'light_life_support',
    name: 'Life Support Algae Vat Luminaire',
    x: 520,
    y: 295,
    radius: 160,
    intensity: 1.0,
    color: [0.2, 0.95, 0.45],
    room: 'life_support',
  },
  {
    id: 'light_quarters',
    name: 'Crew Berthing Ambient Array',
    x: 680,
    y: 295,
    radius: 160,
    intensity: 0.9,
    color: [1.0, 0.9, 0.75],
    room: 'quarters',
  },
  {
    id: 'light_mess',
    name: 'Mess Hall Galley Luminaire',
    x: 840,
    y: 295,
    radius: 160,
    intensity: 1.0,
    color: [1.0, 0.98, 0.92],
    room: 'mess',
  },
  {
    id: 'light_airlock_stbd',
    name: 'Starboard Airlock Hazard Strobe',
    x: 970,
    y: 295,
    radius: 140,
    intensity: 0.95,
    color: [1.0, 0.75, 0.2],
    room: 'airlock_stbd',
  },

  // Lower Deck Room Fixtures (Y = 505)
  {
    id: 'light_armory',
    name: 'Armory Security Alert Lamp',
    x: 220,
    y: 505,
    radius: 180,
    intensity: 0.95,
    color: [1.0, 0.65, 0.35],
    room: 'armory',
  },
  {
    id: 'light_airlock_port',
    name: 'Port Airlock Hazard Strobe',
    x: 380,
    y: 505,
    radius: 140,
    intensity: 0.95,
    color: [1.0, 0.75, 0.2],
    room: 'airlock_port',
  },
  {
    id: 'light_cargo',
    name: 'Cargo Bay Industrial Floodlight',
    x: 600,
    y: 505,
    radius: 200,
    intensity: 0.9,
    color: [0.9, 0.9, 0.82],
    room: 'cargo',
  },
  {
    id: 'light_station_lobby',
    name: 'Station Lobby Concourse Array',
    x: 570,
    y: 725,
    radius: 220,
    intensity: 1.0,
    color: [1.0, 0.95, 0.85],
    room: 'station_lobby',
  },
  {
    id: 'light_station_bay',
    name: 'Station Bay Floodlight',
    x: 570,
    y: 875,
    radius: 230,
    intensity: 1.0,
    color: [0.85, 0.92, 1.0],
    room: 'station_bay',
  },
  {
    id: 'light_gauntlet',
    name: 'Gauntlet Tube Strip',
    x: 600,
    y: 610,
    radius: 120,
    intensity: 0.9,
    color: [0.4, 0.85, 1.0],
    room: 'gauntlet',
  },
  {
    id: 'light_engineering',
    name: 'Reactor Chamber Core Glow',
    x: 890,
    y: 505,
    radius: 190,
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
  avionics: [0.18, 0.24, 0.32],
  life_support: [0.2, 0.28, 0.22],
  quarters: [0.26, 0.24, 0.22],
  mess: [0.3, 0.3, 0.28],
  airlock_stbd: [0.15, 0.18, 0.22],
  armory: [0.22, 0.22, 0.26],
  airlock_port: [0.15, 0.18, 0.22],
  cargo: [0.2, 0.2, 0.2],
  engineering: [0.24, 0.2, 0.2],
  gauntlet: [0.16, 0.2, 0.26],
  station_lobby: [0.28, 0.27, 0.24],
  station_bay: [0.2, 0.23, 0.28],
};

export interface BreachLocation {
  roomId: string;
  wallId: string;
  x: number;
  y: number;
  normalX: number;
  normalY: number;
}

function findWallForHullPoint(x: number, y: number): WallSegment | undefined {
  return HESPERIA_WALLS.find((w) => {
    if (!w.id.startsWith('hull_')) return false;
    const minX = Math.min(w.x1, w.x2) - 4;
    const maxX = Math.max(w.x1, w.x2) + 4;
    const minY = Math.min(w.y1, w.y2) - 4;
    const maxY = Math.max(w.y1, w.y2) + 4;
    return x >= minX && x <= maxX && y >= minY && y <= maxY;
  });
}

function getHullNormalAt(x: number, y: number): { normalX: number; normalY: number } {
  if (Math.abs(y - 228) <= 4) return { normalX: 0, normalY: -1 };
  if (Math.abs(y - 572) <= 4) return { normalX: 0, normalY: 1 };
  if (Math.abs(y - 650) <= 4) return { normalX: 0, normalY: -1 };
  if (Math.abs(y - 950) <= 4) return { normalX: 0, normalY: 1 };
  if (Math.abs(x - 120) <= 4) return { normalX: -1, normalY: 0 };
  if (Math.abs(x - 1020) <= 4) return { normalX: 1, normalY: 0 };
  return { normalX: 0, normalY: -1 };
}

export function normalizeBreachRoomId(breachId: string): string {
  if (breachId.startsWith('puncture_')) {
    const parts = breachId.split('_');
    if (parts.length >= 4) {
      const yStr = parts[parts.length - 1];
      const xStr = parts[parts.length - 2];
      if (!Number.isNaN(Number(xStr)) && !Number.isNaN(Number(yStr))) {
        const roomParts = parts.slice(1, parts.length - 2);
        const clean = roomParts.join('_');
        return clean === 'reactor' ? 'engineering' : clean;
      }
    }
    const clean = breachId.replace('puncture_', '');
    return clean === 'reactor' ? 'engineering' : clean;
  }
  return breachId === 'reactor' ? 'engineering' : breachId;
}

export function getBreachLocation(breachId: string): BreachLocation | null {
  if (!breachId) return null;

  if (breachId.startsWith('puncture_')) {
    const parts = breachId.split('_');
    if (parts.length >= 4) {
      const y = Number.parseInt(parts[parts.length - 1], 10);
      const x = Number.parseInt(parts[parts.length - 2], 10);
      if (!Number.isNaN(x) && !Number.isNaN(y)) {
        const roomId = normalizeBreachRoomId(breachId);
        const normal = getHullNormalAt(x, y);
        const wall = findWallForHullPoint(x, y);
        return {
          roomId,
          wallId: wall ? wall.id : 'hull_top_l',
          x,
          y,
          normalX: normal.normalX,
          normalY: normal.normalY,
        };
      }
    }
  }

  const norm = normalizeBreachRoomId(breachId);
  return HESPERIA_BREACH_LOCATIONS[norm] || null;
}

export const HESPERIA_BREACH_LOCATIONS: Record<string, BreachLocation> = {
  bridge: { roomId: 'bridge', wallId: 'hull_top_l', x: 220, y: 228, normalX: 0, normalY: -1 },
  avionics: { roomId: 'avionics', wallId: 'hull_top_l', x: 380, y: 228, normalX: 0, normalY: -1 },
  life_support: {
    roomId: 'life_support',
    wallId: 'hull_top_l',
    x: 520,
    y: 228,
    normalX: 0,
    normalY: -1,
  },
  quarters: { roomId: 'quarters', wallId: 'hull_top_l', x: 680, y: 228, normalX: 0, normalY: -1 },
  mess: { roomId: 'mess', wallId: 'hull_top_l', x: 840, y: 228, normalX: 0, normalY: -1 },
  airlock_stbd: {
    roomId: 'airlock_stbd',
    wallId: 'hull_right_upper',
    x: 1020,
    y: 298,
    normalX: 1,
    normalY: 0,
  },
  armory: { roomId: 'armory', wallId: 'hull_bottom_l', x: 220, y: 572, normalX: 0, normalY: 1 },
  airlock_port: {
    roomId: 'airlock_port',
    wallId: 'hull_bottom_l',
    x: 340,
    y: 572,
    normalX: 0,
    normalY: 1,
  },
  cargo: { roomId: 'cargo', wallId: 'hull_bottom_r_east', x: 800, y: 572, normalX: 0, normalY: 1 },
  engineering: {
    roomId: 'engineering',
    wallId: 'hull_bottom_r_east',
    x: 890,
    y: 572,
    normalX: 0,
    normalY: 1,
  },
  reactor: {
    roomId: 'engineering',
    wallId: 'hull_bottom_r_east',
    x: 890,
    y: 572,
    normalX: 0,
    normalY: 1,
  },
  corridor: { roomId: 'corridor', wallId: 'hull_left', x: 120, y: 400, normalX: -1, normalY: 0 },
  gauntlet: {
    roomId: 'gauntlet',
    wallId: 'hull_bottom_gauntlet_west',
    x: 570,
    y: 572,
    normalX: 0,
    normalY: 1,
  },
  station_lobby: {
    roomId: 'station_lobby',
    wallId: 'st_hull_top_west',
    x: 300,
    y: 650,
    normalX: 0,
    normalY: -1,
  },
  station_bay: {
    roomId: 'station_bay',
    wallId: 'st_hull_bottom',
    x: 300,
    y: 950,
    normalX: 0,
    normalY: 1,
  },
};

interface BreachPointOnWall {
  t: number;
  x: number;
  y: number;
}

function findBreachesOnWall(
  wall: WallSegment,
  activeLocs: BreachLocation[],
  halfGap: number
): BreachPointOnWall[] {
  const isHorizontal = Math.abs(wall.y1 - wall.y2) < 1;
  const isVertical = Math.abs(wall.x1 - wall.x2) < 1;
  const list: BreachPointOnWall[] = [];

  for (const loc of activeLocs) {
    if (isHorizontal && Math.abs(loc.y - wall.y1) < 4) {
      const minX = Math.min(wall.x1, wall.x2);
      const maxX = Math.max(wall.x1, wall.x2);
      if (loc.x >= minX - 1 && loc.x <= maxX + 1) {
        const clampedX = Math.max(minX + halfGap, Math.min(maxX - halfGap, loc.x));
        const t = (clampedX - wall.x1) / (wall.x2 - wall.x1);
        list.push({ t, x: clampedX, y: loc.y });
      }
    } else if (isVertical && Math.abs(loc.x - wall.x1) < 4) {
      const minY = Math.min(wall.y1, wall.y2);
      const maxY = Math.max(wall.y1, wall.y2);
      if (loc.y >= minY - 1 && loc.y <= maxY + 1) {
        const clampedY = Math.max(minY + halfGap, Math.min(maxY - halfGap, loc.y));
        const t = (clampedY - wall.y1) / (wall.y2 - wall.y1);
        list.push({ t, x: loc.x, y: clampedY });
      }
    }
  }

  return list.sort((a, b) => a.t - b.t);
}

function carveWallAtBreaches(
  wall: WallSegment,
  breaches: BreachPointOnWall[],
  halfGap: number
): WallSegment[] {
  const isHorizontal = Math.abs(wall.y1 - wall.y2) < 1;
  const segments: WallSegment[] = [];
  let currX = wall.x1;
  let currY = wall.y1;

  for (let i = 0; i < breaches.length; i++) {
    const b = breaches[i];
    const dir = isHorizontal ? (wall.x2 > wall.x1 ? 1 : -1) : wall.y2 > wall.y1 ? 1 : -1;
    const p2X = isHorizontal ? b.x - dir * halfGap : wall.x1;
    const p2Y = isHorizontal ? wall.y1 : b.y - dir * halfGap;

    if (Math.hypot(p2X - currX, p2Y - currY) > 1) {
      segments.push({ ...wall, id: `${wall.id}_br_${i}`, x1: currX, y1: currY, x2: p2X, y2: p2Y });
    }
    currX = isHorizontal ? b.x + dir * halfGap : wall.x1;
    currY = isHorizontal ? wall.y1 : b.y + dir * halfGap;
  }

  if (Math.hypot(wall.x2 - currX, wall.y2 - currY) > 1) {
    segments.push({
      ...wall,
      id: `${wall.id}_br_tail`,
      x1: currX,
      y1: currY,
      x2: wall.x2,
      y2: wall.y2,
    });
  }

  return segments;
}

export function carveBreachedWallSegments(
  walls: WallSegment[],
  breaches: string[] = [],
  gapSize = 18
): WallSegment[] {
  if (!breaches || breaches.length === 0) return walls;

  const halfGap = gapSize / 2;
  const activeLocs = breaches
    .map((b) => getBreachLocation(b))
    .filter((loc): loc is BreachLocation => Boolean(loc));

  if (activeLocs.length === 0) return walls;

  const carved: WallSegment[] = [];
  for (const wall of walls) {
    const wallBreaches = findBreachesOnWall(wall, activeLocs, halfGap);
    if (wallBreaches.length === 0) {
      carved.push(wall);
    } else {
      carved.push(...carveWallAtBreaches(wall, wallBreaches, halfGap));
    }
  }

  return carved;
}

export interface DockFrameOffset {
  x: number;
  y: number;
}

export const SHIP_ROOM_IDS = new Set<string>([
  'bridge',
  'avionics',
  'life_support',
  'quarters',
  'mess',
  'airlock_stbd',
  'corridor',
  'armory',
  'airlock_port',
  'cargo',
  'engineering',
]);

export function isShipSideRoom(roomId: string): boolean {
  return SHIP_ROOM_IDS.has(roomId);
}

export const STATION_ROOM_IDS = new Set<string>(['station_lobby', 'station_bay', 'gauntlet']);

export function isStationRoom(roomId: string): boolean {
  return STATION_ROOM_IDS.has(roomId);
}

export function toShipLocal(
  x: number,
  y: number,
  offset: DockFrameOffset
): { x: number; y: number } {
  return {
    x: Number((x - offset.x).toFixed(2)),
    y: Number((y - offset.y).toFixed(2)),
  };
}

export function toWorld(x: number, y: number, offset: DockFrameOffset): { x: number; y: number } {
  return {
    x: Number((x + offset.x).toFixed(2)),
    y: Number((y + offset.y).toFixed(2)),
  };
}

export function findWorldRoom(x: number, y: number, offset: DockFrameOffset): string | null {
  for (const r of HESPERIA_ROOMS) {
    const shipSide = isShipSideRoom(r.id);
    const rx = shipSide ? r.x + offset.x : r.x;
    const ry = shipSide ? r.y + offset.y : r.y;
    if (x >= rx && x <= rx + r.width && y >= ry && y <= ry + r.height) {
      return r.id;
    }
  }
  return null;
}

export function isAboardShip(x: number, y: number, offset: DockFrameOffset): boolean {
  const roomId = findWorldRoom(x, y, offset);
  return roomId !== null && isShipSideRoom(roomId);
}

export function isShipSideWall(wall: WallSegment): boolean {
  return !wall.id.startsWith('st_') && !wall.id.startsWith('gauntlet_');
}

export function getShipFrameWalls(): WallSegment[] {
  return HESPERIA_WALLS.filter((w) => isShipSideWall(w));
}

export function partitionFrameWalls(walls: WallSegment[]): {
  ship: WallSegment[];
  station: WallSegment[];
} {
  return {
    ship: walls.filter((w) => isShipSideWall(w)),
    station: walls.filter((w) => !isShipSideWall(w)),
  };
}

export function getStationFrameWalls(): WallSegment[] {
  return HESPERIA_WALLS.filter((w) => !isShipSideWall(w));
}

export function getWorldRooms(offset: DockFrameOffset): RoomDefinition[] {
  return HESPERIA_ROOMS.map((r) => {
    if (!isShipSideRoom(r.id)) return r;
    return { ...r, x: r.x + offset.x, y: r.y + offset.y };
  });
}

export function getWorldStations(offset: DockFrameOffset): StationFixture[] {
  return HESPERIA_STATIONS.map((s) => {
    if (s.y >= 640) return s;
    return { ...s, x: s.x + offset.x, y: s.y + offset.y };
  });
}

export function getWorldLights(offset: DockFrameOffset): LightDefinition[] {
  return HESPERIA_LIGHTS.map((l) => {
    if (!l.room || !isShipSideRoom(l.room)) return l;
    return { ...l, x: l.x + offset.x, y: l.y + offset.y };
  });
}

export function applyShipOffsetToWalls(
  walls: WallSegment[],
  offset: DockFrameOffset
): WallSegment[] {
  return walls.map((w) => {
    if (!isShipSideWall(w)) return w;
    return {
      ...w,
      x1: w.x1 + offset.x,
      y1: w.y1 + offset.y,
      x2: w.x2 + offset.x,
      y2: w.y2 + offset.y,
    };
  });
}

export function findRoomAtHullImpact(x: number, y: number): string | null {
  for (const r of HESPERIA_ROOMS) {
    if (x >= r.x - 4 && x <= r.x + r.width + 4 && y >= r.y - 4 && y <= r.y + r.height + 4) {
      return r.id;
    }
  }
  return null;
}
