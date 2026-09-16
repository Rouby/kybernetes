/** Lower-right combat card: weapon blocks, cartridge rack, shift footer. */
import type { WeaponType } from '@kybernetes/protocol';
import {
  cartridgeLoadedStates,
  cartridgeSlotCell,
  combatPanelGeometry,
  formatKineticAmmo,
  formatLaserCharge,
  formatWelderStatus,
  isKineticWeapon,
  type KineticAmmoState,
} from '../combatFormatters';
import type { HudDrawState } from '../HudRenderer.js';
import type { WidgetHost } from '../WidgetHost.js';

export class CombatWidget {
  render(host: WidgetHost, state: HudDrawState, width: number, height: number): void {
    const eq = state.equippedWeapon ?? 'kinetic_carbine';
    const isKinetic = isKineticWeapon(eq);
    const geo = combatPanelGeometry(width, height, isKinetic, Boolean(state.activeInteraction));
    host.addCurvedPanel(geo.x, geo.y, geo.panelW, geo.panelH, 9, 0.03, 0.06, 0.1, 0.82);
    host.addText('EQUIPPED TOOL // [1-4] SELECT', geo.x + 15, geo.y + 12, {
      fontSize: 18,
      fontWeight: 'bold',
      color: '#7088a0',
    });
    this.renderBlock(host, state, geo, eq, isKinetic);
    this.renderFooter(host, state, geo, isKinetic);
  }

  private renderBlock(
    host: WidgetHost,
    state: HudDrawState,
    geo: { x: number; y: number; panelW: number },
    eq: WeaponType,
    isKinetic: boolean
  ): void {
    if (isKinetic) this.renderKinetic(host, state, geo.x, geo.y, eq);
    else if (eq === 'pulse_laser') this.renderLaser(host, state, geo);
    else this.renderWelder(host, state, geo.x, geo.y);
  }

  private renderKinetic(
    host: WidgetHost,
    state: HudDrawState,
    x: number,
    y: number,
    eq: WeaponType
  ): void {
    const fmt = formatKineticAmmo(eq, state.kineticAmmo);
    host.addText(fmt.weaponTitle, x + 15, y + 36, {
      fontSize: 20,
      fontWeight: 'bold',
      color: fmt.ammoCol,
    });
    host.addText(fmt.magLine, x + 15, y + 58, { fontSize: 16, color: '#c8d6e5' });
    host.addText(fmt.statusLine, x + 15, y + 76, { fontSize: 14, color: fmt.ammoCol });
    this.renderRack(host, fmt.ammo, x, y);
  }

  private renderRack(host: WidgetHost, ammo: KineticAmmoState, x: number, y: number): void {
    const loaded = cartridgeLoadedStates(ammo);
    const isLow = ammo.current < 8 && !ammo.isReloading;
    loaded.forEach((isBulletLoaded, i) => {
      const { row, col } = cartridgeSlotCell(i);
      host.addCartridge(
        x + 18 + col * 11.25,
        y + 96 + row * 21,
        isBulletLoaded,
        ammo.isReloading,
        isLow
      );
    });
  }

  private renderLaser(
    host: WidgetHost,
    state: HudDrawState,
    geo: { x: number; y: number; panelW: number }
  ): void {
    const ratio = state.chargingState?.active ? state.chargingState.ratio || 0 : 0;
    const fmt = formatLaserCharge(ratio);
    const laserCol = fmt.isPrimed ? '#c084fc' : '#00e5ff';
    host.addText('PULSE LASER', geo.x + 15, geo.y + 36, {
      fontSize: 22,
      fontWeight: 'bold',
      color: laserCol,
    });
    host.addText(`CHARGE: ${fmt.pct}%  ${fmt.statusText}`, geo.x + 15, geo.y + 60, {
      fontSize: 17,
      color: '#e0e6ed',
    });
    host.addProgressBar(
      geo.x + 15,
      geo.y + 80,
      geo.panelW - 30,
      8,
      fmt.barValue,
      fmt.isPrimed ? [0.75, 0.3, 1.0] : [0.0, 0.9, 1.0]
    );
  }

  private renderWelder(host: WidgetHost, state: HudDrawState, x: number, y: number): void {
    const isWelding = Boolean(state.welderState?.active);
    host.addText('ARC WELDER', x + 15, y + 36, {
      fontSize: 22,
      fontWeight: 'bold',
      color: isWelding ? '#ffb000' : '#7090b0',
    });
    host.addText(formatWelderStatus(isWelding), x + 15, y + 60, { fontSize: 18, color: '#e0e6ed' });
  }

  private renderFooter(
    host: WidgetHost,
    state: HudDrawState,
    geo: { x: number; y: number; panelW: number },
    isKinetic: boolean
  ): void {
    if (state.activeInteraction) {
      this.renderShift(host, state, geo, isKinetic);
      return;
    }
    if (state.promptActionName) {
      host.addText(
        `[E] ${state.promptActionName.toUpperCase()}`,
        geo.x + 15,
        this.hintY(geo.y, isKinetic),
        { fontSize: 16, fontWeight: 'bold', color: '#00e5ff' }
      );
      return;
    }
    host.addText(
      isKinetic ? '[L-CLICK / SPACE] Fire  \u2022  [R] Reload' : '[L-CLICK / SPACE] Discharge Tool',
      geo.x + 15,
      this.hintY(geo.y, isKinetic),
      { fontSize: 16, color: '#506680' }
    );
  }

  private hintY(y: number, isKinetic: boolean): number {
    return isKinetic ? y + 150 : y + 98;
  }

  private renderShift(
    host: WidgetHost,
    state: HudDrawState,
    geo: { x: number; y: number; panelW: number },
    isKinetic: boolean
  ): void {
    const inter = state.activeInteraction;
    if (!inter) return;
    const shiftY = isKinetic ? geo.y + 146 : geo.y + 96;
    const shiftPct = Math.round(inter.progress * 100);
    host.addText(`SHIFT: ${inter.actionName.toUpperCase()} (${shiftPct}%)`, geo.x + 15, shiftY, {
      fontSize: 16,
      fontWeight: 'bold',
      color: '#00e5ff',
    });
    host.addProgressBar(geo.x + 15, shiftY + 18, geo.panelW - 30, 6, shiftPct, [0.0, 0.9, 1.0]);
    host.addButton(
      'abort_shift',
      geo.x + 15,
      shiftY + 30,
      geo.panelW - 30,
      24,
      'ABORT SHIFT [ESC]',
      { fontSize: 16, color: '#ff2244' },
      state.onAbortInteraction
    );
    host.addText('[L-CLICK / SPACE] Discharge Weapon', geo.x + 15, shiftY + 62, {
      fontSize: 16,
      color: '#506680',
    });
  }
}
