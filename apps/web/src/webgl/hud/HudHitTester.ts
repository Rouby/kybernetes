export interface HudHitZone {
  id: string;
  type: 'rect' | 'circle';
  x: number;
  y: number;
  width?: number;
  height?: number;
  radius?: number;
  tooltip?: string;
  cursor?: 'pointer' | 'default';
  onClick: () => void;
}

export class HudHitTester {
  private zones: HudHitZone[] = [];
  private hoveredZoneId: string | null = null;

  public clear(): void {
    this.zones = [];
  }

  public register(zone: HudHitZone): void {
    this.zones.push(zone);
  }

  // fallow-ignore-next-line complexity
  public hitTest(
    screenX: number,
    screenY: number,
    screenWidth?: number,
    screenHeight?: number,
    curvature = 0.055
  ): HudHitZone | null {
    let sx = screenX;
    let sy = screenY;

    if (screenWidth && screenHeight && curvature > 0) {
      const cx = (screenX / screenWidth) * 2 - 1;
      const cy = 1 - (screenY / screenHeight) * 2;
      const r2 = cx * cx + cy * cy;
      const factor = 1 / (1 + curvature * r2);
      const uncurvedCx = cx * factor;
      const uncurvedCy = cy * factor;
      sx = (uncurvedCx + 1) * 0.5 * screenWidth;
      sy = (1 - uncurvedCy) * 0.5 * screenHeight;
    }

    // Reverse order so top-most registered zones are checked first
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      if (z.type === 'circle' && z.radius) {
        const d = Math.hypot(sx - z.x, sy - z.y);
        if (d <= z.radius) {
          return z;
        }
      } else if (z.type === 'rect' && z.width && z.height) {
        if (sx >= z.x && sx <= z.x + z.width && sy >= z.y && sy <= z.y + z.height) {
          return z;
        }
      }
    }
    return null;
  }

  public updateHover(
    screenX: number,
    screenY: number,
    screenWidth?: number,
    screenHeight?: number,
    curvature = 0.055
  ): string | null {
    const hit = this.hitTest(screenX, screenY, screenWidth, screenHeight, curvature);
    this.hoveredZoneId = hit ? hit.id : null;
    return this.hoveredZoneId;
  }

  public isHovered(zoneId: string): boolean {
    return this.hoveredZoneId === zoneId;
  }

  // fallow-ignore-next-line unused-class-member
  public handleClick(
    screenX: number,
    screenY: number,
    screenWidth?: number,
    screenHeight?: number,
    curvature = 0.055
  ): boolean {
    const hit = this.hitTest(screenX, screenY, screenWidth, screenHeight, curvature);
    if (hit) {
      hit.onClick();
      return true;
    }
    return false;
  }
}
