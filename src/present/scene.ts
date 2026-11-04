/**
 * The 3D world: the cell, the cabinet with DEBTOR'S PRISON on it, lights (incl. the bare bulb),
 * and cameras (Play cam, Seated cam, look-around between balls).
 *
 * Visual hooks for juice (all honour Settings.reducedFlashing):
 *   world.table.flashPart('bumper' | 'sling' | 'target' | 'spinner', index, strength)
 *   world.table.fireFlasher(id | 'red' | 'yellow' | 'white' | 'all', strength)
 *   world.table.giPulse(colour, strength)       GI bulbs and GI lights surge in a colour
 *   world.table.flashLamp(lampId | 'all', strength)   insert overdrive past full brightness
 *   world.backbox.pulseGlass(k)                 backglass, DMD and the glow spill blaze
 *   renderer.bloomPulse(k)                      bloom and exposure kick (RetroRenderer)
 *   LampShowPlayer.play(name)                   named lamp shows (attract, riot, payday, ...)
 *   world.kick(strength, dir) / world.swingBulb(amount)   camera shove and the bare bulb
 */
import * as THREE from 'three';
import { TableView } from './table-view';
import { TW, TH } from './coords';
import { CellRoom, PROPS, ROOM } from './cell';
import { ROOM_UNIFORMS } from './retro-material';
import { CoinTray } from './coins';
import { Backbox, buildBody, buildLegs } from './cabinet';

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
  | 'door'
  | 'tray';

const TILT = 6.5 * (Math.PI / 180);
const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Y = new THREE.Vector3(0, 1, 0);
export const FOG_DENSITY = 0.006;
/** The bare bulb hangs off to the left so it never sits in front of the backglass. */
const BULB_X = -11;

