import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildHarborWorld,
  buildSoloShipWorld,
  ensureShipSystems,
  FUEL_PER_CELL,
  plotVoyage,
  restartShipReactor,
  syncEngineFuel,
  tryBuy,
  type World,
} from '@kybernetes/sim-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_CLOCKS, SimHost } from './SimHost.js';
import {
  loadShipRegistryFromFile,
  loadShipRegistryFromJson,
  loadWorldFromFile,
  loadWorldFromJson,
  saveShipRegistryToFile,
  saveWorldToFile,
} from './shipStore.js';

function voyagingWorld(): World {
  let world = ensureShipSystems(buildSoloShipWorld(), 'ship');
  world = restartShipReactor(world, 'ship');
  world = syncEngineFuel(world, 'ship', 2 * FUEL_PER_CELL);
  const plotted = plotVoyage(world, 'ship', 'hub_b', {
    hot: true,
    powered: true,
    engineFuel: 2 * FUEL_PER_CELL,
  });
  if (plotted.reject !== undefined) throw new Error('plot rejected: ' + plotted.reject);
  world = plotted.world;
  const bought = tryBuy(world.market, 'hub_a', [{ goodId: 'scrap', qty: 2 }], 1000, world.timeMs);
  if (!bought.ok) throw new Error('buy rejected: ' + bought.reason);
  return { ...world, market: bought.ledger };
}

describe('shipStore persistence (Strike 4 save-kill-load)', () => {
  let dir = '';

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'strike4-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('resumes at the same hub with dock seals, market stock, and nav leg', () => {
    const host = new SimHost(buildSoloShipWorld(), DEFAULT_CLOCKS, null);
    host.spawnAboardOwnShip('c1', 'Rook', '#fff', 'u1');
    host.debugSetWorld(voyagingWorld());

    const worldPath = join(dir, 'world.json');
    const shipsPath = join(dir, 'ships.json');
    saveWorldToFile(worldPath, host.currentWorld, 9000);
    saveShipRegistryToFile(
      worldPath + '.ships',
      loadShipRegistryFromJson(host.exportShips(9000)),
      9000
    );
    writeFileSync(shipsPath, host.exportShips(9000), 'utf8');
    host.stop();

    const killed = new SimHost(buildHarborWorld(), DEFAULT_CLOCKS, null);
    expect(Object.keys(killed.currentWorld.stations)).toHaveLength(1);

    const restored = killed.restoreWorld(readFileSync(worldPath, 'utf8'));
    expect(restored).toEqual({ ok: true });
    const imported = killed.importShips(readFileSync(shipsPath, 'utf8'));
    expect(imported).toEqual({ ok: true, count: 1 });

    const world = killed.currentWorld;
    expect(Object.keys(world.stations)).toHaveLength(4);
    expect(Object.keys(world.docks).sort()).toEqual(Object.keys(voyagingWorld().docks).sort());
    expect(world.ships.ship?.nav.phase).toBe('in_transit');
    expect(world.ships.ship?.nav.destHubId).toBe('hub_b');
    expect(world.market.stock.hub_a?.scrap).toBe(48);
    expect(world.cargo.crates['bay:scrap-a']).toBeDefined();
    expect(killed.shipRecordFor('u1')?.alive).toBe(true);
    expect(killed.shipRecordFor('u1')?.credits).toBe(50);

    const fromFile = loadWorldFromFile(worldPath);
    expect(fromFile?.ships.ship?.nav.destHubId).toBe('hub_b');
    expect(loadShipRegistryFromFile(shipsPath).get('u1')?.shipId).toBe('ship:u1');
    killed.stop();
  });

  it('rejects corrupt files with the wipe path and keeps the loss wipe', () => {
    const badWorld = join(dir, 'bad-world.json');
    const badShips = join(dir, 'bad-ships.json');
    writeFileSync(badWorld, '{{{not json', 'utf8');
    writeFileSync(badShips, JSON.stringify({ version: 3, universeRev: 999, ships: {} }), 'utf8');
    expect(loadWorldFromFile(badWorld)).toBeUndefined();
    expect(loadWorldFromJson('{{{')).toBeUndefined();
    expect(loadShipRegistryFromFile(badShips).size).toBe(0);
    expect(loadShipRegistryFromFile(join(dir, 'missing.json')).size).toBe(0);

    const host = new SimHost(buildSoloShipWorld(), DEFAULT_CLOCKS, null);
    expect(host.restoreWorld('{{{')).toEqual({
      ok: false,
      error: 'bad-json: save is not valid JSON',
    });
    expect(host.importShips('{}')).toEqual({
      ok: false,
      error: 'bad-version: unknown ship store version',
    });

    host.spawnAboardOwnShip('c1', 'Rook', '#fff', 'u1');
    host.loseShipFor('u1', 'reactor', 10, 1050);
    const reloaded = loadShipRegistryFromJson(host.exportShips(1100));
    expect(reloaded.get('u1')?.alive).toBe(false);
    host.stop();
  });

  it('fires the persist sink on its interval without touching the tick', () => {
    const seen: Array<{ world: string; ships: string }> = [];
    const host = new SimHost(buildSoloShipWorld(), DEFAULT_CLOCKS, null, {
      persist: {
        everyMs: 1000,
        sink: (worldJson: string, shipsJson: string) => {
          seen.push({ world: worldJson, ships: shipsJson });
        },
      },
    });
    const before = host.currentWorld.tick;
    expect(host.maybePersist(500)).toBe(false);
    expect(host.maybePersist(1500)).toBe(true);
    expect(host.maybePersist(1600)).toBe(false);
    expect(seen).toHaveLength(1);
    expect(host.currentWorld.tick).toBe(before);
    host.stop();
  });
});
