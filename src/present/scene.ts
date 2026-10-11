/**
 * The 3D world: the cell, the cabinet with DEBTOR'S PRISON on it, lights (incl. the bare bulb),
 * and cameras (Play cam, Seated cam, look-around between balls).
 */
import * as THREE from 'three';
import { TableView } from './table-view';
import { TW, TH } from './coords';

export type CamMode =
  | 'top'
  | 'play'
  | 'seated'
  | 'atm'
  | 'vending'
  | 'stash'
  | 'phone'
  | 'wall'
  | 'title'
  | 'fall'
  | 'door';

const TILT = 6.5 * (Math.PI / 180);

export class World {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 400);
  readonly table: TableView;
  readonly cabinet = new THREE.Group();
  readonly bulb: THREE.PointLight;
  readonly bulbMesh: THREE.Mesh;
  private readonly fill: THREE.HemisphereLight;
  private readonly key: THREE.DirectionalLight;
  private readonly gi: THREE.PointLight[] = [];
  private readonly camPos = new THREE.Vector3();
  private readonly camLook = new THREE.Vector3();
  private readonly goalPos = new THREE.Vector3();
  private readonly goalLook = new THREE.Vector3();
  mode: CamMode = 'title';
  /** Extra camera offset from shakes/nudges (decays). */
  readonly shake = new THREE.Vector3();
  private shakeVel = new THREE.Vector3();
  private bulbSwing = 0;
  private bulbSwingV = 0;
  private time = 0;
  /** Seated cam yaw offset for look-around (A/D). */
  lookYaw = 0;
  aspect = 16 / 9;

  constructor(tags: ReadonlySet<string>) {
    const envMap = makeEnvMap();
    this.table = new TableView(undefined, tags, envMap);
    this.scene.background = new THREE.Color(0x050403);
    this.scene.fog = new THREE.FogExp2(0x070504, 0.018);

    // Cabinet: the table group tilts toward the player like a real machine.
    this.table.root.rotation.x = TILT;
    this.cabinet.add(this.table.root);
    const wood = new THREE.MeshStandardMaterial({ color: 0x1d120c, roughness: 0.8 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(TW + 3.4, 6, TH + 5), wood);
    body.position.set(0, -3.2, -0.5);
    // The body tilts with the playfield so its top never cuts through the lower table.
    this.table.root.add(body);
    const lockbar = new THREE.Mesh(
      new THREE.BoxGeometry(TW + 3.6, 0.8, 1.2),
      new THREE.MeshStandardMaterial({ color: 0x8a8a90, metalness: 0.9, roughness: 0.3 }),
    );
    lockbar.position.set(0, 0.6, TH / 2 + 2.6);
    this.table.root.add(lockbar);
    // Backbox (DMD and backglass are attached later by the presentation layer).
    const back = new THREE.Mesh(new THREE.BoxGeometry(TW + 3.4, 16, 4), wood);
    back.position.set(0, 7.5, -TH / 2 - 4.2);
    back.name = 'backbox';
    this.cabinet.add(back);
    this.scene.add(this.cabinet);

    // Floor and walls of the cell (placeholder geometry; M5 replaces with the full cell).
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({ color: 0x15110e, roughness: 1 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -12;
    this.scene.add(floor);

    // Lights: a dim cell lit by one bare bulb; the machine's GI makes the playfield the
    // brightest thing in the room so it always reads.
    this.fill = new THREE.HemisphereLight(0x8a7458, 0x140c08, 1.1);
    this.scene.add(this.fill);
    this.bulb = new THREE.PointLight(0xffd59a, 1800, 140, 2);
    this.bulb.position.set(0, 26, 12);
    this.scene.add(this.bulb);
    this.bulbMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.6, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xfff0c0 }),
    );
    this.bulbMesh.position.copy(this.bulb.position);
    this.scene.add(this.bulbMesh);
    const key = new THREE.DirectionalLight(0xfff2dd, 2.2);
    key.position.set(-4, 30, 14);
    this.scene.add(key);
    this.key = key;
    // GI strings down both side rails plus the backbox spill.
    for (const [x, z, c, i] of [
      [-9, 14, 0xffc890, 40],
      [9, 14, 0xffc890, 40],
      [-9, 4, 0xffc080, 40],
      [9, 4, 0xffc080, 40],
      [-8, -7, 0xff9a70, 40],
      [8, -7, 0x90b8ff, 40],
      [0, -17, 0xffd0a0, 60],
    ] as const) {
      const l = new THREE.PointLight(c, i, 22, 1.6);
      l.position.set(x, 3.2, z);
      this.table.root.add(l);
      this.gi.push(l);
    }
    this.goalFor('title');
    this.camPos.copy(this.goalPos);
    this.camLook.copy(this.goalLook);
  }

  /** Blackout Sentence: the room and the machine's GI go dark; only the balls glow. */
  setBlackout(on: boolean): void {
    if (this.table.blackout === on) return;
    this.table.blackout = on;
    const k = on ? 0.06 : 1;
    this.fill.intensity = 1.1 * k;
    this.key.intensity = 2.2 * k;
    for (const l of this.gi) l.intensity = (l.userData.base ??= l.intensity) * k;
    this.bulb.visible = !on;
  }

  setMode(m: CamMode): void {
    this.mode = m;
    // From the play view the bare bulb would hang between the eye and the table.
    this.bulbMesh.visible = m !== 'play' && m !== 'top';
  }

  /** Camera goal for a mode. */
  private goalFor(m: CamMode): void {
    const p = this.goalPos;
    const l = this.goalLook;
    switch (m) {
      case 'play': {
        // High angle that keeps the whole playfield readable. Fit both height and width so
        // portrait phones show the full table; portrait also leaves headroom for the DMD.
        const portrait = this.aspect < 1.2;
        const half = (this.camera.fov * Math.PI) / 360;
        const fitH = TH * 0.62 + (portrait ? 3 : 0);
        const fitW = TW * 0.56;
        const dist = Math.max(fitH / Math.tan(half), fitW / (Math.tan(half) * this.aspect)) * 0.9;
        const pitch = 62 * (Math.PI / 180);
        l.set(0, 0, portrait ? -0.6 : 1.6);
        p.set(0, Math.sin(pitch) * dist, l.z + Math.cos(pitch) * dist);
        break;
      }
      case 'top': {
        // Dev: straight down the table normal.
        const n = new THREE.Vector3(0, 1, 0).applyAxisAngle(new THREE.Vector3(1, 0, 0), TILT);
        l.set(0, 0, 0);
        p.copy(n)
          .multiplyScalar(TH * 1.25)
          .add(new THREE.Vector3(0, 0, 0.01));
        break;
      }
      case 'seated':
        p.set(0, 12, TH / 2 + 15);
        l.set(0, 1, -6);
        break;
      case 'title':
        p.set(9, 16, TH / 2 + 16);
        l.set(0, 2, -3);
        break;
      default:
        p.set(0, 12, TH / 2 + 15);
        l.set(0, 1, -6);
    }
    if (m === 'seated' && this.lookYaw !== 0) {
      const eye = p.clone();
      const dir = l.clone().sub(eye);
      dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.lookYaw);
      l.copy(eye.add(dir));
    }
  }

  kick(strength: number, dir = new THREE.Vector3(0, 0, -1)): void {
    this.shakeVel.addScaledVector(dir, strength);
  }

  swingBulb(amount: number): void {
    this.bulbSwingV += amount;
  }

  update(dt: number): void {
    this.time += dt;
    this.camera.aspect = this.aspect;
    this.goalFor(this.mode);
    const k = 1 - Math.exp(-dt * 4);
    this.camPos.lerp(this.goalPos, k);
    this.camLook.lerp(this.goalLook, k);
    // Spring-damped shake.
    this.shakeVel.addScaledVector(this.shake, -180 * dt);
    this.shakeVel.multiplyScalar(Math.exp(-dt * 12));
    this.shake.addScaledVector(this.shakeVel, dt);
    this.camera.position.copy(this.camPos).add(this.shake);
    this.camera.lookAt(this.camLook.x + this.shake.x * 0.3, this.camLook.y, this.camLook.z);
    this.camera.updateProjectionMatrix();
    // Bulb pendulum + flicker.
    this.bulbSwingV += -this.bulbSwing * 9 * dt;
    this.bulbSwingV *= Math.exp(-dt * 0.6);
    this.bulbSwing += this.bulbSwingV * dt;
    this.bulb.position.set(
      Math.sin(this.bulbSwing) * 6,
      26 - Math.abs(Math.sin(this.bulbSwing)) * 1.5,
      12,
    );
    this.bulbMesh.position.copy(this.bulb.position);
    const flicker = Math.random() < 0.02 ? 0.4 : 1;
    this.bulb.intensity = 900 * flicker;
  }
}

/** A tiny procedural environment map for the chrome ball: warm bulb, dark room, lit glass. */
function makeEnvMap(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, '#4a3a2a');
  grad.addColorStop(0.45, '#1a120c');
  grad.addColorStop(0.55, '#2a1810');
  grad.addColorStop(1, '#0a0605');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 128);
  const r = g.createRadialGradient(128, 18, 2, 128, 18, 30);
  r.addColorStop(0, 'rgba(255,240,200,1)');
  r.addColorStop(1, 'rgba(255,200,120,0)');
  g.fillStyle = r;
  g.fillRect(80, 0, 96, 60);
  g.fillStyle = 'rgba(255,120,60,0.5)';
  g.fillRect(20, 70, 50, 10);
  g.fillStyle = 'rgba(120,180,255,0.4)';
  g.fillRect(180, 74, 40, 8);
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
