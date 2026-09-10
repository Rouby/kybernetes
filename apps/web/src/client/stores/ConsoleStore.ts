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
}

type ConsoleListener = (snapshot: ConsoleSnapshot) => void;

export class ConsoleStore {
  private consoleOpen: ConsoleKind | null = null;
  private shipSystems: ShipSystemsBroadcast | null = null;
  private shipLost: ShipLostBroadcast | null = null;
  private readonly listeners = new Set<ConsoleListener>();
  private readonly onShipLost?: (shipId: string) => void;

  constructor(onShipLost?: (shipId: string) => void) {
    this.onShipLost = onShipLost;
  }

  public getSnapshot(): ConsoleSnapshot {
    return { consoleOpen: this.consoleOpen, shipSystems: this.shipSystems };
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
