/**
 * PinballSim: the physical machine. Planck world on the playfield plane, fixed 240 Hz step.
 * Emits SimEvents; knows nothing about scoring. Rules drive it through the command methods.
 */
import {
  World,
  Vec2,
  CircleShape,
  ChainShape,
  PolygonShape,
  RevoluteJoint,
  WorldManifold,
  type Body,
  type Contact,
  type Fixture,
} from 'planck';
import { Rng } from '../core/rng';
import { DEG, pointInPolygon, segmentCross, side, type P2 } from '../core/math';
import { StateHasher } from '../core/hash';
import type {
  DropTargetDef,
  FlipperDef,
  MaterialId,
  OneWayDef,
  SlingDef,
  TableDef,
  TriggerDef,
} from './table-def';
import type { SimConfig } from './sim-config';
import { EventRing } from './events';
import { TransportPath } from './transport';

export interface SimInput {
  left: boolean;
  right: boolean;
  plunger: boolean;
  /** Analog plunger pull 0..1 (touch); -1 to use hold-time pull. */
  pull: number;
  /** One-step nudge pulse: 0 none, 1 up, 2 left, 3 right. */
  nudge: 0 | 1 | 2 | 3;
}

export const emptyInput = (): SimInput => ({
  left: false,
  right: false,
  plunger: false,
  pull: -1,
  nudge: 0,
});

export type BallState = 'field' | 'transport' | 'held' | 'gone';

export class SimBall {
  state: BallState = 'field';
  body: Body | null = null;
  x = 0;
  y = 0;
  z = 0;
  vx = 0;
  vy = 0;
  px = 0;
  py = 0;
  pz = 0;
  // transport
  path: TransportPath | null = null;
  transportId = '';
  tU = 0;
  tDur = 1;
  // bookkeeping
  lastOutlaneStep = -1e9;
  lastOutlaneId = '';
  lastCenterStep = -1e9;
  stuckTime = 0;
  rescues = 0;
  rescueX = 0;
  rescueY = 0;
  divert = false;
  chuteEntered = false;
  /** True until the ball first leaves the shooter lane. */
  inShooter = true;
  heldSteps = 0;
  autoLaunchIn = -1;
  /** Steps since this ball entered play. */
  age = 0;
  constructor(readonly id: number) {}
}

const enum FixKind {
  Ball,
  Wall,
  Post,
  Pop,
  Sling,
  SlingFace,
  Drop,
  Flipper,
  OneWay,
}

interface FixTag {
  kind: FixKind;
  id: string;
  mat: MaterialId;
  index: number;
  ball: SimBall | null;
}

const CAT_BALL = 1;
const CAT_STATIC = 2;
const CAT_FLIPPER = 4;

export class FlipperRT {
  pressed = false;
  eos = false;
  angle = 0;
  prevAngle = 0;
  readonly dir: number;
  readonly stroke: number;
  readonly restAngle: number;
  constructor(
    readonly def: FlipperDef,
    readonly body: Body,
    readonly joint: RevoluteJoint,
  ) {
    this.dir = def.side === 'left' ? 1 : -1;
    this.stroke = (def.upDeg - def.restDeg) * DEG;
    this.restAngle = def.side === 'left' ? def.restDeg * DEG : Math.PI - def.restDeg * DEG;
    this.angle = this.prevAngle = this.restAngle;
  }
  /** 0 at rest .. 1 fully up. */
  get progress(): number {
    return (this.dir * this.joint.getJointAngle()) / this.stroke;
  }
}

interface DropRT {
  def: DropTargetDef;
  body: Body;
  up: boolean;
  nx: number;
  ny: number;
}

interface PopRT {
  id: string;
  x: number;
  y: number;
  r: number;
  cooldown: number;
  flash: number;
}

interface SlingRT {
  def: SlingDef;
  nx: number;
  ny: number;
  cooldown: number;
  flash: number;
}

interface SpinnerRT {
  id: string;
  a: P2;
  b: P2;
  /** Revolutions. */
  angle: number;
  /** Revolutions per second. */
  vel: number;
}

const PEND_POP = 1;
const PEND_SLING = 2;
const PEND_DROP = 3;
const MAX_PEND = 64;
const LIMIT_INSET = 2 * DEG;
const scratchV = { x: 0, y: 0 };
function setVel(body: Body, x: number, y: number): void {
  scratchV.x = x;
  scratchV.y = y;
  body.setLinearVelocity(scratchV as Vec2);
}

export interface SimOptions {
  table: TableDef;
  config: SimConfig;
  /** Enabled tags: mounts, sentence/contraband toggles. Untagged parts are always built. */
  tags: ReadonlySet<string>;
  seed: number;
  /** Drop target states at ball start (true = up). */
  drops?: boolean[];
}

export class PinballSim {
  readonly table: TableDef;
  readonly cfg: SimConfig;
  readonly tags: ReadonlySet<string>;
  readonly world: World;
  readonly rng: Rng;
  readonly events = new EventRing(4096);
  readonly dt: number;
  step = 0;
  balls: SimBall[] = [];
  readonly flippers: FlipperRT[] = [];
  readonly pops: PopRT[] = [];
  readonly slings: SlingRT[] = [];
  readonly drops: DropRT[] = [];
  readonly spinners: SpinnerRT[] = [];
  readonly transports = new Map<
    string,
    { path: TransportPath; time: number; exit: P2; exitVel: P2 }
  >();
  plungerPull = 0;
  private plungerWasHeld = false;
  kickbackArmed = false;
  tilted = false;
  private nudgeCooldown = 0;
  private nextBallId = 1;
  private serveQueue: boolean[] = [];
  private dropsResetPending = false;
  private readonly oneWays: OneWayDef[] = [];
  private readonly wm = new WorldManifold();
  private readonly tmpOut = new Float64Array(3);
  private readonly ground: Body;
  private readonly cabinet: readonly P2[];
  private readonly holeBolted: boolean;
  // pending contact actions (applied after the step)
  private pendType = new Int8Array(MAX_PEND);
  private pendIdx = new Int32Array(MAX_PEND);
  private pendBall: (SimBall | null)[] = new Array(MAX_PEND).fill(null);
  private pendCount = 0;
  private readonly triggers: TriggerDef[];

