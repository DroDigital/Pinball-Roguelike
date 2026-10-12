/**
 * The machine's cabinet: painted body with side art and a lit coin door (tilts with the
 * playfield), chrome-banded legs (stand on the floor), and the backbox with its backlit
 * backglass, glowing orange dot-matrix display, bezels and flasher domes.
 */
import * as THREE from 'three';
import { TW, TH } from './coords';
import { paintCabinetFront, paintCabinetSide } from './plastics-art';
import { FONT_STENCIL, PALETTE as P } from './art-kit';
import type { FlasherBank } from './flashers';
import { artTexture, bakeStatic, type MachineMaterials } from './materials';

/** Body size in table-root space (kept equal to the old body so the coin tray still lines up). */
export const BODY = { w: TW + 3.4, h: 6, d: TH + 5, y: -3.2, z: -0.5 };

function sideTexture(flip: boolean): THREE.CanvasTexture {
  return artTexture((c) => paintCabinetSide(c, flip));
}

function frontTexture(): THREE.CanvasTexture {
  return artTexture(paintCabinetFront);
}

function haloTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(64, 64, 2, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,0.9)');
  r.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function labelTexture(lines: string[], w = 256, h = 112): THREE.CanvasTexture {
  return artTexture((c) => {
    c.width = w;
    c.height = h;
    const g = c.getContext('2d')!;
    g.fillStyle = '#16102a';
    g.fillRect(0, 0, w, h);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = P.cream;
    lines.forEach((s, i) => {
      g.font = `${i === 0 ? 30 : 22}px ${FONT_STENCIL}`;
      g.fillText(s, w / 2, 28 + i * 34);
    });
  });
}

/** The painted cabinet body with its coin door (child of the tilted table root). */
export function buildBody(mats: MachineMaterials, env: THREE.Texture | null): THREE.Group {
  const g = new THREE.Group();
  const side = (flip: boolean) =>
    new THREE.MeshStandardMaterial({
      map: sideTexture(flip),
      roughness: 0.4,
      metalness: 0,
      envMap: env,
      envMapIntensity: 0.5,
    });
  const body = new THREE.Mesh(new THREE.BoxGeometry(BODY.w, BODY.h, BODY.d), [
    side(false),
    side(true),
    mats.cabinet,
    mats.cabinet,
    new THREE.MeshStandardMaterial({
      map: frontTexture(),
      roughness: 0.4,
      envMap: env,
      envMapIntensity: 0.5,
    }),
    mats.cabinet,
  ]);
  body.position.set(0, BODY.y, BODY.z);
  g.add(body);

  // Coin door on the front face, left of the coin return tray.
  const zf = BODY.z + BODY.d / 2;
  const door = new THREE.Group();
  door.position.set(-3.1, BODY.y + 0.3, zf + 0.02);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(6.2, 4.0, 0.16), mats.satin);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(5.7, 3.5, 0.18), mats.enamel);
  panel.position.z = 0.03;
  door.add(frame, panel);
  const lit = new THREE.MeshBasicMaterial({
    color: new THREE.Color(1.7, 0.95, 0.28),
    toneMapped: false,
  });
  const litRed = new THREE.MeshBasicMaterial({
    color: new THREE.Color(1.8, 0.22, 0.14),
    toneMapped: false,
  });
  // The coin windows sit out at the edges so the legend between them stays readable.
  for (const x of [-2.05, 2.05]) {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.7, 0.1), mats.darkMetal);
    plate.position.set(x, 0.55, 0.14);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.4), lit);
    win.position.set(x, 0.55, 0.2);
    const slot = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.9, 0.05),
      new THREE.MeshBasicMaterial({ color: 0x050308 }),
    );
    slot.position.set(x, 0.62, 0.23);
    const button = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.1, 16), litRed);
    button.rotation.x = Math.PI / 2;
    button.position.set(x, -0.95, 0.16);
    door.add(plate, win, slot, button);
  }
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(2.5, 1.09),
    new THREE.MeshBasicMaterial({
      map: labelTexture(['PAY THE WARDEN', 'INSERT COIN', 'ONE BALL FREE']),
      toneMapped: false,
      color: new THREE.Color(1.3, 1.3, 1.3),
    }),
  );
  label.position.set(0, 0.1, 0.15);
  door.add(label);
  g.add(door);
  const lock = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.1, 14), mats.brass);
  lock.rotation.x = Math.PI / 2;
  lock.position.set(2.5, BODY.y - 1.55, zf + 0.06);
  g.add(lock);
  bakeStatic(g, new Set([body]));
  return g;
}

