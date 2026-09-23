/**
 * Soundboard: debug-only DOM page for auditioning game sounds.
 * Mounted by boot on ?soundboard=1. The button list is pure (node-testable);
 * only mountSoundboard touches the DOM. Static inline CSS, no dependencies.
 */

import type { WeaponType } from '@kybernetes/protocol';
import { hudFonts, hudTheme } from '@kybernetes/ui-tokens';
import { ShipAudioEngine } from '../audio/ShipAudioEngine';

/** Structural engine surface the soundboard needs (real or fake). */
export interface SoundboardEngine {
  readonly playUiClick: () => void;
  readonly playStationInteract: () => void;
  readonly playDebriefStamp: () => void;
  readonly playExplosionShockwave: () => void;
  readonly playVisorToggle: (sealed: boolean) => void;
  readonly playLocalFootstep: () => void;
  readonly playDoorToggle: (x: number, y: number, isOpen: boolean) => void;
  readonly playWeaponFire: (
    x: number,
    y: number,
    weapon: WeaponType,
    charge: number,
    isLocal: boolean
  ) => void;
  readonly playImpact: (x: number, y: number, type: 'kinetic' | 'laser' | 'welder') => void;
  readonly playPackGrab: () => void;
  readonly playPackDrop: () => void;
  readonly playPackLand: () => void;
  readonly playPackRotate: () => void;
  readonly playLidSeat: () => void;
  readonly playSealStamp: () => void;
  readonly playCashRegister: () => void;
  readonly playPackReject: () => void;
  readonly startTechno: (intensity?: number, freak?: number) => void;
  readonly stopTechno: () => void;
  readonly setTechnoFreak: (freak: number) => void;
  readonly isTechnoPlaying: () => boolean;
  readonly previewAlert: (level: 'nominal' | 'yellow' | 'red') => void;
  readonly playTrack: (id: string) => void;
  readonly crossfadeOther: () => void;
  readonly transitionDropTo: (id: string) => void;
}

export interface SoundboardButton {
  readonly group: string;
  readonly label: string;
  readonly play: () => void;
}

/** Every auditionable sound, grouped for the debug page. */
export function soundboardButtons(engine: SoundboardEngine): SoundboardButton[] {
  return [
    { group: 'Pack bench', label: 'Grab unit', play: () => engine.playPackGrab() },
    { group: 'Pack bench', label: 'Drop unit', play: () => engine.playPackDrop() },
    { group: 'Pack bench', label: 'Unit lands', play: () => engine.playPackLand() },
    { group: 'Pack bench', label: 'Rotate ratchet', play: () => engine.playPackRotate() },
    { group: 'Pack bench', label: 'Lid seats', play: () => engine.playLidSeat() },
    { group: 'Trade', label: 'Seal stamp', play: () => engine.playSealStamp() },
    { group: 'Trade', label: 'Cash register', play: () => engine.playCashRegister() },
    { group: 'Trade', label: 'Seal rejected', play: () => engine.playPackReject() },
    { group: 'UI', label: 'Click', play: () => engine.playUiClick() },
    { group: 'UI', label: 'Station chirp', play: () => engine.playStationInteract() },
    { group: 'UI', label: 'Debrief stamp', play: () => engine.playDebriefStamp() },
    { group: 'Ship', label: 'Footstep', play: () => engine.playLocalFootstep() },
    { group: 'Ship', label: 'Door opens', play: () => engine.playDoorToggle(0, 0, true) },
    { group: 'Ship', label: 'Door closes', play: () => engine.playDoorToggle(0, 0, false) },
    { group: 'Ship', label: 'Visor seals', play: () => engine.playVisorToggle(true) },
    { group: 'Ship', label: 'Visor opens', play: () => engine.playVisorToggle(false) },
    { group: 'Ship', label: 'Explosion', play: () => engine.playExplosionShockwave() },
    {
      group: 'Weapons',
      label: 'Carbine',
      play: () => engine.playWeaponFire(0, 0, 'kinetic_carbine', 1, true),
    },
    {
      group: 'Weapons',
      label: 'Pulse laser',
      play: () => engine.playWeaponFire(0, 0, 'pulse_laser', 1, true),
    },
    {
      group: 'Weapons',
      label: 'Arc welder',
      play: () => engine.playWeaponFire(0, 0, 'arc_welder', 1, true),
    },
    { group: 'Weapons', label: 'Kinetic impact', play: () => engine.playImpact(0, 0, 'kinetic') },
    { group: 'Weapons', label: 'Laser impact', play: () => engine.playImpact(0, 0, 'laser') },
    { group: 'Music', label: 'Freaky techno: drop', play: () => engine.startTechno(0.85, 0.9) },
    { group: 'Music', label: 'Freaky techno: stripped', play: () => engine.startTechno(0.4, 0.4) },
    { group: 'Music', label: 'Freaky techno: full freak', play: () => engine.setTechnoFreak(1.0) },
    { group: 'Music', label: 'Freaky techno: toggle', play: () => toggleTechno(engine) },
    { group: 'Music', label: 'Freaky techno: cut', play: () => engine.stopTechno() },
    { group: 'Music', label: 'Iron Chapel: drop', play: () => engine.playTrack('iron-chapel') },
    { group: 'Music', label: 'Rave 99: drop', play: () => engine.playTrack('rave-99') },
    { group: 'Music', label: 'DJ xfade to next track', play: () => engine.crossfadeOther() },
    { group: 'Music', label: 'DROP to Rave 99', play: () => engine.transitionDropTo('rave-99') },

    {
      group: 'Alert',
      label: 'Alert nominal (music chills)',
      play: () => engine.previewAlert('nominal'),
    },
    {
      group: 'Alert',
      label: 'Alert yellow (music lifts)',
      play: () => engine.previewAlert('yellow'),
    },
    { group: 'Alert', label: 'Alert red (full freak)', play: () => engine.previewAlert('red') },
  ];
}

