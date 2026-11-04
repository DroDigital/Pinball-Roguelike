/**
 * Flasher domes: coloured translucent domes on the playfield and the backbox that blaze when
 * fired (juice hook: TableView.fireFlasher). Energy fades out in a fraction of a second, like
 * a cooling xenon tube; there is no strobe. Settings.reducedFlashing caps the peak and fades
 * faster.
 */
import * as THREE from 'three';
import { dome } from './machine-parts';
import type { MachineMaterials } from './materials';

export type FlasherColor = 'red' | 'yellow' | 'white';

/** What the unlit bulb looks like inside the dome (a warm filament even in a clear dome). */
const IDLE: Record<FlasherColor, THREE.Color> = {
  red: new THREE.Color(0.5, 0.06, 0.04),
  yellow: new THREE.Color(0.5, 0.36, 0.05),
  white: new THREE.Color(0.5, 0.34, 0.14),
};

const COLORS: Record<FlasherColor, THREE.Color> = {
  red: new THREE.Color(1, 0.12, 0.08),
  yellow: new THREE.Color(1, 0.72, 0.1),
  white: new THREE.Color(1, 0.92, 0.8),
};

interface Flasher {
  id: string;
  color: FlasherColor;
  lens: THREE.MeshPhysicalMaterial;
  bulb: THREE.MeshBasicMaterial;
  halo: THREE.Sprite;
  energy: number;
}

let haloTex: THREE.Texture | null = null;
function haloTexture(): THREE.Texture {
  if (haloTex) return haloTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.18, 'rgba(255,255,255,0.55)');
  r.addColorStop(0.5, 'rgba(255,255,255,0.14)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  haloTex = new THREE.CanvasTexture(c);
  haloTex.colorSpace = THREE.SRGBColorSpace;
  return haloTex;
}

export class FlasherBank {
  private readonly all: Flasher[] = [];
  private readonly byId = new Map<string, Flasher>();
  /** Honour Settings.reducedFlashing. */
  reduced = false;

  /** Build one flasher dome at `pos` inside `parent` and register it under `id`. */
  add(
    id: string,
    color: FlasherColor,
    parent: THREE.Object3D,
    x: number,
    y: number,
    z: number,
    mats: MachineMaterials,
    scale = 1,
  ): void {
    const tint = COLORS[color];
    const lens = new THREE.MeshPhysicalMaterial({
      // Mostly see-through: an opaque pale dome reads as a second ball on the playfield.
      color: tint.clone().multiplyScalar(color === 'white' ? 0.45 : 0.7),
      emissive: tint,
      emissiveIntensity: 0.04,
      transparent: true,
      opacity: 0.36,
      roughness: 0.08,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      envMap: mats.chrome.envMap,
      envMapIntensity: 1.2,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const bulb = new THREE.MeshBasicMaterial({ color: IDLE[color].clone() });
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.scale.setScalar(scale);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.5, 0.1, 20), mats.chrome);
    base.position.y = 0.05;
    const lensMesh = new THREE.Mesh(dome(0.42, 0.4), lens);
    lensMesh.position.y = 0.08;
    lensMesh.renderOrder = 4;
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8), bulb);
    core.position.y = 0.26;
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: haloTexture(),
        color: tint.clone().multiplyScalar(2.4),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    halo.position.y = 0.4;
    halo.scale.setScalar(5.2);
    halo.visible = false;
    group.add(base, core, lensMesh, halo);
    parent.add(group);
    const f: Flasher = { id, color, lens, bulb, halo, energy: 0 };
    this.all.push(f);
    this.byId.set(id, f);
  }

  /** Fire one flasher by id, every flasher of a colour ('red'), or 'all'. */
  fire(idOrGroup: string, strength = 1): void {
    const k = Math.min(this.reduced ? 0.35 : 1.4, strength);
    for (const f of this.all) {
      if (idOrGroup === 'all' || idOrGroup === f.id || idOrGroup === f.color)
        f.energy = Math.max(f.energy, k);
    }
  }

  energyOf(id: string): number {
    return this.byId.get(id)?.energy ?? 0;
  }

  /** A fired dome decays smoothly, like a xenon tube cooling: no strobe at any setting. */
  update(dt: number): void {
    const decay = Math.exp(-dt * (this.reduced ? 4 : 6.5));
    for (const f of this.all) {
      f.energy *= decay;
      if (f.energy < 0.004) f.energy = 0;
      const b = f.energy;
      const tint = COLORS[f.color];
      f.lens.emissiveIntensity = 0.04 + b * 2.4;
      f.bulb.color
        .copy(IDLE[f.color])
        .lerp(tint, Math.min(1, b))
        .multiplyScalar(1 + b * 7);
      const o = Math.min(1, b * 0.85);
      (f.halo.material as THREE.SpriteMaterial).opacity = o;
      f.halo.visible = o > 0.01;
    }
  }
}
