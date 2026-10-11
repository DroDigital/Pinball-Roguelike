/**
 * The three endings as short scripted camera sequences:
 * - Paid in Full: the door opens onto a corridor of identical cells, each with a machine.
 * - Breakout: the camera dives into the drain and the ball rolls out into daylight.
 * - Cellmate: the neighbour's wall comes down on a cell exactly like yours.
 * The director drives the World's scripted camera and narrates through cues; it leaves the
 * final shot in place (behind the Rap Sheet) until stop().
 */
import * as THREE from 'three';
import { FOG_DENSITY, type World } from './scene';
import { ROOM } from './cell';

export type EndingKind = 'paidInFull' | 'breakout' | 'cellmate';

interface Cue {
  at: number;
  /** '' narrates; 'TITLE' is the ending's name. */
  speaker: string;
  text: string;
}

const CUES: Record<EndingKind, Cue[]> = {
  paidInFull: [
    { at: 1.2, speaker: 'THE WARDEN', text: 'Paid in full. The door is open. It always was.' },
    { at: 5, speaker: '', text: 'A corridor of cells. Each one has a stool, a chain, a machine.' },
    { at: 7.6, speaker: '', text: 'Every machine is lit. Every stool is taken.' },
    { at: 9.4, speaker: 'TITLE', text: 'PAID IN FULL' },
  ],
  breakout: [
    { at: 0.4, speaker: '', text: 'Down the drain, past the apron, into the dark.' },
    { at: 3.6, speaker: '', text: 'Daylight.' },
    { at: 6.4, speaker: '', text: 'Somewhere behind the wall, a phone rings. It is not for you.' },
    { at: 8.4, speaker: 'TITLE', text: 'BREAKOUT' },
  ],
  cellmate: [
    { at: 0.5, speaker: '', text: 'The knocking stops.' },
    { at: 2.2, speaker: '', text: 'Then the wall comes down.' },
    {
      at: 5.2,
      speaker: '',
      text: 'The cell next door is yours. The same machine. The same stool.',
    },
    { at: 8, speaker: '', text: 'The same marks on the wall. Exactly as many.' },
    {
      at: 10.2,
      speaker: '',
      text: 'The chain is still warm. Behind you, someone starts to knock.',
    },
    { at: 12.2, speaker: 'TITLE', text: 'CELLMATE' },
  ],
};

export const ENDING_SECONDS: Record<EndingKind, number> = {
  paidInFull: 10.5,
  breakout: 9.5,
  cellmate: 13,
};

