/**
 * DebugHud: framework-free ?debug=1 status panel (Phase 3 Round 12).
 * Mirrors SessionDebugHud testids and wording via the shared sessionHud
 * builders so e2e keeps passing under the vanilla session. Plain DOM.
 */

import type { ManifestBroadcast, WatchBroadcast } from '@kybernetes/protocol';
import type { InteractTarget } from '../harbor/interactTarget';
import { dockChipText } from '../harbor/renderState';
import {
  describeTarget,
  noticesLine,
  offerLine,
  statusLine,
  storesLine,
  vitalsLine,
} from '../harbor/sessionHud';
import type { PredictedPose } from './stores/MovementController';
import type { SocketStoreState } from './stores/SocketStore';

type HudRow =
  | 'pawn'
  | 'target'
  | 'status'
  | 'dock'
  | 'pos'
  | 'vitals'
  | 'stores'
  | 'watch'
  | 'manifest'
  | 'offer'
  | 'notices';

const ROW_TESTIDS: Record<HudRow, string> = {
  pawn: 'harbor-pawn',
  target: 'harbor-target',
  status: 'harbor-status',
  dock: 'harbor-dock',
  pos: 'harbor-pos',
  vitals: 'harbor-vitals',
  stores: 'harbor-stores',
  watch: 'harbor-watch',
  manifest: 'harbor-manifest',
  offer: 'harbor-offer',
  notices: 'harbor-notices',
};

export class DebugHud {
  private readonly rows: Record<HudRow, HTMLDivElement>;
  private last: Record<HudRow, string> = {
    pawn: '',
    target: '',
    status: '',
    dock: '',
    pos: '',
    vitals: '',
    stores: '',
    watch: '',
    manifest: '',
    offer: '',
    notices: '',
  };

  constructor(root: HTMLElement) {
    const box = document.createElement('div');
    box.style.position = 'absolute';
    box.style.top = '8px';
    box.style.left = '8px';
    box.style.zIndex = '10';
    box.style.pointerEvents = 'none';
    box.style.color = '#cfd8e3';
    const rows = {} as Record<HudRow, HTMLDivElement>;
    (Object.keys(ROW_TESTIDS) as HudRow[]).forEach((row) => {
      rows[row] = appendRow(box, ROW_TESTIDS[row]);
    });
    root.appendChild(box);
    this.rows = rows;
  }

  public update(
    store: SocketStoreState,
    predicted: PredictedPose | null,
    target: InteractTarget | null
  ): void {
    this.set('pawn', store.pawnId ?? '-');
    this.set('target', describeTarget(target));
    this.set('status', statusLine(store));
    this.set('dock', dockChipText(store.dock));
    this.set(
      'pos',
      predicted === null ? 'x:? y:?' : `x:${Math.round(predicted.x)} y:${Math.round(predicted.y)}`
    );
    this.set('vitals', vitalsLine(store));
    this.set('stores', storesLine(store.shipStatus));
    this.set('watch', watchLine(store.watch));
    this.set('manifest', manifestLine(store.manifest));
    this.set('offer', offerLine(store.offer));
    this.set('notices', noticesLine(store.notices));
  }

  private set(row: HudRow, text: string): void {
    if (this.last[row] === text) return;
    this.last[row] = text;
    this.rows[row].textContent = text;
  }
}

function watchLine(watch: WatchBroadcast | null): string {
  if (watch === null) return 'watch:none';
  const done = watch.checklist.filter((task) => task.done).length;
  return (
    'watch#' +
    watch.watchNo +
    ' ' +
    watch.remainingS +
    's ' +
    watch.grade +
    ' tasks:' +
    done +
    '/' +
    watch.checklist.length
  );
}

function manifestLine(manifest: ManifestBroadcast | null): string {
  if (manifest === null) return 'crew:-';
  return (
    'beacon:' +
    manifest.beacon +
    ' crew:' +
    manifest.crew.map((entry) => `${entry.callsign}:${entry.role}`).join(',')
  );
}

function appendRow(box: HTMLElement, testid: string): HTMLDivElement {
  const row = document.createElement('div');
  row.dataset.testid = testid;
  box.appendChild(row);
  return row;
}
