/**
 * The coin tray on the front of the cabinet. Winnings spill out of the coin return in a
 * fountain and pile up; the pile is your pocket and empties when you feed the ATM. One
 * instanced mesh, simple ballistic coins against a heightmap: no physics engine, no
 * allocation per frame.
 */
import * as THREE from 'three';

const POOL = 140;
const HW = 2.7; // tray inner half-width (x)
const HD = 1.35; // tray inner half-depth (z)
const WALL = 1.1;
const COIN_R = 0.42;
const COIN_H = 0.09;
const GRAVITY = -32;
const GRID_X = 9;
const GRID_Z = 4;
const SPAWN_RATE = 30; // coins per second at most
const BOUNCE_VY = 3;

const enum State {
  Hidden,
  Flying,
  Settled,
}

interface Coin {
  s: State;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  rz: number;
  spin: number;
  ry: number;
}

export class CoinTray {
  readonly group = new THREE.Group();
  private readonly mesh: THREE.InstancedMesh;
  private readonly coins: Coin[] = [];
  private readonly heights = new Float32Array(GRID_X * GRID_Z);
  private pending = 0;
  private spawnAcc = 0;
  private next = 0;
  private dirty = true;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly p = new THREE.Vector3();
  private readonly one = new THREE.Vector3(1, 1, 1);
  private readonly hide = new THREE.Matrix4().makeScale(0, 0, 0);

