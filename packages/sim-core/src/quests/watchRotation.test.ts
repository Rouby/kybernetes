import { describe, expect, it } from 'vitest';
import { applyDutySubsystemImpact, calculateClearanceRank, calculateDutyRewards } from '../duties';
import { createInitialVesselState } from '../state';
import { createInitialPlayerVitals } from '../survival';
import { tickLifeSupport } from '../systems/lifeSupport';
import { tickReactor } from '../systems/reactor';
import { advanceShiftTask, generateShiftChecklist, handoverWatchRotation } from './shiftChecklist';

describe('Watch Rotation & Handover Gameloop', () => {
  it('initializes a fresh shift checklist in active_watch phase with station targets', () => {
    const shift = generateShiftChecklist('wiper', 1, Date.now(), 'alpha', 1);
    expect(shift.shiftNumber).toBe(1);
    expect(shift.watchSection).toBe('alpha');
    expect(shift.phase).toBe('active_watch');
    expect(shift.rankBadge).toBe('ENG-3');
    expect(shift.tasks).toHaveLength(3);
    expect(shift.tasks[0].targetStationId).toBe('reactor_primary_console');
  });

  it('progresses active watch tasks and transitions to off_duty on final duty completion', () => {
    let shift = generateShiftChecklist('wiper', 1);

    // Complete task 1
    const step1 = advanceShiftTask(shift, shift.tasks[0].dutyId);
    expect(step1.taskCompleted).toBe(true);
    expect(step1.shiftFinished).toBe(false);
    expect(step1.nextShift.phase).toBe('active_watch');
    shift = step1.nextShift;

    // Complete task 2
    const step2 = advanceShiftTask(shift, shift.tasks[1].dutyId);
    expect(step2.taskCompleted).toBe(true);
    expect(step2.shiftFinished).toBe(false);
    shift = step2.nextShift;

    // Complete task 3
    const step3 = advanceShiftTask(shift, shift.tasks[2].dutyId);
    expect(step3.taskCompleted).toBe(true);
    expect(step3.shiftFinished).toBe(true);
    expect(step3.nextShift.phase).toBe('off_duty');
  });

  it('executes bunk handover, scores performance, and promotes clearance level upon XP threshold', () => {
    let shift = generateShiftChecklist('wiper', 1);
    for (const t of shift.tasks) {
      shift = advanceShiftTask(shift, t.dutyId).nextShift;
    }
    expect(shift.phase).toBe('off_duty');

    const vitals = createInitialPlayerVitals();
    // Handover with starting clearance 1 and 30 initial XP (duties + S-grade bonus will exceed 50 XP)
    const result = handoverWatchRotation(shift, vitals, 1, 30, shift.startedAt + 45000);

    expect(result.evaluation.grade).toBe('S');
    expect(result.evaluation.baseCredits).toBeGreaterThan(0);
    expect(result.promoted).toBe(true);
    expect(result.newClearanceLevel).toBe(2);
    expect(result.evaluation.rankBadge).toBe('ENG-2');
    expect(result.nextShift.shiftNumber).toBe(2);
    expect(result.nextShift.phase).toBe('active_watch');
    expect(result.nextShift.rankBadge).toBe('ENG-2');
  });

  it('scales duty credit rewards based on clearance level salary multiplier', () => {
    const r1 = calculateDutyRewards('scrub_plasma', 'wiper', 1);
    const r3 = calculateDutyRewards('scrub_plasma', 'wiper', 3);
    const rank3 = calculateClearanceRank('wiper', 3);

    expect(rank3.salaryMultiplier).toBe(1.5);
    expect(r3.credits).toBeGreaterThan(r1.credits);
    expect(r3.credits).toBe(Math.round(r1.credits * 1.5));
  });
});

describe('Systemic Degradation & Direct Duty Impact', () => {
  it('causes thermal drift over time and purges coolant to recover core temperature', () => {
    const vessel = createInitialVesselState();
    // Simulate 120 seconds of operation without maintenance
    const hotReactor = tickReactor(vessel.reactor, 120);
    expect(hotReactor.tempKelvin).toBeGreaterThan(vessel.reactor.tempKelvin);

    const stateWithHeat = { ...vessel, reactor: hotReactor };
    const impact = applyDutySubsystemImpact(stateWithHeat, 'purge_coolant');

    expect(impact.nextState.reactor.tempKelvin).toBeLessThan(hotReactor.tempKelvin);
    expect(impact.nextState.reactor.coolantLevelPercent).toBe(100);
  });

  it('causes scrubber efficiency decay over time and restores 100% via calibration duty', () => {
    const vessel = createInitialVesselState();
    // Simulate 180 seconds of life support wear
    const wornLs = tickLifeSupport(vessel.lifeSupport, 180);
    expect(wornLs.scrubberEfficiencyPercent).toBeLessThan(95);

    const stateWithWornLs = { ...vessel, lifeSupport: wornLs };
    const impact = applyDutySubsystemImpact(stateWithWornLs, 'calibrate_scrubbers');

    expect(impact.nextState.lifeSupport.scrubberEfficiencyPercent).toBe(100);
  });

  it('replenishes ship rations and water supplies when logistics duties are performed', () => {
    const vessel = createInitialVesselState();
    vessel.supplies.rations = 40;
    vessel.supplies.waterLitres = 80;

    const res1 = applyDutySubsystemImpact(vessel, 'mix_protein');
    expect(res1.nextState.supplies.rations).toBe(55);

    const res2 = applyDutySubsystemImpact(res1.nextState, 'restock_water');
    expect(res2.nextState.supplies.waterLitres).toBe(105);
  });
});
