import type { Room } from './room';

export enum PortalType {
  Door = 'door',
  Window = 'window',
  Puncture = 'puncture',
}

export interface PortalConfig {
  id: string;
  type: PortalType;
  roomA: Room;
  roomB: Room | null; // null = open space / vacuum
  width: number;
  height: number;
  openRatio?: number; // 0.0 (closed) to 1.0 (fully open)
  side: 'north' | 'south' | 'east' | 'west';
  position: number; // 0.0 (leftmost) to 1.0 (rightmost)
}

export class Portal {
  readonly id: string;
  readonly type: PortalType;
  readonly roomA: Room;
  readonly roomB: Room | null;
  readonly width: number;
  readonly height: number;
  readonly maxArea: number;
  readonly distance: number;
  openRatio: number;
  side: 'north' | 'south' | 'east' | 'west';
  position: number; // 0.0 (leftmost) to 1.0 (rightmost)
  velocity = 0;

  constructor(config: PortalConfig) {
    this.id = config.id;
    this.type = config.type;
    this.roomA = config.roomA;
    this.roomB = config.roomB;
    this.width = config.width;
    this.height = config.height;
    this.maxArea = config.width * config.height;
    this.openRatio = config.openRatio ?? (config.type === PortalType.Door ? 0 : 1);
    this.side = config.side;
    this.position = config.position;
    this.distance = config.roomB
      ? Math.sqrt(
          (config.roomA.config.x - config.roomB?.config.x) ** 2 +
            (config.roomA.config.y - config.roomB?.config.y) ** 2
        )
      : 10;
  }

  get dischargeCoefficient(): number {
    switch (this.type) {
      case PortalType.Door:
        return 0.85;
      case PortalType.Window:
        return 0.65;
      case PortalType.Puncture:
        return 0.62;
    }
    return 0;
  }

  get effectiveArea(): number {
    return this.maxArea * Math.max(0, Math.min(1, this.openRatio));
  }

  /**
   * Resize the throat while preserving the configured height (combat
   * breaches widen after linking). Readonly fields mutate only here so
   * the solver-facing shape stays immutable everywhere else.
   */
  resizeThroat(widthM2: number): void {
    const width = Math.max(0, widthM2);
    (this as { width: number }).width = width;
    (this as { maxArea: number }).maxArea = width * this.height;
  }
}
