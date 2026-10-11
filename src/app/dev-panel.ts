/**
 * Dev panel (?dev): live physics tuning, spawn tools, collider overlay, slow motion, frame
 * step and a frame-time graph. Edits to BASE_CONFIG apply to the next ball; "push to live"
 * copies them into the running sim's config for values read every step.
 */
import * as THREE from 'three';
import type { CamMode } from '../present/scene';
import { Pane, type FolderApi } from 'tweakpane';
import * as Essentials from '@tweakpane/plugin-essentials';
import type { Body, Fixture } from 'planck';
import { BASE_CONFIG } from '../sim/sim-config';
import { Bot, type BotSkillName as BotSkill } from '../bot/bot';
import { wx, wz } from '../present/coords';
import type { GameApp } from './game-app';
import { TABLE } from '../content/table';
import { JOB_DEFS, jobDef } from '../content/jobs';
import { SENTENCES } from '../content/sentences';
import { SENTENCE } from '../content/balance';
import { gainCharm, jobTarget, roundsIn } from '../rules/run';
import { restock } from '../rules/shop';
import { CHARMS } from '../content/charms';
import { CONTRABAND } from '../content/contraband';

const MAX_SEG = 12000;

export function attachDevPanel(app: GameApp): void {
  const pane = new Pane({ title: 'Ball & Chain dev', expanded: true });
  pane.registerPlugin(Essentials);
  const el = pane.element.parentElement as HTMLElement;
  el.style.zIndex = '50';
  el.style.width = '300px';
  el.style.maxHeight = '96vh';
  el.style.overflowY = 'auto';

  const fps = pane.addBlade({ view: 'fpsgraph', label: 'frame', rows: 2 }) as unknown as {
    begin(): void;
    end(): void;
  };

  const state = {
    timeScale: 1,
    paused: false,
    colliders: false,
    bot: 'off' as 'off' | BotSkill,
    spawnX: 9.2,
    spawnY: 30,
    spawnVx: 0,
    spawnVy: 0,
    clickSpawn: true,
    coins: 50,
    luck: 0,
    job: JOB_DEFS[0].id,
    sentence: SENTENCES[0].id,
    charm: CHARMS[0].id,
    contraband: CONTRABAND[0].id as string,
  };

  // ---- time
  const time = pane.addFolder({ title: 'Time' });
  time
    .addBinding(state, 'timeScale', { min: 0.05, max: 2, step: 0.05, label: 'slow-mo' })
    .on('change', (e) => (app.timeScale = e.value));
  time.addBinding(state, 'paused').on('change', (e) => (app.paused = e.value));
  time.addButton({ title: 'Step 1' }).on('click', () => {
    state.paused = app.paused = true;
    app.stepRequests += 1;
    pane.refresh();
  });
  time.addButton({ title: 'Step 24 (0.1 s)' }).on('click', () => {
    state.paused = app.paused = true;
    app.stepRequests += 24;
    pane.refresh();
  });

  // ---- balls
  const balls = pane.addFolder({ title: 'Balls' });
  balls
    .addBinding(state, 'bot', {
      options: { off: 'off', novice: 'novice', average: 'average', expert: 'expert' },
    })
    .on('change', (e) => {
      app.autoBot = e.value === 'off' ? null : new Bot(e.value, 1234);
    });
  balls.addBinding(state, 'clickSpawn', { label: 'shift-click spawn' });
  balls.addBinding(state, 'spawnX', { min: 0, max: 20, step: 0.1 });
  balls.addBinding(state, 'spawnY', { min: 0, max: 40, step: 0.1 });
  balls.addBinding(state, 'spawnVx', { min: -60, max: 60, step: 1 });
  balls.addBinding(state, 'spawnVy', { min: -60, max: 60, step: 1 });
  balls
    .addButton({ title: 'Spawn ball' })
    .on('click', () =>
      app.session?.sim.spawnBall(state.spawnX, state.spawnY, state.spawnVx, state.spawnVy),
    );
  balls.addButton({ title: 'Clear balls' }).on('click', () => app.session?.sim.clearBalls());
  balls.addButton({ title: 'Serve' }).on('click', () => app.session?.sim.serveBall(false));

  // ---- run
  const run = pane.addFolder({ title: 'Run', expanded: false });
  run.addBinding(state, 'coins', { min: 0, max: 100000, step: 1 });
  run.addButton({ title: 'Give coins' }).on('click', () => {
    if (app.run) app.run.pocket += state.coins;
  });
  run.addButton({ title: '+5 tickets, +1 Key' }).on('click', () => {
    if (!app.run) return;
    app.run.tickets += 5;
    app.run.keys += 1;
  });
  run.addBinding(state, 'luck', { min: 0, max: 50, step: 1 }).on('change', (e) => {
    if (app.run) app.run.mods.luck = e.value;
    if (app.session) app.session.game.luck = e.value;
  });
  run.addBinding(state, 'job', { options: Object.fromEntries(JOB_DEFS.map((d) => [d.id, d.id])) });
  run.addButton({ title: 'Force Job' }).on('click', () => {
    const r = app.run;
    if (!r) return;
    const def = jobDef(state.job);
    r.job = { id: def.id, target: jobTarget(def, r.deadline), progress: 0, done: false };
  });
  run.addButton({ title: 'Light Lockup' }).on('click', () => {
    if (app.session) {
      app.session.game.machine.lockLit = true;
      app.session.game.refreshLamps();
    }
  });
  run.addBinding(state, 'sentence', {
    options: Object.fromEntries(SENTENCES.map((d) => [d.name, d.id])),
  });
  run.addButton({ title: 'Force Sentence (this round)' }).on('click', () => {
    const r = app.run;
    if (!r) return;
    r.sentences = [state.sentence];
    r.sentencesCancelled = false;
    // Make the current round the Sentence round.
    r.round = roundsIn(r) - SENTENCE.lastRounds;
  });
  run.addBinding(state, 'charm', {
    options: Object.fromEntries(CHARMS.map((c) => [c.name, c.id])),
  });
  run.addButton({ title: 'Give charm' }).on('click', () => {
    if (!app.run) return;
    app.run.mods.charmSlots = Math.max(app.run.mods.charmSlots, app.run.charms.length + 1);
    gainCharm(app.run, state.charm);
  });
  run.addBinding(state, 'contraband', {
    options: Object.fromEntries(CONTRABAND.map((c) => [c.name, c.id])),
  });
  run
    .addButton({ title: 'Give contraband' })
    .on('click', () => app.run?.contraband.push(state.contraband));
  run.addButton({ title: 'Restock shop' }).on('click', () => app.run && restock(app.run));
  run.addButton({ title: 'Skip deadline (paid)' }).on('click', () => app.devSkipDeadline());
  run.addButton({ title: 'Trapdoor' }).on('click', () => app.fall());
  run.addButton({ title: 'Knock (next round)' }).on('click', () => app.devKnock());
  run.addButton({ title: 'Last Call + 3 Keys' }).on('click', () => {
    const r = app.run;
    if (!r) return;
    r.keys = Math.max(r.keys, 3);
    while (r.deadline < r.deadlines - 1 && r.phase !== 'over') app.devSkipDeadline();
  });
  run.addButton({ title: 'Play bug report (clipboard)' }).on('click', () => {
    navigator.clipboard
      .readText()
      .then((t) => app.devPlayReport(t))
      .catch(() => {
        const t = window.prompt('Paste a bug report');
        if (t) app.devPlayReport(t);
      });
  });
  for (const k of ['paidInFull', 'breakout', 'cellmate'] as const)
    run.addButton({ title: `Ending: ${k}` }).on('click', () => app.devEnding(k));

  // ---- tuning
  const tune = pane.addFolder({ title: 'Physics (next ball)', expanded: false });
  addNumbers(tune, 'physics', BASE_CONFIG.physics as unknown as Record<string, unknown>);
  addNumbers(tune, 'flipper', BASE_CONFIG.flipper as unknown as Record<string, unknown>);
  addNumbers(tune, 'kickers', BASE_CONFIG.kickers as unknown as Record<string, unknown>);
  addNumbers(tune, 'plunger', BASE_CONFIG.plunger as unknown as Record<string, unknown>);
  addNumbers(tune, 'nudge', BASE_CONFIG.nudge as unknown as Record<string, unknown>);
  tune.addButton({ title: 'Push to live ball' }).on('click', () => {
    const s = app.session?.sim;
    if (!s) return;
    Object.assign(s.cfg.flipper, BASE_CONFIG.flipper);
    Object.assign(s.cfg.kickers, BASE_CONFIG.kickers);
    Object.assign(s.cfg.plunger, BASE_CONFIG.plunger);
    Object.assign(s.cfg.nudge, BASE_CONFIG.nudge);
    s.cfg.physics.rollingResistance = BASE_CONFIG.physics.rollingResistance;
  });
  tune.addButton({ title: 'Dump JSON' }).on('click', () => {
    void navigator.clipboard?.writeText(JSON.stringify(BASE_CONFIG, null, 2));
    console.info(JSON.stringify(BASE_CONFIG, null, 2));
  });

  // ---- collider overlay
  const view = pane.addFolder({ title: 'View' });
  const pos = new Float32Array(MAX_SEG * 6);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const lines = new THREE.LineSegments(
    geo,
    new THREE.LineBasicMaterial({
      color: 0x40ff80,
      depthTest: false,
      transparent: true,
      opacity: 0.85,
    }),
  );
  lines.frustumCulled = false;
  lines.renderOrder = 20;
  lines.visible = false;
  app.world.table.root.add(lines);
  view.addBinding(state, 'colliders').on('change', (e) => (lines.visible = e.value));
  const cam = { camera: 'auto' };
  view
    .addBinding(cam, 'camera', {
      options: { auto: 'auto', overhead: 'play', seated: 'seated', 'top-down': 'top' },
    })
    .on('change', (e) => (app.devCam = e.value === 'auto' ? null : (e.value as CamMode)));
  const triggerSegs: number[] = [];
  for (const t of TABLE.triggers) triggerSegs.push(t.a[0], t.a[1], t.b[0], t.b[1]);

  const writer = { n: 0 };
  const seg = (x0: number, y0: number, x1: number, y1: number) => {
    if (writer.n >= MAX_SEG) return;
    const o = writer.n++ * 6;
    pos[o] = wx(x0);
    pos[o + 1] = 0.35;
    pos[o + 2] = wz(y0);
    pos[o + 3] = wx(x1);
    pos[o + 4] = 0.35;
    pos[o + 5] = wz(y1);
  };

  // Shift-click to spawn a ball where the playfield is clicked.
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane();
  const hit = new THREE.Vector3();
  const inv = new THREE.Matrix4();
  app.renderer.canvas.addEventListener('pointerdown', (e) => {
    if (!e.shiftKey || !state.clickSpawn || !app.session) return;
    const r = app.renderer.canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, app.world.camera);
    const root = app.world.table.root;
    root.updateMatrixWorld();
    plane.setFromNormalAndCoplanarPoint(
      new THREE.Vector3(0, 1, 0).transformDirection(root.matrixWorld),
      root.localToWorld(new THREE.Vector3(0, 0.5, 0)),
    );
    if (!ray.ray.intersectPlane(plane, hit)) return;
    root.worldToLocal(hit);
    inv.identity();
    // Invert wx/wz: wx = x - CX, wz = -(y - CY).
    const x = hit.x - wx(0);
    const y = -(hit.z - wz(0));
    state.spawnX = Math.round(x * 10) / 10;
    state.spawnY = Math.round(y * 10) / 10;
    pane.refresh();
    app.session.sim.spawnBall(x, y, state.spawnVx, state.spawnVy);
  });

  let begun = false;
  app.onFrame = () => {
    if (begun) fps.end();
    fps.begin();
    begun = true;
    if (!lines.visible) return;
    writer.n = 0;
    const s = app.session ?? null;
    if (s) {
      for (let b: Body | null = s.sim.world.getBodyList(); b; b = b.getNext()) {
        const xf = b.getTransform();
        const c = xf.q.c;
        const sn = xf.q.s;
        const px = xf.p.x;
        const py = xf.p.y;
        const tx = (x: number, y: number, out: number[]) => {
          out[0] = px + c * x - sn * y;
          out[1] = py + sn * x + c * y;
        };
        const p0 = [0, 0];
        const p1 = [0, 0];
        for (let f: Fixture | null = b.getFixtureList(); f; f = f.getNext()) {
          const sh = f.getShape() as unknown as {
            m_type: string;
            m_vertices?: { x: number; y: number }[];
            m_count?: number;
            m_vertex1?: { x: number; y: number };
            m_vertex2?: { x: number; y: number };
            m_p?: { x: number; y: number };
            m_radius: number;
          };
          if (sh.m_type === 'circle' && sh.m_p) {
            const N = 12;
            for (let i = 0; i < N; i++) {
              const a0 = (i / N) * Math.PI * 2;
              const a1 = ((i + 1) / N) * Math.PI * 2;
              tx(sh.m_p.x + Math.cos(a0) * sh.m_radius, sh.m_p.y + Math.sin(a0) * sh.m_radius, p0);
              tx(sh.m_p.x + Math.cos(a1) * sh.m_radius, sh.m_p.y + Math.sin(a1) * sh.m_radius, p1);
              seg(p0[0], p0[1], p1[0], p1[1]);
            }
          } else if (sh.m_type === 'edge' && sh.m_vertex1 && sh.m_vertex2) {
            tx(sh.m_vertex1.x, sh.m_vertex1.y, p0);
            tx(sh.m_vertex2.x, sh.m_vertex2.y, p1);
            seg(p0[0], p0[1], p1[0], p1[1]);
          } else if (sh.m_vertices) {
            const v = sh.m_vertices;
            const n = sh.m_count ?? v.length;
            const closed = sh.m_type === 'polygon';
            for (let i = 0; i < n - (closed ? 0 : 1); i++) {
              const a = v[i];
              const bb = v[(i + 1) % n];
              tx(a.x, a.y, p0);
              tx(bb.x, bb.y, p1);
              seg(p0[0], p0[1], p1[0], p1[1]);
            }
          }
        }
      }
    }
    for (let i = 0; i < triggerSegs.length; i += 4)
      seg(triggerSegs[i], triggerSegs[i + 1], triggerSegs[i + 2], triggerSegs[i + 3]);
    geo.setDrawRange(0, writer.n * 2);
    (geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  };
}

function addNumbers(parent: FolderApi, title: string, obj: Record<string, unknown>): void {
  const f = parent.addFolder({ title, expanded: false });
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v !== 'number') continue;
    const mag = Math.abs(v) || 1;
    f.addBinding(obj, k, { min: 0, max: mag * 4, step: mag >= 100 ? 1 : mag >= 1 ? 0.01 : 0.001 });
  }
}
