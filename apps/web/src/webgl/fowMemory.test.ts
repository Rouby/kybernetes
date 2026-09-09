import { updateExplorationGrid } from '@kybernetes/sim-core';
import { describe, expect, it } from 'vitest';
import {
  clearFowGrid,
  createFowGrid,
  type FowStorage,
  fowStorageKey,
  loadFowGrid,
  saveFowGrid,
} from './fowMemory';

function memoryStorage(): FowStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}

describe('fowMemory persistence', () => {
  it('keys exploration per beacon and user', () => {
    expect(fowStorageKey('HESP01', 'u-1')).toBe('kybernetes.fow.v1:HESP01:u-1');
    expect(fowStorageKey('HESP01', 'u-2')).not.toBe(fowStorageKey('HESP01', 'u-1'));
  });

  it('round-trips explored cells through storage', () => {
    const storage = memoryStorage();
    const grid = createFowGrid();
    updateExplorationGrid(
      grid,
      [
        { x: 600, y: 200 },
        { x: 700, y: 200 },
        { x: 700, y: 300 },
        { x: 600, y: 300 },
      ],
      { x: 650, y: 250 },
      0
    );
    saveFowGrid(storage, 'HESP01', 'u-1', grid);
    const restored = loadFowGrid(storage, 'HESP01', 'u-1');
    expect(restored).not.toBeNull();
    expect(restored?.cols).toBe(grid.cols);
  });

  it('returns null on first run or corrupt payloads', () => {
    const storage = memoryStorage();
    expect(loadFowGrid(storage, 'HESP01', 'fresh')).toBeNull();
    storage.setItem('kybernetes.fow.v1:HESP01:broken', '{oops');
    expect(loadFowGrid(storage, 'HESP01', 'broken')).toBeNull();
    storage.setItem('kybernetes.fow.v1:HESP01:typed', '"nope"');
    expect(loadFowGrid(storage, 'HESP01', 'typed')).toBeNull();
  });

  it('clears stored exploration', () => {
    const storage = memoryStorage();
    saveFowGrid(storage, 'HESP01', 'u-1', createFowGrid());
    clearFowGrid(storage, 'HESP01', 'u-1');
    expect(loadFowGrid(storage, 'HESP01', 'u-1')).toBeNull();
  });

  it('survives quota failures without throwing', () => {
    const failing: FowStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(() => saveFowGrid(failing, 'HESP01', 'u-1', createFowGrid())).not.toThrow();
  });
});
