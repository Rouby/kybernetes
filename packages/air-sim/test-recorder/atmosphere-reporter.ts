import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  Reporter,
  SerializedError,
  TestCase,
  TestModule,
  TestRunEndReason,
} from 'vitest/node';
import type { AtmosphereRecording } from './atmosphere-recorder.ts';

export default class AtmosphereHtmlReporter implements Reporter {
  // fallow-ignore-next-line unused-class-member -- Vitest invokes reporter lifecycle hooks dynamically.
  onTestRunEnd(
    testModules: ReadonlyArray<TestModule>,
    _unhandledErrors: ReadonlyArray<SerializedError>,
    _reason: TestRunEndReason
  ): void {
    const recordings: AtmosphereRecording[] = [];

    // Traverse all test files and extract recordings from task metadata
    for (const file of testModules) {
      const walk = (task: TestCase) => {
        const { atmosphereRecordings } = task.meta() as {
          atmosphereRecordings?: AtmosphereRecording[];
        };
        if (atmosphereRecordings) {
          recordings.push(...atmosphereRecordings);
        }
      };
      for (const test of file.children.allTests()) {
        walk(test);
      }
    }

    if (recordings.length === 0) {
      console.log('No recordings');
      return;
    }

    const html = this.buildHtmlReport(recordings);
    const resolvedPath = path.resolve(process.cwd(), 'atmos-report.html');
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    fs.writeFileSync(resolvedPath, html, 'utf-8');
    console.log(`\n\x1b[32m✔ Atmospheric Playback Report generated:\x1b[0m ${resolvedPath}\n`);
  }

