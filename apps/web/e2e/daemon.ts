import { type ChildProcess, execSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

/**
 * Start a private harbor daemon for the calling spec file and wait until it
 * accepts sockets. Each spec file owns its daemon on an ephemeral port
 * (started in beforeAll, stopped in afterAll) so world state never leaks
 * across files and a stale server on 3001 cannot taint results.
 */

export interface StartedDaemon {
  readonly child: ChildProcess;
  readonly port: number;
}

export async function startDaemon(port?: number): Promise<StartedDaemon> {
  if (port !== undefined) return launchDaemon(port);
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const free = await findFreePort();
    try {
      return await launchDaemon(free);
    } catch (err) {
      lastError = err;
    }
  }
  if (lastError instanceof Error) throw lastError;
  throw new Error('harbor daemon failed to start');
}

export async function stopDaemon(
  daemon: StartedDaemon | ChildProcess | null | undefined
): Promise<void> {
  const child = normalizeChild(daemon);
  if (child === null || child.exitCode !== null) return;
  try {
    child.kill('SIGTERM');
  } catch {
    return;
  }
  const exited = await waitForExit(child, 10000);
  if (!exited) killTree(child);
}

/** Page URL for the spec's private daemon; throws when the daemon is missing. */
export function harborUrl(daemon: StartedDaemon | null, extra = ''): string {
  if (daemon === null) throw new Error('harbor daemon not started');
  const suffix = extra === '' ? '' : `&${extra}`;
  return `/?harbor=1&harborPort=${daemon.port}${suffix}`;
}

async function launchDaemon(port: number): Promise<StartedDaemon> {
  const child = spawnServer(port);
  try {
    await waitForReady(child, port, 30000);
    return { child, port };
  } catch (err) {
    await stopDaemon(child);
    throw err;
  }
}

function spawnServer(port: number): ChildProcess {
  const entry = resolveServerEntry();
  return spawn(process.execPath, [entry.file], {
    cwd: entry.cwd,
    env: { ...process.env, PORT: String(port) },
    stdio: 'ignore',
    windowsHide: true,
  });
}

function normalizeChild(
  daemon: StartedDaemon | ChildProcess | null | undefined
): ChildProcess | null {
  if (daemon === null || daemon === undefined) return null;
  if ('child' in daemon) return (daemon as StartedDaemon).child;
  return daemon as ChildProcess;
}

function waitForReady(child: ChildProcess, port: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const onExit = (): void => {
      if (settled) return;
      settled = true;
      reject(new Error(`daemon on port ${port} exited before opening`));
    };
    child.once('exit', onExit);
    waitForPort(port, timeoutMs).then(
      () => {
        if (settled) return;
        settled = true;
        child.off('exit', onExit);
        resolve();
      },
      (err: unknown) => {
        if (settled) return;
        settled = true;
        child.off('exit', onExit);
        reject(err instanceof Error ? err : new Error(`daemon port ${port} never opened`));
      }
    );
  });
}

function waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (child.exitCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    if (typeof timer.unref === 'function') timer.unref();
    child.once('exit', () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

function killTree(child: ChildProcess): void {
  if (child.pid === undefined || child.exitCode !== null) return;
  if (process.platform !== 'win32') {
    try {
      child.kill('SIGKILL');
    } catch {
      // Already gone; the port release is what matters.
    }
    return;
  }
  try {
    execSync(`taskkill /F /T /PID ${child.pid}`);
  } catch {
    // Already gone; the port release is what matters.
  }
}

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

function resolveServerEntry(): { cwd: string; file: string } {
  const cwd = resolveServerDir();
  const file = path.join(cwd, 'dist', 'boot.mjs');
  if (!existsSync(file))
    throw new Error(`harbor daemon entry missing at ${file}; run yarn build first`);
  return { cwd, file };
}

function resolveServerDir(): string {
  const fromPackage = path.resolve(process.cwd(), '../server');
  if (existsSync(path.join(fromPackage, 'package.json'))) return fromPackage;
  return path.resolve(process.cwd(), 'apps/server');
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
