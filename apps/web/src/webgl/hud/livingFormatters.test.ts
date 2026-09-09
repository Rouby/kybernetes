import { describe, expect, it } from 'vitest';
import { formatLivingStrip, LIVING_LINE_BUDGET, type LivingSummary } from './livingFormatters';

function summary(over: Partial<LivingSummary> = {}): LivingSummary {
  return {
    powerKw: 8.5,
    heatMaxC: 34,
    waterCleanL: 12.5,
    waterGreyL: 5.5,
    mealsReady: 2,
    growthMaxPct: 64,
    breakerTripped: false,
    ...over,
  };
}

describe('formatLivingStrip', () => {
  it('formats power heat water meals growth', () => {
    const formatted = formatLivingStrip(summary());
    expect(formatted.title).toContain('LIVING');
    expect(formatted.line1).toContain('PWR 8.5kW');
    expect(formatted.line1).toContain('H2O 12.5L');
    expect(formatted.line2).toContain('MEALS 2');
    expect(formatted.line2).toContain('GROW 64%');
    expect(formatted.alert).toBeNull();
  });

  it('stays inside the panel text budget', () => {
    const formatted = formatLivingStrip(
      summary({
        powerKw: 123.4,
        heatMaxC: 99,
        waterCleanL: 99.9,
        mealsReady: 9,
        growthMaxPct: 100,
      }),
      599
    );
    expect(formatted.line1.length).toBeLessThanOrEqual(LIVING_LINE_BUDGET);
    expect(formatted.line2.length).toBeLessThanOrEqual(LIVING_LINE_BUDGET);
  });

  it('appends the mess buff while fed', () => {
    expect(formatLivingStrip(summary(), 45).line2).toContain('FED 45s');
    expect(formatLivingStrip(summary(), 0).line2).not.toContain('FED');
  });

  it('raises breaker trips as critical', () => {
    const formatted = formatLivingStrip(summary({ breakerTripped: true }));
    expect(formatted.alert).toBe('BREAKER TRIPPED');
    expect(formatted.alertIsCritical).toBe(true);
  });

  it('warns on heat and low water', () => {
    expect(formatLivingStrip(summary({ heatMaxC: 70 })).alert).toBe('HEAT WARNING');
    expect(formatLivingStrip(summary({ waterCleanL: 1 })).alert).toBe('WATER LOW');
  });
});
