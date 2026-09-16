/** Top-left watch checklist: rating, timer, tasks, off-duty handover. */
import type { ShiftChecklistState } from '@kybernetes/protocol';
import { hexToRgb } from '../../ui/UiPass.js';
import type { HudDrawState } from '../HudRenderer.js';
import { watchProgress, watchRingSegments } from '../telemetryGauges';
import type { WidgetHost } from '../WidgetHost.js';

interface ChecklistPanel {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly offDuty: boolean;
}

function checklistPanel(shift: ShiftChecklistState, width: number, height: number): ChecklistPanel {
  const marginX = Math.max(72, Math.round(width * 0.055));
  const marginY = Math.max(38, Math.round(height * 0.055));
  const offDuty = shift.phase === 'off_duty';
  return { x: marginX, y: marginY, w: 425, h: offDuty ? 165 : 140, offDuty };
}

export class ChecklistWidget {
  render(host: WidgetHost, state: HudDrawState, width: number, height: number): void {
    const shift = state.shiftChecklist;
    if (!shift) return;
    const panel = checklistPanel(shift, width, height);
    host.addCurvedPanel(panel.x, panel.y, panel.w, panel.h, 6, 0.02, 0.05, 0.08, 0.82);
    this.renderHeader(host, state, shift, panel);
    this.renderRating(host, state, shift, panel);
    this.renderTasks(host, shift, panel);
    if (panel.offDuty) this.renderHandover(host, shift, panel);
  }

  private checklistTitle(shift: ShiftChecklistState): { title: string; color: string } {
    const secTag = (shift.watchSection || 'alpha').toUpperCase();
    return shift.phase === 'off_duty'
      ? { title: `WATCH #${shift.shiftNumber} - SEC ${secTag} [OFF-DUTY]`, color: '#ffb000' }
      : { title: `WATCH #${shift.shiftNumber} - SEC ${secTag} [ACTIVE]`, color: '#00e5ff' };
  }

  private renderHeader(
    host: WidgetHost,
    _state: HudDrawState,
    shift: ShiftChecklistState,
    panel: ChecklistPanel
  ): void {
    const { title, color } = this.checklistTitle(shift);
    host.addText(title, panel.x + 15, panel.y + 10, { fontSize: 18, fontWeight: 'bold', color });
  }

  private renderRating(
    host: WidgetHost,
    state: HudDrawState,
    shift: ShiftChecklistState,
    panel: ChecklistPanel
  ): void {
    const grade = state.projectedGrade || 'A';
    const timer = state.shiftTimerFormatted || '00:00';
    const rankBadge = shift.rankBadge ? ` [${shift.rankBadge}]` : '';
    host.addText(`RATING: [${grade}]  TIME: ${timer}${rankBadge}`, panel.x + 15, panel.y + 36, {
      fontSize: 16,
      color: this.gradeColor(grade),
    });
    this.renderWatchRing(host, shift, panel, grade);
  }

  private renderWatchRing(
    host: WidgetHost,
    shift: ShiftChecklistState,
    panel: ChecklistPanel,
    grade: string
  ): void {
    const progress = watchProgress(shift.tasks);
    const cx = panel.x + panel.w - 44;
    const cy = panel.y + 34;
    const ring = watchRingSegments(cx, cy, 20, progress.frac);
    for (const segment of ring.empty) {
      host.addTriangle(
        segment.x1,
        segment.y1,
        segment.x2,
        segment.y2,
        segment.x3,
        segment.y3,
        0.15,
        0.22,
        0.3,
        0.8
      );
    }
    const col = hexToRgb(this.gradeColor(grade));
    for (const segment of ring.filled) {
      host.addTriangle(
        segment.x1,
        segment.y1,
        segment.x2,
        segment.y2,
        segment.x3,
        segment.y3,
        col[0],
        col[1],
        col[2],
        0.95
      );
    }
    host.addText(`${progress.done}/${progress.total}`, cx - 12, cy - 6, {
      fontSize: 12,
      color: '#e0e6ed',
    });
  }

  private gradeColor(grade: string): string {
    if (grade === 'S') return '#00ff88';
    if (grade === 'B') return '#ffb000';
    if (grade === 'C') return '#ff3344';
    return '#00e5ff';
  }

  private renderTasks(host: WidgetHost, shift: ShiftChecklistState, panel: ChecklistPanel): void {
    for (let i = 0; i < shift.tasks.length; i += 1) {
      const task = shift.tasks[i];
      if (task !== undefined) this.renderTask(host, shift, task, i, panel);
    }
  }

  private renderTask(
    host: WidgetHost,
    shift: ShiftChecklistState,
    task: ShiftChecklistState['tasks'][number],
    i: number,
    panel: ChecklistPanel
  ): void {
    const ty = panel.y + 60 + i * 26;
    const active = i === shift.currentTaskIndex && !shift.isCompleted && !panel.offDuty;
    const prefix = task.completed ? '[X] ' : active ? '[>] ' : '[ ] ';
    const col = task.completed ? '#00ff88' : active ? '#00e5ff' : '#55708a';
    host.addText(`${prefix}${task.name}`, panel.x + 15, ty, {
      fontSize: 16,
      fontWeight: active ? 'bold' : 'normal',
      color: col,
    });
  }

  private renderHandover(
    host: WidgetHost,
    shift: ShiftChecklistState,
    panel: ChecklistPanel
  ): void {
    host.addText(
      '[>] Rest in Crew Bunk (Hand Over Watch)',
      panel.x + 15,
      panel.y + 60 + shift.tasks.length * 26,
      { fontSize: 15, fontWeight: 'bold', color: '#ffb000' }
    );
  }
}
