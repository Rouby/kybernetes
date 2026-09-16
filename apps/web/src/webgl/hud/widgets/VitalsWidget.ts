/** Lower-left vitals card plus the living-strip readout above it. */
import type { PlayerVitals } from '@kybernetes/protocol';
import type { HudDrawState } from '../HudRenderer.js';
import { formatLivingStrip } from '../livingFormatters';
import { subsystemGauges } from '../telemetryGauges';
import {
  formatAtmosphereStatus,
  formatIncapacitatedNotice,
  formatSuitStatus,
  resolveRoomAtmosSummary,
} from '../vitalsFormatters';
import type { WidgetHost } from '../WidgetHost.js';

interface VitalsPanel {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

function vitalsPanel(width: number, height: number): VitalsPanel {
  const marginX = Math.max(72, Math.round(width * 0.055));
  const marginY = Math.max(52, Math.round(height * 0.065));
  return { x: marginX, y: height - 228 - marginY, w: 410, h: 228 };
}

export class VitalsWidget {
  render(host: WidgetHost, state: HudDrawState, width: number, height: number): void {
    if (!state.vitals) return;
    const panel = vitalsPanel(width, height);
    host.addCurvedPanel(panel.x, panel.y, panel.w, panel.h, 9, 0.03, 0.06, 0.1, 0.82);
    this.renderHeader(host, state, panel);
    this.renderAmbient(host, state, panel);
    this.renderHealth(host, state.vitals, panel);
    this.renderOxygen(host, state.vitals, panel);
    this.renderStamina(host, state.vitals, panel);
    this.renderNutrition(host, state.vitals, panel);
    this.renderNotice(host, state, panel);
    this.renderSubsystems(host, state, panel);
  }

  private renderSubsystems(host: WidgetHost, state: HudDrawState, panel: VitalsPanel): void {
    const rooms = state.telemetry?.roomAtmospheres;
    if (rooms === undefined) return;
    const gauges = subsystemGauges(rooms);
    const w = 190;
    const h = 110;
    const x = panel.x + panel.w + 12;
    const y = panel.y + panel.h - h;
    host.addCurvedPanel(x, y, w, h, 9, 0.03, 0.06, 0.1, 0.82);
    host.addText('SUBSYSTEMS', x + 15, y + 10, {
      fontSize: 16,
      fontWeight: 'bold',
      color: '#00e5ff',
    });
    host.addText(`HULL: ${gauges.breachCount}/${gauges.roomCount} BRCH`, x + 15, y + 32, {
      fontSize: 14,
      color: gauges.breachCount > 0 ? '#ff3344' : '#c0d0e0',
    });
    host.addProgressBar(x + 15, y + 48, w - 30, 6, 100 - gauges.breachPct, [0.0, 0.9, 1.0]);
    host.addText(`ATMOS: ${Math.round(gauges.atmosPct)}%`, x + 15, y + 60, {
      fontSize: 14,
      color: gauges.atmosPct < 50 ? '#ff3344' : '#c0d0e0',
    });
    host.addProgressBar(x + 15, y + 76, w - 30, 6, gauges.atmosPct, [0.0, 1.0, 0.4]);
  }

  private renderHeader(host: WidgetHost, state: HudDrawState, panel: VitalsPanel): void {
    const suit = formatSuitStatus(state.vitals as PlayerVitals);
    host.addText('SUIT TELEMETRY // CREW VITALS', panel.x + 15, panel.y + 12, {
      fontSize: 20,
      fontWeight: 'bold',
      color: '#00e5ff',
    });
    host.addButton(
      'btn_visor_toggle',
      panel.x + panel.w - 165,
      panel.y + 8,
      150,
      24,
      suit.visorLabel,
      { fontSize: 13, color: suit.visorColor },
      state.onToggleHelmet
    );
    host.addText(
      `${state.pawn.callsign} [${state.pawn.role.toUpperCase()}]`,
      panel.x + 15,
      panel.y + 36,
      { fontSize: 18, color: state.pawn.color || '#ffb000' }
    );
  }

  private renderAmbient(host: WidgetHost, state: HudDrawState, panel: VitalsPanel): void {
    const atmos = formatAtmosphereStatus(
      resolveRoomAtmosSummary(state.telemetry?.roomAtmospheres, state.currentRoomId)
    );
    host.addText(atmos.ambientText, panel.x + 15, panel.y + 56, {
      fontSize: 14,
      color: atmos.isHazard ? '#ff3344' : '#8098b0',
    });
  }

