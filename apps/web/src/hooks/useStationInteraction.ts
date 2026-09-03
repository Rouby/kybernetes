import type { StartingRole, StationFixture } from '@kybernetes/protocol';
import { getDutiesForStation } from '@kybernetes/sim-core';
import { useCallback, useRef, useState } from 'react';
import type { ActiveInteraction } from '../types';

export interface StationActionConfig {
  actionName: string;
  verb: string;
  type: 'duty' | 'rest' | 'paste' | 'water' | 'coolant';
  dutyId?: string;
  durationSeconds: number;
  color: string;
}

// fallow-ignore-next-line complexity
export function getStationActionConfig(
  station: StationFixture,
  role: StartingRole,
  activeDutyId?: string
): StationActionConfig {
  if (station.stationType === 'bunk') {
    return {
      actionName: 'Rest in Bunk',
      verb: 'Resting in Bunk',
      type: 'rest',
      durationSeconds: 3.0,
      color: '#ffb000',
    };
  }
  if (station.id === 'paste_dispenser') {
    return {
      actionName: 'Dispense Nutrient Paste',
      verb: 'Dispensing Paste',
      type: 'paste',
      durationSeconds: 1.5,
      color: '#ffb000',
    };
  }
  if (station.id === 'water_dispenser') {
    return {
      actionName: 'Drink Recycled Water',
      verb: 'Drinking Water',
      type: 'water',
      durationSeconds: 1.2,
      color: '#00e5ff',
    };
  }
  if (station.id === 'coolant_valve') {
    return {
      actionName: 'Vent Reactor Coolant',
      verb: 'Purging Coolant Lines',
      type: 'coolant',
      durationSeconds: 2.0,
      color: '#00e5ff',
    };
  }

  // Work Stations: prioritize active scheduled duty, or role specialized duty
  const duties = getDutiesForStation(station.stationType);
  const matched =
    (activeDutyId ? duties.find((d) => d.id === activeDutyId) : undefined) ||
    duties.find((d) => d.roleBonus === role) ||
    duties[0];
  const dutyName = matched ? matched.name : `Operate ${station.name}`;
  const dutyId = matched?.id;
  const duration = matched ? matched.durationSeconds : 6.0;

  return {
    actionName: dutyName,
    verb: matched ? `Performing ${matched.name}` : `Operating ${station.name}`,
    type: 'duty',
    dutyId,
    durationSeconds: duration,
    color: '#00e5ff',
  };
}

interface ActionHandlers {
  onCompleteDuty: (dutyId: string, stationId: string) => void;
  onConsumePaste: () => void;
  onDrinkWater: () => void;
  onRestInBunk: () => void;
  onVentCoolant: () => void;
  onNotice: (msg: string) => void;
}

// fallow-ignore-next-line complexity
function dispatchActionCompletion(current: ActiveInteraction, handlers: ActionHandlers): void {
  if (current.type === 'paste') {
    handlers.onConsumePaste();
    handlers.onNotice('[+] DISPENSED NUTRIENT PASTE (+25% NUTRITION)');
  } else if (current.type === 'water') {
    handlers.onDrinkWater();
    handlers.onNotice('[+] HYDRATION RESTORED (+30% HYDRATION)');
  } else if (current.type === 'rest') {
    handlers.onRestInBunk();
    handlers.onNotice('[+] REST CYCLE COMPLETED (-40% FATIGUE, +STAMINA)');
  } else if (current.type === 'coolant') {
    handlers.onVentCoolant();
    handlers.onNotice('[!] VENTED REACTOR COOLANT (-150 K)');
  } else if (current.dutyId) {
    handlers.onCompleteDuty(current.dutyId, current.stationId);
    handlers.onNotice(`[✓] SHIFT COMPLETED: ${current.actionName.toUpperCase()}`);
  }
}

interface UseStationInteractionProps extends ActionHandlers {
  role: StartingRole;
  activeDutyId?: string;
}

// fallow-ignore-next-line complexity
export function useStationInteraction({
  role,
  activeDutyId,
  onCompleteDuty,
  onConsumePaste,
  onDrinkWater,
  onRestInBunk,
  onVentCoolant,
  onNotice,
}: UseStationInteractionProps) {
  const [interaction, setInteraction] = useState<ActiveInteraction | null>(null);

  const handlersRef = useRef<ActionHandlers>({
    onCompleteDuty,
    onConsumePaste,
    onDrinkWater,
    onRestInBunk,
    onVentCoolant,
    onNotice,
  });
  handlersRef.current = {
    onCompleteDuty,
    onConsumePaste,
    onDrinkWater,
    onRestInBunk,
    onVentCoolant,
    onNotice,
  };

  const interactionRef = useRef<ActiveInteraction | null>(null);
  interactionRef.current = interaction;

  const startInteraction = useCallback(
    (station: StationFixture) => {
      const config = getStationActionConfig(station, role, activeDutyId);
      setInteraction({
        stationId: station.id,
        stationName: station.name,
        actionName: config.actionName,
        verb: config.verb,
        type: config.type,
        dutyId: config.dutyId,
        progress: 0,
        durationSeconds: config.durationSeconds,
        worldX: station.x,
        worldY: station.y,
        color: config.color,
      });
    },
    [role, activeDutyId]
  );

  const abortInteraction = useCallback(() => {
    setInteraction(null);
  }, []);

  // fallow-ignore-next-line complexity
  const tickInteraction = useCallback((dt: number) => {
    const current = interactionRef.current;
    if (!current) return;

    const nextElapsed = current.progress * current.durationSeconds + dt;
    const nextProgress = Math.min(1, nextElapsed / current.durationSeconds);

    if (nextProgress >= 1) {
      dispatchActionCompletion(current, handlersRef.current);
      setInteraction(null);
    } else {
      setInteraction({ ...current, progress: nextProgress });
    }
  }, []);

  return {
    interaction,
    startInteraction,
    abortInteraction,
    tickInteraction,
  };
}
