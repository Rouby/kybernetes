/** Top visor header: vessel card, nav buttons, economy chips, alert state. */

import { uiEllipsize } from '../../ui/UiToolkit.js';
import type { HudDrawState } from '../HudRenderer.js';
import type { WidgetHost } from '../WidgetHost.js';

export interface HeaderChip {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly label: string;
}

interface HeaderPanel {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * Pure top-visor chip layout: clearance and credit chips ride the header
 * button row right of DISEMBARK with a 5px rhythm and a 10px right margin.
 */
export function topVisorChips(state: HudDrawState): { clearance: HeaderChip; credits: HeaderChip } {
  return {
    clearance: {
      id: 'btn_clearance',
      x: 420,
      y: 21,
      w: 90,
      h: 27,
      label: uiEllipsize(`CLR: LVL ${state.clearanceLevel ?? 1}`, 12, 82),
    },
    credits: {
      id: 'btn_credits',
      x: 515,
      y: 21,
      w: 70,
      h: 27,
      label: uiEllipsize(`CR: ${state.credits ?? 0}`, 12, 62),
    },
  };
}

function headerPanel(width: number, height: number): HeaderPanel {
  const marginX = Math.max(72, Math.round(width * 0.055));
  const marginY = Math.max(38, Math.round(height * 0.055));
  return { x: width - 595 - marginX, y: marginY, w: 595, h: 54 };
}

export class HeaderWidget {
  render(host: WidgetHost, state: HudDrawState, width: number, height: number): void {
    const panel = headerPanel(width, height);
    host.addCurvedPanel(panel.x, panel.y, panel.w, panel.h, 6, 0.02, 0.05, 0.08, 0.75);
    this.renderTitle(host, state, panel);
    this.renderNavButtons(host, state, panel);
    this.renderShipButtons(host, state, panel);
    this.renderChips(host, state, panel);
    this.renderAlert(host, state, panel);
  }

  private renderTitle(host: WidgetHost, state: HudDrawState, panel: HeaderPanel): void {
    const shipName = state.telemetry?.shipName ?? 'CSS HESPERIA';
    host.addText(`VSSL: ${shipName}`, panel.x + 14, panel.y + 4, {
      fontSize: 14,
      fontWeight: 'bold',
      color: '#7090b0',
    });
  }

  private renderNavButtons(host: WidgetHost, state: HudDrawState, panel: HeaderPanel): void {
    host.addButton(
      'btn_beacon',
      panel.x + 10,
      panel.y + 21,
      75,
      27,
      `BCN: ${state.beaconCode ?? 'HESP01'}`,
      { fontSize: 13 },
      state.onBeaconClick
    );
    host.addButton(
      'btn_crew',
      panel.x + 90,
      panel.y + 21,
      70,
      27,
      `CREW: ${state.crewCount ?? 1}`,
      { fontSize: 13 },
      state.onManifestClick
    );
    host.addButton(
      'btn_role',
      panel.x + 165,
      panel.y + 21,
      55,
      27,
      'BILLET',
      { fontSize: 13 },
      state.onRoleClick
    );
  }

  private renderShipButtons(host: WidgetHost, state: HudDrawState, panel: HeaderPanel): void {
    host.addButton(
      'btn_audio',
      panel.x + 220,
      panel.y + 21,
      80,
      27,
      'AUDIO [O]',
      { fontSize: 12, color: '#00e5ff' },
      state.onAudioClick
    );
    host.addButton(
      'btn_leave',
      panel.x + 300,
      panel.y + 21,
      115,
      27,
      'DISEMBARK',
      { fontSize: 14, color: '#ff4466' },
      state.onDisembarkClick
    );
  }

  private renderChips(host: WidgetHost, state: HudDrawState, panel: HeaderPanel): void {
    const chips = topVisorChips(state);
    host.addButton(
      chips.clearance.id,
      panel.x + chips.clearance.x,
      panel.y + chips.clearance.y,
      chips.clearance.w,
      chips.clearance.h,
      chips.clearance.label,
      { fontSize: 12, color: '#00e5ff' },
      state.onRoleClick
    );
    host.addButton(
      chips.credits.id,
      panel.x + chips.credits.x,
      panel.y + chips.credits.y,
      chips.credits.w,
      chips.credits.h,
      chips.credits.label,
      { fontSize: 12, color: '#ffb000' },
      state.onManifestClick
    );
  }

  private renderAlert(host: WidgetHost, state: HudDrawState, panel: HeaderPanel): void {
    if (state.alertLevel === 'red') {
      host.addText('CONDITION: RED', panel.x - 170, panel.y + 16, {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#ff2244',
      });
    } else if (state.alertLevel === 'yellow') {
      host.addText('CONDITION: YELLOW', panel.x - 195, panel.y + 16, {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#ffaa00',
      });
    }
  }
}