export class World {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 400);
  readonly table: TableView;
  readonly cabinet = new THREE.Group();
  readonly backbox: Backbox;
  /** The bare bulb: a position for the cell's shader and the mesh (not a real light, which
   * would add per-fragment cost to every machine material). */
  readonly bulb = { position: new THREE.Vector3(BULB_X, 26, 12), visible: true };
  readonly bulbMesh: THREE.Mesh;
  readonly cell: CellRoom;
  readonly coins = new CoinTray();
  /** World position of the coin tray (camera target). */
  private readonly trayPos = new THREE.Vector3();
  /** Seconds into the trapdoor fall (mode 'fall'). */
  fallT = 0;
  private flickerChance = 0.02;
  private readonly fill: THREE.HemisphereLight;
  private readonly key: THREE.DirectionalLight;
  private readonly gi: THREE.PointLight[] = [];
  private readonly giBase: number[] = [];
  private readonly giTint = new THREE.Color();
  /** Warm pool of light the machine throws on the floor (follows GI level and surges). */
  private readonly floorGlow: THREE.Mesh;
  private readonly camPos = new THREE.Vector3();
  private readonly camLook = new THREE.Vector3();
  private readonly goalPos = new THREE.Vector3();
  private readonly goalLook = new THREE.Vector3();
  private readonly tmpOff = new THREE.Vector3();
  mode: CamMode = 'title';
  /** Extra camera offset from shakes/nudges (decays). */
  readonly shake = new THREE.Vector3();
  private shakeVel = new THREE.Vector3();
  private bulbSwing = 0;
  private bulbSwingV = 0;
  private time = 0;
  /** An ending's scripted camera overrides the mode's goal while set. */
  scripted: { pos: THREE.Vector3; look: THREE.Vector3; rate: number } | null = null;
  /** Seated cam yaw offset for look-around (A/D). */
  lookYaw = 0;
  /** Moonshine camera sway amount (0..1). */
  sway = 0;
  /** The bare bulb's brightness (dims as the cell decays). */
  bulbPower = 1800;
  aspect = 16 / 9;

  constructor(tags: ReadonlySet<string>, env: THREE.Texture | null = null) {
    this.table = new TableView(undefined, tags, env);
    this.scene.background = new THREE.Color(0x050403);
    this.scene.fog = new THREE.FogExp2(0x070504, FOG_DENSITY);

    // Cabinet: the table group tilts toward the player like a real machine.
    this.table.root.rotation.x = TILT;
    this.cabinet.add(this.table.root);
    const mats = this.table.materials;
    // The body tilts with the playfield so its top never cuts through the lower table.
    this.table.root.add(buildBody(mats, env));
    // Backbox: backlit glass, DMD and flasher domes (attached by the app via attach()).
    this.backbox = new Backbox(mats, this.table.flashers);
    this.cabinet.add(this.backbox.group);
    this.scene.add(this.cabinet);
    this.cabinet.updateMatrixWorld(true);
    this.cabinet.add(buildLegs(this.table.root, mats, ROOM.floor));
    // Coin tray hung on the cabinet front, under the lockbar and right of centre.
    this.table.root.localToWorld(this.trayPos.set(TW / 2 - 4.2, -3.8, TH / 2 + 2));
    this.trayPos.z += 1.5;
    this.coins.group.position.copy(this.trayPos);
    this.scene.add(this.coins.group);

    // The cell around the machine.
    this.cell = new CellRoom();
    this.scene.add(this.cell.group);
    this.floorGlow = makeFloorGlow();
    this.floorGlow.position.set(0, ROOM.floor + 0.06, 8);
    this.scene.add(this.floorGlow);

    // Lights: a dim cell lit by one bare bulb; the machine's GI makes the playfield the
    // brightest thing in the room so it always reads.
    this.fill = new THREE.HemisphereLight(0x8a7458, 0x140c08, 0.5);
    this.scene.add(this.fill);
    this.bulbMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.6, 8, 6),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 4, 2.6), toneMapped: false }),
    );
    this.bulbMesh.position.copy(this.bulb.position);
    this.scene.add(this.bulbMesh);
    const key = new THREE.DirectionalLight(0xfff2dd, 1.0);
    key.position.set(-4, 30, 14);
    this.scene.add(key);
    this.key = key;
    // GI: two real lights (fragment cost scales with light count on phones); the rest of the
    // glow is the instanced bulbs on the rails.
    for (const [x, z, c, i] of [
      [0, 9, 0xffc890, 24],
      [0, -10, 0xffc08c, 24],
    ] as const) {
      const l = new THREE.PointLight(c, i, 38, 1.5);
      l.position.set(x, 5, z);
      this.table.root.add(l);
      this.gi.push(l);
      this.giBase.push(i);
    }
    this.goalFor('title');
    this.camPos.copy(this.goalPos);
    this.camLook.copy(this.goalLook);
  }

  /** The cell decays with the deadlines: rust, the leak, a dimmer and twitchier bulb. */
  setDecay(d: number): void {
    this.cell.setDecay(d);
    this.bulbPower = 1800 * (1 - 0.35 * d);
    this.flickerChance = 0.02 + 0.08 * d;
  }

  /** Blackout Sentence: the room and the machine's GI go dark; only the balls glow. */
  /** Bring the machine's GI back after JAILBREAK. */
  restoreLights(): void {
    this.lightsDying = false;
    this.table.giLevel = 1;
    this.applyGi(1);
  }

  setBlackout(on: boolean): void {
    if (this.table.blackout === on) return;
    this.table.blackout = on;
    const k = on ? 0.06 : 1;
    this.fill.intensity = 0.5 * k;
    this.key.intensity = 1.0 * k;
    this.table.giLevel = k;
    this.applyGi(k);
    this.bulb.visible = !on;
  }

  /** JAILBREAK: the machine's lights are dying (GI sags slowly). */
  lightsDying = false;
  private sagPhase = 0;
  private sagDepth = 0.5;

  /** GI lights follow the table's level and its colour surge (giPulse). */
  private applyGi(level: number): void {
    const p = this.table.gi;
    const glow = this.floorGlow.material as THREE.MeshBasicMaterial;
    glow.opacity = Math.min(1, 0.15 * level * (1 + p.pulse * 3));
    glow.color.setHex(0xffa860).lerp(p.color, Math.min(1, p.pulse * 0.8));
    this.giTint.setHex(0xffc890);
    for (let i = 0; i < this.gi.length; i++) {
      // A surge brightens the real GI lights but never tints them: the printed field keeps
      // its colour (the bulbs and inserts carry the surge colour).
      const l = this.gi[i];
      l.intensity = this.giBase[i] * level * (1 + p.pulse * 0.9);
      l.color.setHex(0xffc890);
    }
  }

  setMode(m: CamMode): void {
    if (m === 'fall' && this.mode !== 'fall') this.fallT = 0;
    if (m !== 'fall' && this.mode === 'fall') this.cell.openTrapdoor(0);
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
        l.set(0, 0, 0);
        p.set(0, 1, 0)
          .applyAxisAngle(AXIS_X, TILT)
          .multiplyScalar(TH * 1.25);
        p.z += 0.01;
        break;
      }
      case 'seated':
        p.set(0, 13, TH / 2 + 17);
        l.set(0, 4.5, -6);
        break;
      case 'atm':
        p.set(18, 9, 24);
        l.copy(PROPS.atm);
        break;
      case 'phone':
        p.set(22, 11, 10);
        l.copy(PROPS.phone);
        break;
      case 'vending':
        p.set(-16, 8, 26);
        l.copy(PROPS.vending);
        break;
      case 'wall':
        p.set(-14, 13, 4);
        l.copy(PROPS.tally);
        break;
      case 'stash':
        p.set(-18, 2, -14);
        l.copy(PROPS.stash);
        break;
      case 'door':
        p.set(0, 10, 34);
        l.copy(PROPS.door);
        break;
      case 'fall': {
        // Through the trapdoor: the floor opens and the light shrinks above you.
        const t = this.fallT;
        p.set(0, 12 - 0.5 * 34 * t * t, TH / 2 + 15 + Math.min(1, t) * 3);
        l.set(0, 40, TH / 2 + 10);
        break;
      }
      case 'tray':
        // Looking down past the lockbar at the coins.
        l.copy(this.trayPos).add(this.tmpOff.set(-4.5, 1.5, -3));
        p.copy(this.trayPos).add(this.tmpOff.set(-7, 10.5, 11));
        break;
      case 'title':
        p.set(9, 17, TH / 2 + 18);
        l.set(0, 4.5, -3);
        break;
      default:
        p.set(0, 13, TH / 2 + 17);
        l.set(0, 4.5, -6);
    }
    if (m === 'seated' || m === 'title') this.fitTable(p, l);
    if (m === 'seated' && this.lookYaw !== 0) {
      this.tmpOff.copy(l).sub(p).applyAxisAngle(AXIS_Y, this.lookYaw);
      l.copy(p).add(this.tmpOff);
    }
  }

  /**
   * Back the camera off until the whole table fits, by width (narrow screens) and by height
   * (the flippers and drain stay in frame at any aspect), the same contract as the play view.
   */
  private fitTable(p: THREE.Vector3, l: THREE.Vector3): void {
    const half = (this.camera.fov * Math.PI) / 360;
    const fitW = (TW + 6) / 2 / (Math.tan(half) * this.aspect);
    const fitH = (TH * 0.62) / Math.tan(half);
    const fit = Math.max(fitW, fitH);
    const off = this.tmpOff.copy(p).sub(l);
    const len = off.length();
    if (len < fit) p.copy(l).addScaledVector(off, fit / len);
  }

  /**
   * A slow swell (about 0.4 Hz, 0..depth) for the JAILBREAK sag and the decaying bulb. The
   * depth is re-rolled once per cycle, so the randomness sets the rate and depth of the
   * dimming, never a per-frame on/off.
   */
  private sag(dt: number): number {
    this.sagPhase += dt * 0.4;
    if (this.sagPhase >= 1) {
      this.sagPhase -= 1;
      this.sagDepth = 0.4 + Math.random() * 0.6;
    }
    return (0.5 - 0.5 * Math.cos(this.sagPhase * Math.PI * 2)) * this.sagDepth;
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
    const sc = this.scripted;
    if (sc) {
      this.goalPos.copy(sc.pos);
      this.goalLook.copy(sc.look);
    } else this.goalFor(this.mode);
    const k = 1 - Math.exp(-dt * (sc ? sc.rate : 4));
    this.camPos.lerp(this.goalPos, k);
    this.camLook.lerp(this.goalLook, k);
    // Spring-damped shake.
    this.shakeVel.addScaledVector(this.shake, -180 * dt);
    this.shakeVel.multiplyScalar(Math.exp(-dt * 12));
    this.shake.addScaledVector(this.shakeVel, dt);
    this.camera.position.copy(this.camPos).add(this.shake);
    // Moonshine: a slow drunken drift.
    const sx = this.sway * Math.sin(this.time * 0.7) * 1.4;
    const sy = this.sway * Math.sin(this.time * 1.1) * 0.5;
    this.camera.position.x += sx * 0.5;
    this.camera.position.y += sy;
    this.camera.lookAt(this.camLook.x + this.shake.x * 0.3 + sx, this.camLook.y, this.camLook.z);
    this.camera.updateProjectionMatrix();
    // Bulb pendulum + flicker.
    this.bulbSwingV += -this.bulbSwing * 9 * dt;
    this.bulbSwingV *= Math.exp(-dt * 0.6);
    this.bulbSwing += this.bulbSwingV * dt;
    this.bulb.position.set(
      BULB_X + Math.sin(this.bulbSwing) * 6,
      26 - Math.abs(Math.sin(this.bulbSwing)) * 1.5,
      12,
    );
    this.bulbMesh.position.copy(this.bulb.position);
    ROOM_UNIFORMS.uBulbPos.value.copy(this.bulb.position);
    const swell = this.sag(dt);
    // Decay: the bulb dims in slow swells, never a per-frame blink (reduced: steady).
    const flicker = this.table.reducedFlashing
      ? 1
      : 1 - Math.min(0.5, this.flickerChance * 4) * swell;
    ROOM_UNIFORMS.uBulbPower.value = this.bulb.visible ? (this.bulbPower / 1800) * flicker : 0.05;
    if (this.lightsDying && !this.table.blackout) {
      // JAILBREAK: the GI sags and recovers slowly; reduced flashing holds it steady and dim.
      this.table.giLevel = this.table.reducedFlashing ? 0.25 : 0.22 + 0.2 * (1 - swell);
    }
    this.applyGi(this.table.blackout ? 0.06 : this.table.giLevel);
    this.backbox.update(dt);
    this.cell.update(dt);
    if (this.mode === 'fall') {
      this.fallT += dt;
      this.cell.openTrapdoor(Math.min(1, this.fallT * 3));
    }
  }
}

function makeFloorGlow(): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,0.9)');
  r.addColorStop(0.35, 'rgba(255,255,255,0.4)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(64, 84),
    new THREE.MeshBasicMaterial({
      map: tex,
      color: 0xffa860,
      transparent: true,
      opacity: 0.15,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 1;
  m.name = 'floor-glow';
  return m;
}
