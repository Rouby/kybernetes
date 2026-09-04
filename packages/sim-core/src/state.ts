import type {
  BoardingTacticsTelemetry,
  DefenseTelemetry,
  HullTelemetry,
  LifeSupportTelemetry,
  MacroCrewSupplies,
  NavalDamageEvent,
  ReactorTelemetry,
  RoomAtmosphereSummary,
  ShieldTelemetry,
  TelemetryDeltaBroadcast,
} from '@kybernetes/protocol';
import {
  type CellularAtmosGrid,
  createInitialAtmosGrid,
  summarizeRoomAtmospheres,
  tickCellularAtmos,
} from './spatial/atmosGrid';
import { createInitialDoors } from './spatial/doors';
import { createInitialBoardingState, tickBoardingCombat } from './systems/boardingCombat';
import { createInitialHull, createInitialShields, tickShields } from './systems/hull';
import { createInitialLifeSupport, tickLifeSupport } from './systems/lifeSupport';
import { createInitialDefense, resolveEventImpact } from './systems/navalCombat';
import { createInitialReactor, tickReactor } from './systems/reactor';

export interface VesselSimulationState {
  shipName: string;
  reactorTemp: number;
  reactorMaxTemp: number;
  reactorOutputMw: number;
  oxygenLevelPercent: number;
  hullIntegrityPercent: number;
  shieldIntegrityPercent: number;
  alertLevel: 'nominal' | 'yellow' | 'red';
  supplies: MacroCrewSupplies;
  reactor: ReactorTelemetry;
  lifeSupport: LifeSupportTelemetry;
  hull: HullTelemetry;
  shields: ShieldTelemetry;
  defense: DefenseTelemetry;
  activeEvents: NavalDamageEvent[];
  activeFires: string[];
  boarding: BoardingTacticsTelemetry;
  atmos: CellularAtmosGrid;
  roomAtmospheres?: Record<string, RoomAtmosphereSummary>;
}

export function createInitialVesselState(): VesselSimulationState {
  const reactor = createInitialReactor();
  const lifeSupport = createInitialLifeSupport();
  const hull = createInitialHull();
  const shields = createInitialShields();
  const defense = createInitialDefense();
  const boarding = createInitialBoardingState();
  const atmos = createInitialAtmosGrid();
  const roomAtmospheres = summarizeRoomAtmospheres(atmos);

  return {
    shipName: 'CSS Hesperia',
    reactorTemp: reactor.tempKelvin,
    reactorMaxTemp: reactor.maxTempKelvin,
    reactorOutputMw: reactor.outputMw,
    oxygenLevelPercent: lifeSupport.o2LevelPercent,
    hullIntegrityPercent: hull.integrityPercent,
    shieldIntegrityPercent: shields.integrityPercent,
    alertLevel: 'nominal',
    supplies: {
      rations: 450,
      waterLitres: 1200,
      oxygenPercent: 99.4,
      morale: 85,
      mutinyRisk: 5,
      biomassStock: 120,
      greywaterLitres: 400,
    },
    reactor,
    lifeSupport,
    hull,
    shields,
    defense,
    activeEvents: [],
    activeFires: [],
    boarding,
    atmos,
    roomAtmospheres,
  };
}

function processEventsTick(
  events: NavalDamageEvent[],
  dtSeconds: number,
  baseState: {
    reactor: ReactorTelemetry;
    lifeSupport: LifeSupportTelemetry;
    hull: HullTelemetry;
    shields: ShieldTelemetry;
    activeFires: string[];
  }
) {
  let { reactor, lifeSupport, hull, shields, activeFires } = baseState;
  const nextEvents: NavalDamageEvent[] = [];

  for (const ev of events) {
    if (ev.status === 'incoming') {
      const nextTime = Math.max(0, ev.timeToImpactSeconds - dtSeconds);
      if (nextTime <= 0) {
        const res = resolveEventImpact(ev, { reactor, lifeSupport, hull, shields, activeFires });
        reactor = res.reactor;
        lifeSupport = res.lifeSupport;
        hull = res.hull;
        shields = res.shields;
        activeFires = res.activeFires;
        nextEvents.push(res.resolvedEvent);
      } else {
        nextEvents.push({ ...ev, timeToImpactSeconds: Number(nextTime.toFixed(1)) });
      }
    } else if (ev.status === 'mitigated' || ev.status === 'resolved') {
      const lingerSeconds = ev.timeToImpactSeconds - dtSeconds;
      if (lingerSeconds > -4) {
        nextEvents.push({ ...ev, timeToImpactSeconds: Number(lingerSeconds.toFixed(1)) });
      }
    } else if (ev.status === 'impacting') {
      nextEvents.push({ ...ev, status: 'resolved', timeToImpactSeconds: 0 });
    }
  }

  return { nextEvents, reactor, lifeSupport, hull, shields, activeFires };
}