  constructor(opts: SimOptions) {
    this.table = opts.table;
    this.cfg = opts.config;
    this.tags = opts.tags;
    this.rng = new Rng(opts.seed);
    this.dt = 1 / this.cfg.physics.hz;
    this.world = new World({
      gravity: new Vec2(0, -this.cfg.physics.slopeGravity * this.cfg.mods.gravity),
    });
    this.ground = this.world.createBody();
    this.cabinet = this.table.bounds;
    this.holeBolted = this.tags.has(this.table.hole.boltTag);
    this.triggers = this.table.triggers;
    this.build(opts.drops);
    this.world.on('pre-solve', (c: Contact) => this.onPreSolve(c));
    this.world.on('begin-contact', (c: Contact) => this.onBeginContact(c));
  }

  // ------------------------------------------------------------------ build

  private has(tag?: string): boolean {
    return !tag || this.tags.has(tag);
  }

  private tag(kind: FixKind, id: string, mat: MaterialId, index = -1): FixTag {
    return { kind, id, mat, index, ball: null };
  }

  private staticFix(
    body: Body,
    shape: ChainShape | CircleShape | PolygonShape,
    t: FixTag,
  ): Fixture {
    const m = this.cfg.materials[t.mat];
    return body.createFixture({
      shape,
      friction: m.friction,
      restitution: m.restitution,
      userData: t,
      filterCategoryBits: CAT_STATIC,
      filterMaskBits: CAT_BALL,
    });
  }

  private build(dropStates?: boolean[]): void {
    const t = this.table;
    for (const w of t.walls) {
      if (!this.has(w.tag)) continue;
      const verts = w.pts.map((p) => new Vec2(p[0], p[1]));
      this.staticFix(
        this.ground,
        new ChainShape(verts, !!w.loop),
        this.tag(FixKind.Wall, w.id, w.mat),
      );
    }
    for (const p of t.posts) {
      if (!this.has(p.tag)) continue;
      this.staticFix(
        this.ground,
        new CircleShape(new Vec2(p.x, p.y), p.r),
        this.tag(FixKind.Post, p.id, p.mat),
      );
    }
    t.oneWays.forEach((ow, i) => {
      this.oneWays.push(ow);
      const shape = new ChainShape([new Vec2(ow.a[0], ow.a[1]), new Vec2(ow.b[0], ow.b[1])], false);
      this.staticFix(this.ground, shape, this.tag(FixKind.OneWay, ow.id, ow.mat, i));
    });
    for (const b of t.bumpers) {
      if (!this.has(b.tag)) continue;
      const idx = this.pops.length;
      this.pops.push({ id: b.id, x: b.x, y: b.y, r: b.r, cooldown: 0, flash: 0 });
      this.staticFix(
        this.ground,
        new CircleShape(new Vec2(b.x, b.y), b.r),
        this.tag(FixKind.Pop, b.id, 'pop', idx),
      );
    }
    t.slings.forEach((s, i) => this.buildSling(s, i));
    let di = 0;
    for (const bank of t.dropBanks) {
      for (const d of bank.targets) {
        const dx = d.b[0] - d.a[0];
        const dy = d.b[1] - d.a[1];
        const l = Math.hypot(dx, dy);
        const nx = -dy / l;
        const ny = dx / l;
        const th = 0.25;
        const body = this.world.createBody();
        const poly = new PolygonShape([
          new Vec2(d.a[0], d.a[1]),
          new Vec2(d.a[0] - nx * th, d.a[1] - ny * th),
          new Vec2(d.b[0] - nx * th, d.b[1] - ny * th),
          new Vec2(d.b[0], d.b[1]),
        ]);
        this.staticFix(body, poly, this.tag(FixKind.Drop, d.id, 'drop', di));
        const up = dropStates ? dropStates[di] !== false : true;
        body.setActive(up);
        this.drops.push({ def: d, body, up, nx, ny });
        di++;
      }
    }
    for (const sp of t.spinners)
      this.spinners.push({ id: sp.id, a: sp.a, b: sp.b, angle: 0, vel: 0 });
    for (const f of t.flippers) if (this.has(f.tag)) this.buildFlipper(f);
    for (const tp of t.transports)
      this.transports.set(tp.id, {
        path: new TransportPath(tp.path),
        time: tp.time,
        exit: tp.exit,
        exitVel: tp.exitVel,
      });
  }

  private buildSling(s: SlingDef, i: number): void {
    const body = this.ground;
    const r = s.postR;
    const pts = [s.a, s.b, s.c];
    // Orient so a->b->c is clockwise: outward normal of an edge u->v is then (dy, -dx).
    const area = (s.b[0] - s.a[0]) * (s.c[1] - s.a[1]) - (s.b[1] - s.a[1]) * (s.c[0] - s.a[0]);
    const cw = area < 0;
    const outward = (u: P2, v: P2): P2 => {
      const dx = v[0] - u[0];
      const dy = v[1] - u[1];
      const l = Math.hypot(dx, dy);
      return cw ? [-dy / l, dx / l] : [dy / l, -dx / l];
    };
    const edges: [P2, P2][] = [
      [s.a, s.b],
      [s.b, s.c],
      [s.c, s.a],
    ];
    edges.forEach(([u, v], ei) => {
      const n = outward(u, v);
      const quad = [
        new Vec2(u[0], u[1]),
        new Vec2(v[0], v[1]),
        new Vec2(v[0] + n[0] * r, v[1] + n[1] * r),
        new Vec2(u[0] + n[0] * r, u[1] + n[1] * r),
      ];
      const kind = ei === 0 ? FixKind.SlingFace : FixKind.Sling;
      this.staticFix(
        body,
        new PolygonShape(quad),
        this.tag(kind, s.id, ei === 0 ? 'sling' : 'rubber', i),
      );
      if (ei === 0) this.slings.push({ def: s, nx: n[0], ny: n[1], cooldown: 0, flash: 0 });
    });
    this.staticFix(
      body,
      new PolygonShape(pts.map((p) => new Vec2(p[0], p[1]))),
      this.tag(FixKind.Sling, s.id, 'rubber', i),
    );
    for (const p of pts)
      this.staticFix(
        body,
        new CircleShape(new Vec2(p[0], p[1]), r),
        this.tag(FixKind.Sling, s.id, 'post', i),
      );
  }

