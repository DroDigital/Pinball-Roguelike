/**
 * Dressing for the cell: a barred window with a shaft of moonlight, pipes and chains, a cot,
 * a bucket, a floor drain, a camera that watches the table, and dust in the air. All low-poly
 * and built in code; nothing here touches game state.
 */
import * as THREE from 'three';
import { canvasTexture, retroMaterial } from './retro-material';

export interface RoomBounds {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  floor: number;
  ceil: number;
}

const flat = (color: string) =>
  canvasTexture(8, 8, (g) => {
    g.fillStyle = color;
    g.fillRect(0, 0, 8, 8);
    for (let i = 0; i < 10; i++) {
      g.fillStyle = `rgba(0,0,0,${Math.random() * 0.25})`;
      g.fillRect(Math.random() * 8, Math.random() * 8, 2, 2);
    }
  });

const DUST = 90;

export class CellProps {
  readonly group = new THREE.Group();
  private readonly shaft: THREE.Mesh;
  private readonly led: THREE.MeshBasicMaterial;
  private readonly camHead = new THREE.Group();
  private readonly chains: THREE.Group[] = [];
  /** Hidden from the play camera: motes between the eye and the playfield read as noise. */
  readonly dust: THREE.Points;
  private readonly dustPos: Float32Array;
  private readonly dustVel: Float32Array;
  private readonly look = new THREE.Vector3();
  private time = 0;
  private sway = 0;

  constructor(private readonly R: RoomBounds) {
    const iron = retroMaterial({ map: flat('#34363a'), rust: 0.9 });
    const dark = retroMaterial({ map: flat('#1c1a18'), rust: 0.4 });
    const cloth = retroMaterial({ map: flat('#5a5648'), rust: 0.2 });
    const wood = retroMaterial({ map: flat('#4a3220'), rust: 0.3 });
    const box = (
      w: number,
      h: number,
      d: number,
      mat: THREE.Material,
      x: number,
      y: number,
      z: number,
      parent: THREE.Object3D = this.group,
    ): THREE.Mesh => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      parent.add(m);
      return m;
    };

