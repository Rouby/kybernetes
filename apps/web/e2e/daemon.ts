import { type ChildProcess, execSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

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
