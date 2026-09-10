/** @vitest-environment node */
import { describe, expect, it, vi } from 'vitest';
import { selectSessionOverlayId } from '../webgl/ui/UiPass';
import { GameSession } from './GameSession';

function session(): GameSession {
  return new GameSession({
    identity: { callsign: 'Rook', color: '#ffd166', beacon: 'HESP01', userId: 'u1' },
    debug: false,
    onQuit: () => undefined,
  });
}

function systems(): import('@kybernetes/protocol').ShipSystemsBroadcast {
  return {
    tempK: 660,
    bandLo: 620,
    bandHi: 700,
    outputMW: 31,
    demandMW: 28,
    rods: 0.3,
    coolant: 0.5,
    scrammed: false,
    spool: 1,
    tune: 0.8,
    wear: 0,
    brownout: false,
  } as unknown as import('@kybernetes/protocol').ShipSystemsBroadcast;
}

interface FakeSocket {
  sent: string[];
  readyState: number;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onclose: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  send(data: string): void;
  close(): void;
}

function makeFake(): FakeSocket {
  const fake: FakeSocket = {
    sent: [],
    readyState: 1,
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
    send: (data: string): void => {
      fake.sent.push(data);
    },
    close: (): void => {},
  };
  return fake;
}

function liveSession(fake: FakeSocket): GameSession {
  const s = new GameSession({
    identity: { callsign: 'Rook', color: '#ffd166', beacon: 'HESP01', userId: 'u1' },
    debug: false,
    onQuit: () => undefined,
    factory: () => fake as unknown as WebSocket,
  });
  s.socket.connect();
  fake.onopen?.({});
  return s;
}

function selected(session: GameSession): string | null {
  const wiring = session.getProps()?.glOverlay;
  if (wiring === undefined || wiring === null) return null;
  return selectSessionOverlayId({
    paused: wiring.paused,
    dead: wiring.dead,
    settingsOpen: wiring.settingsOpen,
    console: wiring.console?.kind ?? null,
  });
}

describe('GameSession sync', () => {
  it('builds empty props with no overlay', () => {
    const s = session();
    expect(s.getProps()).toBeNull();
    s.sync();
    expect(s.getProps()?.snapshot).toBeNull();
    expect(selected(s)).toBeNull();
    s.dispose();
  });

  it('shows the pause overlay while paused', () => {
    const s = session();
    s.controls.togglePause();
    s.sync();
    expect(selected(s)).toBe('pause');
    expect(s.getProps()?.glOverlay?.paused).toBe(true);
    s.dispose();
  });

  it('prefers the death overlay while dead', () => {
    const fake = makeFake();
    const s = liveSession(fake);
    fake.onmessage?.({ data: JSON.stringify({ type: 'DEATH', v: 2, cause: 'combat' }) });
    s.sync();
    expect(selected(s)).toBe('death');
    s.dispose();
  });

  it('opens the reactor console with live systems', () => {
    const fake = makeFake();
    const s = liveSession(fake);
    fake.onmessage?.({
      data: JSON.stringify({ type: 'SHIP_SYSTEMS', v: 2, tick: 30, ...systems() }),
    });
    s.consoles.toggleConsole('reactor_console');
    s.sync();
    expect(selected(s)).toBe('reactor_console');
    expect(s.getProps()?.glOverlay?.console?.systems.tempK).toBe(660);
    s.consoles.closeConsole();
    s.sync();
    expect(selected(s)).toBeNull();
    s.dispose();
  });

  it('fires onShipLost and tolerates offline restart', () => {
    const onQuit = vi.fn();
    const onShipLost = vi.fn();
    const s = new GameSession({
      identity: { callsign: 'Rook', color: '#ffd166', beacon: 'HESP01', userId: 'u1' },
      debug: false,
      onQuit,
      onShipLost,
    });
    s.controls.restart();
    s.consoles.setShipLost({
      shipId: 'ship:u1',
    } as unknown as import('@kybernetes/protocol').ShipLostBroadcast);
    expect(onShipLost).toHaveBeenCalledWith('ship:u1');
    s.dispose();
  });
});
