/**
 * The machine's reflection environment: a small procedural room (warm bulb, soft boxes, a
 * red and a cold neon strip, dark floor) baked through PMREM so the steel ball, chrome rails,
 * flipper bushings and glass catch real-looking highlights. HDR panels (values above 1) give
 * the ball its sharp window glints.
 */
import * as THREE from 'three';

function panel(
  w: number,
  h: number,
  color: [number, number, number],
  pos: [number, number, number],
  look: [number, number, number],
): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color().setRGB(...color),
      side: THREE.DoubleSide,
    }),
  );
  m.position.set(...pos);
  m.lookAt(...look);
  return m;
}

export function buildEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const scene = new THREE.Scene();
  // Room shell: dark warm walls, a lighter ceiling, nearly black floor.
  const geo = new THREE.SphereGeometry(90, 32, 20);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 90;
    if (y > 0) c.setRGB(0.1 + 0.34 * y, 0.075 + 0.22 * y, 0.055 + 0.15 * y);
    else c.setRGB(0.035 + 0.02 * -y, 0.024, 0.018);
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  scene.add(
    new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })),
  );
  // Overhead soft box and the bare bulb behind the viewer. The bulb is kept near 3.5 (not 9):
  // a hotter source turns each reflection on the ball into a bloom flare, not a highlight.
  // Broad panels stay at or below 1 so flat chrome never blooms; only the small lamps go hot.
  // A smaller softbox: a steel ball seen from above mirrors the whole ceiling, and a big
  // bright one turns its face into a white disc.
  scene.add(panel(14, 18, [1.05, 0.95, 0.8], [0, 40, 6], [0, 0, 6]));
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(2.2, 12, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(3.6, 2.7, 1.7) }),
  );
  bulb.position.set(0, 28, 14);
  scene.add(bulb);
  // Long cool strip lights on both sides: streaks down the chrome rails and the ball.
  scene.add(panel(5, 50, [0.8, 0.95, 1.25], [-48, 14, 4], [0, 8, 4]));
  scene.add(panel(5, 50, [0.8, 0.95, 1.25], [48, 14, 4], [0, 8, 4]));
  // Colour accents the ball picks up: red neon far left, amber backglass glow, cold blue right.
  scene.add(panel(4, 34, [2.0, 0.2, 0.12], [-40, 8, -30], [0, 6, 0]));
  scene.add(panel(4, 30, [0.2, 0.6, 1.7], [40, 8, -26], [0, 6, 0]));
  scene.add(panel(46, 16, [1.0, 0.45, 0.15], [0, 12, -62], [0, 6, 0]));
  // A dim warm card low in front: the lit coin door.
  scene.add(panel(26, 6, [1.4, 0.7, 0.3], [0, -6, 52], [0, 4, 0]));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(scene, 0.02);
  pmrem.dispose();
  geo.dispose();
  return rt.texture;
}
