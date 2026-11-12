/* global window, location, fetch, OfflineAudioContext, btoa */
/**
 * Offline audio scenarios for tools/audio-check.mjs. Runs in the browser (Vite dev server):
 * builds the real Audio facade and Music on an OfflineAudioContext, fires events on a virtual
 * clock (mix.clock), renders, and returns levels plus the PCM so the driver can write WAVs.
 */
import { Audio } from '../src/present/audio.ts';
import { Music } from '../src/present/music.ts';
import { allStems } from '../src/present/sfx-manifest.ts';

const SR = 44100;
const bankUrl = () => `${location.origin}/sfx/`;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const db = (x) => 20 * Math.log10(Math.max(1e-9, x));

/** Second-order high-pass, applied twice: a stand-in for a laptop or phone speaker. */
function smallSpeaker(buf) {
  const out = [0, 1].map((c) => Float32Array.from(buf.getChannelData(c)));
  const w0 = (2 * Math.PI * 180) / SR;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * 0.707);
  const a0 = 1 + alpha;
  const b0 = (1 + cos) / 2 / a0;
  const b1 = -(1 + cos) / a0;
  const a1 = (-2 * cos) / a0;
  const a2 = (1 - alpha) / a0;
  for (const x of out)
    for (let pass = 0; pass < 2; pass++) {
      let x1 = 0;
      let x2 = 0;
      let y1 = 0;
      let y2 = 0;
      for (let i = 0; i < x.length; i++) {
        const y = b0 * x[i] + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2;
        x2 = x1;
        x1 = x[i];
        y2 = y1;
        y1 = y;
        x[i] = y;
      }
    }
  return { getChannelData: (c) => out[c], duration: buf.duration, length: buf.length };
}

/** Peak, whole-file RMS and loudest 400 ms RMS (all dBFS) of [t0, t1) of the stereo buffer. */
function measure(buf, t0 = 0, t1 = buf.duration) {
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  const i0 = Math.floor(t0 * SR);
  const i1 = Math.min(L.length, Math.floor(t1 * SR));
  let peak = 0;
  let sum = 0;
  let dsum = 0;
  for (let i = i0; i < i1; i++) {
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
    sum += (L[i] * L[i] + R[i] * R[i]) / 2;
    if (i > i0) dsum += ((L[i] - L[i - 1]) ** 2 + (R[i] - R[i - 1]) ** 2) / 2;
  }
  const win = Math.floor(0.4 * SR);
  let best = 0;
  for (let s = i0; s + win <= i1; s += Math.floor(win / 4)) {
    let w = 0;
    for (let i = s; i < s + win; i++) w += (L[i] * L[i] + R[i] * R[i]) / 2;
    best = Math.max(best, w / win);
  }
  return {
    peak: +db(peak).toFixed(1),
    rms: +db(Math.sqrt(sum / Math.max(1, i1 - i0))).toFixed(1),
    mom: +db(Math.sqrt(best)).toFixed(1),
    // Brightness: energy of the first difference relative to the signal (lower = duller).
    hf: +db(Math.sqrt(dsum / Math.max(1e-12, sum))).toFixed(1),
  };
}

function pack(buf) {
  const n = buf.length;
  const pcm = new Int16Array(n * 2);
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  for (let i = 0; i < n; i++) {
    pcm[i * 2] = Math.max(-32768, Math.min(32767, Math.round(L[i] * 32767)));
    pcm[i * 2 + 1] = Math.max(-32768, Math.min(32767, Math.round(R[i] * 32767)));
  }
  const bytes = new Uint8Array(pcm.buffer);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function make(seconds) {
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * SR), SR);
  const a = new Audio();
  a.attach(ctx, bankUrl());
  await a.ready();
  let T = 0;
  a.parts.mix.clock = () => T;
  const music = new Music(a);
  return {
    ctx,
    a,
    music,
    set: (t) => (T = t),
    at: (t, fn) => {
      T = t;
      fn(a);
    },
    /** Call fn(t) every dt seconds from t0 to t1. */
    every: (t0, t1, dt, fn) => {
      for (let t = t0; t < t1; t += dt) {
        T = t;
        fn(t);
      }
    },
  };
}

