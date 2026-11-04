/**
 * The cell around the machine: concrete walls, a tiled floor with the trapdoor under the
 * stool, the ATM and the phone on the right wall, the vending cabinet and the tally wall on
 * the left (the neighbour's side), the door behind you and a loose brick hiding your stash.
 * It decays as deadlines pass: rust spreads, a leak starts, the bulb dims and flickers more.
 */
import * as THREE from 'three';
import { ROOM_UNIFORMS, canvasTexture, retroMaterial } from './retro-material';
import { bakeStatic } from './materials';

/** Room bounds (world units, 1 = one ball diameter). */
export const ROOM = { x0: -46, x1: 46, z0: -46, z1: 62, floor: -12, ceil: 50 } as const;

const DOOR_W = 18;
const DOOR_H = 34;

/** Where the props are (camera modes look at them). */
export const PROPS = {
  atm: new THREE.Vector3(ROOM.x1 - 2.2, 4, 18),
  phone: new THREE.Vector3(ROOM.x1 - 1.2, 9, 1),
  vending: new THREE.Vector3(ROOM.x0 + 4.5, 2, 16),
  tally: new THREE.Vector3(ROOM.x0 + 0.05, 14, -12),
  stash: new THREE.Vector3(ROOM.x0 + 6, ROOM.floor + 1.2, -34),
  door: new THREE.Vector3(0, 6, ROOM.z1 - 0.2),
  trapdoor: new THREE.Vector3(0, ROOM.floor + 0.02, 38),
} as const;

function speckle(g: CanvasRenderingContext2D, w: number, h: number, n: number, a: number): void {
  for (let i = 0; i < n; i++) {
    const v = Math.random() * 255;
    g.fillStyle = `rgba(${v},${v * 0.9},${v * 0.8},${a})`;
    g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}

/**
 * Tileable value noise multiplied over the texture: `cells` lattice points per side, wrapped so
 * the texture still repeats seamlessly. dark/light set how far it darkens and lightens.
 */
function noiseLayer(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  cells: number,
  dark: number,
  light: number,
): void {
  const grid = new Float32Array(cells * cells);
  for (let i = 0; i < grid.length; i++) grid[i] = Math.random();
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    const fy = (y / h) * cells;
    const y0 = Math.floor(fy) % cells;
    const y1 = (y0 + 1) % cells;
    const ty = fy - Math.floor(fy);
    const sy = ty * ty * (3 - 2 * ty);
    for (let x = 0; x < w; x++) {
      const fx = (x / w) * cells;
      const x0 = Math.floor(fx) % cells;
      const x1 = (x0 + 1) % cells;
      const tx = fx - Math.floor(fx);
      const sx = tx * tx * (3 - 2 * tx);
      const a = grid[y0 * cells + x0] + (grid[y0 * cells + x1] - grid[y0 * cells + x0]) * sx;
      const b = grid[y1 * cells + x0] + (grid[y1 * cells + x1] - grid[y1 * cells + x0]) * sx;
      const n = a + (b - a) * sy;
      const k = n < 0.5 ? 1 - (0.5 - n) * 2 * dark : 1 + (n - 0.5) * 2 * light;
      const i = (y * w + x) * 4;
      d[i] = Math.min(255, d[i] * k);
      d[i + 1] = Math.min(255, d[i + 1] * k);
      d[i + 2] = Math.min(255, d[i + 2] * k);
    }
  }
  g.putImageData(img, 0, 0);
}

/** Draw `fn` at (x, y) and at its wrapped copies, so marks crossing an edge tile cleanly. */
function wrapped(w: number, h: number, x: number, y: number, fn: (x: number, y: number) => void) {
  for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) fn(x + ox, y + oy);
}