/** Four legs from the body's underside to the floor, plus levelers. Built in world space. */
export function buildLegs(
  root: THREE.Object3D,
  mats: MachineMaterials,
  floorY: number,
): THREE.Group {
  const g = new THREE.Group();
  root.updateMatrixWorld(true);
  const corners: [number, number][] = [
    [-BODY.w / 2 + 0.9, BODY.z + BODY.d / 2 - 1],
    [BODY.w / 2 - 0.9, BODY.z + BODY.d / 2 - 1],
    [-BODY.w / 2 + 0.9, BODY.z - BODY.d / 2 + 1],
    [BODY.w / 2 - 0.9, BODY.z - BODY.d / 2 + 1],
  ];
  const v = new THREE.Vector3();
  for (const [x, z] of corners) {
    v.set(x, BODY.y - BODY.h / 2, z);
    root.localToWorld(v);
    const top = v.y;
    const len = Math.max(0.5, top - floorY);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.5, len, 14), mats.darkMetal);
    leg.position.set(v.x, floorY + len / 2, v.z);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.66, 0.5, 14), mats.chrome);
    band.position.set(v.x, top - 0.7, v.z);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 0.28, 14), mats.rubberBlack);
    foot.position.set(v.x, floorY + 0.14, v.z);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.12, 1.7), mats.chrome);
    plate.position.set(v.x, top - 0.06, v.z);
    g.add(leg, band, foot, plate);
  }
  bakeStatic(g);
  return g;
}

/**
 * Backbox layout in its own space. The cabinet's rear edge hides everything below world
 * y ~ 5.3 from the play and seated cameras, so the DMD sits above that line and the glass
 * above the DMD.
 */
const BB = { w: TW + 3.4, h: 21, y: 10 };
const GLASS = { w: 17.6, h: 8.8, y: 5.5 };
const DMD = { w: 16, h: 4, y: -2 };

/** The backbox: backlit glass, DMD and flasher domes (child of the untilted cabinet group). */
export class Backbox {
  readonly group = new THREE.Group();
  private glassMat: THREE.MeshBasicMaterial | null = null;
  private dmdMat: THREE.MeshBasicMaterial | null = null;
  private readonly glow: THREE.Mesh;
  private time = 0;
  /** Extra brightness on the glass (juice hook), decays on its own. */
  private surge = 0;

