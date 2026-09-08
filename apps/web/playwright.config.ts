import { defineConfig, devices } from '@playwright/test';

const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  snapshotDir: './e2e/__snapshots__',
  // Files run in parallel; tests within a file stay serial. Rationale, learned
  // the hard way: quickBoard mints a fresh room per call so files never share
  // server state, but milestone5/shift_loop coordinate shared rooms IN-FILE
  // (multi-page co-op, dossier persistence, 90s checklist). Overlapping those
  // same-room tests across workers duplicates roster entries, races
  // disembark/rejoin flows, and saturates the single Node game server, which
  // starves every vessel's broadcasts until the 60s test cap. File-level
  // parallelism keeps the proven-green serial semantics per file.
  fullyParallel: false,
  // One private daemon per file (see helpers startDaemon): files run serially
  // so daemon restarts never overlap on the port.
  workers: 1,
  retries: isCI ? 2 : 1,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  reporter: isCI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      // Production artifact (dist/), not tsx watch: Gate 5 output is what ships.
      // The harbor daemon is NOT managed here: each spec file starts its own
      // private daemon in beforeAll (see e2e/helpers startDaemon) so world
      // state never leaks across files.
      command: 'yarn preview --port 3000 --strictPort',
      url: 'http://localhost:3000',
      reuseExistingServer: true,
      timeout: 120000,
    },
  ],
});
