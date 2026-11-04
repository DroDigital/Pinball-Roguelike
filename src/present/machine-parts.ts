/** Geometry builders for the machine's parts (all built once; nothing here runs per frame). */
import * as THREE from 'three';

/** A flipper bat outline in table coordinates: pivot circle r0 at the origin, tip r1 at (len, 0). */
export function flipperShape(len: number, r0: number, r1: number): THREE.Shape {
  const phi = Math.asin((r0 - r1) / len);
  const a = Math.PI / 2 - phi;
  const s = new THREE.Shape();
  s.moveTo(r0 * Math.cos(a), r0 * Math.sin(a));
  s.absarc(0, 0, r0, a, Math.PI * 2 - a, false);
  s.lineTo(len + r1 * Math.cos(-a), r1 * Math.sin(-a));
  s.absarc(len, 0, r1, -a, a, false);
  s.lineTo(r0 * Math.cos(a), r0 * Math.sin(a));
  return s;
}

/** Point on the curve and the horizontal unit vector to its right. */
export function sideAt(
  curve: THREE.CatmullRomCurve3,
  u: number,
  p: THREE.Vector3,
  n: THREE.Vector3,
  t: THREE.Vector3,
): void {
  curve.getPointAt(u, p);
  curve.getTangentAt(u, t);
  n.set(-t.z, 0, t.x);
  if (n.lengthSq() < 1e-6) n.set(1, 0, 0);
  n.normalize();
}

/** A flat ribbon following the curve, `half` wide each side, `yOff` below the path. */
export function ribbon(
  curve: THREE.CatmullRomCurve3,
  seg: number,
  half: number,
  yOff: number,
): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const t = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    sideAt(curve, i / seg, p, n, t);
    pos.push(
      p.x - n.x * half,
      p.y + yOff,
      p.z - n.z * half,
      p.x + n.x * half,
      p.y + yOff,
      p.z + n.z * half,
    );
    if (i < seg) {
      const k = i * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A thin cylinder between two points (cross straps, struts). */
export function strut(
  a: THREE.Vector3,
  b: THREE.Vector3,
  r: number,
  radial = 5,
): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r, r, len, radial, 1, false);
  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    b.clone().sub(a).normalize(),
  );
  g.applyQuaternion(q);
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}

/** A tube along arbitrary points. */
export function tubeAlong(
  pts: THREE.Vector3[],
  radius: number,
  segPerUnit = 3,
  radial = 6,
): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts);
  const seg = Math.max(12, Math.round(curve.getLength() * segPerUnit));
  return new THREE.TubeGeometry(curve, seg, radius, radial, false);
}

/** The outline of a lamp insert in lamp-local space, y up (arrow tip along +x). */
export function lampOutline(kind: string, s: number): [number, number][] {
  switch (kind) {
    case 'arrow':
      return [
        [s * 0.7, 0],
        [-s * 0.5, s * 0.45],
        [-s * 0.25, 0],
        [-s * 0.5, -s * 0.45],
      ];
    case 'triangle':
      return [
        [s * 0.6, 0],
        [-s * 0.45, s * 0.5],
        [-s * 0.45, -s * 0.5],
      ];
    case 'rect':
      return [
        [-s * 0.5, -s * 0.3],
        [s * 0.5, -s * 0.3],
        [s * 0.5, s * 0.3],
        [-s * 0.5, s * 0.3],
      ];
    case 'star': {
      const pts: [number, number][] = [];
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? s * 0.28 : s * 0.65;
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        pts.push([Math.cos(a) * r, -Math.sin(a) * r]);
      }
      return pts;
    }
    default: {
      const pts: [number, number][] = [];
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * Math.PI * 2;
        pts.push([Math.cos(a) * s * 0.55, Math.sin(a) * s * 0.55]);
      }
      return pts;
    }
  }
}

/** A dome (hemisphere) of radius r, open at the bottom. */
export function dome(r: number, h = r): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * h));
  }
  return new THREE.LatheGeometry(pts, 20);
}

/** The pop-bumper cap: a flared mushroom with a rounded crown. */
export function bumperCap(r: number): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(r * 0.74, 0),
    new THREE.Vector2(r * 0.9, 0.0),
    new THREE.Vector2(r * 0.93, 0.07),
    new THREE.Vector2(r * 0.9, 0.16),
    new THREE.Vector2(r * 0.8, 0.2),
  ];
  for (let i = 1; i <= 8; i++) {
    const a = (i / 8) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.cos(a) * r * 0.74, 0.2 + Math.sin(a) * 0.3));
  }
  return new THREE.LatheGeometry(pts, 28);
}

/** Closed polyline helper for the rail strips. */
export function railStrip(
  pts: readonly (readonly number[])[],
  toWorld: (p: readonly number[]) => [number, number],
  halfW: number,
  y: number,
  height: number,
): THREE.BufferGeometry {
  // A vertical band with a flat top: used for chrome trims along boundary polylines.
  const pos: number[] = [];
  const idx: number[] = [];
  const n = pts.length;
  const w = pts.map((p) => toWorld(p));
  for (let i = 0; i < n; i++) {
    const prev = w[Math.max(0, i - 1)];
    const next = w[Math.min(n - 1, i + 1)];
    let dx = next[0] - prev[0];
    let dz = next[1] - prev[1];
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    const nx = -dz;
    const nz = dx;
    const [x, z] = w[i];
    // Four corners: inner bottom, inner top, outer top, outer bottom.
    pos.push(x - nx * halfW, y, z - nz * halfW);
    pos.push(x - nx * halfW, y + height, z - nz * halfW);
    pos.push(x + nx * halfW, y + height, z + nz * halfW);
    pos.push(x + nx * halfW, y, z + nz * halfW);
    if (i < n - 1) {
      const k = i * 4;
      for (let c = 0; c < 3; c++) {
        const a = k + c;
        const b = k + c + 1;
        idx.push(a, k + 4 + c, b, b, k + 4 + c, k + 4 + c + 1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
