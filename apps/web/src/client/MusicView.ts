/**
 * MusicView: debug-only TECHNO LAB page (?music=1).
 * Live voice grid with per-voice mute/solo, transport, track selector,
 * DJ crossfade, intensity and freak sliders, and alert preview.
 * Only mountMusicView touches the DOM; describeMusicRow is pure.
 * Static inline CSS, no deps.
 */

import { ShipAudioEngine } from '../audio/ShipAudioEngine';
import type { TechnoMusicSnapshot } from '../audio/synths/TechnoMusicSynth';
import {
  TECHNO_STEPS_PER_LOOP,
  TECHNO_VOICE_LABELS,
  TECHNO_VOICES,
  type TechnoVoice,
  voiceHitSteps,
} from '../audio/synths/technoPatterns';
import { type TechnoTrack, trackById } from '../audio/synths/technoTracks';

export interface MusicCellState {
  readonly hit: boolean;
  readonly current: boolean;
  readonly fired: boolean;
}

export interface MusicRowState {
  readonly voice: TechnoVoice;
  readonly label: string;
  readonly muted: boolean;
  readonly soloed: boolean;
  readonly audible: boolean;
  readonly cells: readonly MusicCellState[];
}

const FIRE_WINDOW_SEC = 0.25;

/** Pure row model: static pattern + live playhead + recent-hit flash. */
export function describeMusicRow(
  snapshot: TechnoMusicSnapshot | null,
  track: TechnoTrack,
  voice: TechnoVoice,
  sounding: number,
  now: number
): MusicRowState {
  const loop = snapshot?.loop ?? 0;
  const hits = new Set(voiceHitSteps(track, voice, loop));
  const mark = snapshot?.lastHit[voice];
  const muted = snapshot?.muted.includes(voice) ?? false;
  const solo = snapshot?.solo ?? null;
  const cells: MusicCellState[] = [];
  for (let step = 0; step < TECHNO_STEPS_PER_LOOP; step++) {
    cells.push({
      hit: hits.has(step),
      current: step === sounding,
      fired: isFired(mark, step, loop, now),
    });
  }
  return {
    voice,
    label: TECHNO_VOICE_LABELS[voice],
    muted,
    soloed: solo === voice,
    audible: solo !== null ? solo === voice : !muted,
    cells,
  };
}

function isFired(
  mark: TechnoMusicSnapshot['lastHit'][TechnoVoice] | undefined,
  step: number,
  loop: number,
  now: number
): boolean {
  if (mark === undefined) return false;
  return mark.step === step && mark.loop === loop && Math.abs(mark.at - now) < FIRE_WINDOW_SEC;
}

interface VoiceRowDom {
  readonly muteBtn: HTMLButtonElement;
  readonly soloBtn: HTMLButtonElement;
  readonly cells: readonly HTMLSpanElement[];
}

const MUSIC_CSS =
  '.technolab{background:#05070d;color:#c9f2ff;font:12px/1.5 monospace;min-height:100vh;padding:20px 24px;box-sizing:border-box}' +
  '.technolab h1{font-size:15px;color:#00e5ff;margin:0 0 2px}' +
  '.technolab p{color:#7fa3b8;margin:0 0 12px}' +
  '.technolab .trow{margin:0 0 8px}.technolab .trow button{background:#0a1420;border:1px solid #1e4a5a;color:#c9f2ff;font:inherit;padding:8px 12px;margin:0 8px 8px 0;cursor:pointer}' +
  '.technolab .trow button:hover{background:#00333f;color:#fff}' +
  '.technolab label{color:#7fa3b8;margin-right:16px}.technolab input[type=range]{width:140px;vertical-align:middle}' +
  '.technolab .vrow{display:flex;align-items:center;margin:0 0 4px}' +
  '.technolab .vlab{width:52px;color:#7fa3b8;flex:none}.technolab .vlab.off{color:#3a4a55;text-decoration:line-through}' +
  '.technolab .vbtn{width:44px;flex:none;background:#0a1420;border:1px solid #1e4a5a;color:#c9f2ff;font:inherit;margin:0 4px 0 0;padding:2px 0;cursor:pointer}' +
  '.technolab .vbtn.on{background:#00333f;color:#fff}.technolab .vbtn.solo-on{background:#3f2a00;border-color:#8a5f00;color:#ffd97f}' +
  '.technolab .mcell{width:13px;height:18px;margin-right:3px;flex:none;background:#101820;border:1px solid #1a2836}' +
  '.technolab .mcell.hit{background:#134052;border-color:#1e6a8a}' +
  '.technolab .mcell.cur{outline:1px solid #00e5ff}' +
  '.technolab .mcell.fired{background:#ffd97f;border-color:#ffd97f}' +
  '.technolab .legend{color:#3a4a55;margin-top:12px}';

