/**
 * Shared PBR materials for the machine and a small geometry batcher. Every static part of the
 * table is baked into a handful of merged meshes (one per material and visibility tag), so the
 * whole machine costs a few dozen draw calls even with hundreds of screws, rails and wires.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { loadArtFonts } from './art-kit';

export interface MachineMaterials {
  chrome: THREE.MeshStandardMaterial;
  /** Brushed chrome for long trims: broad soft highlights instead of hot lens-flare glints. */
  satin: THREE.MeshStandardMaterial;
  steel: THREE.MeshStandardMaterial;
  darkMetal: THREE.MeshStandardMaterial;
  brass: THREE.MeshStandardMaterial;
  rubberBlack: THREE.MeshStandardMaterial;
  rubberRed: THREE.MeshStandardMaterial;
  rubberWhite: THREE.MeshStandardMaterial;
  postWhite: THREE.MeshPhysicalMaterial;
  enamel: THREE.MeshPhysicalMaterial;
  enamelRed: THREE.MeshPhysicalMaterial;
  cabinet: THREE.MeshPhysicalMaterial;
  clear: THREE.MeshPhysicalMaterial;
  smoke: THREE.MeshPhysicalMaterial;
  ramp: THREE.MeshPhysicalMaterial;
  screw: THREE.MeshStandardMaterial;
  wire: THREE.MeshStandardMaterial;
}

/** Paint a canvas texture now, and again once the art fonts can be drawn to a canvas. */
export function artTexture(paint: (c: HTMLCanvasElement) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  paint(c);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  void loadArtFonts().then(() => {
    paint(c);
    t.needsUpdate = true;
  });
  return t;
}

export function makeMaterials(env: THREE.Texture | null): MachineMaterials {
  const metal = (color: number, roughness: number, intensity = 1.2) =>
    new THREE.MeshStandardMaterial({
      color,
      metalness: 1,
      roughness,
      envMap: env,
      envMapIntensity: intensity,
    });
  const gloss = (color: number, roughness: number, clearcoat = 1, intensity = 0.8) =>
    new THREE.MeshPhysicalMaterial({
      color,
      roughness,
      metalness: 0,
      clearcoat,
      clearcoatRoughness: 0.08,
      envMap: env,
      envMapIntensity: intensity,
    });
  const rubber = (color: number) =>
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.85,
      envMap: env,
      envMapIntensity: 0.25,
    });
  const clear = (color: number, opacity: number, rough = 0.14) =>
    new THREE.MeshPhysicalMaterial({
      color,
      transparent: true,
      opacity,
      roughness: rough,
      metalness: 0,
      clearcoat: 0.8,
      clearcoatRoughness: 0.22,
      envMap: env,
      envMapIntensity: 0.6,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  return {
    chrome: metal(0xf2f4f8, 0.2, 0.55),
    satin: metal(0xe4e8ee, 0.36, 0.6),
    steel: metal(0xaab0ba, 0.4, 0.7),
    darkMetal: metal(0x5a5f69, 0.42, 0.9),
    brass: metal(0xe0b048, 0.28, 1.2),
    rubberBlack: rubber(0x15151a),
    rubberRed: rubber(0xc01c14),
    rubberWhite: rubber(0xe8e2d2),
    postWhite: gloss(0xf4efe0, 0.28, 0.6, 0.8),
    enamel: gloss(0x14182c, 0.38, 1, 0.9),
    enamelRed: gloss(0x9c1710, 0.3, 1, 0.9),
    cabinet: gloss(0x10162c, 0.45, 0.6, 0.7),
    clear: clear(0xdfeeff, 0.16),
    smoke: clear(0x6a7a90, 0.34),
    ramp: clear(0x9fd0ff, 0.24),
    screw: metal(0xc8ccd4, 0.32, 0.6),
    wire: metal(0x8e96a6, 0.34, 0.6),
  };
}

interface Bucket {
  mat: THREE.Material;
  geos: THREE.BufferGeometry[];
  tag?: string;
  order: number;
}

/** Splits a multi-material geometry (Extrude: caps, sides) into one geometry per group. */
export function splitGroups(geo: THREE.BufferGeometry): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const src = geo.index ? geo.toNonIndexed() : geo;
  for (const grp of geo.groups) {
    const g = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'uv'] as const) {
      const a = src.getAttribute(name);
      if (!a) continue;
      const n = a.itemSize;
      const arr = new Float32Array(grp.count * n);
      for (let i = 0; i < grp.count * n; i++) arr[i] = a.array[grp.start * n + i];
      g.setAttribute(name, new THREE.BufferAttribute(arr, n));
    }
    out[grp.materialIndex ?? 0] = g;
  }
  return out;
}

/**
 * Merge a group's static meshes into one mesh per material (draw-call budget for phones).
 * Meshes with a material array, hidden meshes and anything in `keep` stay as they are.
 */
export function bakeStatic(
  root: THREE.Object3D,
  keep: ReadonlySet<THREE.Object3D> = new Set(),
): void {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const m = new THREE.Matrix4();
  const batch = new Batch();
  const dead: THREE.Mesh[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible || keep.has(o) || Array.isArray(mesh.material)) return;
    m.multiplyMatrices(inv, mesh.matrixWorld);
    batch.add(mesh.geometry, mesh.material, m, undefined, mesh.renderOrder);
    dead.push(mesh);
  });
  for (const mesh of dead) mesh.removeFromParent();
  batch.build(root, new Map());
}

export class Batch {
  private readonly buckets = new Map<string, Bucket>();
  private readonly m = new THREE.Matrix4();

  /** Add a geometry (cloned and baked with `matrix`). */
  add(
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    matrix?: THREE.Matrix4,
    tag?: string,
    order = 0,
  ): void {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) {
      if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    }
    if (!g.getAttribute('uv')) {
      g.setAttribute(
        'uv',
        new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2),
      );
    }
    g.clearGroups();
    if (matrix) g.applyMatrix4(matrix);
    const key = `${mat.uuid}|${tag ?? ''}`;
    let b = this.buckets.get(key);
    if (!b) {
      b = { mat, geos: [], tag, order };
      this.buckets.set(key, b);
    }
    b.geos.push(g);
  }

  /** Convenience: transform from position / rotation / scale. */
  addAt(
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
    rx = 0,
    ry = 0,
    rz = 0,
    tag?: string,
  ): void {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz));
    this.m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1));
    this.add(geo, mat, this.m, tag);
  }

  /** Merge each bucket into a mesh on `root`; returns the meshes by tag for visibility toggles. */
  build(root: THREE.Object3D, tagged: Map<string, THREE.Object3D[]>): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    for (const b of this.buckets.values()) {
      const merged = mergeGeometries(b.geos, false);
      for (const g of b.geos) g.dispose();
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, b.mat);
      mesh.renderOrder = b.order;
      root.add(mesh);
      meshes.push(mesh);
      if (b.tag) {
        const list = tagged.get(b.tag) ?? [];
        list.push(mesh);
        tagged.set(b.tag, list);
      }
    }
    this.buckets.clear();
    return meshes;
  }
}