// fallow-ignore-next-line complexity
export function tickVesselState(
  state: VesselSimulationState,
  dtSeconds: number
): VesselSimulationState {
  const extraHeat = state.activeFires.length * 3.0;
  let reactor = tickReactor(state.reactor, dtSeconds, extraHeat);
  let lifeSupport = tickLifeSupport(
    state.lifeSupport,
    dtSeconds,
    state.hull.breaches.length,
    state.activeFires.length
  );
  let shields = tickShields(state.shields, dtSeconds, reactor.outputMw);
  let hull = state.hull;
  let activeFires = state.activeFires;

  const eventRes = processEventsTick(state.activeEvents, dtSeconds, {
    reactor,
    lifeSupport,
    hull,
    shields,
    activeFires,
  });

  reactor = eventRes.reactor;
  lifeSupport = eventRes.lifeSupport;
  hull = eventRes.hull;
  shields = eventRes.shields;
  activeFires = eventRes.activeFires;

  let boarding = state.boarding || createInitialBoardingState();
  const boardingRes = tickBoardingCombat(boarding, dtSeconds);
  boarding = boardingRes.nextState;

  if (boardingRes.sabotageDetonated) {
    hull = {
      ...hull,
      integrityPercent: Math.max(0, hull.integrityPercent - boardingRes.hullDamageInflicted),
    };
  }

  // Cellular atmospheric tick
  const doors = boarding.doors || createInitialDoors();
  const atmos = tickCellularAtmos(
    state.atmos || createInitialAtmosGrid(),
    doors,
    hull.breaches,
    activeFires,
    dtSeconds
  );
  const roomAtmospheres = summarizeRoomAtmospheres(atmos, doors, hull.breaches);

  // Filter extinguished fires (if cellular fire starved or smothered)
  const remainingFires = activeFires.filter((fRoom) => {
    const summary = roomAtmospheres[fRoom];
    return summary && summary.activeFires > 0;
  });

  // Closed loop macro supplies decay/morale
  const supplies = { ...state.supplies };
  if (supplies.rations < 50 || supplies.waterLitres < 100) {
    supplies.morale = Math.max(10, supplies.morale - dtSeconds * 0.05);
    supplies.mutinyRisk = Math.min(100, supplies.mutinyRisk + dtSeconds * 0.1);
  }

  // Escalate alert level if critical conditions occur
  let alertLevel = state.alertLevel;
  if (
    remainingFires.length > 0 ||
    hull.breaches.length > 0 ||
    boarding.intruders.some((i) => i.state !== 'neutralized') ||
    eventRes.nextEvents.some((e) => e.status === 'incoming' && e.severity === 'critical')
  ) {
    alertLevel = 'red';
  }

  return {
    ...state,
    reactorTemp: reactor.tempKelvin,
    oxygenLevelPercent: lifeSupport.o2LevelPercent,
    hullIntegrityPercent: hull.integrityPercent,
    shieldIntegrityPercent: shields.integrityPercent,
    alertLevel,
    supplies,
    reactor,
    lifeSupport,
    hull,
    shields,
    activeEvents: eventRes.nextEvents,
    activeFires: remainingFires,
    boarding,
    atmos,
    roomAtmospheres,
  };
}

export function stateToTelemetryBroadcast(state: VesselSimulationState): TelemetryDeltaBroadcast {
  return {
    type: 'TELEMETRY_DELTA',
    timestamp: Date.now(),
    shipName: state.shipName,
    reactorTemp: state.reactorTemp,
    reactorMaxTemp: state.reactorMaxTemp,
    reactorOutputMw: state.reactorOutputMw,
    oxygenLevelPercent: state.oxygenLevelPercent,
    hullIntegrityPercent: state.hullIntegrityPercent,
    shieldIntegrityPercent: state.shieldIntegrityPercent,
    alertLevel: state.alertLevel,
    supplies: state.supplies,
    reactor: state.reactor,
    lifeSupport: state.lifeSupport,
    hull: state.hull,
    shields: state.shields,
    defense: state.defense,
    activeEvents: state.activeEvents,
    activeFires: state.activeFires,
    boarding: state.boarding,
    roomAtmospheres: state.roomAtmospheres,
  };
}
