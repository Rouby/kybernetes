/**
 * ScreenManager: framework-free shell phase machine (Phase 3 Round 13).
 * Menu, customize, intro, game, and game-over on SplashMount + GameSession,
 * identity through harbor/identity, audio through AudioPrefs. Per-frame
 * layout closures replace React re-renders; no framework of its own.
 */

import {
  type HarborIdentityState,
  type IdentityStore,
  loadIdentity,
  saveIdentity,
} from '../harbor/identity';
import { menuButtonIds } from '../harbor/terminalLayout';
import { createTextField, type TextFieldState } from '../webgl/ui/TextFieldModel';
import {
  layoutCustomizeField,
  layoutCustomizeScreen,
  layoutGameOverScreen,
  layoutIntroScreen,
  layoutMenuScreen,
  type UiScreenLayout,
} from '../webgl/ui/UiScreens';
import { applySwatchPick } from './customizePick';
import { GameSession } from './GameSession';
import { activateActionKey, activateTerminalButton, type MenuActions } from './menuActions';
import { SplashMount } from './SplashMount';
import { AudioPrefs } from './stores/AudioPrefs';

export type ShellPhase = 'menu' | 'customize' | 'intro' | 'game' | 'gameover';

export type ShellEvent = 'embark' | 'customize' | 'back' | 'quit' | 'shipLost' | 'restart';

const SHELL_TRANSITIONS: Record<ShellPhase, Partial<Record<ShellEvent, ShellPhase>>> = {
  menu: { embark: 'intro', customize: 'customize' },
  customize: { embark: 'intro', back: 'menu' },
  intro: { embark: 'game' },
  game: { quit: 'menu', shipLost: 'gameover' },
  gameover: { restart: 'game' },
};

export function reduceShellPhase(phase: ShellPhase, event: ShellEvent): ShellPhase {
  return SHELL_TRANSITIONS[phase][event] ?? phase;
}

export interface ScreenManagerDeps {
  readonly root: HTMLElement;
  readonly storage: IdentityStore;
  readonly beacon: string;
  readonly callsign: string | null;
  readonly debug: boolean;
}

export class ScreenManager {
  private phase: ShellPhase = 'menu';
  private identity: HarborIdentityState;
  private readonly audio = new AudioPrefs();
  private mount: SplashMount | null = null;
  private game: GameSession | null = null;
  private input: HTMLInputElement | null = null;
  private field: TextFieldState;
  private size = { w: 1280, h: 720 };
  private lostShipId: string | null = null;
  private started = false;

  constructor(private readonly deps: ScreenManagerDeps) {
    const stored = loadIdentity(deps.storage);
    this.identity = { ...stored, callsign: deps.callsign ?? stored.callsign };
    this.field = createTextField(this.identity.callsign);
  }

  public start(): void {
    if (this.started) return;
    this.started = true;
    this.audio.attach();
    window.addEventListener('keydown', this.unlockAudio, { once: true });
    window.addEventListener('pointerdown', this.unlockAudio, { once: true });
    this.show();
  }

  public dispose(): void {
    if (!this.started) return;
    this.started = false;
    window.removeEventListener('keydown', this.unlockAudio);
    window.removeEventListener('pointerdown', this.unlockAudio);
    window.removeEventListener('keydown', this.menuKeys);
    this.teardown();
    this.audio.detach();
  }

  public getPhase(): ShellPhase {
    return this.phase;
  }

  private transition(event: ShellEvent): void {
    const next = reduceShellPhase(this.phase, event);
    if (next === this.phase) return;
    this.phase = next;
    this.show();
  }

  private teardown(): void {
    window.removeEventListener('keydown', this.menuKeys);
    this.mount?.dispose();
    this.mount = null;
    this.game?.dispose();
    this.game = null;
    this.input = null;
    this.deps.root.replaceChildren();
  }

  private readonly showers: Record<ShellPhase, () => void> = {
    menu: () => this.showMenu(),
    customize: () => this.showCustomize(),
    intro: () => this.showIntro(),
    game: () => this.showGame(),
    gameover: () => this.showGameOver(),
  };

  private show(): void {
    this.teardown();
    this.showers[this.phase]();
  }