  private buildFlipper(f: FlipperDef): void {
    const cfg = this.cfg.flipper;
    const restAngle = f.side === 'left' ? f.restDeg * DEG : Math.PI - f.restDeg * DEG;
    const body = this.world.createBody({
      type: 'dynamic',
      position: new Vec2(f.x, f.y),
      angle: restAngle,
      bullet: true,
    });
    const phi = Math.asin((f.r0 - f.r1) / f.len);
    const sp = Math.sin(phi);
    const cp = Math.cos(phi);
    const tag = this.tag(FixKind.Flipper, f.id, 'flipper', this.flippers.length);
    const fix = (shape: CircleShape | PolygonShape) =>
      body.createFixture({
        shape,
        density: cfg.density,
        friction: cfg.friction,
        restitution: cfg.baseRestitution,
        userData: tag,
        filterCategoryBits: CAT_FLIPPER,
        filterMaskBits: CAT_BALL,
      });
    fix(new CircleShape(new Vec2(0, 0), f.r0));
    fix(new CircleShape(new Vec2(f.len, 0), f.r1));
    fix(
      new PolygonShape([
        new Vec2(f.r0 * sp, -f.r0 * cp),
        new Vec2(f.len + f.r1 * sp, -f.r1 * cp),
        new Vec2(f.len + f.r1 * sp, f.r1 * cp),
        new Vec2(f.r0 * sp, f.r0 * cp),
      ]),
    );
    const stroke = (f.upDeg - f.restDeg) * DEG;
    const left = f.side === 'left';
    const joint = new RevoluteJoint(
      {
        enableLimit: true,
        // The stroke end settles ~angularSlop past its bound under coil torque; inset it.
        lowerAngle: left ? 0 : -stroke + LIMIT_INSET,
        upperAngle: left ? stroke - LIMIT_INSET : 0,
        enableMotor: true,
        maxMotorTorque: cfg.returnTorque,
        motorSpeed: left ? -cfg.returnSpeed : cfg.returnSpeed,
      },
      this.ground,
      body,
      new Vec2(f.x, f.y),
    );
    this.world.createJoint(joint);
    this.flippers.push(new FlipperRT(f, body, joint));
  }

  // ------------------------------------------------------------------ contacts

  private onPreSolve(c: Contact): void {
    const fa = c.getFixtureA();
    const fb = c.getFixtureB();
    const ta = fa.getUserData() as FixTag;
    const tb = fb.getUserData() as FixTag;
    let bt: FixTag;
    let ot: FixTag;
    let ballIsA: boolean;
    if (ta.kind === FixKind.Ball) {
      bt = ta;
      ot = tb;
      ballIsA = true;
    } else if (tb.kind === FixKind.Ball) {
      bt = tb;
      ot = ta;
      ballIsA = false;
    } else return;
    const ball = bt.ball!;
    const body = ball.body!;
    if (ot.kind === FixKind.Ball) {
      c.setRestitution(this.cfg.physics.ballBallRestitution);
      c.setFriction(this.cfg.physics.ballBallFriction);
      return;
    }
    if (ot.kind === FixKind.OneWay) {
      // Box2D one-sided platform rule: collide only when the ball is wholly on the blocking
      // side; a ball passing through from below is never shoved sideways.
      const ow = this.oneWays[ot.index];
      const p = body.getPosition();
      const len = Math.hypot(ow.b[0] - ow.a[0], ow.b[1] - ow.a[1]);
      const dist = side(ow.a[0], ow.a[1], ow.b[0], ow.b[1], p.x, p.y) / len;
      if (dist < this.cfg.physics.ballRadius - 0.015) c.setEnabled(false);
      return;
    }
    c.getWorldManifold(this.wm);
    const n = this.wm.normal;
    const sgn = ballIsA ? 1 : -1;
    const v = body.getLinearVelocity();
    let rvx = v.x;
    let rvy = v.y;
    if (ot.kind === FixKind.Flipper) {
      const f = this.flippers[ot.index];
      const w = f.body.getAngularVelocity();
      const pt = this.wm.points[0];
      const fp = f.body.getPosition();
      rvx -= -w * (pt.y - fp.y);
      rvy -= w * (pt.x - fp.x);
      const approach = Math.abs((rvx * n.x + rvy * n.y) * sgn);
      // Along-bat position 0 (base) .. 1 (tip): dead at the base, livelier at the tip.
      const ax = Math.cos(f.body.getAngle());
      const ay = Math.sin(f.body.getAngle());
      const along = Math.min(1, Math.max(0, ((pt.x - fp.x) * ax + (pt.y - fp.y) * ay) / f.def.len));
      const fc = this.cfg.flipper;
      const m = this.cfg.materials.flipper;
      const e =
        (fc.baseRestitution + (fc.tipRestitution - fc.baseRestitution) * along) *
        (1 - m.speedLoss * Math.min(1, approach / 80));
      c.setRestitution(e);
      c.setFriction(fc.friction);
      return;
    }
    const approach = Math.abs((rvx * n.x + rvy * n.y) * sgn);
    const m = this.cfg.materials[ot.mat];
    c.setRestitution(m.restitution * (1 - m.speedLoss * Math.min(1, approach / 80)));
    c.setFriction(m.friction);
  }

