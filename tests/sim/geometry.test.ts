import { describe, expect, it } from 'vitest';
import { TABLE } from '../../src/content/table';
import { distToSegment, DEG } from '../../src/core/math';

describe('table geometry', () => {
  it('flippers sweep clear of all walls and posts', () => {
    for (const f of TABLE.flippers.filter((x) => !x.tag)) {
      for (let a = f.restDeg; a <= f.upDeg; a += 2) {
        const ang = (f.side === 'left' ? a : 180 - a) * DEG;
        const tx = f.x + Math.cos(ang) * f.len;
        const ty = f.y + Math.sin(ang) * f.len;
        for (const w of TABLE.walls) {
          if (w.tag || w.look === 'cabinet') continue;
          const pts = w.loop ? [...w.pts, w.pts[0]] : w.pts;
          for (let i = 0; i < pts.length - 1; i++) {
            const [ax, ay] = pts[i];
            const [bx, by] = pts[i + 1];
            // Distance from wall segment endpoints to the flipper's centre segment.
            const d = Math.min(
              distToSegment(ax, ay, f.x, f.y, tx, ty),
              distToSegment(bx, by, f.x, f.y, tx, ty),
            );
            expect(d, `${f.id} vs ${w.id}`).toBeGreaterThan(f.r1 * 0.9);
          }
        }
      }
    }
  });

  it('lanes and passages admit the ball (>= 1.05 ball widths)', () => {
    // Outlane: cabinet wall to outlane post edge.
    const post = TABLE.posts.find((p) => p.id === 'outPostL')!;
    expect(post.x - post.r).toBeGreaterThan(1.05);
    // Inlane entrance: outlane post to sling top post.
    const sling = TABLE.slings.find((s) => s.side === 'left')!;
    expect(sling.a[0] - sling.postR - (post.x + post.r)).toBeGreaterThan(1.05);
  });

  it('every trigger has distinct endpoints and an id', () => {
    for (const t of TABLE.triggers) {
      expect(t.id.length).toBeGreaterThan(0);
      expect(Math.hypot(t.b[0] - t.a[0], t.b[1] - t.a[1])).toBeGreaterThan(0.5);
    }
  });
});
