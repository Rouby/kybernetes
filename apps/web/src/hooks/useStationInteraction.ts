import type { StartingRole, StationFixture } from '@kybernetes/protocol';
import { getDutiesForStation } from '@kybernetes/sim-core';
import { useCallback, useState } from 'react';
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
  role: StartingRole
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

  // Work Stations: choose specialized role duty or station default duty
  const duties = getDutiesForStation(station.stationType);
  const matched = duties.find((d) => d.roleBonus === role) || duties[0];
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
}

// fallow-ignore-next-line complexity
export function useStationInteraction({
  role,
  onCompleteDuty,
  onConsumePaste,
  onDrinkWater,
  onRestInBunk,
  onVentCoolant,
  onNotice,
}: UseStationInteractionProps) {
  const [interaction, setInteraction] = useState<ActiveInteraction | null>(null);

  const startInteraction = useCallback(
    (station: StationFixture) => {
      const config = getStationActionConfig(station, role);
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
    [role]
  );

  const abortInteraction = useCallback(() => {
    setInteraction(null);
  }, []);

  // fallow-ignore-next-line complexity
  const tickInteraction = useCallback(
    (dt: number) => {
      if (!interaction) return;

      const nextElapsed = interaction.progress * interaction.durationSeconds + dt;
      const nextProgress = Math.min(1, nextElapsed / interaction.durationSeconds);

      if (nextProgress >= 1) {
        dispatchActionCompletion(interaction, {
          onCompleteDuty,
          onConsumePaste,
          onDrinkWater,
          onRestInBunk,
          onVentCoolant,
          onNotice,
        });
        setInteraction(null);
      } else {
        setInteraction((prev) => (prev ? { ...prev, progress: nextProgress } : null));
      }
    },
    [
      interaction,
      onCompleteDuty,
      onConsumePaste,
      onDrinkWater,
      onRestInBunk,
      onVentCoolant,
      onNotice,
    ]
  );

  return {
    interaction,
    startInteraction,
    abortInteraction,
    tickInteraction,
  };
}