  private onBeginContact(c: Contact): void {
    const ta = c.getFixtureA().getUserData() as FixTag;
    const tb = c.getFixtureB().getUserData() as FixTag;
    let bt: FixTag;
    let ot: FixTag;
    let ballIsA: boolean;
    if (ta.kind === FixKind.Ball) {
      bt = ta;
      ot = tb;
      ballIsA = true;
    } else if (tb.kind === FixKind.Ball) {
      bt = tb;
      ot = ta;
      ballIsA = false;
    } else return;
    const ball = bt.ball!;
    if (ball.state !== 'field' || !ball.body) return;
    const v = ball.body.getLinearVelocity();
    const p = ball.body.getPosition();
    switch (ot.kind) {
      case FixKind.Pop: {
        const pop = this.pops[ot.index];
        if (!this.tilted && pop.cooldown <= 0) {
          pop.cooldown = this.cfg.kickers.popCooldown;
          this.queue(PEND_POP, ot.index, ball);
        }
        return;
      }
      case FixKind.SlingFace: {
        const s = this.slings[ot.index];
        const approach = -(v.x * s.nx + v.y * s.ny);
        if (!this.tilted && s.cooldown <= 0 && approach > this.cfg.kickers.slingThreshold) {
          s.cooldown = this.cfg.kickers.slingCooldown;
          this.queue(PEND_SLING, ot.index, ball);
        } else this.emitHit('rubber', approach, p.x, p.y, ball.id);
        return;
      }
      case FixKind.Drop: {
        const d = this.drops[ot.index];
        const front = (p.x - d.def.a[0]) * d.nx + (p.y - d.def.a[1]) * d.ny > 0;
        const approach = -(v.x * d.nx + v.y * d.ny);
        if (d.up && front && approach > this.cfg.kickers.dropThreshold)
          this.queue(PEND_DROP, ot.index, ball);
        else this.emitHit('drop', Math.abs(approach), p.x, p.y, ball.id);
        return;
      }
      case FixKind.OneWay: {
        const ow = this.oneWays[ot.index];
        if (side(ow.a[0], ow.a[1], ow.b[0], ow.b[1], p.x, p.y) > 0)
          this.emitHit('metal', 10, p.x, p.y, ball.id);
        return;
      }
      default: {
        c.getWorldManifold(this.wm);
        const n = this.wm.normal;
        let rvx = v.x;
        let rvy = v.y;
        if (ot.kind === FixKind.Ball) {
          const ob = ballIsA ? c.getFixtureB().getBody() : c.getFixtureA().getBody();
          const ov = ob.getLinearVelocity();
          rvx -= ov.x;
          rvy -= ov.y;
        }
        const approach = Math.abs(rvx * n.x + rvy * n.y);
        if (ot.kind === FixKind.Flipper) {
          if (approach > 1.5)
            this.events.push('flipperHit', ot.id, ball.id, 0, approach, p.x, p.y, this.step);
        } else if (ot.kind === FixKind.Ball) {
          if (approach > 2 && ballIsA) this.emitHit('ball', approach, p.x, p.y, ball.id);
        } else this.emitHit(ot.mat, approach, p.x, p.y, ball.id);
      }
    }
  }

  private emitHit(mat: string, speed: number, x: number, y: number, ballId: number): void {
    if (speed > 2.5) this.events.push('hit', mat, ballId, 0, speed, x, y, this.step);
  }

  private queue(type: number, idx: number, ball: SimBall): void {
    if (this.pendCount >= MAX_PEND) return;
    this.pendType[this.pendCount] = type;
    this.pendIdx[this.pendCount] = idx;
    this.pendBall[this.pendCount] = ball;
    this.pendCount++;
  }

  // ------------------------------------------------------------------ balls

  private createBallBody(ball: SimBall, x: number, y: number, vx: number, vy: number): void {
    const ph = this.cfg.physics;
    const body = this.world.createBody({
      type: 'dynamic',
      position: new Vec2(x, y),
      bullet: true,
      linearDamping: ph.ballLinearDamping,
      angularDamping: ph.ballAngularDamping,
      allowSleep: false,
    });
    const t = this.tag(FixKind.Ball, 'ball', 'metal');
    t.ball = ball;
    body.createFixture({
      shape: new CircleShape(ph.ballRadius),
      density: ph.ballDensity * this.cfg.mods.ballMass,
      friction: 0.2,
      restitution: 0.3,
      userData: t,
      filterCategoryBits: CAT_BALL,
      filterMaskBits: CAT_BALL | CAT_STATIC | CAT_FLIPPER,
    });
    setVel(body, vx, vy);
    ball.body = body;
    ball.state = 'field';
    ball.x = ball.px = x;
    ball.y = ball.py = y;
    ball.z = ball.pz = 0;
    ball.vx = vx;
    ball.vy = vy;
    ball.stuckTime = 0;
  }

  private destroyBallBody(ball: SimBall): void {
    if (ball.body) {
      this.world.destroyBody(ball.body);
      ball.body = null;
    }
  }

  private removeBall(ball: SimBall): void {
    this.destroyBallBody(ball);
    ball.state = 'gone';
  }

  /** Queue a ball into the shooter lane. Auto balls are launched by the machine. */
  serveBall(auto = false): void {
    this.serveQueue.push(auto);
  }

  /** Number of balls queued to serve. */
  get pendingServes(): number {
    return this.serveQueue.length;
  }

  private shooterClear(): boolean {
    const pl = this.table.plunger;
    for (const b of this.balls)
      if (b.state === 'field' && b.x > pl.minX - 0.2 && b.y < pl.y + 1.6) return false;
    return true;
  }

  private exitClear(x: number, y: number): boolean {
    for (const b of this.balls) {
      if (b.state !== 'field') continue;
      const dx = b.x - x;
      const dy = b.y - y;
      if (dx * dx + dy * dy < 1.15 * 1.15) return false;
    }
    return true;
  }

  /** Field + transport + held balls. */
  ballsInPlay(): number {
    let n = 0;
    for (const b of this.balls) if (b.state !== 'gone') n++;
    return n + this.serveQueue.length;
  }

  getBall(id: number): SimBall | undefined {
    for (const b of this.balls) if (b.id === id) return b;
    return undefined;
  }

