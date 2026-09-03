import { describe, expect, it } from 'vitest';
import { createInitialPlayerVitals } from '../survival';
import {
  advanceShiftTask,
  calculateProjectedGrade,
  calculateVitalsAverage,
  evaluateShiftPerformance,
  generateShiftChecklist,
} from './shiftChecklist';

describe('Shift Checklist Quests', () => {
  it('generates 3 sequential tasks matching the role duties', () => {
    const shift = generateShiftChecklist('wiper', 1, 1000);
    expect(shift.shiftNumber).toBe(1);
    expect(shift.role).toBe('wiper');
    expect(shift.tasks).toHaveLength(3);
    expect(shift.currentTaskIndex).toBe(0);
    expect(shift.isCompleted).toBe(false);

    // wiper duties are scrub_plasma and purge_coolant
    expect(['scrub_plasma', 'purge_coolant']).toContain(shift.tasks[0].dutyId);
    expect(['scrub_plasma', 'purge_coolant']).toContain(shift.tasks[1].dutyId);
  });

  it('advances current task only when dutyId matches', () => {
    const shift = generateShiftChecklist('wiper', 1, 1000);
    const expectedFirstDutyId = shift.tasks[0].dutyId;

    // Wrong duty does not advance
    const wrongRes = advanceShiftTask(shift, 'unrelated_duty');
    expect(wrongRes.taskCompleted).toBe(false);
    expect(wrongRes.nextShift.currentTaskIndex).toBe(0);

    // Matching duty advances
    const step1 = advanceShiftTask(shift, expectedFirstDutyId);
    expect(step1.taskCompleted).toBe(true);
    expect(step1.shiftFinished).toBe(false);
    expect(step1.nextShift.currentTaskIndex).toBe(1);
    expect(step1.nextShift.tasks[0].completed).toBe(true);

    // Step 2
    const step2 = advanceShiftTask(step1.nextShift, step1.nextShift.tasks[1].dutyId);
    expect(step2.taskCompleted).toBe(true);
    expect(step2.shiftFinished).toBe(false);
    expect(step2.nextShift.currentTaskIndex).toBe(2);

    // Step 3
    const step3 = advanceShiftTask(step2.nextShift, step2.nextShift.tasks[2].dutyId);
    expect(step3.taskCompleted).toBe(true);
    expect(step3.shiftFinished).toBe(true);
    expect(step3.nextShift.isCompleted).toBe(true);
  });

  it('calculates vitals average and projected grades accurately', () => {
    const vitals = createInitialPlayerVitals();
    const vitalsAvg = calculateVitalsAverage(vitals);
    expect(vitalsAvg).toBeGreaterThan(60);

    // Fast with high vitals -> S
    const gradeS = calculateProjectedGrade(60, vitals);
    expect(gradeS).toBe('S');

    // Moderate duration -> A
    const gradeA = calculateProjectedGrade(110, vitals);
    expect(gradeA).toBe('A');

    // Slower duration -> B
    const gradeB = calculateProjectedGrade(180, vitals);
    expect(gradeB).toBe('B');

    // Very slow or exhausted -> C
    const exhaustedVitals = { ...vitals, hunger: 10, thirst: 10, fatigue: 95 };
    const gradeC = calculateProjectedGrade(300, exhaustedVitals);
    expect(gradeC).toBe('C');
  });

  it('evaluates shift performance with tiered rewards and remarks', () => {
    const startTime = 100000;
    const shift = generateShiftChecklist('security_private', 2, startTime);
    const vitals = createInitialPlayerVitals();

    // Finish 60 seconds later with nominal vitals -> Grade S
    const finishTime = startTime + 60 * 1000;
    const evalS = evaluateShiftPerformance(shift, vitals, finishTime);

    expect(evalS.grade).toBe('S');
    expect(evalS.elapsedSeconds).toBe(60);
    expect(evalS.bonusCredits).toBeGreaterThan(evalS.baseCredits * 0.5);
    expect(evalS.evaluationText).toContain('COMMENDABLE');
  });
});
