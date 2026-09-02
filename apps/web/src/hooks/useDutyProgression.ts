import type { StartingRole } from '@kybernetes/protocol';
import {
  type ActiveDutyState,
  calculateDutyRewards,
  startDuty as createDuty,
  tickActiveDuty,
} from '@kybernetes/sim-core';
import { useState } from 'react';

export function useDutyProgression(role: StartingRole) {
  const [activeDuty, setActiveDuty] = useState<ActiveDutyState | null>(null);
  const [credits, setCredits] = useState(120);
  const [clearanceXp, setClearanceXp] = useState(0);
  const [clearanceLevel, setClearanceLevel] = useState(1);

  const startNewDuty = (dutyId: string, stationId: string) => {
    const d = createDuty(dutyId, stationId);
    setActiveDuty(d);
  };

  const cancelActiveDuty = () => setActiveDuty(null);

  const tickDuty = (dt: number, currentVitals: Parameters<typeof tickActiveDuty>[3]) => {
    if (!activeDuty) return 0;

    const { nextDuty, staminaCost, completed } = tickActiveDuty(
      activeDuty,
      dt,
      role,
      currentVitals
    );

    if (completed) {
      const rew = calculateDutyRewards(activeDuty.dutyId, role);
      setCredits((c) => c + rew.credits);
      setClearanceXp((xp) => {
        const nx = xp + rew.xp;
        if (nx >= 100 * clearanceLevel) setClearanceLevel((lvl) => lvl + 1);
        return nx;
      });
      setActiveDuty(null);
    } else {
      setActiveDuty(nextDuty);
    }

    return staminaCost;
  };

  return {
    activeDuty,
    credits,
    clearanceXp,
    clearanceLevel,
    startNewDuty,
    cancelActiveDuty,
    tickDuty,
  };
}