    // The window: high on the far wall, barred, the only way the night gets in.
    const wx = -16;
    const wy = R.ceil - 14;
    const wz = R.z0 + 0.3;
    box(13, 9, 0.6, dark, wx, wy, wz);
    const sky = new THREE.Mesh(
      new THREE.PlaneGeometry(11, 7),
      new THREE.MeshBasicMaterial({ color: 0x2a3c66 }),
    );
    sky.position.set(wx, wy, wz + 0.35);
    this.group.add(sky);
    const moon = new THREE.Mesh(
      new THREE.CircleGeometry(1.3, 10),
      new THREE.MeshBasicMaterial({ color: 0xe8ecff }),
    );
    moon.position.set(wx + 2.6, wy + 1.2, wz + 0.4);
    this.group.add(moon);
    for (let i = -2; i <= 2; i++) box(0.5, 7.4, 0.5, iron, wx + i * 2.1, wy, wz + 0.7);
    // The shaft of moonlight falls across the floor toward the machine.
    const shaftGeo = new THREE.BufferGeometry();
    const fx = wx + 10;
    const fz = R.z0 + 34;
    const top = wy + 3.5;
    const bot = wy - 3.5;
    shaftGeo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [
          wx - 5.5,
          top,
          wz + 1,
          wx + 5.5,
          top,
          wz + 1,
          fx + 9,
          R.floor + 0.1,
          fz + 8,
          wx - 5.5,
          top,
          wz + 1,
          fx + 9,
          R.floor + 0.1,
          fz + 8,
          fx - 9,
          R.floor + 0.1,
          fz + 8,
          wx - 5.5,
          bot,
          wz + 1,
          wx + 5.5,
          bot,
          wz + 1,
          fx + 7,
          R.floor + 0.1,
          fz - 6,
          wx - 5.5,
          bot,
          wz + 1,
          fx + 7,
          R.floor + 0.1,
          fz - 6,
          fx - 7,
          R.floor + 0.1,
          fz - 6,
        ],
        3,
      ),
    );
    this.shaft = new THREE.Mesh(
      shaftGeo,
      new THREE.MeshBasicMaterial({
        color: 0x6f8fd0,
        transparent: true,
        opacity: 0.05,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.group.add(this.shaft);
    const pool = new THREE.Mesh(
      new THREE.PlaneGeometry(17, 13),
      new THREE.MeshBasicMaterial({
        color: 0x5f7fc0,
        transparent: true,
        opacity: 0.1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(fx, R.floor + 0.06, fz + 1);
    this.group.add(pool);

    // Pipes along the ceiling and down the right wall.
    const pipe = (
      len: number,
      r: number,
      x: number,
      y: number,
      z: number,
      axis: 'x' | 'y' | 'z',
    ) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6), iron);
      if (axis === 'x') m.rotation.z = Math.PI / 2;
      if (axis === 'z') m.rotation.x = Math.PI / 2;
      m.position.set(x, y, z);
      this.group.add(m);
    };
    pipe(R.x1 - R.x0, 0.9, 0, R.ceil - 2.5, R.z0 + 9, 'x');
    pipe(R.x1 - R.x0, 0.5, 0, R.ceil - 4.2, R.z0 + 11, 'x');
    pipe(R.z1 - R.z0, 0.7, R.x1 - 3, R.ceil - 3, (R.z0 + R.z1) / 2, 'z');
    pipe(R.ceil - R.floor, 0.7, R.x1 - 3, (R.ceil + R.floor) / 2, R.z0 + 9, 'y');
    for (const z of [R.z0 + 9, 0, 30]) box(1.8, 0.5, 1.8, iron, R.x1 - 3, R.ceil - 3, z);

    // Chains hanging from the big pipe; they sway when the machine is shaken.
    const linkGeo = new THREE.TorusGeometry(0.5, 0.14, 4, 6);
    for (const [x, n] of [
      [-30, 9],
      [-9, 5],
      [12, 7],
      [31, 11],
    ] as const) {
      const chain = new THREE.Group();
      for (let i = 0; i < n; i++) {
        const link = new THREE.Mesh(linkGeo, iron);
        link.position.y = -i * 1.15;
        link.rotation.y = i % 2 ? Math.PI / 2 : 0;
        chain.add(link);
      }
      const hook = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.18, 4, 6, Math.PI * 1.3), iron);
      hook.position.y = -n * 1.15 - 0.5;
      chain.add(hook);
      chain.position.set(x, R.ceil - 3.5, R.z0 + 9);
      this.group.add(chain);
      this.chains.push(chain);
    }

    // The cot against the right wall, behind the phone.
    const cot = new THREE.Group();
    box(9, 0.6, 22, iron, 0, 4, 0, cot);
    box(8.4, 1.2, 21, cloth, 0, 4.9, 0, cot);
    box(6, 1, 4, retroMaterial({ map: flat('#8a8474'), rust: 0.1 }), 0, 5.9, -8, cot);
    for (const [x, z] of [
      [-4, -10],
      [4, -10],
      [-4, 10],
      [4, 10],
    ] as const)
      box(0.6, 4, 0.6, iron, x, 2, z, cot);
    cot.position.set(R.x1 - 6.5, R.floor, R.z0 + 24);
    this.group.add(cot);

    // A bucket, a stool-height crate and a tin plate by the left wall.
    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 1.8, 4.4, 8, 1, true), iron);
    bucket.position.set(R.x0 + 10, R.floor + 2.2, 40);
    (bucket.material as THREE.Material).side = THREE.DoubleSide;
    this.group.add(bucket);
    box(6, 5, 6, wood, R.x0 + 9, R.floor + 2.5, 50).rotation.y = 0.3;
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(2, 1.6, 0.4, 8), iron);
    plate.position.set(R.x0 + 9, R.floor + 5.2, 50);
    this.group.add(plate);

    // The floor drain in front of the machine, and stains spreading from it.
    const grate = new THREE.Mesh(
      new THREE.PlaneGeometry(7, 7),
      new THREE.MeshBasicMaterial({
        map: canvasTexture(32, 32, (g) => {
          g.fillStyle = '#0a0908';
          g.fillRect(0, 0, 32, 32);
          g.fillStyle = '#3a3936';
          for (let i = 0; i < 6; i++) g.fillRect(2, 2 + i * 5, 28, 2);
          g.strokeStyle = '#55524c';
          g.strokeRect(0.5, 0.5, 31, 31);
        }),
      }),
    );
    grate.rotation.x = -Math.PI / 2;
    grate.position.set(-24, R.floor + 0.05, 30);
    this.group.add(grate);
    const stainTex = canvasTexture(64, 64, (g) => {
      g.clearRect(0, 0, 64, 64);
      for (let i = 0; i < 14; i++) {
        const r = 4 + Math.random() * 14;
        const grad = g.createRadialGradient(0, 0, 0, 0, 0, r);
        grad.addColorStop(0, 'rgba(30,8,4,0.55)');
        grad.addColorStop(1, 'rgba(30,8,4,0)');
        g.save();
        g.translate(12 + Math.random() * 40, 12 + Math.random() * 40);
        g.fillStyle = grad;
        g.fillRect(-r, -r, r * 2, r * 2);
        g.restore();
      }
    });
    for (const [x, z, s, rot] of [
      [-22, 26, 22, 0.4],
      [24, 8, 26, 2.1],
      [18, 42, 18, 4.0],
      [-27, -8, 20, 1.2],
    ] as const) {
      const stain = new THREE.Mesh(
        new THREE.PlaneGeometry(s, s),
        new THREE.MeshBasicMaterial({ map: stainTex, transparent: true, depthWrite: false }),
      );
      stain.rotation.set(-Math.PI / 2, 0, rot);
      stain.position.set(x, R.floor + 0.04, z);
      this.group.add(stain);
    }

    // The Warden's camera in the far left corner: it follows the ball.
    const mount = new THREE.Group();
    box(0.8, 0.8, 5, iron, 0, 0, 2.5, mount);
    box(3, 2.2, 5, dark, 0, 0, 0, this.camHead);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 1.4, 8), iron);
    lens.rotation.x = Math.PI / 2;
    lens.position.z = 3;
    this.camHead.add(lens);
    this.led = new THREE.MeshBasicMaterial({ color: 0xff2010 });
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.35, 6, 4), this.led);
    led.position.set(1, 0.8, 2.6);
    this.camHead.add(led);
    this.camHead.position.set(0, -1, 5.5);
    mount.add(this.camHead);
    mount.position.set(R.x0 + 14, R.ceil - 9, R.z0 + 0.5);
    this.group.add(mount);

    // Dust drifting through the bulb's light.
    this.dustPos = new Float32Array(DUST * 3);
    this.dustVel = new Float32Array(DUST * 3);
    for (let i = 0; i < DUST; i++) {
      this.dustPos[i * 3] = (Math.random() - 0.5) * 60;
      this.dustPos[i * 3 + 1] = R.floor + Math.random() * 44;
      this.dustPos[i * 3 + 2] = -20 + Math.random() * 60;
      this.dustVel[i * 3] = (Math.random() - 0.5) * 0.6;
      this.dustVel[i * 3 + 1] = -0.15 - Math.random() * 0.3;
      this.dustVel[i * 3 + 2] = (Math.random() - 0.5) * 0.6;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(this.dustPos, 3));
    this.dust = new THREE.Points(
      dustGeo,
      new THREE.PointsMaterial({
        color: 0xffe2b0,
        size: 0.22,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
      }),
    );
    this.dust.frustumCulled = false;
    this.group.add(this.dust);
  }

  /** The room shudders (a nudge, a jackpot): chains swing. */
  rattle(amount: number): void {
    this.sway = Math.min(1.2, this.sway + amount);
  }

  /** Point the camera at a world position (the ball, or the stool). */
  watch(p: THREE.Vector3): void {
    this.look.lerp(p, 0.08);
  }

  update(dt: number): void {
    this.time += dt;
    this.sway *= Math.exp(-dt * 0.8);
    this.chains.forEach((c, i) => {
      const a = 0.03 + this.sway * 0.35;
      c.rotation.z = Math.sin(this.time * (1.6 + i * 0.23) + i) * a;
      c.rotation.x = Math.cos(this.time * (1.3 + i * 0.17) + i * 2) * a * 0.6;
    });
    (this.shaft.material as THREE.MeshBasicMaterial).opacity =
      0.045 + Math.sin(this.time * 0.4) * 0.012;
    this.led.color.setHex(Math.sin(this.time * 3.2) > 0.2 ? 0xff2010 : 0x300604);
    this.camHead.lookAt(this.look);
    const R = this.R;
    for (let i = 0; i < DUST; i++) {
      const j = i * 3;
      this.dustPos[j] += this.dustVel[j] * dt;
      this.dustPos[j + 1] += this.dustVel[j + 1] * dt;
      this.dustPos[j + 2] += this.dustVel[j + 2] * dt;
      if (this.dustPos[j + 1] < R.floor) this.dustPos[j + 1] = R.floor + 44;
    }
    (this.dust.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }
}