  private mountCanvas(testid: string): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.dataset.testid = testid;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    this.deps.root.appendChild(canvas);
    return canvas;
  }

  private mountSplash(
    canvas: HTMLCanvasElement,
    buildLayout: (width: number, height: number) => UiScreenLayout,
    onAction: (id: string) => void
  ): void {
    const mount = new SplashMount({
      buildLayout,
      onAction,
      onSize: (w, h) => {
        this.size = { w, h };
        this.layoutInput();
      },
    });
    this.mount = mount;
    mount.attach(canvas);
  }

  private readonly unlockAudio = (): void => {
    this.audio.enable();
  };

  private menuLive(): MenuActions {
    const snapshot = this.audio.getSnapshot();
    return {
      callsign: this.identity.callsign,
      audio: {
        ready: snapshot.ready,
        muted: snapshot.muted,
        masterPct: snapshot.masterPct,
        enable: () => this.audio.enable(),
        setMasterPct: (pct) => this.audio.setMasterPct(pct),
        setMuted: (muted) => this.audio.setMuted(muted),
      },
      onEmbark: () => this.transition('embark'),
      onCustomize: () => this.transition('customize'),
    };
  }

  private readonly menuKeys = (event: KeyboardEvent): void => {
    if (!event.repeat) activateActionKey(event.key, this.menuLive());
  };

  private showMenu(): void {
    const canvas = this.mountCanvas('gl-splash');
    window.addEventListener('keydown', this.menuKeys);
    this.mountSplash(
      canvas,
      (w, h) => this.menuLayout(w, h),
      (id) => this.menuAction(id)
    );
  }

  private menuLayout(w: number, h: number) {
    const snapshot = this.audio.getSnapshot();
    return layoutMenuScreen({
      width: w,
      height: h,
      callsign: this.identity.callsign,
      audioReady: snapshot.ready,
      muted: snapshot.muted,
      masterPct: snapshot.masterPct,
    });
  }

  private menuAction(id: string): void {
    const valid = menuButtonIds(this.audio.getSnapshot().ready).find((entry) => entry === id);
    if (valid !== undefined) activateTerminalButton(valid, this.menuLive());
  }

  private showCustomize(): void {
    const canvas = this.mountCanvas('gl-splash');
    this.input = this.mountInput();
    this.mountSplash(
      canvas,
      (w, h) => this.customizeLayout(w, h),
      (id) => this.customizeAction(id)
    );
  }

  private customizeLayout(w: number, h: number) {
    return layoutCustomizeScreen(w, h, this.field.value, {
      color: this.identity.color,
      trim: this.identity.trim,
      thruster: this.identity.thruster,
      caret: this.field.caret,
      focused: this.field.focused,
    });
  }

  private customizeAction(id: string): void {
    if (id === 'field:callsign') {
      this.field = { ...this.field, focused: true };
      this.input?.focus();
      return;
    }
    if (id === 'back' || id === 'embark') {
      this.transition(id);
      return;
    }
    applySwatchPick(id, this.identity, (draft) => this.saveIdentity(draft));
  }

  private saveIdentity(draft: HarborIdentityState): void {
    this.identity = draft;
    saveIdentity(this.deps.storage, draft);
  }

  private mountInput(): HTMLInputElement {
    const input = document.createElement('input');
    input.setAttribute('aria-label', 'Callsign');
    input.maxLength = 24;
    input.value = this.field.value;
    input.style.position = 'absolute';
    input.style.opacity = '0';
    input.style.pointerEvents = 'none';
    input.style.border = 'none';
    input.style.outline = 'none';
    input.style.background = 'transparent';
    input.style.color = 'transparent';
    input.style.caretColor = 'transparent';
    input.style.fontSize = '16px';
    input.addEventListener('input', () => this.readInput(input));
    input.addEventListener('focus', () => {
      this.field = { ...this.field, focused: true };
    });
    input.addEventListener('blur', () => {
      this.field = { ...this.field, focused: false };
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === 'Escape') input.blur();
    });
    this.deps.root.appendChild(input);
    this.layoutInput();
    return input;
  }

  private readInput(input: HTMLInputElement): void {
    const value = input.value.slice(0, 24);
    this.field = {
      ...this.field,
      value,
      caret: input.selectionStart ?? value.length,
      focused: true,
    };
    this.saveIdentity({ ...this.identity, callsign: value });
  }

  private layoutInput(): void {
    const input = this.input;
    if (input === null) return;
    const rect = layoutCustomizeField(this.size.w, this.size.h);
    const spanW = Math.max(320, this.size.w);
    const spanH = Math.max(320, this.size.h);
    input.style.left = (rect.x / spanW) * 100 + '%';
    input.style.top = (rect.y / spanH) * 100 + '%';
    input.style.width = (rect.w / spanW) * 100 + '%';
    input.style.height = (rect.h / spanH) * 100 + '%';
  }

  private showIntro(): void {
    const shipId = 'ship:' + this.identity.userId;
    const canvas = this.mountCanvas('gl-splash');
    this.mountSplash(
      canvas,
      (w, h) => layoutIntroScreen(w, h, shipId),
      () => this.transition('embark')
    );
  }

  private showGame(): void {
    const game = new GameSession({
      identity: {
        callsign: this.identity.callsign,
        color: this.identity.color,
        beacon: this.deps.beacon,
        userId: this.identity.userId,
        trim: this.identity.trim,
        thruster: this.identity.thruster,
      },
      debug: this.deps.debug,
      onQuit: () => this.transition('quit'),
      onShipLost: (shipId) => {
        this.lostShipId = shipId;
        this.transition('shipLost');
      },
    });
    this.game = game;
    game.attach(this.deps.root);
  }

  private showGameOver(): void {
    const shipId = this.lostShipId ?? 'ship:' + this.identity.userId;
    const canvas = this.mountCanvas('gl-splash');
    this.mountSplash(
      canvas,
      (w, h) => layoutGameOverScreen(w, h, shipId),
      () => this.transition('restart')
    );
  }
}