/** Cue reel: each cue fires on its own, 3 s apart, and is measured separately. */
function reel(cues, gap = 3.2) {
  return {
    dur: cues.length * gap + 1.5,
    async run(h) {
      const segs = [];
      cues.forEach(([label, fn], i) => {
        const t0 = 0.3 + i * gap;
        h.at(t0, fn);
        segs.push({ label, t0, t1: t0 + gap - 0.1 });
      });
      return segs;
    },
  };
}

export const SCENARIOS = {
  /** Twenty-four seconds of busy table play, with the rewards in it. */
  rally: {
    dur: 26,
    async run(h) {
      const r = rng(7);
      const a = h.a;
      h.at(0.4, () => a.launch(0.8));
      h.every(0, 25, 1 / 60, (t) => {
        const v = 20 + 30 * Math.abs(Math.sin(t * 0.7));
        a.roll(v, t % 9 > 7);
      });
      // Flippers: alternate presses.
      for (let t = 1; t < 24; t += 0.5 + r() * 0.5) {
        const left = r() < 0.5;
        const id = left ? 'L' : 'R';
        const x = left ? 6 : 12;
        h.at(t, () => a.flipper(id, true, x));
        h.at(t + 0.25 + r() * 0.2, () => a.flipper(id, false, x));
        h.at(t + 0.02, () => a.flipperHit(10 + r() * 30, x));
      }
      // Pop bumper bursts (every 3 s, one second at ~9 Hz) and slings.
      for (let b = 2; b < 24; b += 3)
        for (let t = b; t < b + 1; t += 0.11) {
          h.at(t, () => a.pop(5 + r() * 8));
          h.at(t + 0.02, () => a.score(0.12, 0));
        }
      for (let t = 1.5; t < 24; t += 0.7 + r()) h.at(t, () => a.sling(r() < 0.5 ? 3 : 15));
      for (let t = 1; t < 24; t += 0.09 + r() * 0.2) {
        const mats = ['rubber', 'metal', 'wood', 'plastic', 'post', 'ball'];
        h.at(t, () => a.hit(mats[Math.floor(r() * mats.length)], 4 + r() * 38, r() * 18));
      }
      for (let t = 4; t < 22; t += 5) {
        h.at(t, () => a.spin(3, 40));
        h.at(t + 0.1, () => a.spin(2, 30));
      }
      for (let t = 6; t < 22; t += 4.3) {
        h.at(t, () => a.drop(8, 0));
        h.at(t + 0.2, () => a.drop(9, 1));
        h.at(t + 0.4, () => a.drop(10, 2));
        h.at(t + 0.9, () => a.dropReset());
      }
      // The chain climbs 2..8 with payouts.
      for (let n = 2; n <= 8; n++) {
        const t = 8 + (n - 2) * 0.7;
        h.at(t, () => a.combo(n));
        h.at(t + 0.02, () => a.score(0.8 * n, n, false));
      }
      h.at(14, () => a.jackpot(1));
      h.at(18, () => a.payday(false));
      h.at(21, () => a.extraBall());
      h.at(23.5, () => a.drain());
      h.at(24.1, () => a.ballOver(false));
      return [{ label: 'rally', t0: 0, t1: 26 }];
    },
  },

  /** Everything at once: the limiter and compressor must hold. */
  stress: {
    dur: 6,
    async run(h) {
      const a = h.a;
      const t = 0.5;
      h.at(t, () => {
        for (const id of ['L', 'R', 'U']) a.flipper(id, true, 4 + Math.random() * 10);
        for (let i = 0; i < 10; i++) a.pop(2 + i);
        for (let i = 0; i < 8; i++) a.sling(i * 2);
        for (let i = 0; i < 6; i++) a.drop(6 + i, i % 3);
        a.spin(3, 60);
        for (let i = 0; i < 14; i++) a.hit(['rubber', 'metal', 'wood'][i % 3], 40, i);
        a.knocker();
        a.kick();
        a.hole();
        a.lock(2);
        a.jackpot(2);
        a.payday(true);
        a.riot(true);
        a.extraBall();
        a.combo(8);
        a.jailbreak('start', 0);
        a.trapdoor();
        a.doorClang();
        a.clang();
        a.glassCrack();
        a.tilt();
        a.warn();
      });
      h.at(t + 0.4, () => {
        a.jailbreak('escaped', 5);
        for (let i = 0; i < 6; i++) a.pop(i * 3);
        a.deadlinePaid();
        a.unlocked();
      });
      return [{ label: 'stress', t0: 0, t1: 6 }];
    },
  },

  /** The cue reel for the reward layer. */
  rewards: reel([
    ['coin lvl0', (a) => a.coin(0)],
    ['coin lvl8', (a) => a.coin(8)],
    ['score tick .12', (a) => a.score(0.12, 0)],
    ['score minor .36', (a) => a.score(0.36, 0)],
    ['score major .8', (a) => a.score(0.8, 0)],
    ['score major .8 combo3', (a) => a.score(0.8, 3)],
    ['score big 2.4 combo5', (a) => a.score(2.4, 5)],
    ['score jackpot', (a) => a.score(60, 5, true)],
    ['combo 2', (a) => a.combo(2)],
    ['combo 4', (a) => a.combo(4)],
    ['combo 8', (a) => a.combo(8)],
    ['jackpot', (a) => a.jackpot(1)],
    ['super jackpot', (a) => a.jackpot(2)],
    ['payday', (a) => a.payday(false)],
    ['super payday', (a) => a.payday(true)],
    ['riot on', (a) => a.riot(true)],
    ['riot off', (a) => a.riot(false)],
    ['ball save', (a) => a.save()],
    ['extra ball', (a) => a.extraBall()],
    ['skill shot', (a) => a.skillShot(false)],
    ['super skill', (a) => a.skillShot(true)],
    ['job complete', (a) => a.jobComplete()],
    ['level up', (a) => a.levelUp()],
    ['deadline paid', (a) => a.deadlinePaid()],
    ['unlocked', (a) => a.unlocked()],
    ['tunnel', (a) => a.tunnel()],
    ['bonus mult x3', (a) => a.bonusMult(3)],
    ['lane complete', (a) => a.chime(1)],
    ['lock', (a) => a.lock(1)],
    ['active', (a) => a.active()],
    ['spark', (a) => a.spark()],
    ['banner big', (a) => a.banner('big')],
    ['banner good', (a) => a.banner('good')],
    ['banner bad', (a) => a.banner('bad')],
    ['callout 6', (a) => a.callout(6)],
  ]),

  /** Machine one-shots. */
  machine: reel(
    [
      ['flipper up', (a) => a.flipper('L', true, 6)],
      ['flipper down', (a) => a.flipper('L', false, 6)],
      ['flipper hit', (a) => a.flipperHit(30, 6)],
      ['pop', (a) => a.pop(9)],
      ['sling', (a) => a.sling(4)],
      ['drop', (a) => a.drop(8, 1)],
      ['drop reset', (a) => a.dropReset()],
      ['spin', (a) => a.spin(3, 40)],
      ['lane', (a) => a.lane(5)],
      ['rubber', (a) => a.hit('rubber', 30, 9)],
      ['metal', (a) => a.hit('metal', 30, 9)],
      ['wood', (a) => a.hit('wood', 30, 9)],
      ['plastic', (a) => a.hit('plastic', 30, 9)],
      ['ball-ball', (a) => a.hit('ball', 30, 9)],
      ['launch', (a) => a.launch(1)],
      ['chute', (a) => a.chute()],
      ['hole', (a) => a.hole()],
      ['kick', (a) => a.kick()],
      ['knocker', (a) => a.knocker()],
      ['drain', (a) => a.drain()],
      ['tilt', (a) => a.tilt()],
      ['warn', (a) => a.warn()],
    ],
    2.2,
  ),

  /** The cell reel. */
  cell: reel([
    ['phone', (a) => a.phoneRing()],
    ['atm deposit', (a) => a.deposit()],
    ['atm key', (a) => a.atmKey(2)],
    ['atm cash-out', (a) => a.cashOut()],
    ['vend', (a) => a.vend()],
    ['door clang', (a) => a.doorClang()],
    ['door lock', (a) => a.doorLock()],
    ['chain', (a) => a.chain()],
    ['creak', (a) => a.creak()],
    ['knock x3', (a) => a.knock(3)],
    ['trapdoor', (a) => a.trapdoor()],
    ['glass', (a) => a.glassCrack()],
    ['wall down', (a) => a.wallDown()],
    ['coin tray', (a) => a.clatter()],
    ['warden', (a) => a.warden()],
    ['ball over', (a) => a.ballOver(true)],
    ['jb start', (a) => a.jailbreak('start', 0)],
    ['jb shot', (a) => a.jailbreak('shot', 3)],
    ['jb posts', (a) => a.jailbreak('posts', 0)],
    ['jb lights', (a) => a.jailbreak('lights', 0)],
    ['jb glass', (a) => a.jailbreak('glass', 0)],
    ['jb escaped', (a) => a.jailbreak('escaped', 5)],
    ['jb failed', (a) => a.jailbreak('failed', 0)],
  ]),

  /** The story beats and the hurry-up; endings run 13 s each. */
  story: {
    dur: 5 * 3.2 + 3 * 14 + 22,
    async run(h) {
      const a = h.a;
      const segs = [];
      let t = 0.3;
      const once = (label, fn, len = 3.1) => {
        h.at(t, fn);
        segs.push({ label, t0: t, t1: t + len });
        t += len + 0.1;
      };
      once('run start', (x) => x.runStart());
      once('atm alarm', (x) => x.atmAlarm());
      once('ball feed', (x) => x.ballFeed());
      once('hurry on', (x) => x.hurry(true));
      once('hurry missed', (x) => x.hurry(false, false));
      // The countdown pulse: 15 s, called each frame like the game does.
      const t0 = t;
      h.every(t0, t0 + 15, 1 / 60, (x) => a.hurryTick(15 - (x - t0)));
      segs.push({ label: 'hurry ticks', t0, t1: t0 + 15 });
      t += 16;
      for (const k of ['paidInFull', 'breakout', 'cellmate']) {
        h.at(t, (x) => x.ending(k));
        segs.push({ label: `ending ${k}`, t0: t, t1: t + 13 });
        t += 14;
      }
      return segs;
    },
  },

  /** Every menu cue. */
  ui: reel(
    [
      'move',
      'hover',
      'tick',
      'slider',
      'select',
      'back',
      'open',
      'close',
      'error',
      'buy',
      'sell',
      'deposit',
      'reward',
      'toggleOn',
      'toggleOff',
      'lock',
      'unlock',
      'success',
      'warning',
      'notify',
      'pause',
      'resume',
    ].map((c) => [`ui ${c}`, (a) => a.ui(c)]),
    1.4,
  ),

  /** Continuous beds: ball roll at several speeds, the wire ramp, and a held flipper's hum. */
  beds: {
    dur: 22,
    async run(h) {
      const a = h.a;
      const plan = [
        ['idle', 0, false],
        ['roll 10', 10, false],
        ['roll 30', 30, false],
        ['roll 60', 60, false],
        ['ramp 40', 40, true],
      ];
      const segs = [];
      plan.forEach(([label, v, ramp], i) => {
        const t0 = 0.5 + i * 3;
        h.every(t0, t0 + 3, 1 / 60, () => a.roll(v, ramp));
        segs.push({ label, t0: t0 + 1, t1: t0 + 3 });
      });
      h.at(16.5, () => a.flipper('L', true, 6));
      h.at(17.5, () => a.flipper('R', true, 12));
      h.at(21, () => a.releaseCoils());
      h.every(16, 22, 1 / 60, () => a.roll(0, false));
      segs.push(
        { label: 'one coil hum', t0: 17, t1: 17.5 },
        { label: 'two coil hum', t0: 18.5, t1: 20.5 },
      );
      return segs;
    },
  },

  /** The bonus count-up. */
  tally: {
    dur: 5,
    async run(h) {
      const a = h.a;
      for (let i = 1; i <= 24; i++) h.at(0.3 + i * (2.4 / 24), () => a.countTick(i, 24));
      return [{ label: 'tally', t0: 0, t1: 5 }];
    },
  },

  /** The same hits with the camera on the table, then away at the ATM. */
  muffle: {
    dur: 9,
    async run(h) {
      const a = h.a;
      const m = a.parts.mix;
      const segs = [];
      for (const [i, focus] of ['table', 'seated', 'away', 'title'].entries()) {
        const t0 = 0.3 + i * 2.2;
        h.at(t0 - 0.05, () => m.setFocus(focus, true));
        for (let k = 0; k < 4; k++) {
          h.at(t0 + k * 0.4, () => a.pop(9));
          h.at(t0 + k * 0.4 + 0.1, () => a.hit('metal', 30, 9));
        }
        segs.push({ label: `focus ${focus}`, t0, t1: t0 + 2 });
      }
      return segs;
    },
  },

  /** Table music in its layers, with a jackpot stinger ducking it. */
  musicTable: {
    dur: 56,
    async run(h) {
      const music = h.music;
      const a = h.a;
      music.setMode('table');
      const plan = [
        [0, { combo: 0, riot: false, sentence: false }],
        [10, { combo: 1, riot: false, sentence: false }],
        [20, { combo: 3, riot: false, sentence: false }],
        [30, { combo: 0, riot: true, sentence: false }],
        [40, { combo: 0, riot: false, sentence: true }],
        [48, { combo: 0, riot: false, sentence: false }],
      ];
      let p = 0;
      h.every(0, 55, 1 / 60, (t) => {
        while (p < plan.length && t >= plan[p][0]) Object.assign(music.state, plan[p++][1]);
        music.update();
      });
      h.at(52, () => a.jackpot(1));
      return [
        { label: 'base', t0: 2, t1: 10 },
        { label: 'combo1', t0: 12, t1: 20 },
        { label: 'combo3', t0: 22, t1: 30 },
        { label: 'riot', t0: 32, t1: 40 },
        { label: 'sentence', t0: 42, t1: 48 },
        { label: 'duck (jackpot @52)', t0: 51, t1: 56 },
      ];
    },
  },

  /** The cell: drone, clock, drips; tension rises to the deadline. */
  musicCell: {
    dur: 40,
    async run(h) {
      const music = h.music;
      music.setMode('cell');
      h.every(0, 39, 1 / 60, (t) => {
        music.state.tension = t < 20 ? 0.05 : Math.min(1, (t - 20) / 15);
        music.update();
      });
      return [
        { label: 'calm', t0: 2, t1: 20 },
        { label: 'tense', t0: 22, t1: 40 },
      ];
    },
  },
};

