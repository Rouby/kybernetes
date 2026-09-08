import { type ChildProcess, execSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { expect, type Page } from '@playwright/test';

interface E2ESocketWindow {
  __kybernetesSocket?: WebSocket;
}

/**
 * Wait until the harbor socket reports OPEN.
 */
export async function waitForHarborSocket(page: Page, timeout = 20_000): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(
          () => (window as unknown as E2ESocketWindow).__kybernetesSocket?.readyState === 1
        ),
      { timeout }
    )
    .toBe(true);
}

/**
 * Board the harbor client: load ?harbor=1, wait for canvas, socket, JOINED
 * handshake, and the first SNAPSHOT. Returns the canvas locator.
 */
export async function harborBoard(
  page: Page,
  options: { beacon?: string; callsign?: string } = {}
) {
  const params = new URLSearchParams({ harbor: '1', debug: '1' });
  if (options.beacon !== undefined) params.set('beacon', options.beacon);
  if (options.callsign !== undefined) params.set('callsign', options.callsign);
  await page.goto(`/?${params.toString()}`);
  const canvas = page.getByTestId('harbor-canvas');
  await expect(canvas).toBeVisible();
  await waitForHarborSocket(page);
  await waitForHarbor(page, 'harbor-pawn', (t) => t !== '' && t !== '-', 20000);
  await waitForHarbor(page, 'harbor-status', (t) => t.includes('room:'), 20000);
  await waitForHarbor(page, 'harbor-vitals', (t) => t.includes('hp:'), 20000);
  return canvas;
}

/**
 * Start a private harbor daemon for the calling spec file and wait until it
 * accepts sockets. Each spec file owns its daemon (started in beforeAll,
 * stopped in afterAll) so hires, departures, door states, and crew lists
 * never leak across files — no test may assume a fresh shared server.
 */
export async function startDaemon(port = 3001): Promise<ChildProcess> {
  freePort(port);
  const serverDir = resolveServerDir();
  const child = spawn(`yarn --cwd ${serverDir} start`, {
    shell: true,
    env: { ...process.env, PORT: String(port) },
    stdio: 'ignore',
  });
  try {
    await waitForPort(port, 30000);
    return child;
  } catch (err) {
    stopDaemon(child);
    throw err;
  }
}

export async function stopDaemon(child: ChildProcess | null): Promise<void> {
  if (child === null || child.exitCode !== null) return;
  child.kill('SIGTERM');
  const exited = await Promise.race([
    new Promise<boolean>((resolve) => {
      child.on('exit', () => resolve(true));
    }),
    new Promise<boolean>((resolve) => {
      setTimeout(() => resolve(false), 10000);
    }),
  ]);
  if (!exited && child.pid !== undefined) {
    try {
      execSync(`taskkill /F /PID ${child.pid}`);
    } catch {
      // Already gone; the port release is what matters.
    }
  }
}

function resolveServerDir(): string {
  const fromPackage = path.resolve(process.cwd(), '../server');
  if (existsSync(path.join(fromPackage, 'package.json'))) return fromPackage;
  return path.resolve(process.cwd(), 'apps/server');
}

function freePort(port: number): void {
  if (process.platform !== 'win32') return;
  try {
    const out = execSync(
      `powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)"`
    ).toString();
    for (const pid of out.split(/\s+/)) {
      if (/^\d+$/.test(pid) && Number(pid) !== process.pid) execSync(`taskkill /F /PID ${pid}`);
    }
  } catch {
    // Best effort: a conflicting listener surfaces as a readiness timeout.
  }
}

function waitForPort(port: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const probe = (): void => {
      const socket = net.connect(port, '127.0.0.1');
      socket.on('connect', () => {
        socket.end();
        resolve();
      });
      socket.on('error', () => {
        socket.destroy();
        if (Date.now() - start > timeoutMs) reject(new Error(`daemon port ${port} never opened`));
        else setTimeout(probe, 250);
      });
    };
    probe();
  });
}

/** Read a harbor HUD readout by test id. */
export async function harborText(page: Page, testId: string): Promise<string> {
  return page.getByTestId(testId).innerText();
}

/** Poll a harbor HUD readout until the predicate holds. */
export async function waitForHarbor(
  page: Page,
  testId: string,
  pred: (text: string) => boolean,
  timeoutMs: number
): Promise<string> {
  const start = Date.now();
  let text = await harborText(page, testId);
  while (!pred(text)) {
    if (Date.now() - start > timeoutMs) throw new Error(`harbor timeout; last ${testId}: ${text}`);
    await page.waitForTimeout(200);
    text = await harborText(page, testId);
  }
  return text;
}

export function statX(text: string): number {
  return Number(/x:(-?\d+)/.exec(text)?.[1] ?? Number.NaN);
}

export function statSX(text: string): number {
  return Number(/sx:(-?\d+)/.exec(text)?.[1] ?? Number.NaN);
}

export function statFace(text: string): number {
  return Number(/face:(-?\d+)/.exec(text)?.[1] ?? Number.NaN);
}

export function angDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

export function statRoom(text: string): string {
  return /room:([A-Za-z_]+)/.exec(text)?.[1] ?? '';
}
