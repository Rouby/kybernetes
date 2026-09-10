/**
 * Ship console panel state: [E] toggles reactor/engine consoles, SHIP_LOST
 * fires onShipLost. Extracted from HarborSession so the session component
 * stays under the complexity gate. Pure hook wiring; rendering stays with
 * the session and ShipConsolePanel.
 */

import { useCallback, useEffect, useState } from 'react';
import type { ConsoleKind } from './sessionActions';
import type { HarborSocket } from './sessionHud';

export interface ShipConsoleState {
  readonly consoleOpen: ConsoleKind | null;
  readonly toggleConsole: (kind: ConsoleKind) => void;
  readonly closeConsole: () => void;
  readonly shipSystems: HarborSocket['shipSystems'];
}

export function useShipConsole(
  socket: HarborSocket,
  onShipLost?: (shipId: string) => void
): ShipConsoleState {
  const [consoleOpen, setConsoleOpen] = useState<ConsoleKind | null>(null);
  const toggleConsole = useCallback((kind: ConsoleKind): void => {
    setConsoleOpen((prev) => (prev === kind ? null : kind));
  }, []);
  const closeConsole = useCallback((): void => {
    setConsoleOpen(null);
  }, []);
  useEffect(() => {
    if (socket.shipLost !== null) onShipLost?.(socket.shipLost.shipId);
  }, [socket.shipLost, onShipLost]);
  return { consoleOpen, toggleConsole, closeConsole, shipSystems: socket.shipSystems };
}