  constructor(
    mats: MachineMaterials,
    private readonly bank: FlasherBank,
  ) {
    const g = this.group;
    g.name = 'backbox';
    g.position.set(0, BB.y, -TH / 2 - 4.2);
    const shell = new THREE.Mesh(new THREE.BoxGeometry(BB.w, BB.h, 4), mats.cabinet);
    g.add(shell);
    // Chrome trim around the whole front face.
    const w = BB.w;
    const top = BB.h / 2;
    for (const [bw, bh, x, y] of [
      [w + 0.2, 0.4, 0, top + 0.05],
      [w + 0.2, 0.4, 0, -top - 0.05],
      [0.4, BB.h + 0.5, -w / 2 - 0.05, 0],
      [0.4, BB.h + 0.5, w / 2 + 0.05, 0],
    ] as const) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.5), mats.satin);
      m.position.set(x, y, 2.0);
      g.add(m);
    }
    // Black bezels: one for the glass, one for the display, each with a chrome lip.
    const gw = GLASS.w + 1.2;
    const gh = GLASS.h + 1.0;
    const dw = DMD.w + 1.2;
    const dh = DMD.h + 1.0;
    const gb = new THREE.Mesh(new THREE.BoxGeometry(gw, gh, 0.3), mats.rubberBlack);
    gb.position.set(0, GLASS.y, 2.0);
    const db = new THREE.Mesh(new THREE.BoxGeometry(dw, dh, 0.3), mats.rubberBlack);
    db.position.set(0, DMD.y, 2.0);
    g.add(gb, db);
    for (const [bw, bh, x, y, z] of [
      [gw, 0.18, 0, GLASS.y + gh / 2, 2.18],
      [gw, 0.18, 0, GLASS.y - gh / 2, 2.18],
      [dw, 0.18, 0, DMD.y + dh / 2, 2.18],
      [dw, 0.18, 0, DMD.y - dh / 2, 2.18],
      [0.18, gh, -gw / 2, GLASS.y, 2.18],
      [0.18, gh, gw / 2, GLASS.y, 2.18],
      [0.18, dh, -dw / 2, DMD.y, 2.18],
      [0.18, dh, dw / 2, DMD.y, 2.18],
    ] as const) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.1), mats.satin);
      m.position.set(x, y, z);
      g.add(m);
    }
    bakeStatic(g);
    // Soft warm halo around the glass when the flashers blaze (a radial falloff, never a box).
    this.glow = new THREE.Mesh(
      new THREE.PlaneGeometry(36, 22),
      new THREE.MeshBasicMaterial({
        map: haloTexture(),
        color: new THREE.Color(1.0, 0.5, 0.2),
        transparent: true,
        opacity: 0.0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.glow.position.set(0, GLASS.y, 2.9);
    this.glow.visible = false;
    g.add(this.glow);
    // Flasher domes on top: a red pair and a white centre.
    bank.add('backL', 'red', g, -8.2, top, 0.3, mats, 1.5);
    bank.add('backR', 'red', g, 8.2, top, 0.3, mats, 1.5);
    bank.add('backC', 'white', g, 0, top, 0.3, mats, 1.2);
  }

  /** Hand over the live canvases: the DMD and the backglass. */
  attach(dmdTex: THREE.Texture, glassTex: THREE.Texture): void {
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(GLASS.w, GLASS.h),
      (this.glassMat = new THREE.MeshBasicMaterial({
        map: glassTex,
        color: new THREE.Color(1.18, 1.14, 1.1),
        toneMapped: false,
      })),
    );
    glass.position.set(0, GLASS.y, 2.17);
    glass.name = 'glass';
    const dmd = new THREE.Mesh(
      new THREE.PlaneGeometry(DMD.w, DMD.h),
      (this.dmdMat = new THREE.MeshBasicMaterial({
        map: dmdTex,
        color: new THREE.Color(2.4, 2.4, 2.4),
        toneMapped: false,
      })),
    );
    dmd.position.set(0, DMD.y, 2.17);
    dmd.name = 'dmd';
    this.group.add(glass, dmd);
  }

  /** Make the glass blaze for a moment (juice hook). */
  pulseGlass(k: number): void {
    this.surge = Math.max(this.surge, Math.min(this.bank.reduced ? 0.3 : 1.6, k));
  }

  update(dt: number): void {
    this.time += dt;
    this.surge *= Math.exp(-dt * 4);
    const fl =
      this.bank.energyOf('backL') + this.bank.energyOf('backR') + this.bank.energyOf('backC');
    const k = 1.16 + Math.min(0.85, fl * 0.3 + this.surge * 0.6);
    this.glassMat?.color.setRGB(k, k * 0.97, k * 0.93);
    if (this.dmdMat) {
      const d = 2.4 + this.surge * 1.5;
      this.dmdMat.color.setRGB(d, d, d);
    }
    const o = Math.min(0.4, fl * 0.18 + this.surge * 0.2);
    (this.glow.material as THREE.MeshBasicMaterial).opacity = o;
    this.glow.visible = o > 0.01;
  }
}