/** Mounts the techno lab into root; returns a disposer (loop keeps playing). */
export function mountMusicView(root: HTMLElement): () => void {
  const engine = ShipAudioEngine.getInstance();
  engine.init();
  const page = document.createElement('div');
  page.className = 'technolab';
  page.dataset.testid = 'musiclab';
  const style = document.createElement('style');
  style.textContent = MUSIC_CSS;
  const title = document.createElement('h1');
  title.textContent = 'TECHNO LAB // live voice mixer';
  const status = document.createElement('p');
  page.append(style, title, status);
  const controls = buildTransport(engine, page);
  const rows = new Map<TechnoVoice, VoiceRowDom>();
  for (const voice of TECHNO_VOICES) rows.set(voice, buildVoiceRow(engine, page, voice));
  appendLegend(page);
  root.append(page);
  let raf = 0;
  const refresh = () => {
    refreshView(engine, status, controls, rows);
    raf = requestAnimationFrame(refresh);
  };
  raf = requestAnimationFrame(refresh);
  return () => {
    cancelAnimationFrame(raf);
    page.remove();
  };
}

interface LabControls {
  readonly intSlider: HTMLInputElement;
  readonly freakSlider: HTMLInputElement;
}

function buildTransport(engine: ShipAudioEngine, page: HTMLElement): LabControls {
  const row = document.createElement('div');
  row.className = 'trow';
  row.append(
    transportButton('START LOOP', () => engine.startTechno(0.85, 0.9)),
    transportButton('CUT', () => engine.stopTechno()),
    transportButton('TRACK 1', () => engine.playTrack('freaky-main')),
    transportButton('TRACK 2', () => engine.playTrack('iron-chapel')),
    transportButton('TRACK 3', () => engine.playTrack('rave-99')),
    transportButton('TRACK 4', () => engine.playTrack('hymn')),
    transportButton('XFADE', () => engine.crossfadeOther()),
    transportButton('DROP', () => engine.transitionDropTo(engine.nextTrackId())),
    transportButton('NOMINAL', () => engine.previewAlert('nominal')),
    transportButton('YELLOW', () => engine.previewAlert('yellow')),
    transportButton('RED', () => engine.previewAlert('red'))
  );
  page.append(row);
  return buildSliders(engine, page);
}

function transportButton(label: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.textContent = label;
  btn.addEventListener('click', () => {
    ShipAudioEngine.getInstance().resume();
    onClick();
  });
  return btn;
}

function buildSliders(engine: ShipAudioEngine, page: HTMLElement): LabControls {
  const row = document.createElement('div');
  row.className = 'trow';
  const intSlider = sliderRow(row, 'INT', (v) => engine.technoSynth?.setIntensity(v / 100));
  const freakSlider = sliderRow(row, 'FREAK', (v) => engine.technoSynth?.setFreak(v / 100));
  page.append(row);
  return { intSlider, freakSlider };
}

function sliderRow(
  row: HTMLElement,
  label: string,
  onInput: (v: number) => void
): HTMLInputElement {
  const wrap = document.createElement('label');
  wrap.textContent = `${label} `;
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '100';
  slider.value = '80';
  slider.addEventListener('input', () => onInput(Number(slider.value)));
  wrap.append(slider);
  row.append(wrap);
  return slider;
}