  private renderHealth(host: WidgetHost, vitals: PlayerVitals, panel: VitalsPanel): void {
    const col: [number, number, number] = vitals.health < 25 ? [1.0, 0.13, 0.27] : [0.0, 0.9, 1.0];
    host.addText(`HEALTH: ${Math.round(vitals.health)}%`, panel.x + 15, panel.y + 74, {
      fontSize: 16,
      color: '#e0e6ed',
    });
    host.addProgressBar(panel.x + 15, panel.y + 90, panel.w - 30, 6, vitals.health, col);
  }

  private renderOxygen(host: WidgetHost, vitals: PlayerVitals, panel: VitalsPanel): void {
    const suit = formatSuitStatus(vitals);
    host.addText(suit.o2Text, panel.x + 15, panel.y + 100, { fontSize: 14, color: '#c0d0e0' });
    host.addText(suit.integrityText, panel.x + panel.w - 145, panel.y + 100, {
      fontSize: 13,
      color: suit.isLeaking ? '#ff3344' : '#608098',
    });
    host.addProgressBar(
      panel.x + 15,
      panel.y + 116,
      panel.w - 30,
      6,
      suit.o2Percent,
      suit.o2BarColor
    );
  }

  private renderStamina(host: WidgetHost, vitals: PlayerVitals, panel: VitalsPanel): void {
    host.addText(
      `STAMINA: ${Math.round(vitals.stamina)} / ${Math.round(vitals.maxStamina)}`,
      panel.x + 15,
      panel.y + 126,
      { fontSize: 14, color: '#c0d0e0' }
    );
    host.addProgressBar(
      panel.x + 15,
      panel.y + 142,
      panel.w - 30,
      6,
      (vitals.stamina / vitals.maxStamina) * 100,
      [0.0, 1.0, 0.4]
    );
  }

  private renderNutrition(host: WidgetHost, vitals: PlayerVitals, panel: VitalsPanel): void {
    this.renderNutrient(
      host,
      `NUT: ${Math.round(vitals.hunger)}%`,
      vitals.hunger,
      vitals.hunger < 20,
      panel.x + 15,
      panel
    );
    this.renderNutrient(
      host,
      `HYD: ${Math.round(vitals.thirst)}%`,
      vitals.thirst,
      vitals.thirst < 20,
      panel.x + 140,
      panel
    );
    this.renderNutrient(
      host,
      `FTG: ${Math.round(vitals.fatigue)}%`,
      vitals.fatigue,
      vitals.fatigue > 80,
      panel.x + 265,
      panel
    );
  }

  private renderNutrient(
    host: WidgetHost,
    label: string,
    value: number,
    critical: boolean,
    x: number,
    panel: VitalsPanel
  ): void {
    const col: [number, number, number] = critical
      ? [1.0, 0.13, 0.27]
      : label.startsWith('HYD')
        ? [0.0, 0.9, 1.0]
        : [1.0, 0.69, 0.0];
    host.addText(label, x, panel.y + 154, { fontSize: 14, color: '#c0d0e0' });
    host.addProgressBar(x, panel.y + 170, 110, 5, value, col);
  }

  private renderNotice(host: WidgetHost, state: HudDrawState, panel: VitalsPanel): void {
    const notice = formatIncapacitatedNotice(state.vitals as PlayerVitals);
    if (notice) {
      host.addText(notice, panel.x + 15, panel.y + 195, {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#ff2244',
      });
    } else {
      host.addText(
        '[W][A][S][D] Move \u2022 [H] Visor \u2022 [E] Action \u2022 [V] Sensor',
        panel.x + 15,
        panel.y + 198,
        { fontSize: 14, color: '#55708a' }
      );
    }
  }

  renderLivingStrip(host: WidgetHost, state: HudDrawState, width: number, height: number): void {
    if (state.livingSummary === undefined) return;
    const formatted = formatLivingStrip(state.livingSummary, state.mealBuffS ?? 0);
    const marginX = Math.max(72, Math.round(width * 0.055));
    const marginY = Math.max(52, Math.round(height * 0.065));
    const panelW = 410;
    const panelH = formatted.alert === null ? 86 : 106;
    const x = marginX;
    const y = height - 228 - marginY - 12 - panelH;
    host.addCurvedPanel(x, y, panelW, panelH, 9, 0.03, 0.06, 0.1, 0.82);
    host.addText(formatted.title, x + 15, y + 10, {
      fontSize: 16,
      fontWeight: 'bold',
      color: '#00e5ff',
    });
    host.addText(formatted.line1, x + 15, y + 30, { fontSize: 14, color: '#c0d0e0' });
    host.addText(formatted.line2, x + 15, y + 48, { fontSize: 14, color: '#c0d0e0' });
    if (formatted.alert !== null) {
      host.addText(formatted.alert, x + 15, y + 68, {
        fontSize: 14,
        fontWeight: 'bold',
        color: formatted.alertIsCritical ? '#ff2244' : '#ffb000',
      });
    }
  }
}
