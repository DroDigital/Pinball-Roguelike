/** Floating number pops ("+1.5") rendered as pooled sprites over the playfield. */
import * as THREE from 'three';

interface Pop {
  sprite: THREE.Sprite;
  ctx: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
  t: number;
  life: number;
  vy: number;
}

export function formatCoins(v: number): string {
  if (v >= 1000) return `${Math.round(v / 100) / 10}K`;
  if (v >= 10) return String(Math.round(v));
  return (Math.round(v * 10) / 10).toString();
}

export class NumberPops {
  readonly group = new THREE.Group();
  private pool: Pop[] = [];
  private next = 0;
  scale = 1;

  constructor(size = 28) {
    for (let i = 0; i < size; i++) {
      const c = document.createElement('canvas');
      c.width = 96;
      c.height = 24;
      const ctx = c.getContext('2d')!;
      const tex = new THREE.CanvasTexture(c);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.visible = false;
      sprite.renderOrder = 10;
      this.group.add(sprite);
      this.pool.push({ sprite, ctx, tex, t: 0, life: 0, vy: 0 });
    }
  }

  spawn(text: string, pos: THREE.Vector3, color = '#ffd25a', big = false): void {
    const p = this.pool[this.next];
    this.next = (this.next + 1) % this.pool.length;
    const g = p.ctx;
    g.clearRect(0, 0, 96, 24);
    g.font = `bold ${big ? 20 : 16}px "Courier New", monospace`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 4;
    g.strokeStyle = 'rgba(0,0,0,0.9)';
    g.strokeText(text, 48, 12);
    g.fillStyle = color;
    g.fillText(text, 48, 12);
    p.tex.needsUpdate = true;
    p.sprite.position.copy(pos);
    const s = (big ? 4.2 : 3.2) * this.scale;
    p.sprite.scale.set(s, s / 4, 1);
    p.sprite.visible = true;
    (p.sprite.material as THREE.SpriteMaterial).opacity = 1;
    p.t = 0;
    p.life = big ? 1.4 : 0.9;
    p.vy = big ? 2.2 : 3.2;
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (!p.sprite.visible) continue;
      p.t += dt;
      p.sprite.position.y += p.vy * dt;
      p.vy *= Math.exp(-dt * 2);
      const k = p.t / p.life;
      (p.sprite.material as THREE.SpriteMaterial).opacity =
        k < 0.6 ? 1 : Math.max(0, 1 - (k - 0.6) / 0.4);
      if (p.t >= p.life) p.sprite.visible = false;
    }
  }
}