/** A thin wandering crack. */
function crack(g: CanvasRenderingContext2D, w: number, h: number, len: number): void {
  const x0 = Math.random() * w;
  const y0 = Math.random() * h;
  wrapped(w, h, x0, y0, (x, y) => {
    g.beginPath();
    g.moveTo(x, y);
    let cx = x;
    let cy = y;
    let ang = Math.random() * Math.PI * 2;
    for (let i = 0; i < len; i++) {
      ang += (Math.random() - 0.5) * 0.9;
      cx += Math.cos(ang) * 4;
      cy += Math.sin(ang) * 4;
      g.lineTo(cx, cy);
    }
    g.stroke();
  });
}

/** Damp streaks running down from the top edge. */
function streaks(g: CanvasRenderingContext2D, w: number, h: number, n: number, a: number): void {
  for (let i = 0; i < n; i++) {
    const x = Math.random() * w;
    const len = h * (0.3 + Math.random() * 0.7);
    const grad = g.createLinearGradient(0, 0, 0, len);
    grad.addColorStop(0, `rgba(18,14,10,${a})`);
    grad.addColorStop(1, 'rgba(18,14,10,0)');
    g.fillStyle = grad;
    const wd = 2 + Math.random() * 6;
    wrapped(w, h, x, 0, (xx) => g.fillRect(xx, 0, wd, len));
  }
}

/** Soft stains (water rings, rust, grime) as radial blots. */
function stains(g: CanvasRenderingContext2D, w: number, h: number, n: number, rgb: string): void {
  for (let i = 0; i < n; i++) {
    const r = 6 + Math.random() * 30;
    const a = 0.08 + Math.random() * 0.18;
    wrapped(w, h, Math.random() * w, Math.random() * h, (x, y) => {
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, `rgba(${rgb},${a})`);
      grad.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = grad;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    });
  }
}

const TEX = 256;

const concrete = () => {
  const t = canvasTexture(TEX, TEX, (g, w, h) => {
    g.fillStyle = '#5c554c';
    g.fillRect(0, 0, w, h);
    noiseLayer(g, w, h, 6, 0.35, 0.18);
    noiseLayer(g, w, h, 24, 0.16, 0.1);
    stains(g, w, h, 14, '28,22,16');
    streaks(g, w, h, 9, 0.35);
    speckle(g, w, h, 5000, 0.14);
    // Pitting: tiny dark holes with a light lip.
    for (let i = 0; i < 160; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      g.fillStyle = 'rgba(15,12,9,0.55)';
      g.fillRect(x, y, 1 + Math.random() * 2, 1 + Math.random() * 2);
      g.fillStyle = 'rgba(200,190,170,0.12)';
      g.fillRect(x + 1, y + 1, 1, 1);
    }
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(16,12,9,0.55)';
    for (let i = 0; i < 3; i++) crack(g, w, h, 18 + Math.floor(Math.random() * 20));
  });
  return mipped(t);
};

const bricks = () => {
  const t = canvasTexture(TEX, TEX, (g, w, h) => {
    // Mortar.
    g.fillStyle = '#2e241e';
    g.fillRect(0, 0, w, h);
    noiseLayer(g, w, h, 16, 0.3, 0.15);
    const rows = 8;
    const bh = h / rows;
    const bw = w / 4;
    for (let r = 0; r < rows; r++)
      for (let c = -1; c < 5; c++) {
        const x = c * bw + (r % 2) * (bw / 2);
        const y = r * bh;
        const v = 62 + Math.random() * 46;
        const hue = Math.random();
        g.fillStyle = `rgb(${v},${v * (0.5 + hue * 0.15)},${v * (0.38 + hue * 0.1)})`;
        g.fillRect(x + 3, y + 3, bw - 6, bh - 6);
        // Top-lit bevel and a shadowed lower lip.
        g.fillStyle = 'rgba(255,220,190,0.08)';
        g.fillRect(x + 3, y + 3, bw - 6, 2);
        g.fillStyle = 'rgba(0,0,0,0.28)';
        g.fillRect(x + 3, y + bh - 5, bw - 6, 2);
        // Chipped corners.
        g.fillStyle = '#2e241e';
        if (Math.random() < 0.35) g.fillRect(x + 3, y + 3, 3 + Math.random() * 5, 3);
        if (Math.random() < 0.35) g.fillRect(x + bw - 9, y + bh - 6, 6, 3);
      }
    noiseLayer(g, w, h, 8, 0.3, 0.12);
    stains(g, w, h, 10, '20,14,10');
    streaks(g, w, h, 6, 0.3);
    speckle(g, w, h, 3000, 0.12);
  });
  return mipped(t);
};