  /** Launch speed for a plunger pull (see PLUNGER.exitCurve). */
  plungeSpeed(pull: number): number {
    const pc = this.cfg.plunger;
    const p = Math.max(0, Math.min(1, pull));
    const k = pc.exitCurve;
    let ve = k[k.length - 1][1];
    for (let i = 1; i < k.length; i++) {
      if (p <= k[i][0]) {
        const f = (p - k[i - 1][0]) / (k[i][0] - k[i - 1][0]);
        ve = k[i - 1][1] + (k[i][1] - k[i - 1][1]) * f;
        break;
      }
    }
    const g = this.cfg.physics.slopeGravity * this.cfg.mods.gravity;
    return Math.sqrt(ve * ve + 2 * g * pc.climb) * pc.lossComp;
  }

  private launch(ball: SimBall, pull: number, auto: boolean, divert: boolean): void {
    const speed = this.plungeSpeed(pull);
    setVel(ball.body!, 0, speed);
    ball.divert = divert;
    this.events.push('launch', '', ball.id, auto ? 1 : 0, speed, ball.x, ball.y, this.step);
  }

  /** Start a ball on a 3D transport path (Chute, wireforms). */
  startTransport(ball: SimBall, id: string, entrySpeed: number): void {
    const tp = this.transports.get(id)!;
    this.destroyBallBody(ball);
    ball.state = 'transport';
    ball.path = tp.path;
    ball.transportId = id;
    ball.tU = 0;
    const ref = this.cfg.chute.refSpeed;
    const k = entrySpeed > 0 ? Math.min(1.3, Math.max(0.75, ref / entrySpeed)) : 1;
    ball.tDur = tp.time * k;
    ball.chuteEntered = false;
    this.events.push('transportStart', id, ball.id, 0, entrySpeed, ball.x, ball.y, this.step);
  }

  /** Eject a ball held in the Hole along its wireform. */
  ejectHeld(ballId: number): void {
    const b = this.getBall(ballId);
    if (!b || b.state !== 'held') return;
    this.events.push('holeEject', '', b.id, 0, 0, b.x, b.y, this.step);
    this.startTransport(b, this.table.hole.transport, 0);
  }

  /** Lock a held ball (it leaves play; rules count it). */
  lockHeld(ballId: number): void {
    const b = this.getBall(ballId);
    if (!b || b.state !== 'held') return;
    b.state = 'gone';
    this.events.push('locked', '', b.id, 0, 0, b.x, b.y, this.step);
  }

  /** Kick an outlaned ball back up (lucky bounce). */
  luckyKick(ballId: number): void {
    const b = this.getBall(ballId);
    if (!b || b.state !== 'field' || !b.body) return;
    const sgn = b.x < this.table.width / 2 ? 1 : -1;
    setVel(b.body, sgn * 2.5, this.cfg.kickers.luckyKickSpeed);
    b.lastOutlaneStep = -1e9;
    this.events.push('luckyKick', '', b.id, 0, 0, b.x, b.y, this.step);
  }

  setKickback(armed: boolean): void {
    this.kickbackArmed = armed;
  }

  setTilted(t: boolean): void {
    if (t && !this.tilted) this.events.push('tilt', '', -1, 0, 0, 0, 0, this.step);
    this.tilted = t;
  }

  /** Reset all drop targets (deferred while a ball overlaps one). */
  resetDrops(): void {
    this.dropsResetPending = true;
  }

  /** Knock down a drop target (Crowbar etc.). */
  knockDrop(index: number): void {
    const d = this.drops[index];
    if (!d || !d.up) return;
    d.up = false;
    d.body.setActive(false);
    this.events.push('drop', d.def.id, -1, 0, index, 0, 0, this.step);
  }

  dropStates(): boolean[] {
    return this.drops.map((d) => d.up);
  }

  /** Place a ball directly on the field (tests, tools, dev panel). */
  spawnBall(x: number, y: number, vx = 0, vy = 0): SimBall {
    const ball = new SimBall(this.nextBallId++);
    ball.inShooter = false;
    this.balls.push(ball);
    this.createBallBody(ball, x, y, vx, vy);
    return ball;
  }

  /** Put a new ball in the Hole, held (RIOT releases locked balls this way). */
  spawnHeld(): SimBall {
    const hole = this.table.hole;
    const ball = new SimBall(this.nextBallId++);
    ball.inShooter = false;
    ball.state = 'held';
    ball.x = ball.px = hole.x;
    ball.y = ball.py = hole.y;
    this.balls.push(ball);
    return ball;
  }

  /** Remove every ball immediately (end of ball housekeeping). */
  clearBalls(): void {
    for (const b of this.balls) this.removeBall(b);
    this.balls.length = 0;
    this.serveQueue.length = 0;
  }

  // ------------------------------------------------------------------ step