/** Toggle audition: stops a running loop, otherwise drops the full-freak loop. */
function toggleTechno(engine: SoundboardEngine): void {
  if (engine.isTechnoPlaying()) engine.stopTechno();
  else engine.startTechno(0.85, 0.9);
}

const SOUNDBOARD_CSS =
  `.soundboard{background:${hudTheme.bgVoid};color:${hudTheme.textPrimary};font:13px/1.5 ${hudFonts.fontMono};min-height:100vh;padding:24px;box-sizing:border-box}` +
  `.soundboard h1{font-size:15px;color:${hudTheme.cyanTelemetry};margin:0 0 4px}` +
  `.soundboard p{color:${hudTheme.textSecondary};margin:0 0 16px}` +
  `.soundboard h2{font-size:12px;color:${hudTheme.textSecondary};margin:18px 0 8px;text-transform:uppercase}` +
  `.soundboard button{background:${hudTheme.bgPanel};border:1px solid ${hudTheme.borderBright};color:${hudTheme.textPrimary};font:inherit;padding:10px 14px;margin:0 8px 8px 0;cursor:pointer}` +
  '.soundboard button:hover{background:#00333f;color:#fff}';

/** Mounts the debug soundboard into root; returns a disposer. */
export function mountSoundboard(root: HTMLElement): () => void {
  const engine = ShipAudioEngine.getInstance();
  engine.init();
  const page = document.createElement('div');
  page.className = 'soundboard';
  page.dataset.testid = 'soundboard';
  const style = document.createElement('style');
  style.textContent = SOUNDBOARD_CSS;
  const title = document.createElement('h1');
  title.textContent = 'SOUNDBOARD // click to audition';
  const status = document.createElement('p');
  const refresh = () => {
    status.textContent = `AudioContext: ${engine.ctx?.state ?? 'unavailable'} — gestures unlock audio`;
  };
  refresh();
  page.append(style, title, status);
  let group = '';
  for (const button of soundboardButtons(engine)) {
    if (button.group !== group) {
      group = button.group;
      const heading = document.createElement('h2');
      heading.textContent = group;
      page.append(heading);
    }
    const el = document.createElement('button');
    el.textContent = button.label;
    el.addEventListener('click', () => {
      engine.resume();
      button.play();
      refresh();
    });
    page.append(el);
  }
  root.append(page);
  return () => {
    page.remove();
  };
}
