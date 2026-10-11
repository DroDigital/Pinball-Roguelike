/** Cracks in the playfield glass (JAILBREAK): jagged lines out from a few impact points. */
export function paintCracks(c: HTMLCanvasElement, seed: number): void {
  const W = (c.width = 480);
  const H = (c.height = 270);
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, W, H);
  let s = seed >>> 0 || 1;
  const rnd = () => (s = Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) >>> 0) / 4294967296;
  g.strokeStyle = 'rgba(230,240,255,0.55)';
  g.lineWidth = 1;
  for (let hit = 0; hit < 3; hit++) {
    const cx = W * (0.2 + rnd() * 0.6);
    const cy = H * (0.2 + rnd() * 0.6);
    const rays = 7 + Math.floor(rnd() * 5);
    for (let r = 0; r < rays; r++) {
      let a = (r / rays) * Math.PI * 2 + rnd() * 0.4;
      let x = cx;
      let y = cy;
      g.beginPath();
      g.moveTo(x, y);
      const len = 40 + rnd() * 140;
      for (let d = 0; d < len; d += 8 + rnd() * 10) {
        a += (rnd() - 0.5) * 0.5;
        x += Math.cos(a) * 12;
        y += Math.sin(a) * 12;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    // A ring of short cross-cracks round the impact.
    g.beginPath();
    g.arc(cx, cy, 10 + rnd() * 14, 0, Math.PI * 2);
    g.stroke();
  }
}