  stepOnce(input: SimInput): void {
    const cfg = this.cfg;
    const dt = this.dt;
    this.step++;

    // Flippers respond on this step.
    const fc = cfg.flipper;
    const strength = cfg.mods.flipperStrength;
    for (const f of this.flippers) {
      const pressed = !this.tilted && (f.def.button === 'left' ? input.left : input.right);
      if (pressed !== f.pressed) {
        f.pressed = pressed;
        if (!pressed) f.eos = false;
        this.events.push(
          'flipper',
          f.def.id,
          -1,
          pressed ? 1 : 0,
          0,
          f.body.getPosition().x,
          f.body.getPosition().y,
          this.step,
        );
      }
      if (pressed) {
        const prog = f.progress;
        if (!f.eos && prog >= fc.eosFraction) f.eos = true;
        else if (f.eos && prog < fc.eosFraction - 0.1) f.eos = false;
        f.joint.setMotorSpeed(f.dir * fc.strokeSpeed * strength);
        f.joint.setMaxMotorTorque((f.eos ? fc.holdTorque : fc.strokeTorque) * strength);
      } else {
        f.joint.setMotorSpeed(-f.dir * fc.returnSpeed);
        f.joint.setMaxMotorTorque(fc.returnTorque);
      }
      f.prevAngle = f.angle;
    }

    // Plunger.
    const pc = cfg.plunger;
    if (input.pull >= 0) this.plungerPull = input.pull;
    else if (input.plunger) this.plungerPull = Math.min(1, this.plungerPull + dt / pc.pullTime);
    const held = input.plunger || input.pull >= 0;
    if (this.plungerWasHeld && !held) {
      const ball = this.ballOnPlunger();
      if (ball) this.launch(ball, this.plungerPull, false, input.left);
      this.plungerPull = 0;
    }
    this.plungerWasHeld = held;

    // Nudge.
    if (this.nudgeCooldown > 0) this.nudgeCooldown -= dt;
    if (input.nudge && this.nudgeCooldown <= 0) {
      this.nudgeCooldown = cfg.nudge.cooldown;
      const nm = cfg.mods.nudgeStrength / Math.sqrt(cfg.mods.ballMass);
      let nx = 0;
      let ny = cfg.nudge.strength * nm;
      if (input.nudge === 2) {
        nx = -cfg.nudge.sideStrength * nm;
        ny = cfg.nudge.sideStrength * 0.35 * nm;
      } else if (input.nudge === 3) {
        nx = cfg.nudge.sideStrength * nm;
        ny = cfg.nudge.sideStrength * 0.35 * nm;
      }
      for (const b of this.balls) {
        if (b.state !== 'field' || !b.body) continue;
        const v = b.body.getLinearVelocity();
        setVel(b.body, v.x + nx, v.y + ny);
      }
      this.events.push('nudge', '', -1, input.nudge, 0, nx, ny, this.step);
    }

    // Chute incline + previous positions.
    const ch = this.table.chute;
    const inclineA = cfg.mods.greasedRail ? 0 : cfg.chute.inclineAccel;
    for (const b of this.balls) {
      b.px = b.x;
      b.py = b.y;
      b.pz = b.z;
      if (b.state === 'field' && b.body && inclineA > 0 && b.y > 21.5 && b.y < 27 && b.x < 8) {
        if (pointInPolygon(b.x, b.y, ch.incline)) {
          const v = b.body.getLinearVelocity();
          setVel(
            b.body,
            v.x + ch.downhill[0] * inclineA * dt,
            v.y + ch.downhill[1] * inclineA * dt,
          );
        }
      }
    }

    this.pendCount = 0;
    this.world.step(dt, cfg.physics.velocityIterations, cfg.physics.positionIterations);

    for (const f of this.flippers) f.angle = f.body.getAngle();
    this.applyPending();
    this.postStep();
  }

  private ballOnPlunger(): SimBall | null {
    const pl = this.table.plunger;
    for (const b of this.balls)
      if (b.state === 'field' && b.body && b.x > pl.minX && b.x < pl.maxX && b.y < pl.y + 0.45)
        return b;
    return null;
  }

  private applyPending(): void {
    const k = this.cfg.kickers;
    const km = this.cfg.mods.kickStrength / Math.sqrt(this.cfg.mods.ballMass);
    for (let i = 0; i < this.pendCount; i++) {
      const ball = this.pendBall[i]!;
      this.pendBall[i] = null;
      const idx = this.pendIdx[i];
      if (ball.state !== 'field' || !ball.body) continue;
      const body = ball.body;
      const p = body.getPosition();
      const v = body.getLinearVelocity();
      switch (this.pendType[i]) {
        case PEND_POP: {
          const pop = this.pops[idx];
          let nx = p.x - pop.x;
          let ny = p.y - pop.y;
          const l = Math.hypot(nx, ny) || 1;
          nx /= l;
          ny /= l;
          const vn = v.x * nx + v.y * ny;
          // Real coils vary shot to shot; a little seeded variation also breaks periodic orbits.
          const kick = k.popKickSpeed * km * (1 + this.rng.range(-k.kickVariance, k.kickVariance));
          const add = Math.max(0, kick - vn);
          setVel(body, v.x + nx * add, v.y + ny * add);
          pop.flash = 1;
          this.events.push('pop', pop.id, ball.id, 0, kick, p.x, p.y, this.step);
          break;
        }
        case PEND_SLING: {
          const s = this.slings[idx];
          const vn = v.x * s.nx + v.y * s.ny;
          const tx = (v.x - vn * s.nx) * k.slingTangentKeep;
          const ty = (v.y - vn * s.ny) * k.slingTangentKeep;
          const kick =
            k.slingKickSpeed * km * (1 + this.rng.range(-k.kickVariance, k.kickVariance));
          // Tilt toward the flipper (clockwise for the left sling, counter-clockwise for the right).
          const tilt = (s.def.side === 'left' ? -k.slingKickTilt : k.slingKickTilt) * DEG;
          const ja = tilt + this.rng.range(-k.slingAngleJitter, k.slingAngleJitter) * DEG;
          const ca = Math.cos(ja);
          const sa = Math.sin(ja);
          const kx = s.nx * ca - s.ny * sa;
          const ky = s.nx * sa + s.ny * ca;
          setVel(body, tx + kx * kick, ty + ky * kick);
          s.flash = 1;
          this.events.push('sling', s.def.id, ball.id, 0, kick, p.x, p.y, this.step);
          break;
        }
        case PEND_DROP: {
          const d = this.drops[idx];
          if (!d.up) break;
          d.up = false;
          d.body.setActive(false);
          this.events.push('drop', d.def.id, ball.id, 0, idx, p.x, p.y, this.step);
          break;
        }
      }
    }
    this.pendCount = 0;
  }

