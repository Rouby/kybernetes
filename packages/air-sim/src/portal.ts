import type { Room } from "./room";

export enum PortalType {
    Door = 'door',
    Window = 'window',
    Puncture = 'puncture'
}

export interface PortalConfig {
    id: string;
    type: PortalType;
    roomA: Room;
    roomB: Room | null; // null = open space / vacuum
    maxArea: number;   // m^2
    openRatio?: number; // 0.0 (closed) to 1.0 (fully open)
    structuralIntegrity?: number; // 0.0 (destroyed) to 1.0 (intact)
    side: 'north' | 'south' | 'east' | 'west';
    position: number; // 0.0 (leftmost) to 1.0 (rightmost)
}

export class Portal {
    readonly id: string;
    readonly type: PortalType;
    readonly roomA: Room;
    readonly roomB: Room | null;
    readonly maxArea: number;
    openRatio: number;
    structuralIntegrity: number;
    side: 'north' | 'south' | 'east' | 'west';
    position: number; // 0.0 (leftmost) to 1.0 (rightmost)

    constructor(config: PortalConfig) {
        this.id = config.id;
        this.type = config.type;
        this.roomA = config.roomA;
        this.roomB = config.roomB;
        this.maxArea = config.maxArea;
        this.openRatio = config.openRatio ?? (config.type === PortalType.Door ? 0 : 1);
        this.structuralIntegrity = config.structuralIntegrity ?? 1.0;
        this.side = config.side;
        this.position = config.position;
    }

    get dischargeCoefficient(): number {
        switch (this.type) {
            case PortalType.Door: return 0.85;
            case PortalType.Window: return 0.65;
            case PortalType.Puncture: return 0.62;
        }
    }

    get effectiveArea(): number {
        if (this.structuralIntegrity <= 0) return this.maxArea;
        return this.maxArea * Math.max(0, Math.min(1, this.openRatio));
    }
}