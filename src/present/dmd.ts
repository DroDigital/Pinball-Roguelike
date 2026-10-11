/**
 * The 128x32 orange dot-matrix display. Content is composed into a dot buffer (16 brightness
 * levels) each frame: an idle status page, priority takeovers (callouts/animations) and
 * scrolling Warden messages. Drawn as round dots to a canvas used both as a HUD element and
 * as a texture on the backbox.
 */
import { FONT_LARGE, FONT_SMALL, textWidth, type PixelFont } from './dmd-font';

export const DMD_W = 128;
export const DMD_H = 32;

export interface DmdCallout {
  text: string;
  sub?: string;
  priority: number;
  anim?: string;
  duration?: number;
}

interface Active extends DmdCallout {
  t: number;
  duration: number;
}

export type DmdAnim = (d: Dmd, t: number, c: Active) => void;

export class Dmd {
  readonly buf = new Uint8Array(DMD_W * DMD_H);
  readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  private readonly dot: number;
  private queue: Active[] = [];
  private current: Active | null = null;
  private scroll: { text: string; x: number; speed: number } | null = null;
  private readonly anims = new Map<string, DmdAnim>();
  /** Idle page content provider. */
  idle: (d: Dmd, time: number) => void = () => {};
  time = 0;
  /** Any change since last draw (to skip texture uploads). */
  dirty = true;

  constructor(dotPx = 4) {
    this.dot = dotPx;
    this.canvas = document.createElement('canvas');
    this.canvas.width = DMD_W * dotPx;
    this.canvas.height = DMD_H * dotPx;
    this.g = this.canvas.getContext('2d')!;
    this.initLayers();
    registerDefaultAnims(this);
  }

  registerAnim(name: string, fn: DmdAnim): void {
    this.anims.set(name, fn);
  }

  // ------------------------------------------------------------------ drawing primitives

  clear(): void {
    this.buf.fill(0);
  }

