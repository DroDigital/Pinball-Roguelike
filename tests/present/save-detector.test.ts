import { describe, expect, it } from 'vitest';
import { SaveDetector } from '../../src/present/save-detector';
import { SimBall } from '../../src/sim/sim';

const ball = (x: number, y: number, vy: number): SimBall => {
  const b = new SimBall(1);
  b.inShooter = false;
  Object.assign(b, { x, y, vy });
  return b;
};

describe('last-second save detector', () => {
  it('fires when a ball falling through the gap is sent back up', () => {
    const d = new SaveDetector();
    expect(d.update([ball(9.2, 4.8, -9)], 1)).toBe(false);
    expect(d.update([ball(9.4, 5.2, 12)], 1.1)).toBe(true);
    // Only once per doomed moment.
    expect(d.update([ball(9.4, 6, 10)], 1.15)).toBe(false);
  });

  it('ignores routine flips from the cradle and slow rebounds', () => {
    const d = new SaveDetector();
    expect(d.update([ball(12.6, 5.5, -4)], 1)).toBe(false);
    expect(d.update([ball(12.6, 5.6, 14)], 1.05)).toBe(false);
    expect(d.update([ball(9.2, 4.8, -9)], 2)).toBe(false);
    expect(d.update([ball(9.2, 5, 3)], 2.05)).toBe(false);
    // Too late to count.
    expect(d.update([ball(9.2, 5, 12)], 3)).toBe(false);
  });
});
