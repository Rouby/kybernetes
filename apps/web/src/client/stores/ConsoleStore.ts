/**
 * ConsoleStore: framework-free ship console panel state (Phase 1).
 * Mirrors useShipConsole ([E] toggles reactor/engine/nav consoles, SHIP_LOST
 * fires onShipLost) without React.
 */

import type { ShipLostBroadcast, ShipSystemsBroadcast } from '@kybernetes/protocol';
import type { ConsoleKind } from '../../harbor/sessionActions';

export interface ConsoleSnapshot {
  readonly consoleOpen: ConsoleKind | null;
  readonly shipSystems: ShipSystemsBroadcast | null;
  /** Drafted course stops (last = destination); null when nothing previewed. */
  readonly coursePreview: readonly string[] | null;
  /** Draft throttle 10-100% of the 1g band; resets with the draft. */
  readonly thrustPct: number;
}

type ConsoleListener = (snapshot: ConsoleSnapshot) => void;

export class ConsoleStore {
  private consoleOpen: ConsoleKind | null = null;
  private shipSystems: ShipSystemsBroadcast | null = null;
  private coursePreview: readonly string[] | null = null;
  private thrustPct = 100;
  private shipLost: ShipLostBroadcast | null = null;
  private readonly listeners = new Set<ConsoleListener>();
  private readonly onShipLost?: (shipId: string) => void;

  constructor(onShipLost?: (shipId: string) => void) {
    this.onShipLost = onShipLost;
  }

  public getSnapshot(): ConsoleSnapshot {
    return {
      consoleOpen: this.consoleOpen,
      shipSystems: this.shipSystems,
      coursePreview: this.coursePreview,
      thrustPct: this.thrustPct,
    };
  }

  public subscribe(listener: ConsoleListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public toggleConsole(kind: ConsoleKind): void {
    this.consoleOpen = this.consoleOpen === kind ? null : kind;
    this.emit();
  }

  public openConsole(kind: ConsoleKind): void {
    if (this.consoleOpen === kind) return;
    this.consoleOpen = kind;
    this.emit();
  }

  public closeConsole(): void {
    this.consoleOpen = null;
    this.coursePreview = null;
    this.thrustPct = 100;
    this.emit();
  }

  public setThrustPct(pct: number): void {
    const stepped = Math.min(100, Math.max(10, Math.round(pct / 10) * 10));
    if (stepped === this.thrustPct) return;
    this.thrustPct = stepped;
    this.emit();
  }

  public previewCourse(stops: readonly string[]): void {
    this.coursePreview = [...stops];
    this.emit();
  }

  public clearPreview(): void {
    if (this.coursePreview === null) return;
    this.coursePreview = null;
    this.emit();
  }

  public setShipSystems(systems: ShipSystemsBroadcast | null): void {
    this.shipSystems = systems;
    this.emit();
  }

  public setShipLost(lost: ShipLostBroadcast | null): void {
    const wasLost = this.shipLost;
    this.shipLost = lost;
    if (lost !== null && wasLost?.shipId !== lost.shipId) {
      this.onShipLost?.(lost.shipId);
    }
  }

  private emit(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}
