/** Center alert banners stacked below the visor header. */

import { uiVisorMargins } from '../../ui/UiToolkit.js';
import type { HudDrawState } from '../HudRenderer.js';
import type { WidgetHost } from '../WidgetHost.js';

export interface AlertRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface CenterAlertLayout {
  readonly notice?: AlertRect;
  readonly dual?: AlertRect;
  readonly collab?: AlertRect;
}

/**
 * Pure center-alert stacking: the first banner clears the 54px visor header
 * with a 14px gap (topClearance), later banners stack below on a 12px rhythm.
 */
export function layoutCenterAlerts(
  width: number,
  height: number,
  visible: { notice: boolean; dual: boolean; collab: boolean }
): CenterAlertLayout {
  const { topClearance } = uiVisorMargins(width, height);
  const layout: { notice?: AlertRect; dual?: AlertRect; collab?: AlertRect } = {};
  let y = topClearance;
  if (visible.notice) {
    layout.notice = { x: Math.floor((width - 570) / 2), y, w: 570, h: 40 };
    y += 40 + 12;
  }
  if (visible.dual) {
    layout.dual = { x: Math.floor((width - 600) / 2), y, w: 600, h: 45 };
    y += 45 + 12;
  }
  if (visible.collab) {
    layout.collab = { x: Math.floor((width - 630) / 2), y, w: 630, h: 42 };
  }
  return layout;
}

interface AlertVisibility {
  readonly notice: string | null;
  readonly dual: boolean;
  readonly collab: boolean;
}

function alertVisibility(state: HudDrawState): AlertVisibility {
  const shift = state.collabShift;
  return {
    notice: state.inGameNotice || state.triageNotice || null,
    dual: (state.dualProtocol?.stage ?? '') === 'primed',
    collab:
      shift !== undefined && shift !== null && !shift.isCompleted && shift.participants.length > 0,
  };
}

export class AlertsWidget {
  render(host: WidgetHost, state: HudDrawState, width: number, height: number): void {
    const visible = alertVisibility(state);
    const layout = layoutCenterAlerts(width, height, {
      notice: visible.notice !== null,
      dual: visible.dual,
      collab: visible.collab,
    });
    this.renderNoticeIfAny(host, visible, layout);
    this.renderDualIfAny(host, state, visible, layout);
    this.renderCollabIfAny(host, state, visible, layout);
  }

  private renderNoticeIfAny(
    host: WidgetHost,
    visible: AlertVisibility,
    layout: CenterAlertLayout
  ): void {
    if (visible.notice !== null && layout.notice)
      this.renderNotice(host, visible.notice, layout.notice);
  }

  private renderDualIfAny(
    host: WidgetHost,
    state: HudDrawState,
    visible: AlertVisibility,
    layout: CenterAlertLayout
  ): void {
    if (!visible.dual || state.dualProtocol?.stage !== 'primed' || !layout.dual) return;
    this.renderDual(host, state.dualProtocol, layout.dual, state.onExecuteDualProtocol);
  }

  private renderCollabIfAny(
    host: WidgetHost,
    state: HudDrawState,
    visible: AlertVisibility,
    layout: CenterAlertLayout
  ): void {
    if (!visible.collab || !state.collabShift || !layout.collab) return;
    this.renderCollab(host, state.collabShift, layout.collab);
  }

  private renderNotice(host: WidgetHost, notice: string, rect: AlertRect): void {
    host.addCurvedPanel(rect.x, rect.y, rect.w, rect.h, 6, 0.05, 0.08, 0.12, 0.94);
    host.addText(notice, rect.x + 16, rect.y + 8, {
      fontSize: 20,
      fontWeight: 'bold',
      color: '#00e5ff',
    });
  }

  private renderDual(
    host: WidgetHost,
    p: NonNullable<HudDrawState['dualProtocol']>,
    rect: AlertRect,
    onExecute: HudDrawState['onExecuteDualProtocol']
  ): void {
    host.addCurvedPanel(rect.x, rect.y, rect.w, rect.h, 6, 0.15, 0.02, 0.04, 0.95);
    host.addText(
      `DUAL PROTOCOL: ${p.title} (${p.remainingSeconds.toFixed(1)}s)`,
      rect.x + 16,
      rect.y + 10,
      {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#ff2244',
      }
    );
    host.addButton(
      'btn_exec_dual',
      rect.x + rect.w - 195,
      rect.y + 6,
      180,
      33,
      'EXECUTE [E]',
      { fontSize: 18, color: '#00ff66' },
      onExecute
    );
  }

  private renderCollab(
    host: WidgetHost,
    cs: NonNullable<HudDrawState['collabShift']>,
    rect: AlertRect
  ): void {
    host.addCurvedPanel(rect.x, rect.y, rect.w, rect.h, 6, 0.04, 0.08, 0.12, 0.92);
    host.addText(
      `CO-OP SHIFT: ${cs.title} (${Math.round(cs.progressPercent)}%) [${cs.participants.length} OPS]`,
      rect.x + 16,
      rect.y + 9,
      { fontSize: 20, color: '#00e5ff' }
    );
  }
}