const smooth = (a: number, b: number, t: number) => {
  const k = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

export class EndingDirector {
  kind: EndingKind | null = null;
  t = 0;
  onCue: (speaker: string, text: string) => void = () => {};
  private next = 0;
  private readonly pos = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private built: THREE.Object3D[] = [];
  private sky: HTMLCanvasElement | null = null;
  private white: HTMLElement | null = null;

  constructor(
    private readonly world: World,
    private readonly overlayParent: HTMLElement,
    private readonly glassTex: THREE.Texture | null,
  ) {}

  get running(): boolean {
    return this.kind !== null && this.t < ENDING_SECONDS[this.kind];
  }

  start(kind: EndingKind): void {
    this.stop();
    this.kind = kind;
    this.t = 0;
    this.next = 0;
    if (kind === 'paidInFull') {
      this.buildCorridor();
      this.setFog(0.008);
    }
    if (kind === 'cellmate') this.buildNeighbour();
    if (kind === 'breakout') this.buildSky();
    this.world.scripted = { pos: this.pos, look: this.look, rate: 2.5 };
    this.update(0);
  }

  /** Tear down everything the ending built and give the camera back. */
  stop(): void {
    for (const o of this.built) o.removeFromParent();
    this.built = [];
    this.sky?.remove();
    this.white?.remove();
    this.sky = null;
    this.white = null;
    this.setFog(FOG_DENSITY);
    this.world.cell.openDoor(0);
    this.world.cell.dropWall(0);
    this.world.scripted = null;
    this.kind = null;
  }

  update(dt: number): void {
    const kind = this.kind;
    if (!kind) return;
    this.t += dt;
    const cues = CUES[kind];
    while (this.next < cues.length && cues[this.next].at <= this.t) {
      const c = cues[this.next++];
      this.onCue(c.speaker, c.text);
    }
    if (kind === 'paidInFull') this.paidInFull(this.t);
    else if (kind === 'breakout') this.breakout(this.t);
    else this.cellmate(this.t);
  }

  private setFog(d: number): void {
    const f = this.world.scene.fog;
    if (f instanceof THREE.FogExp2) f.density = d;
  }

  // ------------------------------------------------------------------ Paid in Full

  private paidInFull(t: number): void {
    const cell = this.world.cell;
    cell.openDoor(smooth(1.5, 3.6, t));
    // Stand, turn to the door, then walk out and down the corridor.
    const walk = smooth(3.4, 10.5, t);
    this.pos.set(0, 15 - walk * 3, 22 + walk * 150);
    this.look.set(0, 10, ROOM.z1 + 40 + walk * 150);
  }

  private buildCorridor(): void {
    const g = new THREE.Group();
    const z0 = ROOM.z1;
    const len = 220;
    const w = 34;
    const h = 40;
    const concrete = new THREE.MeshLambertMaterial({ color: 0x6a6058 });
    const dark = new THREE.MeshLambertMaterial({ color: 0x3a322a });
    const add = (m: THREE.Mesh, x: number, y: number, z: number) => {
      m.position.set(x, y, z);
      g.add(m);
      return m;
    };
    add(new THREE.Mesh(new THREE.BoxGeometry(w, 1, len), dark), 0, ROOM.floor - 0.5, z0 + len / 2);
    add(
      new THREE.Mesh(new THREE.BoxGeometry(w, 1, len), concrete),
      0,
      ROOM.floor + h,
      z0 + len / 2,
    );
    const bar = new THREE.CylinderGeometry(0.25, 0.25, h, 5);
    const steel = new THREE.MeshLambertMaterial({ color: 0x6a6a70 });
    const glow = new THREE.MeshBasicMaterial({ map: this.glassTex ?? undefined, color: 0xffd8b0 });
    const field = new THREE.MeshBasicMaterial({ color: 0x9a3a1a });
    for (let i = 0; i < 8; i++) {
      const z = z0 + 18 + i * 26;
      for (const s of [-1, 1]) {
        // Wall stub between cells, bars across the cell front, a lit machine inside.
        add(
          new THREE.Mesh(new THREE.BoxGeometry(2, h, 6), concrete),
          (s * w) / 2,
          ROOM.floor + h / 2,
          z - 13,
        );
        for (let k = 0; k < 7; k++)
          add(new THREE.Mesh(bar, steel), (s * w) / 2, ROOM.floor + h / 2, z - 9 + k * 3);
        add(
          new THREE.Mesh(new THREE.BoxGeometry(2, h, 26), dark),
          s * (w / 2 + 26),
          ROOM.floor + h / 2,
          z,
        );
        const m = new THREE.Group();
        const part = (geo: THREE.BufferGeometry, mat: THREE.Material, y: number, pz: number) => {
          const p = new THREE.Mesh(geo, mat);
          p.position.set(0, y, pz);
          m.add(p);
          return p;
        };
        part(new THREE.BoxGeometry(11, 3, 22), dark, 6, 0);
        part(new THREE.PlaneGeometry(10, 20), field, 7.6, 0).rotation.x = -Math.PI / 2;
        part(new THREE.BoxGeometry(11, 8, 1.5), dark, 13, -11);
        part(new THREE.PlaneGeometry(10, 5), glow, 14, -10.2);
        m.position.set(s * (w / 2 + 12), ROOM.floor, z);
        m.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
        g.add(m);
      }
      if (i % 2 === 0) {
        const l = new THREE.PointLight(0xffc890, 700, 80, 1.4);
        l.position.set(0, ROOM.floor + h - 4, z);
        g.add(l);
        const bulb = new THREE.Mesh(
          new THREE.SphereGeometry(0.6, 6, 4),
          new THREE.MeshBasicMaterial({ color: 0xfff0c0 }),
        );
        bulb.position.copy(l.position);
        g.add(bulb);
      }
    }
    this.world.scene.add(g);
    this.built.push(g);
  }

  // ------------------------------------------------------------------ Breakout

  private breakout(t: number): void {
    const tv = this.world.table;
    // Into the drain between the flippers.
    const k = smooth(0, 2.6, t);
    tv.worldOf(9.2, 9 - k * 8.6, 12 - k * 11.8, this.a);
    tv.worldOf(9.2, 1.5 - k * 4, -k * 6, this.b);
    this.pos.copy(this.a);
    this.look.copy(this.b);
    if (this.white) this.white.style.opacity = String(smooth(2.1, 2.9, t) - smooth(3.0, 4.2, t));
    if (this.sky) {
      this.sky.style.opacity = t > 2.9 ? '1' : '0';
      if (t > 2.9) paintDaylight(this.sky, t - 2.9);
    }
  }

  private buildSky(): void {
    const c = document.createElement('canvas');
    c.width = 320;
    c.height = 180;
    c.className = 'ending-sky';
    const white = document.createElement('div');
    white.className = 'ending-white';
    this.overlayParent.append(c, white);
    this.sky = c;
    this.white = white;
  }

  // ------------------------------------------------------------------ Cellmate

  private cellmate(t: number): void {
    const cell = this.world.cell;
    // Face the wall, watch it fall, step over it into the cell next door.
    cell.dropWall(smooth(2.4, 4.6, t) ** 2);
    const walk = smooth(4.8, 9.5, t);
    const turn = smooth(7, 10.5, t);
    this.pos.set(-12 - walk * 62, 15 - walk * 2, 6 + walk * 30);
    this.a.set(ROOM.x0, 14, -6);
    this.b.set(-92 + 2, 4, 30);
    this.look.copy(this.a).lerp(this.b, walk);
    this.b.set(-92 + ROOM.x0, 12, -12);
    this.look.lerp(this.b, turn);
  }

  private buildNeighbour(): void {
    const dx = -(ROOM.x1 - ROOM.x0);
    const room = this.world.cell.group.clone(true);
    room.position.x += dx;
    // Their wall to us stays up on their side: we only remove ours.
    const machine = this.world.cabinet.clone(true);
    const lights: THREE.Object3D[] = [];
    machine.traverse((o) => {
      if ((o as THREE.Light).isLight) lights.push(o);
    });
    for (const l of lights) l.removeFromParent();
    machine.position.x += dx;
    this.world.scene.add(room, machine);
    this.built.push(room, machine);
  }
}

/** A low-res daylight scene: sky, the prison wall, grass, and the ball rolling free. */
function paintDaylight(c: HTMLCanvasElement, t: number): void {
  const g = c.getContext('2d')!;
  const W = c.width;
  const H = c.height;
  const sky = g.createLinearGradient(0, 0, 0, H * 0.62);
  sky.addColorStop(0, '#6aa8e8');
  sky.addColorStop(1, '#d8ecf8');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#fff6c8';
  g.beginPath();
  g.arc(W * 0.78, H * 0.2, 14, 0, Math.PI * 2);
  g.fill();
  // The prison wall behind, with a tower, and the drain pipe the ball came out of.
  const horizon = H * 0.6;
  g.fillStyle = '#7a7268';
  g.fillRect(0, horizon - 34, W * 0.55, 34);
  g.fillRect(W * 0.08, horizon - 58, 18, 58);
  g.fillStyle = '#5a534a';
  g.fillRect(W * 0.08 - 3, horizon - 62, 24, 6);
  g.fillStyle = '#24201c';
  g.beginPath();
  g.ellipse(W * 0.3, horizon - 6, 8, 6, 0, 0, Math.PI * 2);
  g.fill();
  // Grass, swaying.
  g.fillStyle = '#4a8a3a';
  g.fillRect(0, horizon, W, H - horizon);
  g.strokeStyle = '#3a7a2a';
  for (let x = 0; x < W; x += 4) {
    const sway = Math.sin(t * 2 + x * 0.3) * 2;
    g.beginPath();
    g.moveTo(x, H);
    g.lineTo(x + sway, horizon + 8 + ((x * 7) % 11));
    g.stroke();
  }
  // The ball: out of the pipe, across the grass, slowing to a stop.
  const k = Math.min(1, t / 5);
  const ease = 1 - (1 - k) * (1 - k);
  const bx = W * 0.3 + ease * W * 0.42;
  const by = horizon + 2 + ease * 26 - Math.abs(Math.sin(ease * 9)) * (1 - ease) * 10;
  const r = 4 + ease * 3;
  const ball = g.createRadialGradient(bx - r / 3, by - r / 3, 1, bx, by, r);
  ball.addColorStop(0, '#ffffff');
  ball.addColorStop(0.5, '#b8c0c8');
  ball.addColorStop(1, '#4a5058');
  g.fillStyle = ball;
  g.beginPath();
  g.arc(bx, by, r, 0, Math.PI * 2);
  g.fill();
  // Birds.
  g.strokeStyle = '#2a2a2a';
  for (let i = 0; i < 3; i++) {
    const x = ((t * 18 + i * 40) % (W + 40)) - 20;
    const y = 30 + i * 9 + Math.sin(t * 3 + i) * 3;
    g.beginPath();
    g.moveTo(x - 4, y - 2);
    g.lineTo(x, y);
    g.lineTo(x + 4, y - 2);
    g.stroke();
  }
}