  private postStep(): void {
    const cfg = this.cfg;
    const dt = this.dt;
    const t = this.table;
    const maxV = cfg.physics.maxBallSpeed;
    let removed = false;

    for (const pop of this.pops) {
      if (pop.cooldown > 0) pop.cooldown -= dt;
      if (pop.flash > 0) pop.flash = Math.max(0, pop.flash - dt * 8);
    }
    for (const s of this.slings) {
      if (s.cooldown > 0) s.cooldown -= dt;
      if (s.flash > 0) s.flash = Math.max(0, s.flash - dt * 8);
    }

    for (const b of this.balls) {
      if (b.state === 'field' && b.body) {
        b.age++;
        const pos = b.body.getPosition();
        const vel = b.body.getLinearVelocity();
        let vx = vel.x;
        let vy = vel.y;
        const sp2 = vx * vx + vy * vy;
        if (sp2 > 1e-12) {
          const sp = Math.sqrt(sp2);
          // Constant rolling resistance, then the hard speed cap.
          const target = Math.min(maxV, Math.max(0, sp - cfg.physics.rollingResistance * dt));
          if (target !== sp) {
            const s = target / sp;
            vx *= s;
            vy *= s;
            setVel(b.body, vx, vy);
          }
        }
        b.x = pos.x;
        b.y = pos.y;
        b.vx = vx;
        b.vy = vy;
        const speed = Math.sqrt(vx * vx + vy * vy);

        // Auto-launch for machine-served balls.
        if (b.autoLaunchIn >= 0) {
          if (b.autoLaunchIn-- === 0) this.launch(b, cfg.plunger.autoPull, true, false);
        }

        this.checkTriggers(b, speed);
        if (b.state !== 'field') continue;

        // The Hole.
        const hole = t.hole;
        if (!this.holeBolted) {
          const dx = b.x - hole.x;
          const dy = b.y - hole.y;
          if (dx * dx + dy * dy < hole.captureR * hole.captureR) {
            this.destroyBallBody(b);
            b.state = 'held';
            b.heldSteps = 0;
            b.x = hole.x;
            b.y = hole.y;
            this.events.push('holeCapture', hole.id, b.id, 0, speed, b.x, b.y, this.step);
            continue;
          }
        }

        // Drain.
        if (b.y < t.drainY) {
          let cause = 'side';
          const win = 3 / dt;
          const sinceOut = this.step - b.lastOutlaneStep;
          const sinceCenter = this.step - b.lastCenterStep;
          if (this.tilted) cause = 'tilt';
          else if (sinceOut < win && sinceOut <= sinceCenter) cause = b.lastOutlaneId;
          else if (sinceCenter < win) cause = 'center';
          this.events.push('drain', cause, b.id, 0, speed, b.x, b.y, this.step);
          this.removeBall(b);
          removed = true;
          continue;
        }

        // Escape (should never happen).
        if (b.x < 0.25 || b.x > t.width - 0.25 || b.y > 37 || b.y < -0.4) {
          if (!pointInPolygon(b.x, b.y, this.cabinet) || b.y > t.height) {
            this.events.push('escape', '', b.id, 0, speed, b.x, b.y, this.step);
            this.removeBall(b);
            removed = true;
            this.serveBall(true);
            continue;
          }
        }

        this.watchdog(b, speed);
      } else if (b.state === 'transport') {
        this.advanceTransport(b);
      } else if (b.state === 'held') {
        b.heldSteps++;
      }
    }

    // Spinners.
    for (const s of this.spinners) {
      if (s.vel <= 0) continue;
      const before = Math.floor(s.angle * 2);
      s.angle += s.vel * dt;
      const halves = Math.floor(s.angle * 2) - before;
      if (halves > 0) this.events.push('spin', s.id, -1, 0, halves, s.a[0], s.a[1], this.step);
      s.vel = Math.max(0, s.vel - cfg.kickers.spinnerDrag * dt * (1 + s.vel * 0.12));
      if (s.vel === 0) s.angle = Math.round(s.angle * 2) / 2;
    }

    // Serve queue.
    if (this.serveQueue.length && this.shooterClear()) {
      const auto = this.serveQueue.shift()!;
      const ball = new SimBall(this.nextBallId++);
      this.balls.push(ball);
      this.createBallBody(ball, t.plunger.x, t.plunger.y, 0, 0);
      ball.inShooter = true;
      ball.autoLaunchIn = auto ? Math.round(0.35 / dt) : -1;
      this.events.push('served', '', ball.id, auto ? 1 : 0, 0, ball.x, ball.y, this.step);
    }

    // Drop reset.
    if (this.dropsResetPending) {
      let blocked = false;
      for (const d of this.drops) {
        if (d.up) continue;
        for (const b of this.balls) {
          if (b.state !== 'field') continue;
          const mx = (d.def.a[0] + d.def.b[0]) / 2;
          const my = (d.def.a[1] + d.def.b[1]) / 2;
          if ((b.x - mx) ** 2 + (b.y - my) ** 2 < 1.3 * 1.3) blocked = true;
        }
      }
      if (!blocked) {
        this.dropsResetPending = false;
        for (const d of this.drops) {
          if (!d.up) {
            d.up = true;
            d.body.setActive(true);
          }
        }
        this.events.push('dropsReset', '', -1, 0, 0, 0, 0, this.step);
      }
    }

    if (removed) this.balls = this.balls.filter((b) => b.state !== 'gone');
    else {
      // locked balls also leave the list
      for (const b of this.balls)
        if (b.state === 'gone') {
          this.balls = this.balls.filter((x) => x.state !== 'gone');
          break;
        }
    }
  }

