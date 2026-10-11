import { describe, expect, it } from 'vitest';
import { CoinTray } from '../../src/present/coins';

describe('coin tray', () => {
  it('pours coins that all come to rest, and empties', () => {
    const t = new CoinTray();
    t.pour(30);
    expect(t.count).toBe(30);
    for (let i = 0; i < 240; i++) t.update(1 / 60);
    expect(t.count).toBe(30);
    // Everything has landed: nothing left in the air to clink.
    expect(t.update(1 / 60)).toBe(0);
    t.clear();
    expect(t.count).toBe(0);
  });

  it('caps at the pool size', () => {
    const t = new CoinTray();
    t.pour(500);
    expect(t.count).toBe(140);
    t.setPile(20);
    expect(t.count).toBe(20);
  });
});
