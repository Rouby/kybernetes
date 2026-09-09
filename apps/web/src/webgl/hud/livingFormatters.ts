/** Living strip view model and formatters: ship power/heat/water/food
 *  at a glance above the vitals panel. Pure and unit-tested; HudRenderer
 *  only draws what these helpers format (visor text-budget rules apply).
 */

export interface LivingSummary {
  readonly powerKw: number;
  readonly heatMaxC: number;
  readonly waterCleanL: number;
  readonly waterGreyL: number;
  readonly mealsReady: number;
  readonly growthMaxPct: number;
  readonly breakerTripped: boolean;
}

export interface FormattedLivingStrip {
  readonly title: string;
  readonly line1: string;
  readonly line2: string;
  readonly alert: string | null;
  readonly alertIsCritical: boolean;
}

/** Max line length so 14px text never breaches a 410px panel. */
export const LIVING_LINE_BUDGET = 44;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function formatLivingStrip(summary: LivingSummary, mealBuffS = 0): FormattedLivingStrip {
  const fed = mealBuffS > 0 ? ` \u2022 FED ${Math.ceil(mealBuffS)}s` : '';
  const line1 = `PWR ${round1(summary.powerKw)}kW \u2022 HEAT ${Math.round(summary.heatMaxC)}C \u2022 H2O ${round1(summary.waterCleanL)}L`;
  const line2 = `MEALS ${summary.mealsReady} \u2022 GROW ${Math.round(summary.growthMaxPct)}%${fed}`;
  return { title: 'SHIP LIVING // POWER WATER FOOD', line1, line2, ...livingAlert(summary) };
}

function livingAlert(
  summary: LivingSummary
): Pick<FormattedLivingStrip, 'alert' | 'alertIsCritical'> {
  if (summary.breakerTripped) return { alert: 'BREAKER TRIPPED', alertIsCritical: true };
  if (summary.heatMaxC > 55) return { alert: 'HEAT WARNING', alertIsCritical: false };
  if (summary.waterCleanL < 2) return { alert: 'WATER LOW', alertIsCritical: false };
  return { alert: null, alertIsCritical: false };
}
