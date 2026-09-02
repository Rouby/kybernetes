import type {
  DefenseTelemetry,
  LifeSupportTelemetry,
  NavalDamageEvent,
  NavalDamageEventType,
  ReactorTelemetry,
  ShieldTelemetry,
} from '@kybernetes/protocol';
import { applyDamageToDefenses } from './hull';
import { calculateReactorStatus } from './reactor';

export function createInitialDefense(): DefenseTelemetry {
  return {
    pdtAmmo: 10,
    pdtReady: true,
    status: 'nominal',
  };
}

export function createNavalDamageEvent(
  type: NavalDamageEventType,
  targetRoomId?: string
): NavalDamageEvent {
  const uid = `${type}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  switch (type) {
    case 'torpedo_run':
      return {
        id: uid,
        type: 'torpedo_run',
        title: 'INBOUND HEAVY TORPEDO',
        description: 'Kinetic anti-ship torpedo tracking signature on intercept vector.',
        severity: 'critical',
        timeToImpactSeconds: 16,
        status: 'incoming',
        targetRoomId: targetRoomId || 'engineering',
      };
    case 'radiation_burst':
      return {
        id: uid,
        type: 'radiation_burst',
        title: 'CORONAL RADIATION BURST',
        description: 'Solar energetic particle wave overloading thermal radiators.',
        severity: 'moderate',
        timeToImpactSeconds: 12,
        status: 'incoming',
      };
    case 'micrometeor_storm':
      return {
        id: uid,
        type: 'micrometeor_storm',
        title: 'MICROMETEOR SWARM',
        description: 'Dense hypervelocity debris cloud puncturing outer plating.',
        severity: 'moderate',
        timeToImpactSeconds: 10,
        status: 'incoming',
        targetRoomId: targetRoomId || 'cargo',
      };
  }
}

export function interceptNavalEvent(
  event: NavalDamageEvent,
  defense: DefenseTelemetry,
  isBonusRole: boolean = false,
  roll: number = 0.5
): { nextEvent: NavalDamageEvent; nextDefense: DefenseTelemetry; success: boolean } {
  if (defense.pdtAmmo <= 0 || !defense.pdtReady || event.status !== 'incoming') {
    return { nextEvent: event, nextDefense: defense, success: false };
  }

  const nextAmmo = defense.pdtAmmo - 1;
  const threshold = isBonusRole ? 0.95 : 0.75;
  const success = roll <= threshold;

  const nextDefense: DefenseTelemetry = {
    ...defense,
    pdtAmmo: nextAmmo,
    status: nextAmmo <= 2 ? 'degraded' : 'nominal',
  };

  const nextEvent: NavalDamageEvent = success
    ? { ...event, status: 'mitigated', timeToImpactSeconds: 0 }
    : event;

  return { nextEvent, nextDefense, success };
}

export function deployFireSuppression(
  activeFires: string[],
  targetRoomId: string
): { nextFires: string[]; extinguished: boolean } {
  const index = activeFires.indexOf(targetRoomId);
  if (index === -1) {
    return { nextFires: activeFires, extinguished: false };
  }
  const nextFires = activeFires.filter((r) => r !== targetRoomId);
  return { nextFires, extinguished: true };
}

export function resolveEventImpact(
  event: NavalDamageEvent,
  state: {
    reactor: ReactorTelemetry;
    lifeSupport: LifeSupportTelemetry;
    hull: import('@kybernetes/protocol').HullTelemetry;
    shields: ShieldTelemetry;
    activeFires: string[];
  }
) {
  let nextReactor = { ...state.reactor };
  let nextLifeSupport = { ...state.lifeSupport };
  const nextFires = [...state.activeFires];

  let nextShields = state.shields;
  let nextHull = state.hull;

  if (event.type === 'torpedo_run') {
    const res = applyDamageToDefenses(state.shields, state.hull, 35, event.targetRoomId);
    nextShields = res.nextShields;
    nextHull = res.nextHull;
    if (event.targetRoomId && !nextFires.includes(event.targetRoomId)) {
      nextFires.push(event.targetRoomId);
    }
  } else if (event.type === 'radiation_burst') {
    const spikedTemp = Number((nextReactor.tempKelvin + 220).toFixed(2));
    nextReactor = {
      ...nextReactor,
      tempKelvin: spikedTemp,
      status: calculateReactorStatus(spikedTemp),
    };
    nextLifeSupport = {
      ...nextLifeSupport,
      scrubberEfficiencyPercent: 40,
    };
  } else if (event.type === 'micrometeor_storm') {
    const res = applyDamageToDefenses(state.shields, state.hull, 20, event.targetRoomId);
    nextShields = res.nextShields;
    nextHull = res.nextHull;
  }

  const resolvedEvent: NavalDamageEvent = {
    ...event,
    status: 'impacting',
    timeToImpactSeconds: 0,
  };

  return {
    reactor: nextReactor,
    lifeSupport: nextLifeSupport,
    hull: nextHull,
    shields: nextShields,
    activeFires: nextFires,
    resolvedEvent,
  };
}