function buildVoiceRow(
  engine: ShipAudioEngine,
  page: HTMLElement,
  voice: TechnoVoice
): VoiceRowDom {
  const row = document.createElement('div');
  row.className = 'vrow';
  const lab = document.createElement('span');
  lab.className = 'vlab';
  lab.textContent = TECHNO_VOICE_LABELS[voice];
  const muteBtn = voiceButton('M', () => toggleMute(engine, voice));
  const soloBtn = voiceButton('S', () => toggleSolo(engine, voice));
  row.append(lab, muteBtn, soloBtn);
  const cells: HTMLSpanElement[] = [];
  for (let step = 0; step < TECHNO_STEPS_PER_LOOP; step++) {
    const cell = document.createElement('span');
    cell.className = 'mcell';
    row.append(cell);
    cells.push(cell);
  }
  page.append(row);
  return { muteBtn, soloBtn, cells };
}

function voiceButton(label: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'vbtn';
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}

function toggleMute(engine: ShipAudioEngine, voice: TechnoVoice): void {
  const synth = engine.technoSynth;
  if (!synth) return;
  synth.setVoiceMuted(voice, !synth.isVoiceMuted(voice));
}

function toggleSolo(engine: ShipAudioEngine, voice: TechnoVoice): void {
  const synth = engine.technoSynth;
  if (!synth) return;
  synth.setSoloVoice(synth.getSnapshot().solo === voice ? null : voice);
}

function appendLegend(page: HTMLElement): void {
  const legend = document.createElement('p');
  legend.className = 'legend';
  legend.textContent =
    'M mute - S solo (isolate one voice) - yellow flash = triggered - outline = playhead - lead hammers bar 2, siren fires step 0 every 8th loop';
  page.append(legend);
}

function refreshView(
  engine: ShipAudioEngine,
  status: HTMLElement,
  controls: LabControls,
  rows: Map<TechnoVoice, VoiceRowDom>
): void {
  const synth = engine.technoSynth;
  const snapshot = synth?.getSnapshot() ?? null;
  const track = trackById(snapshot?.trackId ?? 'freaky-main');
  refreshMeters(engine, status, controls, snapshot, track);
  refreshVoiceRows(rows, snapshot, track, synth?.soundingStep() ?? 0, engine.ctx?.currentTime ?? 0);
}

function refreshMeters(
  engine: ShipAudioEngine,
  status: HTMLElement,
  controls: LabControls,
  snapshot: TechnoMusicSnapshot | null,
  track: TechnoTrack
): void {
  status.textContent = statusLine(engine, snapshot, track);
  syncSlider(controls.intSlider, (snapshot?.intensity ?? 0.8) * 100);
  syncSlider(controls.freakSlider, (snapshot?.freak ?? 0.8) * 100);
}

function refreshVoiceRows(
  rows: Map<TechnoVoice, VoiceRowDom>,
  snapshot: TechnoMusicSnapshot | null,
  track: TechnoTrack,
  sounding: number,
  now: number
): void {
  for (const voice of TECHNO_VOICES) {
    const dom = rows.get(voice);
    if (!dom) continue;
    refreshRow(describeMusicRow(snapshot, track, voice, sounding, now), dom);
  }
}

function statusLine(
  engine: ShipAudioEngine,
  snapshot: TechnoMusicSnapshot | null,
  track: TechnoTrack
): string {
  const state = engine.ctx?.state ?? 'unavailable';
  if (!snapshot) return `AudioContext: ${state} - gestures unlock audio`;
  const loop = snapshot.playing ? `LOOP ${snapshot.loop}` : 'STOPPED';
  return `${track.title} ${snapshot.bpm}BPM - ${loop} - INT ${Math.round(snapshot.intensity * 100)}% - FREAK ${Math.round(snapshot.freak * 100)}% - ctx ${state}`;
}

function syncSlider(slider: HTMLInputElement, value: number): void {
  if (document.activeElement === slider) return;
  slider.value = String(Math.round(value));
}

function refreshRow(state: MusicRowState, dom: VoiceRowDom): void {
  dom.muteBtn.classList.toggle('on', state.muted);
  dom.soloBtn.classList.toggle('solo-on', state.soloed);
  const label = dom.muteBtn.previousElementSibling;
  if (label) label.classList.toggle('off', !state.audible);
  for (let i = 0; i < state.cells.length; i++) {
    const cell = state.cells[i];
    const el = dom.cells[i];
    if (!cell || !el) continue;
    el.classList.toggle('hit', cell.hit);
    el.classList.toggle('cur', cell.current);
    el.classList.toggle('fired', cell.fired);
  }
}