  private buildHtmlReport(recordings: AtmosphereRecording[]): string {
    // Prevent recording labels from closing the embedded script element.
    const payload = JSON.stringify(recordings).replace(/</g, '\\u003c');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Atmospheric Simulation Replay</title>
  <style>
    :root {
      --bg: #090d16;
      --card: #131b2e;
      --border: #1e293b;
      --text: #f1f5f9;
      --muted: #94a3b8;
      --accent: #38bdf8;
    }
    body {
      margin: 0;
      padding: 24px;
      background: var(--bg);
      color: var(--text);
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    .layout {
      max-width: 1100px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .panel {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
    }
    #simSelect { flex: 1 1 420px; min-width: 0; max-width: 100%; text-overflow: ellipsis; }
    h2 { font-size: 0.95rem; margin: 0 0 12px; }
    h1 { font-size: 1.1rem; margin: 0; color: var(--accent); }
    select, button {
      background: #1e293b;
      color: var(--text);
      border: 1px solid #334155;
      padding: 6px 12px;
      border-radius: 4px;
      font-family: inherit;
      cursor: pointer;
    }
    button:hover { background: #334155; }
    button:disabled { opacity: 0.45; cursor: default; }
    .viewport {
      display: flex;
      justify-content: center;
      background: #020617;
      border-radius: 6px;
      overflow: hidden;
      border: 1px solid var(--border);
    }
    svg { width: 100%; height: 420px; }
    .controls {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .timeline-bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 16px;
    }
    input[type=range] {
      flex: 1;
      min-width: 120px;
      accent-color: var(--accent);
      cursor: pointer;
    }
    .btn-group {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }
    .metrics {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr));
      gap: 12px;
    }
    .metric-card {
      background: #0b1120;
      border: 1px solid var(--border);
      padding: 12px;
      border-radius: 4px;
    }
    .metric-title { font-weight: bold; margin-bottom: 4px; color: var(--accent); overflow-wrap: anywhere; }
    .metric-row { display: flex; justify-content: space-between; gap: 12px; font-size: 0.85rem; color: var(--muted); }
    .metric-row span:last-child { text-align: right; }
    .legend { display: flex; flex-wrap: wrap; gap: 12px 24px; font-size: 0.8rem; color: var(--muted); }
    .legend-item { display: inline-flex; align-items: center; gap: 8px; }
    .legend-line { width: 28px; border-top-width: 4px; }
    .legend-closed { border-top-style: solid; border-color: #f87171; }
    .legend-partial { border-top-style: dashed; border-color: #fbbf24; }
    .legend-open { border-top-style: dotted; border-color: #34d399; }
    .hint { margin: 12px 0 0; font-size: 0.8rem; color: var(--muted); }
    #eventLog { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; max-height: 320px; overflow-y: auto; }
    .event-entry { padding: 10px 12px; border: 1px solid var(--border); border-left: 3px solid #475569; border-radius: 4px; overflow-wrap: anywhere; }
    .event-entry.applied { border-left-color: #34d399; background: #102723; }
    .event-entry.latest { outline: 1px solid #34d399; outline-offset: -1px; }
    .event-entry.upcoming { border-left-style: dashed; color: var(--muted); }
    .event-heading { font-size: 0.85rem; font-weight: bold; }
    .event-detail { margin-top: 4px; font-size: 0.8rem; color: var(--muted); }
    @media (max-width: 600px) {
      body { padding: 12px; }
      .panel { padding: 12px; }
      #simSelect { flex-basis: 100%; width: 100%; }
      svg { height: 320px; }
      #timeLabel { width: 100%; text-align: right; font-size: 0.85rem; }
    }
  </style>
</head>
<body>
  <div class="layout">
    <header class="panel">
      <h1>🚀 Atmospheric Chamber Replay</h1>
      <select id="simSelect" aria-label="Recorded scenario"></select>
    </header>

    <div class="viewport panel">
      <svg id="canvas" viewBox="0 0 800 400"></svg>
    </div>

    <div class="controls panel">
      <div class="timeline-bar">
        <button id="playBtn">▶ Play</button>
        <button id="stepBackBtn" aria-label="Previous frame">⏮</button>
        <button id="stepFwdBtn" aria-label="Next frame">⏭</button>
        <input type="range" id="scrubber" min="0" value="0" step="1" aria-label="Recording frame" />
        <span id="timeLabel">0.00s</span>
      </div>
      <div class="btn-group">
        <label style="font-size: 0.85rem; color: var(--muted);">Speed:</label>
        <button class="speed-btn" data-speed="0.5">0.5x</button>
        <button class="speed-btn" data-speed="1.0" style="border-color: var(--accent);">1.0x</button>
        <button class="speed-btn" data-speed="2.0">2.0x</button>
        <button class="speed-btn" data-speed="5.0">5.0x</button>
      </div>
    </div>

    <div class="panel">
      <div class="legend" aria-label="Portal states">
        <span class="legend-item"><span class="legend-line legend-closed" aria-hidden="true"></span>Closed · 0%</span>
        <span class="legend-item"><span class="legend-line legend-partial" aria-hidden="true"></span>Partial · 0–100%</span>
        <span class="legend-item"><span class="legend-line legend-open" aria-hidden="true"></span>Open · 100%</span>
      </div>
      <p class="hint">Segments show the maximum opening. Color and dash show the current door setting; damaged closed doors may still leak.</p>
    </div>

    <section class="panel">
      <h2>Room atmosphere</h2>
      <div class="metrics" id="roomMetrics"></div>
    </section>
    <section class="panel">
      <h2>Portal status</h2>
      <div class="metrics" id="portalMetrics"></div>
    </section>
    <section class="panel">
      <h2>Door event timeline</h2>
      <ol id="eventLog" aria-label="Scheduled portal changes"></ol>
      <p class="hint">Planned times are measured from recording start. Applied events are highlighted; dashed entries are upcoming.</p>
    </section>
  </div>

  <script>
    const data = ${payload};
  </script>
  <script>
    let activeSimIndex = 0;
    let currentFrameIdx = 0;
    let isPlaying = false;
    let playbackRate = 1.0;
    let animTimer = null;
    let playbackGeneration = 0;

    const simSelect = document.getElementById('simSelect');
    const scrubber = document.getElementById('scrubber');
    const timeLabel = document.getElementById('timeLabel');
    const playBtn = document.getElementById('playBtn');
    const stepBackBtn = document.getElementById('stepBackBtn');
    const stepFwdBtn = document.getElementById('stepFwdBtn');
    const canvas = document.getElementById('canvas');
    const roomMetrics = document.getElementById('roomMetrics');
    const portalMetrics = document.getElementById('portalMetrics');
    const eventLog = document.getElementById('eventLog');

    // All recording labels go through textContent or setAttribute, never HTML parsing.
    function element(tag, className, text) {
      const node = document.createElement(tag);
      node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    }

    function svgElement(tag, attributes, text) {
      const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
      Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, String(value)));
      if (text !== undefined) node.textContent = text;
      return node;
    }

    function metricCard(title, rows) {
      const card = element('div', 'metric-card');
      card.append(element('div', 'metric-title', title));
      rows.forEach(([label, value]) => {
        const row = element('div', 'metric-row');
        row.append(element('span', '', label), element('span', '', value));
        card.append(row);
      });
      return card;
    }

    function formatTime(time) {
      // Keep sub-centisecond event times visible without long floating-point tails.
      return Number(time.toFixed(6)).toString() + 's';
    }

    data.forEach((sim, idx) => {
      const opt = element('option', '', sim.testName);
      opt.value = idx;
      simSelect.appendChild(opt);
    });

    simSelect.addEventListener('change', (e) => {
      pause();
      activeSimIndex = parseInt(e.target.value, 10);
      currentFrameIdx = 0;
      initView();
    });

    function getPressureColor(p) {
      const norm = Math.max(0, Math.min(1.5, p / 101325));
      if (norm <= 1.0) {
        const r = Math.round(15 + norm * 5);
        const g = Math.round(23 + norm * 157);
        const b = Math.round(42 + norm * 118);
        return 'rgb(' + r + ',' + g + ',' + b + ')';
      }
      const t = (norm - 1.0) / 0.5;
      return 'rgb(' + Math.round(20 + t * 200) + ',' + Math.round(180 - t * 120) + ',' + Math.round(160 - t * 120) + ')';
    }

    function portalAppearance(openRatio) {
      const ratio = Math.max(0, Math.min(1, openRatio));
      if (ratio === 0) return { ratio, status: 'Closed', color: '#f87171', dash: 'none' };
      if (ratio === 1) return { ratio, status: 'Open', color: '#34d399', dash: '2 6' };
      return { ratio, status: 'Partial', color: '#fbbf24', dash: '8 4' };
    }

    function portalSetting(state) {
      // Support older recordings too; current recordings always carry openRatio.
      return portalAppearance(state.openRatio ?? (state.maxArea > 0 ? state.effectiveArea / state.maxArea : 0));
    }

    function openingLabel(setting) {
      return setting.status + ' (' + (setting.ratio * 100).toFixed(1) + '% open)';
    }

    function fitLayout(layout, scale, pad) {
      const xs = [0];
      const ys = [0];
      layout.rooms.forEach(r => { xs.push(r.x, r.x + r.width); ys.push(r.y, r.y + r.length); });
      layout.portals.forEach(p => {
        xs.push(p.x, p.x + (p.orientation === 'horizontal' ? p.length : 0));
        ys.push(p.y, p.y + (p.orientation === 'vertical' ? p.length : 0));
      });
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      return [minX * scale, minY * scale, (Math.max(...xs) - minX) * scale + 2 * pad, (Math.max(...ys) - minY) * scale + 2 * pad];
    }

    function drawGrid(root, bounds) {
      const defs = svgElement('defs', {});
      const pattern = svgElement('pattern', { id: 'grid', width: 20, height: 20, patternUnits: 'userSpaceOnUse' });
      pattern.append(svgElement('path', { d: 'M 20 0 L 0 0 0 20', fill: 'none', stroke: '#1e293b', 'stroke-width': 0.5 }));
      defs.append(pattern);
      root.append(defs, svgElement('rect', { x: bounds[0], y: bounds[1], width: bounds[2], height: bounds[3], fill: 'url(#grid)' }));
    }

    function drawRooms(root, layout, frame, scale, pad) {
      const cards = document.createDocumentFragment();
      layout.rooms.forEach(r => {
        const state = frame.rooms[r.roomId] || { pressurePa: 0, o2Pct: 0, tempK: 293.15, totalMoles: 0 };
        const rx = r.x * scale + pad;
        const ry = r.y * scale + pad;
        const group = svgElement('g', {});
        group.append(svgElement('rect', { x: rx, y: ry, width: r.width * scale, height: r.length * scale, fill: getPressureColor(state.pressurePa), stroke: '#475569', 'stroke-width': 2, rx: 3 }));
        group.append(svgElement('text', { x: rx + 8, y: ry + 20, 'font-family': 'monospace', 'font-size': 12, 'font-weight': 'bold', fill: '#fff' }, r.roomId));
        group.append(svgElement('text', { x: rx + 8, y: ry + 36, 'font-family': 'monospace', 'font-size': 11, fill: '#cbd5e1' }, (state.pressurePa / 1000).toFixed(1) + ' kPa'));
        group.append(svgElement('text', { x: rx + 8, y: ry + 52, 'font-family': 'monospace', 'font-size': 10, fill: '#38bdf8' }, 'O₂: ' + state.o2Pct.toFixed(0) + '%'));
        root.append(group);
        cards.append(metricCard(r.roomId, [
          ['Pressure:', (state.pressurePa / 1000).toFixed(1) + ' kPa'],
          ['Oxygen:', state.o2Pct.toFixed(1) + '%'],
          ['Moles:', state.totalMoles.toFixed(1) + ' mol'],
          ['Temp:', state.tempK.toFixed(1) + ' K'],
        ]));
      });
      roomMetrics.replaceChildren(cards);
    }

    function drawPortals(root, layout, frame, scale, pad) {
      layout.portals.forEach(p => {
        const state = frame.portals[p.portalId];
        if (!state) return;
        const setting = portalSetting(state);
        const px = p.x * scale + pad;
        const py = p.y * scale + pad;
        // Layout length is the fixed physical maximum, even when the door is closed.
        const length = p.length * scale;
        const isHorizontal = p.orientation === 'horizontal';
        const label = p.portalId + ' — ' + openingLabel(setting);
        const line = svgElement('line', {
          x1: px, y1: py, x2: isHorizontal ? px + length : px, y2: isHorizontal ? py : py + length,
          stroke: setting.color, 'stroke-width': 5, 'stroke-dasharray': setting.dash, 'stroke-linecap': 'round',
          'data-portal-id': p.portalId, 'data-open-ratio': setting.ratio, 'data-status': setting.status.toLowerCase(),
          'aria-label': label,
        });
        line.append(svgElement('title', {}, label));
        root.append(line);
      });
    }

    function renderPortalMetrics(frame) {
      const cards = Object.values(frame.portals).map(state => {
        const setting = portalSetting(state);
        const card = metricCard(state.id, [
          ['Status:', setting.status],
          ['Opening:', (setting.ratio * 100).toFixed(1) + '%'],
          ['Integrity:', ((state.structuralIntegrity ?? 1) * 100).toFixed(1) + '%'],
          ['Effective area:', state.effectiveArea.toFixed(3) + ' m²'],
          ['Maximum area:', state.maxArea.toFixed(3) + ' m²'],
          ['Pressure difference:', (state.pressureDifferencePa ?? state.flowMolS ?? 0).toFixed(1) + ' Pa'],
        ]);
        card.style.borderLeft = '3px solid ' + setting.color;
        return card;
      });
      portalMetrics.replaceChildren(...(cards.length ? cards : [element('p', 'hint', 'No portals in this recording.')]));
    }

    function renderEvents(sim, frame) {
      const events = (sim.events || []).slice().sort((a, b) => a.atSeconds - b.atSeconds);
      const appliedAt = frame.time;
      const latest = events.reduce((time, event) => event.atSeconds <= appliedAt ? Math.max(time, event.atSeconds) : time, -Infinity);
      const entries = events.map(event => {
        const applied = event.atSeconds <= appliedAt;
        const classes = 'event-entry ' + (applied ? 'applied' : 'upcoming') + (applied && event.atSeconds === latest ? ' latest' : '');
        const entry = element('li', classes);
        entry.dataset.atSeconds = event.atSeconds;
        entry.dataset.applied = String(applied);
        entry.append(element('div', 'event-heading', (applied ? '✓ Applied' : 'Upcoming') + ' · ' + (event.label || 'Portal setting change')));
        entry.append(element('div', 'event-detail', 'Planned ' + formatTime(event.atSeconds) + ' · ' + event.portalId + ' → ' + openingLabel(portalAppearance(event.openRatio))));
        return entry;
      });
      eventLog.replaceChildren(...(entries.length ? entries : [element('li', 'hint', 'No scheduled portal events in this recording.')]));
    }

    function initView() {
      const sim = data[activeSimIndex];
      simSelect.title = sim.testName;
      scrubber.max = Math.max(0, sim.frames.length - 1);
      scrubber.disabled = sim.frames.length < 2;
      playBtn.disabled = sim.frames.length < 2;
      renderFrame();
    }

    function renderFrame() {
      const sim = data[activeSimIndex];
      const frame = sim.frames[currentFrameIdx];
      stepBackBtn.disabled = currentFrameIdx === 0;
      stepFwdBtn.disabled = currentFrameIdx >= sim.frames.length - 1;
      scrubber.value = currentFrameIdx;
      if (!frame) {
        canvas.replaceChildren();
        roomMetrics.replaceChildren();
        portalMetrics.replaceChildren();
        eventLog.replaceChildren(element('li', 'hint', 'No recorded frames.'));
        timeLabel.textContent = 'No recorded frames';
        return;
      }
      timeLabel.textContent = formatTime(frame.time) + ' / ' + formatTime(sim.totalTime);
      const scale = sim.layout.scale || 40;
      const pad = 40;
      const bounds = fitLayout(sim.layout, scale, pad);
      canvas.setAttribute('viewBox', bounds.join(' '));
      const root = document.createDocumentFragment();
      drawGrid(root, bounds);
      drawRooms(root, sim.layout, frame, scale, pad);
      drawPortals(root, sim.layout, frame, scale, pad);
      canvas.replaceChildren(root);
      renderPortalMetrics(frame);
      renderEvents(sim, frame);
    }

    function scheduleNextFrame() {
      const sim = data[activeSimIndex];
      if (!isPlaying || currentFrameIdx >= sim.frames.length - 1) { pause(); return; }
      const generation = playbackGeneration;
      const deltaSeconds = sim.frames[currentFrameIdx + 1].time - sim.frames[currentFrameIdx].time;
      animTimer = setTimeout(() => {
        if (!isPlaying || generation !== playbackGeneration) return;
        animTimer = null;
        currentFrameIdx++;
        renderFrame();
        scheduleNextFrame();
      }, Math.max(0, deltaSeconds * 1000 / playbackRate));
    }

    function play() {
      pause();
      const sim = data[activeSimIndex];
      if (sim.frames.length < 2) return;
      if (currentFrameIdx >= sim.frames.length - 1) { currentFrameIdx = 0; renderFrame(); }
      isPlaying = true;
      playBtn.textContent = '⏸ Pause';
      scheduleNextFrame();
    }

    function pause() {
      isPlaying = false;
      playbackGeneration++;
      playBtn.textContent = '▶ Play';
      if (animTimer !== null) clearTimeout(animTimer);
      animTimer = null;
    }

    playBtn.addEventListener('click', () => isPlaying ? pause() : play());
    scrubber.addEventListener('input', (e) => {
      pause();
      currentFrameIdx = parseInt(e.target.value, 10);
      renderFrame();
    });

    stepBackBtn.addEventListener('click', () => {
      pause();
      if (currentFrameIdx > 0) { currentFrameIdx--; renderFrame(); }
    });

    stepFwdBtn.addEventListener('click', () => {
      pause();
      const sim = data[activeSimIndex];
      if (currentFrameIdx < sim.frames.length - 1) { currentFrameIdx++; renderFrame(); }
    });

    document.querySelectorAll('.speed-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.speed-btn').forEach(b => b.style.borderColor = '#334155');
        btn.style.borderColor = 'var(--accent)';
        playbackRate = parseFloat(btn.dataset.speed);
        if (isPlaying) play();
      });
    });

    initView();
  </script>
</body>
</html>`;
  }
}