  set(x: number, y: number, v = 15): void {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= DMD_W || y >= DMD_H) return;
    const i = y * DMD_W + x;
    if (v > this.buf[i]) this.buf[i] = v;
  }

  rect(x: number, y: number, w: number, h: number, v = 15, fill = true): void {
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++)
        if (fill || i === 0 || j === 0 || i === w - 1 || j === h - 1) this.set(x + i, y + j, v);
  }

  line(x0: number, y0: number, x1: number, y1: number, v = 15): void {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++)
      this.set(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), v);
  }

  text(
    s: string,
    x: number,
    y: number,
    opts: {
      font?: PixelFont;
      scale?: number;
      v?: number;
      align?: 'left' | 'center' | 'right';
    } = {},
  ): number {
    const font = opts.font ?? FONT_LARGE;
    const scale = opts.scale ?? 1;
    const v = opts.v ?? 15;
    const w = textWidth(font, s, scale);
    let cx = opts.align === 'center' ? Math.round(x - w / 2) : opts.align === 'right' ? x - w : x;
    for (const ch of s) {
      const rows = font.glyph(ch);
      for (let r = 0; r < font.h; r++) {
        const bits = rows[r] ?? 0;
        for (let c = 0; c < font.w; c++) {
          if (bits & (1 << (font.w - 1 - c))) {
            for (let sy = 0; sy < scale; sy++)
              for (let sx = 0; sx < scale; sx++)
                this.set(cx + c * scale + sx, y + r * scale + sy, v);
          }
        }
      }
      cx += (font.w + font.spacing) * scale;
    }
    return w;
  }

  /** Largest scale (1..4) at which text fits the given width. */
  fitScale(s: string, font: PixelFont, maxW: number, maxScale = 3): number {
    for (let k = maxScale; k > 1; k--) if (textWidth(font, s, k) <= maxW) return k;
    return 1;
  }

  // ------------------------------------------------------------------ content

  show(c: DmdCallout): void {
    // Table action outranks the Warden's scrolling chatter.
    if (c.priority >= 3) this.scroll = null;
    const a: Active = { ...c, t: 0, duration: c.duration ?? (c.priority >= 5 ? 2.2 : 1.4) };
    if (!this.current || a.priority >= this.current.priority) {
      if (this.current && this.current.priority > a.priority) this.queue.push(this.current);
      this.current = a;
    } else this.queue.push(a);
    this.queue.sort((x, y) => y.priority - x.priority);
    if (this.queue.length > 6) this.queue.length = 6;
  }

  /** Scroll a message right-to-left across the display (the Warden speaks). */
  say(text: string, speed = 40): void {
    this.scroll = { text: text.toUpperCase(), x: DMD_W, speed };
  }

  /** End the current takeover now. */
  cut(): void {
    this.current = this.queue.shift() ?? null;
  }

  get busy(): boolean {
    return this.current !== null || this.scroll !== null;
  }

  update(dt: number): void {
    this.time += dt;
    this.clear();
    if (this.current) {
      this.current.t += dt;
      if (this.current.t >= this.current.duration) this.current = this.queue.shift() ?? null;
    }
    if (this.scroll) {
      this.scroll.x -= this.scroll.speed * dt;
      const w = textWidth(FONT_LARGE, this.scroll.text);
      this.text(this.scroll.text, Math.round(this.scroll.x), 12);
      if (this.scroll.x < -w) this.scroll = null;
    } else if (this.current) {
      const fn = this.anims.get(this.current.anim ?? 'default') ?? this.anims.get('default')!;
      fn(this, this.current.t, this.current);
    } else this.idle(this, this.time);
    this.draw();
  }

  private draw(): void {
    const sm = this.small;
    const img = this.img;
    const px = img.data;
    for (let i = 0; i < DMD_W * DMD_H; i++) {
      const v = this.buf[i];
      const lum = v === 0 ? 0 : 0.22 + (v / 15) * 0.78;
      px[i * 4] = 255 * lum;
      px[i * 4 + 1] = 118 * lum;
      px[i * 4 + 2] = 22 * lum;
      px[i * 4 + 3] = v === 0 ? 0 : 255;
    }
    sm.putImageData(img, 0, 0);
    const g = this.g;
    g.globalCompositeOperation = 'copy';
    g.imageSmoothingEnabled = false;
    g.drawImage(sm.canvas, 0, 0, this.canvas.width, this.canvas.height);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(this.mask, 0, 0);
    g.globalCompositeOperation = 'destination-over';
    g.drawImage(this.unlit, 0, 0);
    g.globalCompositeOperation = 'source-over';
    this.dirty = true;
  }

  private small!: CanvasRenderingContext2D;
  private img!: ImageData;
  private mask!: HTMLCanvasElement;
  private unlit!: HTMLCanvasElement;

  private initLayers(): void {
    const sc = document.createElement('canvas');
    sc.width = DMD_W;
    sc.height = DMD_H;
    this.small = sc.getContext('2d')!;
    this.img = this.small.createImageData(DMD_W, DMD_H);
    const d = this.dot;
    const mk = (fill: string, bg: string | null) => {
      const c = document.createElement('canvas');
      c.width = this.canvas.width;
      c.height = this.canvas.height;
      const g = c.getContext('2d')!;
      if (bg) {
        g.fillStyle = bg;
        g.fillRect(0, 0, c.width, c.height);
      }
      g.fillStyle = fill;
      for (let y = 0; y < DMD_H; y++)
        for (let x = 0; x < DMD_W; x++) {
          g.beginPath();
          g.arc(x * d + d / 2, y * d + d / 2, d * 0.42, 0, Math.PI * 2);
          g.fill();
        }
      return c;
    };
    this.mask = mk('#fff', null);
    this.unlit = mk('rgb(40,17,7)', '#0b0503');
  }
}