async function runScenario(name) {
  const sc = SCENARIOS[name];
  if (!sc) throw new Error(`no scenario ${name}`);
  const h = await make(sc.dur);
  const segs = await sc.run(h);
  const buf = await h.ctx.startRendering();
  // "small": how much of the loudest 400 ms survives a laptop-speaker high-pass (dB, 0 = all).
  const sp = smallSpeaker(buf);
  const withSmall = (t0, t1) => {
    const m = measure(buf, t0, t1);
    return { ...m, small: +(measure(sp, t0, t1).mom - m.mom).toFixed(1) };
  };
  return {
    name,
    sr: SR,
    dur: buf.duration,
    whole: withSmall(0, buf.duration),
    segs: segs.map((s) => ({ ...s, ...withSmall(s.t0, s.t1) })),
    pcm: pack(buf),
    stats: h.a.stats(),
  };
}

/** Decode every manifest file the way the engine does and report length, lead-in and level. */
async function checkBank() {
  const ctx = new OfflineAudioContext(1, 1, SR);
  const out = [];
  for (const stem of allStems()) {
    try {
      const res = await fetch(`${bankUrl()}${stem}.mp3`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await ctx.decodeAudioData(await res.arrayBuffer());
      const d = buf.getChannelData(0);
      let first = -1;
      let peak = 0;
      for (let i = 0; i < d.length; i++) {
        const v = Math.abs(d[i]);
        if (first < 0 && v > 0.004) first = i;
        if (v > peak) peak = v;
      }
      out.push({
        stem,
        dur: +buf.duration.toFixed(3),
        lead: +((first < 0 ? 0 : first) / buf.sampleRate).toFixed(4),
        peak: +db(peak).toFixed(1),
        ch: buf.numberOfChannels,
        sr: buf.sampleRate,
      });
    } catch (e) {
      out.push({ stem, error: String(e) });
    }
  }
  return out;
}

window.lab = { runScenario, checkBank, names: Object.keys(SCENARIOS) };
window.labReady = true;