  private checkTriggers(b: SimBall, speed: number): void {
    const t = this.table;
    if (b.px === b.x && b.py === b.y) return;
    for (const tg of this.triggers) {
      const c = segmentCross(b.px, b.py, b.x, b.y, tg.a[0], tg.a[1], tg.b[0], tg.b[1]);
      if (c < 0) continue;
      const dir = side(tg.a[0], tg.a[1], tg.b[0], tg.b[1], b.x, b.y) > 0 ? 1 : -1;
      if ((tg.id === 'outlaneL' || tg.id === 'outlaneR') && dir > 0) {
        b.lastOutlaneStep = this.step;
        b.lastOutlaneId = tg.id;
      } else if (tg.id === 'centerDrain' && dir > 0) b.lastCenterStep = this.step;
      else if (tg.id === 'shooterExit' && dir > 0) b.inShooter = false;
      this.events.push('trigger', tg.id, b.id, dir, speed, b.x, b.y, this.step);
    }
    // Spinner.
    for (const s of this.spinners) {
      if (segmentCross(b.px, b.py, b.x, b.y, s.a[0], s.a[1], s.b[0], s.b[1]) >= 0) {
        s.vel += speed * this.cfg.kickers.spinnerGain;
        const keep = this.cfg.kickers.spinnerBallSpeedKeep;
        setVel(b.body!, b.vx * keep, b.vy * keep);
      }
    }
    // Kickback.
    const kb = t.kickback.trigger;
    if (segmentCross(b.px, b.py, b.x, b.y, kb.a[0], kb.a[1], kb.b[0], kb.b[1]) >= 0) {
      if (
        side(kb.a[0], kb.a[1], kb.b[0], kb.b[1], b.x, b.y) > 0 &&
        this.kickbackArmed &&
        !this.tilted
      ) {
        this.kickbackArmed = false;
        setVel(b.body!, 0.4, this.cfg.kickers.kickbackSpeed);
        b.lastOutlaneStep = -1e9;
        this.events.push('kickback', '', b.id, 0, 0, b.x, b.y, this.step);
      }
    }
    // Wire returns.
    for (const rt of t.returns) {
      const g = rt.trigger;
      if (
        segmentCross(b.px, b.py, b.x, b.y, g.a[0], g.a[1], g.b[0], g.b[1]) >= 0 &&
        side(g.a[0], g.a[1], g.b[0], g.b[1], b.x, b.y) > 0
      ) {
        this.events.push('trigger', g.id, b.id, 1, speed, b.x, b.y, this.step);
        this.startTransport(b, rt.transport, speed);
        return;
      }
    }
    // Diverter (super skill shot).
    const dv = t.diverter.trigger;
    if (b.divert && segmentCross(b.px, b.py, b.x, b.y, dv.a[0], dv.a[1], dv.b[0], dv.b[1]) >= 0) {
      b.divert = false;
      this.events.push('diverted', '', b.id, 0, speed, b.x, b.y, this.step);
      this.startTransport(b, t.diverter.transport, speed);
      return;
    }
    // The Chute.
    const ch = t.chute;
    const m = ch.mouth;
    if (segmentCross(b.px, b.py, b.x, b.y, m.a[0], m.a[1], m.b[0], m.b[1]) >= 0) {
      const up = side(m.a[0], m.a[1], m.b[0], m.b[1], b.x, b.y) > 0;
      if (up) {
        b.chuteEntered = true;
        this.events.push('chuteEnter', '', b.id, 0, speed, b.x, b.y, this.step);
        if (this.cfg.mods.greasedRail) {
          this.events.push('chuteMade', '', b.id, 0, speed, b.x, b.y, this.step);
          this.startTransport(b, ch.transport, speed);
          return;
        }
      } else if (b.chuteEntered) {
        b.chuteEntered = false;
        this.events.push('chuteFail', '', b.id, 0, speed, b.x, b.y, this.step);
      }
    }
    const cm = ch.commit;
    if (segmentCross(b.px, b.py, b.x, b.y, cm.a[0], cm.a[1], cm.b[0], cm.b[1]) >= 0) {
      if (side(cm.a[0], cm.a[1], cm.b[0], cm.b[1], b.x, b.y) > 0) {
        this.events.push('chuteMade', '', b.id, 0, speed, b.x, b.y, this.step);
        this.startTransport(b, ch.transport, speed);
      }
    }
  }

  private advanceTransport(b: SimBall): void {
    const tp = this.transports.get(b.transportId)!;
    if (b.tU < 1) {
      b.tU = Math.min(1, b.tU + this.dt / b.tDur);
      tp.path.sample(b.tU, this.tmpOut);
      b.x = this.tmpOut[0];
      b.y = this.tmpOut[1];
      b.z = this.tmpOut[2];
      return;
    }
    if (!this.exitClear(tp.exit[0], tp.exit[1])) return;
    this.createBallBody(b, tp.exit[0], tp.exit[1], tp.exitVel[0], tp.exitVel[1]);
    b.path = null;
    this.events.push('transportExit', b.transportId, b.id, 0, 0, b.x, b.y, this.step);
  }

  private watchdog(b: SimBall, speed: number): void {
    const wd = this.cfg.watchdog;
    if (speed >= wd.stuckSpeed) {
      b.stuckTime = Math.max(0, b.stuckTime - this.dt * 2);
      if (b.rescues > 0 && (b.x - b.rescueX) ** 2 + (b.y - b.rescueY) ** 2 > 9) b.rescues = 0;
      return;
    }
    for (const r of this.table.restSpots)
      if ((b.x - r.x) ** 2 + (b.y - r.y) ** 2 < r.r * r.r) return;
    b.stuckTime += this.dt;
    if (b.stuckTime < wd.stuckTime) return;
    b.stuckTime = 0;
    if (b.rescues >= wd.maxRescues) {
      this.events.push('reserve', '', b.id, 0, 0, b.x, b.y, this.step);
      this.removeBall(b);
      this.serveBall(true);
      return;
    }
    if (b.rescues === 0) {
      b.rescueX = b.x;
      b.rescueY = b.y;
    }
    b.rescues++;
    const a = this.rng.range(30, 150) * DEG;
    setVel(b.body!, Math.cos(a) * wd.rescueSpeed, Math.sin(a) * wd.rescueSpeed);
    this.events.push('rescue', '', b.id, 0, 0, b.x, b.y, this.step);
  }

  // ------------------------------------------------------------------ debug / determinism

  /** Balls whose centre is inside solid geometry (tunnelling) — used by the soak. */
  findTunnelled(): SimBall[] {
    const out: SimBall[] = [];
    for (const b of this.balls) {
      if (b.state !== 'field') continue;
      for (const w of this.table.walls) {
        if (
          !w.loop ||
          w.look === 'cabinet' ||
          w.look === 'invisible' ||
          (w.tag && !this.tags.has(w.tag))
        )
          continue;
        if (pointInPolygon(b.x, b.y, w.pts)) {
          out.push(b);
          break;
        }
      }
    }
    return out;
  }

  hash(h = new StateHasher()): StateHasher {
    h.int(this.step);
    for (const b of this.balls) {
      h.int(b.id).str(b.state).q(b.x).q(b.y).q(b.vx).q(b.vy).q(b.z);
    }
    for (const f of this.flippers) h.q(f.angle);
    for (const d of this.drops) h.bool(d.up);
    for (const s of this.spinners) h.q(s.angle);
    h.bool(this.kickbackArmed).bool(this.tilted).q(this.plungerPull);
    return h;
  }
}
