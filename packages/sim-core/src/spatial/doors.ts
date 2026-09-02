import type { DoorState } from '@kybernetes/protocol';

export function createInitialDoors(): DoorState[] {
  return [
    // Interior Blast Doors (Connect rooms to central corridor)
    {
      id: 'door_bridge',
      name: 'Bridge Blast Gate',
      x1: 180,
      y1: 280,
      x2: 260,
      y2: 280,
      isOpen: true,
      isAirlock: false,
      roomA: 'bridge',
      roomB: 'corridor',
      health: 100,
    },
    {
      id: 'door_quarters',
      name: 'Quarters Blast Gate',
      x1: 550,
      y1: 280,
      x2: 630,
      y2: 280,
      isOpen: true,
      isAirlock: false,
      roomA: 'quarters',
      roomB: 'corridor',
      health: 100,
    },
    {
      id: 'door_mess',
      name: 'Mess Hall Blast Gate',
      x1: 930,
      y1: 280,
      x2: 1010,
      y2: 280,
      isOpen: true,
      isAirlock: false,
      roomA: 'mess',
      roomB: 'corridor',
      health: 100,
    },
    {
      id: 'door_armory',
      name: 'Armory Blast Gate',
      x1: 180,
      y1: 400,
      x2: 260,
      y2: 400,
      isOpen: true,
      isAirlock: false,
      roomA: 'armory',
      roomB: 'corridor',
      health: 100,
    },
    {
      id: 'door_cargo',
      name: 'Cargo Bay Blast Gate',
      x1: 550,
      y1: 400,
      x2: 630,
      y2: 400,
      isOpen: true,
      isAirlock: false,
      roomA: 'cargo',
      roomB: 'corridor',
      health: 100,
    },
    {
      id: 'door_eng',
      name: 'Engineering Blast Gate',
      x1: 930,
      y1: 400,
      x2: 1010,
      y2: 400,
      isOpen: true,
      isAirlock: false,
      roomA: 'engineering',
      roomB: 'corridor',
      health: 100,
    },

    // Exterior Hull Airlocks (Open directly into space vacuum)
    {
      id: 'airlock_west',
      name: 'Port Hull Airlock',
      x1: 60,
      y1: 310,
      x2: 60,
      y2: 370,
      isOpen: false,
      isAirlock: true,
      roomA: 'corridor',
      roomB: 'vacuum',
    },
    {
      id: 'airlock_cargo',
      name: 'Cargo Vent Hatch',
      x1: 550,
      y1: 740,
      x2: 630,
      y2: 740,
      isOpen: false,
      isAirlock: true,
      roomA: 'cargo',
      roomB: 'vacuum',
    },
    {
      id: 'airlock_eng',
      name: 'Starboard Vent Hatch',
      x1: 1140,
      y1: 540,
      x2: 1140,
      y2: 600,
      isOpen: false,
      isAirlock: true,
      roomA: 'engineering',
      roomB: 'vacuum',
    },
  ];
}

export function toggleDoor(doors: DoorState[], doorId: string, forceState?: boolean): DoorState[] {
  return doors.map((d) => {
    if (d.id !== doorId) return d;
    return {
      ...d,
      isOpen: forceState !== undefined ? forceState : !d.isOpen,
    };
  });
}