const tiles = () => {
  const t = canvasTexture(TEX, TEX, (g, w, h) => {
    const n = 4;
    const s = w / n;
    g.fillStyle = '#16120e';
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const v = 50 + ((x + y) % 2) * 16 + Math.random() * 8;
        g.fillStyle = `rgb(${v},${v * 0.95},${v * 0.86})`;
        g.fillRect(x * s + 2, y * s + 2, s - 4, s - 4);
        // Glaze highlight along the top-left edges.
        g.fillStyle = 'rgba(255,240,220,0.07)';
        g.fillRect(x * s + 2, y * s + 2, s - 4, 3);
        g.fillRect(x * s + 2, y * s + 2, 3, s - 4);
        // A chipped corner now and then.
        if (Math.random() < 0.3) {
          g.fillStyle = '#16120e';
          g.beginPath();
          const cx = x * s + (Math.random() < 0.5 ? 2 : s - 2);
          const cy = y * s + (Math.random() < 0.5 ? 2 : s - 2);
          g.arc(cx, cy, 4 + Math.random() * 6, 0, Math.PI * 2);
          g.fill();
        }
      }
    noiseLayer(g, w, h, 5, 0.4, 0.15);
    noiseLayer(g, w, h, 32, 0.12, 0.08);
    stains(g, w, h, 18, '24,18,12');
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(8,6,4,0.6)';
    for (let i = 0; i < 4; i++) crack(g, w, h, 10 + Math.floor(Math.random() * 10));
    speckle(g, w, h, 4000, 0.16);
  });
  return mipped(t);
};

/** Close up the room keeps its chunky texels; far away it filters, so walls don't shimmer. */
function mipped(t: THREE.CanvasTexture): THREE.CanvasTexture {
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  return t;
}

/** A lit sign: amber pixel text between two red rules (nearest-filtered like the room). */
const marqueeTexture = (label: string) =>
  canvasTexture(128, 24, (g, w, h) => {
    g.fillStyle = '#1a0f08';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffb84a';
    g.font = 'bold 14px monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(label, w / 2, h / 2 + 1);
    g.fillStyle = '#ff5a30';
    g.fillRect(4, 2, w - 8, 1);
    g.fillRect(4, h - 3, w - 8, 1);
  });

const flat = (color: string) =>
  canvasTexture(8, 8, (g) => {
    g.fillStyle = color;
    g.fillRect(0, 0, 8, 8);
    speckle(g, 8, 8, 10, 0.1);
  });

export class CellRoom {
  readonly group = new THREE.Group();
  private readonly tallyTex: THREE.CanvasTexture;
  private readonly tallyCanvas: HTMLCanvasElement;
  private readonly atmScreen: THREE.MeshBasicMaterial;
  private readonly atmCanvas: HTMLCanvasElement;
  private readonly atmTex: THREE.CanvasTexture;
  private atmAlarm = false;
  private atmText = '';
  private readonly leak = new THREE.Group();
  private readonly puddle: THREE.Mesh;
  private readonly drops: { m: THREE.Mesh; v: number }[] = [];
  private readonly trapdoor: THREE.Mesh;
  private readonly doorGlow: THREE.Mesh;
  /** The door swings on its hinge; the left (neighbour's) wall can come down. */
  private readonly doorPivot = new THREE.Group();
  readonly leftWall = new THREE.Group();
  decay = 0;
  private time = 0;

