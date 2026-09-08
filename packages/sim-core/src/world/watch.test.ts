import { describe, expect, it } from 'vitest';
import {
  finishWatch,
  GRADE_REWARDS,
  gradeForFraction,
  projectGrade,
  startWatch,
  TASK_CATALOG,
  tickWatch,
} from './watch.js';

describe('watch rotation', () => {
  it('catalogs two tasks for every role', () => {
    for (const role of ['engineer', 'deckhand', 'cook', 'security'] as const) {
      expect(TASK_CATALOG[role]).toHaveLength(2);
    }
  });

  it('alternates sections by watch number', () => {
    const odd = startWatch('ship', 1, 0, [], 20);
    const even = startWatch('ship', 2, 1, [], 20);
    expect(odd.section).toBe('alpha');
    expect(even.section).toBe('bravo');
  });

  it('advances progress only while assignees are aboard', () => {
    const watch = startWatch('ship', 1, 0, [{ pawnId: 'p1', role: 'engineer' }], 20);
    const idle = tickWatch(watch, 5, new Set());
    expect(idle.tasks[0]?.progress).toBe(0);
    expect(idle.remainingS).toBe(15);
    const working = tickWatch(watch, 5, new Set(['p1']));
    expect(working.tasks[0]?.progress ?? 0).toBeGreaterThan(0);
    expect(working.tasks[0]?.done).toBe(false);
    const done = tickWatch(watch, 20, new Set(['p1']));
    expect(done.tasks[0]?.done).toBe(true);
  });

  it('grades by completion fraction', () => {
    expect(gradeForFraction(1)).toBe('S');
    expect(gradeForFraction(0.75)).toBe('A');
    expect(gradeForFraction(0.5)).toBe('B');
    expect(gradeForFraction(0.49)).toBe('C');
    expect(projectGrade([])).toBe('C');
  });

  it('finishes once with S rewards for a full watch', () => {
    const watch = startWatch('ship', 1, 0, [{ pawnId: 'p1', role: 'cook' }], 10);
    const ticked = tickWatch(watch, 10, new Set(['p1']));
    expect(ticked.remainingS).toBe(0);
    const finished = finishWatch(ticked);
    expect(finished.grade).toBe('S');
    expect(finished.rewarded).toBe(true);
    expect(GRADE_REWARDS.S.credits).toBe(200);
    expect(finishWatch(finished)).toBe(finished);
  });

  it('ignores ticks after the timer ends', () => {
    const watch = startWatch('ship', 1, 0, [{ pawnId: 'p1', role: 'cook' }], 10);
    const ended = tickWatch(watch, 10, new Set());
    expect(tickWatch(ended, 5, new Set(['p1']))).toBe(ended);
  });
});