function registerDefaultAnims(d: Dmd): void {
  // Big text, small subtitle; flashes at the start.
  d.registerAnim('default', (dmd, t, c) => {
    const flash = t < 0.3 && Math.floor(t * 20) % 2 === 0;
    const scale = dmd.fitScale(c.text, FONT_LARGE, 124, c.sub ? 2 : 3);
    const h = 7 * scale;
    const y = c.sub ? Math.max(1, 12 - h / 2 - 2) : 16 - h / 2;
    dmd.text(c.text, 64, Math.round(y), { scale, align: 'center', v: flash ? 6 : 15 });
    if (c.sub) dmd.text(c.sub, 64, 25, { font: FONT_SMALL, align: 'center', v: 11 });
  });
  // Roll Call: bars slam shut then the text.
  d.registerAnim('rollcall', (dmd, t, c) => {
    const k = Math.min(1, t / 0.35);
    for (let x = 0; x < 128; x += 8) dmd.rect(x, 0, 2, Math.round(32 * k), 6);
    if (t > 0.35) {
      dmd.text(c.text, 64, 5, { scale: 2, align: 'center' });
      if (c.sub) dmd.text(c.sub, 64, 23, { font: FONT_SMALL, align: 'center', v: 12 });
    }
  });
  d.registerAnim('skill', (dmd, t, c) => {
    const r = Math.floor(t * 40);
    for (let i = 0; i < 24; i++) dmd.set((i * 37 + r * 7) % 128, (i * 13 + r * 3) % 32, 8);
    const scale = dmd.fitScale(c.text, FONT_LARGE, 124, 2);
    dmd.text(c.text, 64, 4, { scale, align: 'center', v: Math.floor(t * 10) % 2 ? 15 : 10 });
    if (c.sub) dmd.text(c.sub, 64, 24, { font: FONT_SMALL, align: 'center' });
  });
  d.registerAnim('tilt', (dmd, t) => {
    const on = Math.floor(t * 6) % 2 === 0;
    dmd.rect(0, 0, 128, 32, on ? 15 : 0, false);
    dmd.text('TILT', 64, 6, { scale: 3, align: 'center', v: on ? 15 : 8 });
  });
  d.registerAnim('drain', (dmd, t, c) => {
    const y = Math.round(Math.min(1, t / 0.6) * 20);
    dmd.text(c.text, 64, 6 + y, {
      scale: 2,
      align: 'center',
      v: Math.max(3, 15 - Math.floor(t * 8)),
    });
  });
  // Combo: chevrons sweep right, multiplier big.
  d.registerAnim('combo', (dmd, t, c) => {
    const off = Math.floor(t * 60) % 16;
    for (let x = -16 + off; x < 128; x += 16)
      for (let i = 0; i < 6; i++) {
        dmd.set(x + i, 2 + i, 5);
        dmd.set(x + i, 29 - i, 5);
      }
    const scale = dmd.fitScale(c.text, FONT_LARGE, 124, 2);
    dmd.text(c.text, 64, 7, { scale, align: 'center' });
    if (c.sub) dmd.text(c.sub, 64, 24, { font: FONT_SMALL, align: 'center', v: 12 });
  });
  // RIOT: the screen shakes, bars rattle, text strobes.
  d.registerAnim('riot', (dmd, t, c) => {
    const jx = Math.round(Math.sin(t * 70) * 2);
    for (let x = 4; x < 128; x += 12) dmd.rect(x + jx, 0, 2, 32, Math.floor(t * 8) % 2 ? 4 : 7);
    const on = Math.floor(t * 10) % 2 === 0;
    dmd.text(c.text, 64 + jx, 3, { scale: 3, align: 'center', v: on ? 15 : 9 });
    if (c.sub) dmd.text(c.sub, 64, 26, { font: FONT_SMALL, align: 'center', v: 13 });
  });
  // PAYDAY: coins rain behind the text.
  d.registerAnim('payday', (dmd, t, c) => {
    for (let i = 0; i < 18; i++) {
      const x = (i * 29 + 7) % 128;
      const y = Math.floor((t * (40 + (i % 5) * 9) + i * 11) % 36) - 2;
      dmd.rect(x, y, 2, 2, 6);
    }
    const scale = dmd.fitScale(c.text, FONT_LARGE, 124, 2);
    dmd.text(c.text, 64, 4, { scale, align: 'center', v: Math.floor(t * 12) % 2 ? 15 : 11 });
    if (c.sub) dmd.text(c.sub, 64, 24, { font: FONT_SMALL, align: 'center' });
  });
  // JAILBREAK: the bars bend apart from the middle, the text shakes through the gap.
  d.registerAnim('jailbreak', (dmd, t, c) => {
    const k = Math.min(1, t / 0.8);
    for (let i = 0; i < 6; i++) {
      const spread = Math.round(k * (6 + i * 4));
      dmd.rect(58 - i * 10 - spread, 0, 2, 32, 5);
      dmd.rect(68 + i * 10 + spread, 0, 2, 32, 5);
    }
    const jx = Math.round(Math.sin(t * 55) * (1 - k) * 3);
    const scale = dmd.fitScale(c.text, FONT_LARGE, 124, 2);
    dmd.text(c.text, 64 + jx, 4, { scale, align: 'center', v: Math.floor(t * 8) % 2 ? 15 : 12 });
    if (c.sub) dmd.text(c.sub, 64, 24, { font: FONT_SMALL, align: 'center', v: 13 });
  });
  d.registerAnim('count', (dmd, _t, c) => {
    dmd.text(c.text, 64, 3, { font: FONT_SMALL, align: 'center', v: 11 });
    if (c.sub) dmd.text(c.sub, 64, 12, { scale: 2, align: 'center' });
  });
}
