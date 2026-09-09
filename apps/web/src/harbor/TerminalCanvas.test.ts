import { describe, expect, it, vi } from 'vitest';
import { activateTerminalButton, activateTerminalIndex } from './TerminalCanvas';
import type { TermButton } from './terminalLayout';

function live() {
  return {
    callsign: 'Rook',
    audio: {
      ready: true,
      muted: false,
      masterPct: 70,
      enable: vi.fn(),
      setMasterPct: vi.fn(),
      setMuted: vi.fn(),
    },
    onEmbark: vi.fn(),
    onCustomize: vi.fn(),
  };
}

function button(id: TermButton['id']): TermButton {
  return { id, label: id, rect: { x: 0, y: 0, w: 10, h: 10 }, primary: false };
}

describe('terminal activation', () => {
  it('dispatches menu buttons to shell callbacks', () => {
    const current = live();
    activateTerminalButton('embark', current);
    activateTerminalButton('customize', current);
    expect(current.onEmbark).toHaveBeenCalledTimes(1);
    expect(current.onCustomize).toHaveBeenCalledTimes(1);
  });

  it('drives volume through the audio controls', () => {
    const current = live();
    activateTerminalButton('voldn', current);
    expect(current.audio.setMasterPct).toHaveBeenCalledWith(60);
    activateTerminalButton('volup', current);
    expect(current.audio.setMasterPct).toHaveBeenCalledWith(80);
    activateTerminalButton('mute', current);
    expect(current.audio.setMuted).toHaveBeenCalledWith(true);
  });

  it('ignores volume buttons before audio is ready', () => {
    const current = { ...live(), audio: { ...live().audio, ready: false } };
    activateTerminalButton('voldn', current);
    activateTerminalButton('mute', current);
    expect(current.audio.setMasterPct).not.toHaveBeenCalled();
    expect(current.audio.setMuted).not.toHaveBeenCalled();
  });

  it('activates buttons by keyboard index', () => {
    const current = live();
    const buttons = [button('embark'), button('customize')];
    activateTerminalIndex(buttons, 1, current);
    expect(current.onCustomize).toHaveBeenCalledTimes(1);
    activateTerminalIndex(buttons, 9, current);
    expect(current.onEmbark).not.toHaveBeenCalled();
  });
});