  constructor() {
    const R = ROOM;
    const W = R.x1 - R.x0;
    const D = R.z1 - R.z0;
    const H = R.ceil - R.floor;
    const concreteTex = concrete();
    const wall = retroMaterial({ map: concreteTex, repeat: [8, 5] });
    const brick = retroMaterial({ map: bricks(), repeat: [10, 6] });
    const floor = retroMaterial({ map: tiles(), repeat: [12, 14], rust: 0.3 });
    const ceil = retroMaterial({ map: concrete(), repeat: [8, 8], tint: 0x8a8278 });
    const plane = (
      w: number,
      h: number,
      mat: THREE.Material,
      pos: THREE.Vector3,
      ry = 0,
      rx = 0,
    ) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h, 6, 6), mat);
      m.position.copy(pos);
      m.rotation.set(rx, ry, 0);
      this.group.add(m);
      return m;
    };
    // Floor with a hole for the trapdoor (two slabs around it would be overkill: the hatch
    // simply sits flush and swings open when the floor drops away).
    plane(W, D, floor, new THREE.Vector3(0, R.floor, (R.z0 + R.z1) / 2), 0, -Math.PI / 2);
    plane(W, D, ceil, new THREE.Vector3(0, R.ceil, (R.z0 + R.z1) / 2), 0, Math.PI / 2);
    plane(W, H, wall, new THREE.Vector3(0, (R.floor + R.ceil) / 2, R.z0));
    // Back wall in three pieces around the doorway (texture repeats scaled to each piece).
    const side = (W - DOOR_W) / 2;
    const top = H - DOOR_H;
    const sideMat = retroMaterial({ map: concreteTex, repeat: [(8 * side) / W, 5] });
    const topMat = retroMaterial({ map: concreteTex, repeat: [(8 * DOOR_W) / W, (5 * top) / H] });
    const midY = (R.floor + R.ceil) / 2;
    plane(side, H, sideMat, new THREE.Vector3(R.x0 + side / 2, midY, R.z1), Math.PI);
    plane(side, H, sideMat, new THREE.Vector3(R.x1 - side / 2, midY, R.z1), Math.PI);
    plane(DOOR_W, top, topMat, new THREE.Vector3(0, R.ceil - top / 2, R.z1), Math.PI);
    // The neighbour's wall pivots on its foot so it can fall away.
    this.leftWall.position.set(R.x0, R.floor, (R.z0 + R.z1) / 2);
    this.group.add(this.leftWall);
    this.leftWall.add(plane(D, H, brick, new THREE.Vector3(0, H / 2, 0), Math.PI / 2));
    plane(
      D,
      H,
      wall,
      new THREE.Vector3(R.x1, (R.floor + R.ceil) / 2, (R.z0 + R.z1) / 2),
      -Math.PI / 2,
    );

    // Trapdoor hatch under the stool.
    this.trapdoor = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 14),
      retroMaterial({ map: flat('#2a2622'), rust: 0.6 }),
    );
    this.trapdoor.rotation.x = -Math.PI / 2;
    this.trapdoor.position.copy(PROPS.trapdoor).add(new THREE.Vector3(0, 0.03, 0));
    this.group.add(this.trapdoor);

    // ATM on the right wall: a steel box with a green screen.
    const atm = new THREE.Group();
    const steel = retroMaterial({ map: flat('#6a6e72'), rust: 0.7 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(4, 16, 11), steel);
    atm.add(body);
    this.atmCanvas = document.createElement('canvas');
    this.atmCanvas.width = 96;
    this.atmCanvas.height = 64;
    this.atmTex = new THREE.CanvasTexture(this.atmCanvas);
    this.atmTex.magFilter = THREE.NearestFilter;
    this.atmTex.colorSpace = THREE.SRGBColorSpace;
    // HDR colour makes the practical lights (ATM screen, vending glass) bloom in the dark cell.
    this.atmScreen = new THREE.MeshBasicMaterial({
      map: this.atmTex,
      color: new THREE.Color(2, 2, 2),
    });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(7, 4.5), this.atmScreen);
    screen.rotation.y = -Math.PI / 2;
    screen.position.set(-2.05, 3, 0);
    atm.add(screen);
    const slot = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.6, 5),
      new THREE.MeshBasicMaterial({ color: 0x050505 }),
    );
    slot.position.set(-2.1, -2, 0);
    atm.add(slot);
    // Bezel, a lit marquee, a keypad and a glowing card slot: a grim bank terminal.
    const bezel = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 5.8, 8.2),
      retroMaterial({ map: flat('#16181a'), rust: 0.3 }),
    );
    // Just behind the screen plane (x -2.05) so the LCD stays in front of its frame.
    bezel.position.set(-1.97, 3, 0);
    atm.add(bezel);
    const keyGeo = new THREE.BoxGeometry(0.25, 0.7, 0.9);
    const keyMat = retroMaterial({ map: flat('#3a3e42'), rust: 0.2 });
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 3; c++) {
        const k = new THREE.Mesh(keyGeo, keyMat);
        k.position.set(-2.1, -4.4 - r * 1.0, (c - 1) * 1.25);
        atm.add(k);
      }
    const marquee = new THREE.Mesh(
      new THREE.PlaneGeometry(8, 1.6),
      new THREE.MeshBasicMaterial({
        map: marqueeTexture("DEBTOR'S BANK"),
        color: new THREE.Color(1.6, 1.4, 1.1),
      }),
    );
    marquee.rotation.y = -Math.PI / 2;
    marquee.position.set(-2.06, 7.4, 0);
    atm.add(marquee);
    const slotGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(5.2, 0.22),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 2.2, 0.7) }),
    );
    slotGlow.rotation.y = -Math.PI / 2;
    slotGlow.position.set(-2.12, -1.4, 0);
    atm.add(slotGlow);
    bakeStatic(atm);
    atm.position.copy(PROPS.atm);
    this.group.add(atm);
    this.drawAtm('INSERT\nCARD');

    // Rotary phone on a little shelf.
    const phone = new THREE.Group();
    const bakelite = retroMaterial({ map: flat('#1a0f0c'), rust: 0 });
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.4, 6), steel);
    shelf.position.y = -1.6;
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.6, 3.4), bakelite);
    const handset = new THREE.Mesh(new THREE.BoxGeometry(1, 0.8, 4.2), bakelite);
    handset.position.y = 1.1;
    phone.add(shelf, base, handset);
    phone.position.copy(PROPS.phone).add(new THREE.Vector3(-1.5, 0, 0));
    this.group.add(phone);

    // Vending cabinet on the left wall: a tall box with a lit glass front.
    const vend = new THREE.Group();
    const vbody = new THREE.Mesh(
      new THREE.BoxGeometry(8, 30, 14),
      retroMaterial({ map: flat('#4a1a14'), rust: 0.8 }),
    );
    vend.add(vbody);
    const glassTex = canvasTexture(32, 64, (g) => {
      g.fillStyle = '#100a08';
      g.fillRect(0, 0, 32, 64);
      for (let r = 0; r < 6; r++)
        for (let c = 0; c < 3; c++) {
          g.fillStyle = ['#c84', '#7a4', '#48c', '#c44', '#cc4'][(r * 3 + c) % 5];
          g.fillRect(3 + c * 10, 4 + r * 10, 6, 5);
        }
    });
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(11, 20),
      new THREE.MeshBasicMaterial({ map: glassTex, color: new THREE.Color(1.5, 1.35, 1.2) }),
    );
    glass.rotation.y = Math.PI / 2;
    glass.position.set(4.05, 3, 0);
    vend.add(glass);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(11, 2.4),
      new THREE.MeshBasicMaterial({
        map: marqueeTexture('CONTRABAND'),
        color: new THREE.Color(1.5, 1.3, 1.0),
      }),
    );
    sign.rotation.y = Math.PI / 2;
    sign.position.set(4.06, 13.8, 0);
    vend.add(sign);
    vend.position.copy(PROPS.vending).add(new THREE.Vector3(0, 3, 0));
    this.group.add(vend);

    // Tally marks: one per run ever played, scratched into the left wall.
    this.tallyCanvas = document.createElement('canvas');
    this.tallyCanvas.width = 256;
    this.tallyCanvas.height = 128;
    this.tallyTex = new THREE.CanvasTexture(this.tallyCanvas);
    this.tallyTex.magFilter = THREE.NearestFilter;
    this.tallyTex.colorSpace = THREE.SRGBColorSpace;
    const tally = new THREE.Mesh(
      new THREE.PlaneGeometry(26, 13),
      new THREE.MeshBasicMaterial({ map: this.tallyTex, transparent: true, opacity: 0.85 }),
    );
    tally.rotation.y = Math.PI / 2;
    tally.position.copy(PROPS.tally).sub(this.leftWall.position);
    this.leftWall.add(tally);

    // The loose brick that hides the contraband.
    const brickProp = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 1.6, 1.6),
      retroMaterial({ map: bricks(), rust: 0.2 }),
    );
    brickProp.position.copy(PROPS.stash);
    brickProp.rotation.y = 0.12;
    this.group.add(brickProp);

    // The door behind you, light leaking underneath; hinged on its left edge.
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(DOOR_W, DOOR_H, 1),
      retroMaterial({ map: flat('#4a4440'), rust: 1 }),
    );
    door.position.set(DOOR_W / 2, DOOR_H / 2, 0);
    this.doorPivot.position.set(-DOOR_W / 2, R.floor, R.z1 - 0.4);
    this.doorPivot.add(door);
    this.group.add(this.doorPivot);

    // The stool you're chained to, over the trapdoor.
    const iron = retroMaterial({ map: flat('#3a3a3c'), rust: 0.9 });
    const stool = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 0.8, 10), iron);
    seat.position.y = 9;
    stool.add(seat);
    for (let i = 0; i < 3; i++) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.5, 9, 0.5), iron);
      const a = (i / 3) * Math.PI * 2;
      leg.position.set(Math.cos(a) * 2.2, 4.5, Math.sin(a) * 2.2);
      stool.add(leg);
    }
    for (let i = 0; i < 6; i++) {
      const link = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.14, 4, 8), iron);
      link.position.set(1.5 + i * 0.5, 8.5 - i * 1.4, 0.6);
      link.rotation.set(i % 2 ? Math.PI / 2 : 0, 0.4, 0);
      stool.add(link);
    }
    stool.position.set(PROPS.trapdoor.x, R.floor, PROPS.trapdoor.z);
    this.group.add(stool);
    this.doorGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 1.2),
      new THREE.MeshBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.5 }),
    );
    this.doorGlow.rotation.x = -Math.PI / 2;
    this.doorGlow.position.set(0, R.floor + 0.05, R.z1 - 1.5);
    this.group.add(this.doorGlow);

    // The leak: drips from a rusted seam into a growing puddle.
    const dripMat = new THREE.MeshBasicMaterial({
      color: 0x9ab0b8,
      transparent: true,
      opacity: 0.7,
    });
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.25, 4, 3), dripMat);
      m.position.set(-22, R.ceil - i * 15, -12);
      this.leak.add(m);
      this.drops.push({ m, v: 0 });
    }
    this.puddle = new THREE.Mesh(
      new THREE.CircleGeometry(1, 12),
      new THREE.MeshBasicMaterial({ color: 0x223038, transparent: true, opacity: 0.55 }),
    );
    this.puddle.rotation.x = -Math.PI / 2;
    this.puddle.position.set(-22, R.floor + 0.04, -12);
    this.leak.add(this.puddle);
    this.group.add(this.leak);
    this.setTallies(0);
    this.setDecay(0);
  }

  /** Scratch the tally marks (groups of five). */
  setTallies(n: number): void {
    const g = this.tallyCanvas.getContext('2d')!;
    g.clearRect(0, 0, 256, 128);
    // Scratched strokes, groups of five, rows of eight groups.
    g.strokeStyle = 'rgba(228,214,186,0.8)';
    g.lineWidth = 4;
    g.lineCap = 'round';
    const per = 8;
    for (let i = 0; i < n && i < 160; i++) {
      const group = Math.floor(i / 5);
      const k = i % 5;
      const row = Math.floor(group / per);
      const x0 = 10 + (group % per) * 30 + (row % 2) * 6;
      const y0 = 8 + row * 30;
      const wob = ((i * 7919) % 5) - 2;
      g.beginPath();
      if (k < 4) {
        g.moveTo(x0 + k * 6, y0 + wob * 0.5);
        g.lineTo(x0 + k * 6 + wob * 0.4, y0 + 22);
      } else {
        g.moveTo(x0 - 4, y0 + 19);
        g.lineTo(x0 + 22, y0 + 3);
      }
      g.stroke();
    }
    this.tallyTex.needsUpdate = true;
  }

  /** 0 (fresh) .. 1 (last deadline): rust spreads, the leak starts, the bulb weakens. */
  setDecay(d: number): void {
    this.decay = Math.max(0, Math.min(1, d));
    ROOM_UNIFORMS.uDecay.value = this.decay;
    this.leak.visible = this.decay > 0.25;
    this.puddle.scale.setScalar(1 + this.decay * 6);
  }

  /** The ATM screen goes red when the deadline is due. */
  setAtmAlarm(on: boolean): void {
    this.atmAlarm = on;
    this.drawAtm(this.atmText);
  }

  /** Green-on-black LCD lines (debt, bank, due). */
  drawAtm(text: string): void {
    this.atmText = text;
    const g = this.atmCanvas.getContext('2d')!;
    g.fillStyle = this.atmAlarm ? '#200403' : '#021208';
    g.fillRect(0, 0, 96, 64);
    g.fillStyle = this.atmAlarm ? '#ff5040' : '#3cff7a';
    g.font = 'bold 11px monospace';
    text.split('\n').forEach((line, i) => g.fillText(line, 5, 14 + i * 13));
    this.atmTex.needsUpdate = true;
  }

  /** The door swings open into the corridor (0 closed .. 1 open). */
  openDoor(k: number): void {
    this.doorPivot.rotation.y = -k * 1.9;
  }

  /** The neighbour's wall falls away from you (0 standing .. 1 down). */
  dropWall(k: number): void {
    this.leftWall.rotation.z = k * (Math.PI / 2);
    // Lift the fallen wall off the floor it lies on: at rest it would z-fight with the tiles.
    this.leftWall.position.y = ROOM.floor + k * 0.08;
  }

  /** The trapdoor swings open (0 closed .. 1 open). */
  openTrapdoor(k: number): void {
    this.trapdoor.rotation.x = -Math.PI / 2 + k * 1.7;
    this.trapdoor.position.z = PROPS.trapdoor.z + k * 6;
    this.trapdoor.position.y = PROPS.trapdoor.y - k * 6;
  }

  update(dt: number): void {
    this.time += dt;
    ROOM_UNIFORMS.uTime.value = this.time;
    this.doorGlow.visible = true;
    if (this.leak.visible) {
      for (const d of this.drops) {
        d.v += 40 * dt;
        d.m.position.y -= d.v * dt;
        if (d.m.position.y < ROOM.floor) {
          d.m.position.y = ROOM.ceil - Math.random() * 6;
          d.v = 0;
        }
      }
    }
  }
}