  constructor() {
    const steel = new THREE.MeshStandardMaterial({
      color: 0x5a5c60,
      metalness: 0.8,
      roughness: 0.45,
    });
    const box = (w: number, h: number, d: number, x: number, y: number, z: number) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), steel);
      b.position.set(x, y, z);
      this.group.add(b);
    };
    const T = 0.16;
    box(HW * 2 + T * 2, T, HD * 2 + T * 2, 0, -T / 2, 0);
    box(T, WALL, HD * 2 + T * 2, -HW - T / 2, WALL / 2, 0);
    box(T, WALL, HD * 2 + T * 2, HW + T / 2, WALL / 2, 0);
    box(HW * 2, WALL * 0.7, T, 0, WALL * 0.35, HD + T / 2);
    // The coin return: a dark mouth in a chrome bezel on the cabinet face.
    // The cabinet face leans back with the tilt, so the bezel sits a little proud of the tray.
    box(2.2, 1.2, 0.2, 0, 1.75, -HD + 0.2);
    const mouth = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.5, 0.1),
      new THREE.MeshBasicMaterial({ color: 0x050403 }),
    );
    mouth.position.set(0, 1.65, -HD + 0.32);
    this.group.add(mouth);
    const gold = new THREE.MeshStandardMaterial({
      color: 0xd8a83a,
      metalness: 0.85,
      roughness: 0.32,
      emissive: 0x2a1a04,
    });
    this.mesh = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(COIN_R, COIN_R, COIN_H, 12),
      gold,
      POOL,
    );
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);
    for (let i = 0; i < POOL; i++) {
      this.coins.push({
        s: State.Hidden,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        rx: 0,
        rz: 0,
        spin: 0,
        ry: 0,
      });
      this.mesh.setMatrixAt(i, this.hide);
    }
  }

  /** Coins currently in the tray or in the air. */
  get count(): number {
    let n = 0;
    for (const c of this.coins) if (c.s !== State.Hidden) n++;
    return n + this.pending;
  }

  /** Spill `n` coins out of the coin return (the tray holds at most POOL). */
  pour(n: number): void {
    const visible = this.count - this.pending;
    this.pending = Math.min(POOL - visible, this.pending + Math.max(0, Math.round(n)));
  }

  /** Show `n` coins already at rest (after a load or a jump between screens). */
  setPile(n: number): void {
    this.clear();
    const k = Math.min(POOL, Math.max(0, Math.round(n)));
    for (let i = 0; i < k; i++) {
      const c = this.coins[i];
      c.x = (Math.random() * 2 - 1) * (HW - COIN_R);
      c.z = (Math.random() * 2 - 1) * (HD - COIN_R);
      this.settle(c);
    }
    this.next = k % POOL;
    this.dirty = true;
  }

  /** The ATM takes everything in the tray. */
  clear(): void {
    for (const c of this.coins) c.s = State.Hidden;
    this.heights.fill(0);
    this.pending = 0;
    this.next = 0;
    this.dirty = true;
  }

  /** Advance the coins; returns how many hit the tray this frame (for clinks). */
  update(dt: number): number {
    let landed = 0;
    if (this.pending > 0) {
      this.spawnAcc += dt * SPAWN_RATE;
      while (this.spawnAcc >= 1 && this.pending > 0) {
        this.spawnAcc -= 1;
        this.pending--;
        this.spawn();
      }
    } else this.spawnAcc = 0;
    for (const c of this.coins) {
      if (c.s !== State.Flying) continue;
      this.dirty = true;
      c.vy += GRAVITY * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.z += c.vz * dt;
      c.rx += c.spin * dt;
      // Tray walls (only below their lip).
      if (c.y < WALL) {
        if (Math.abs(c.x) > HW - COIN_R) {
          c.x = Math.sign(c.x) * (HW - COIN_R);
          c.vx *= -0.35;
        }
        if (Math.abs(c.z) > HD - COIN_R) {
          c.z = Math.sign(c.z) * (HD - COIN_R);
          c.vz *= -0.35;
        }
      }
      const floor = this.heightAt(c.x, c.z);
      if (c.y <= floor + COIN_H / 2 && c.vy < 0) {
        landed++;
        if (c.vy < -BOUNCE_VY * 2) {
          c.y = floor + COIN_H / 2;
          c.vy *= -0.28;
          c.vx *= 0.5;
          c.vz *= 0.5;
          c.spin *= 0.5;
        } else this.settle(c);
      }
    }
    if (this.dirty) this.writeMatrices();
    return landed;
  }

  private spawn(): void {
    // Recycle the oldest slot if every coin is out (the pile just stops growing).
    let c = this.coins[this.next];
    for (let tries = 0; tries < POOL && c.s !== State.Hidden; tries++) {
      this.next = (this.next + 1) % POOL;
      c = this.coins[this.next];
    }
    if (c.s !== State.Hidden) return;
    this.next = (this.next + 1) % POOL;
    c.s = State.Flying;
    c.x = (Math.random() - 0.5) * 0.9;
    c.y = 1.65;
    c.z = -HD + 0.5;
    c.vx = (Math.random() - 0.5) * 6;
    c.vy = 2 + Math.random() * 4;
    c.vz = 0.8 + Math.random() * 3.2;
    c.rx = Math.random() * Math.PI;
    c.rz = (Math.random() - 0.5) * 0.6;
    c.ry = Math.random() * Math.PI * 2;
    c.spin = (Math.random() < 0.5 ? -1 : 1) * (8 + Math.random() * 14);
  }

  private cell(x: number, z: number): number {
    const gx = Math.min(GRID_X - 1, Math.max(0, Math.floor(((x + HW) / (2 * HW)) * GRID_X)));
    const gz = Math.min(GRID_Z - 1, Math.max(0, Math.floor(((z + HD) / (2 * HD)) * GRID_Z)));
    return gz * GRID_X + gx;
  }

  private heightAt(x: number, z: number): number {
    return this.heights[this.cell(x, z)];
  }

  private settle(c: Coin): void {
    const i = this.cell(c.x, c.z);
    c.s = State.Settled;
    c.y = this.heights[i] + COIN_H / 2;
    // Coins land mostly flat, a few propped on their neighbours.
    c.rx = (Math.random() - 0.5) * 0.5;
    c.rz = (Math.random() - 0.5) * 0.5;
    this.heights[i] = Math.min(WALL * 1.4, this.heights[i] + COIN_H * 0.8);
  }

  private writeMatrices(): void {
    for (let i = 0; i < POOL; i++) {
      const c = this.coins[i];
      if (c.s === State.Hidden) {
        this.mesh.setMatrixAt(i, this.hide);
        continue;
      }
      this.e.set(c.rx, c.ry, c.rz);
      this.q.setFromEuler(this.e);
      this.p.set(c.x, c.y, c.z);
      this.m.compose(this.p, this.q, this.one);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.dirty = false;
  }
}
