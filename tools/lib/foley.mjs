/**
 * Procedural foley for DEBTOR'S PRISON: every pinball, bell, coin and cell sound that has no
 * suitable CC0 recording is modelled here (modal resonators for metal, wood and glass; filtered
 * noise transients; sub thumps) and rendered offline by tools/build-sfx.mjs. Renders are
 * seeded, so the shipped bank is reproducible.
 *
 * Each entry: { name, variants, dur, enc ('hi' | 'lo'), make(r, v) -> Float32Array }. Levels are set
 * by build-sfx.mjs (per class), not here.
 * Time constants (tau) are amplitude decays in seconds: -60 dB takes ~6.9 tau.
 */
import {
  SR,
  rng,
  buf,
  mix,
  modal,
  partials,
  noiseHit,
  thump,
  click,
  osc,
  filt,
  biquad,
  sweepFilter,
  whiteNoise,
  between,
  jit,
  midiHz,
  BAR,
  PLATE,
  BELL,
  BOX,
  softClip,
  fade,
} from './dsp.mjs';

/** @type {Array<{name:string, variants:number, dur:number, enc:string, make:Function}>} */
export const FOLEY = [];

function def(name, opts, make) {
  FOLEY.push({ name, variants: 1, enc: 'hi', ...opts, make });
}

const TAU = Math.PI * 2;

// ---------------------------------------------------------------- flippers

def('flip-up', { variants: 3, dur: 0.24 }, (r, v) => {
  const o = buf(0.24);
  const k = jit(r, 0.07) * [1, 0.93, 1.08][v];
  // Coil slug slamming home: the body of the thunk, kept short so the mids carry on a small speaker.
  thump(o, 0, { f0: 190 * k, f1: 78 * k, glide: 0.016, tau: 0.03, gain: 0.45, drive: 1.7 });
  thump(o, 0.001, { f0: 360 * k, f1: 150 * k, glide: 0.008, tau: 0.014, gain: 0.42 });
  modal(o, 0, [
    { f: 100 * k, a: 0.1, tau: 0.045 },
    { f: 168 * k, a: 0.22, tau: 0.032 },
  ]);
  // The steel plunger meeting its stop: a clack in the 300-1400 Hz band.
  modal(
    o,
    0,
    [
      { f: 310 * k, a: 1, tau: 0.022 },
      { f: 540 * k, a: 0.75, tau: 0.017 },
      { f: 870 * k, a: 0.55, tau: 0.012 },
      { f: 1380 * k, a: 0.4, tau: 0.009 },
    ],
    0.5,
  );
  noiseHit(o, 0, { tau: 0.013, gain: 0.8, chain: [['bp', 1100 * k, 0.7]], r });
  // Contact snap and the plunger hitting its steel stop.
  click(o, 0, { gain: 1.35, hp: 1800, r });
  // The contact edge: a 3 to 5 ms bright snap at 2.5 to 4 kHz (a small speaker needs it).
  noiseHit(o, 0, { tau: 0.0035, gain: 4.0, chain: [['bp', 3200 * k, 1.1]], r });
  noiseHit(o, 0.0004, { tau: 0.008, gain: 0.75, chain: [['bp', 2400 * k, 1.1]], r });
  modal(
    o,
    0.0005,
    partials(2300 * k, PLATE.slice(0, 4), {
      tau: 0.012,
      aSlope: 0.6,
      tauSlope: 0.7,
      r,
      detune: 0.02,
    }),
    0.24,
  );
  // The bat reaches its rubber stop a moment later.
  noiseHit(o, 0.022, { tau: 0.012, gain: 0.45, chain: [['bp', 900, 0.9]], r });
  modal(
    o,
    0.022,
    [
      { f: 640 * k, a: 1, tau: 0.018 },
      { f: 1180 * k, a: 0.5, tau: 0.012 },
    ],
    0.26,
  );
  return o;
});

def('flip-down', { variants: 2, dur: 0.14 }, (r, v) => {
  const o = buf(0.14);
  const k = jit(r, 0.06) * [1, 1.1][v];
  noiseHit(o, 0, { tau: 0.01, gain: 0.5, chain: [['bp', 1500 * k, 0.9]], r });
  modal(
    o,
    0,
    [
      { f: 480 * k, a: 1, tau: 0.02 },
      { f: 900 * k, a: 0.45, tau: 0.012 },
    ],
    0.3,
  );
  thump(o, 0, { f0: 130 * k, f1: 72 * k, glide: 0.012, tau: 0.02, gain: 0.4 });
  click(o, 0, { gain: 0.3, hp: 2200, r });
  noiseHit(o, 0, { tau: 0.0035, gain: 3.5, chain: [['bp', 3000 * k, 1.0]], r });
  return o;
});

// Ball struck by the bat: a dull tock, brighter with speed (the engine pitches it).
def('flip-hit', { variants: 3, dur: 0.12 }, (r, v) => {
  const o = buf(0.12);
  const k = [1, 1.12, 0.92][v] * jit(r, 0.04);
  modal(
    o,
    0,
    [
      { f: 420 * k, a: 1, tau: 0.014 },
      { f: 780 * k, a: 0.45, tau: 0.009 },
      { f: 1650 * k, a: 0.2, tau: 0.006 },
    ],
    0.45,
  );
  noiseHit(o, 0, { tau: 0.008, gain: 0.4, chain: [['bp', 1100, 1]], r });
  click(o, 0, { gain: 0.3, hp: 2500, r });
  thump(o, 0, { f0: 190, f1: 110, glide: 0.01, tau: 0.02, gain: 0.35 });
  return o;
});

// ---------------------------------------------------------------- bumpers and targets

def('pop', { variants: 3, dur: 0.4 }, (r, v) => {
  const o = buf(0.4);
  const k = jit(r, 0.06) * [1, 0.9, 1.1][v];
  thump(o, 0, { f0: 430 * k, f1: 135 * k, glide: 0.028, tau: 0.075, gain: 1, drive: 1.3 });
  modal(o, 0, [{ f: 190 * k, a: 0.45, tau: 0.07 }]);
  noiseHit(o, 0, { tau: 0.014, gain: 0.55, chain: [['bp', 1500 * k, 0.8]], r });
  click(o, 0, { gain: 0.65, hp: 3000, r });
  // The skirt ringing after the kick.
  modal(
    o,
    0.001,
    partials(1250 * k, BAR.slice(0, 4), {
      tau: 0.09,
      aSlope: 0.55,
      tauSlope: 0.55,
      r,
      detune: 0.015,
    }),
    0.2,
  );
  noiseHit(o, 0.035, { tau: 0.02, gain: 0.22, chain: [['bp', 600, 1]], r });
  return o;
});

def('sling', { variants: 3, dur: 0.26 }, (r, v) => {
  const o = buf(0.26);
  const k = jit(r, 0.06) * [1, 1.08, 0.94][v];
  noiseHit(o, 0, { tau: 0.007, gain: 0.85, chain: [['bp', 3000 * k, 1.3]], r });
  click(o, 0, { gain: 0.8, hp: 3500, r });
  thump(o, 0, { f0: 310 * k, f1: 115 * k, glide: 0.012, tau: 0.03, gain: 0.8, drive: 1.2 });
  modal(
    o,
    0,
    partials(1900 * k, BAR.slice(0, 3), { tau: 0.05, aSlope: 0.5, tauSlope: 0.55, r }),
    0.2,
  );
  noiseHit(o, 0.012, { tau: 0.018, gain: 0.28, chain: [['bp', 700, 1]], r });
  return o;
});

def('drop', { variants: 3, dur: 0.24 }, (r, v) => {
  const o = buf(0.24);
  const k = jit(r, 0.05) * [1, 1.07, 0.95][v];
  click(o, 0, { gain: 0.75, hp: 3000, r });
  noiseHit(o, 0, { tau: 0.006, gain: 0.55, chain: [['bp', 2600, 1.5]], r });
  // The strike: a 3 to 6 ms bright transient at 2 to 4 kHz, the part a laptop speaker hears.
  noiseHit(o, 0, { tau: 0.0045, gain: 1.0, chain: [['bp', 3000 * k, 1.2]], r });
  modal(
    o,
    0,
    [
      { f: 1900 * k, a: 0.5, tau: 0.01 },
      { f: 3300 * k, a: 0.3, tau: 0.007 },
    ],
    0.5,
  );
  // The target falls into its slot: a short, light body (it no longer thuds).
  thump(o, 0.012, { f0: 270 * k, f1: 150 * k, glide: 0.02, tau: 0.018, gain: 0.4 });
  modal(
    o,
    0.012,
    [
      { f: 420 * k, a: 0.5, tau: 0.02 },
      { f: 690 * k, a: 0.3, tau: 0.016 },
    ],
    0.35,
  );
  modal(
    o,
    0.03,
    partials(2100 * k, PLATE.slice(0, 3), { tau: 0.03, aSlope: 0.6, tauSlope: 0.7, r }),
    0.12,
  );
  return o;
});

def('drop-reset', { dur: 0.55 }, (r) => {
  const o = buf(0.55);
  thump(o, 0, { f0: 170, f1: 80, glide: 0.025, tau: 0.07, gain: 0.55, drive: 1.5 });
  modal(
    o,
    0,
    [
      { f: 420, a: 1, tau: 0.03 },
      { f: 760, a: 0.6, tau: 0.02 },
    ],
    0.4,
  );
  click(o, 0, { gain: 1.0, hp: 2000, r });
  noiseHit(o, 0, { tau: 0.014, gain: 0.7, chain: [['bp', 1200, 0.9]], r });
  for (let i = 0; i < 3; i++) {
    const t = 0.075 + i * 0.062;
    const k = 1 + i * 0.09;
    noiseHit(o, t, { tau: 0.01, gain: 0.75, chain: [['bp', 2000 * k, 1.3]], r });
    click(o, t, { gain: 0.8, hp: 2800, r });
    modal(
      o,
      t,
      [
        { f: 1250 * k, a: 0.7, tau: 0.016 },
        { f: 2300 * k, a: 0.35, tau: 0.01 },
      ],
      0.4,
    );
    thump(o, t, { f0: 300 * k, f1: 190, glide: 0.012, tau: 0.025, gain: 0.3 });
  }
  // Spring rattle settling.
  modal(
    o,
    0.26,
    partials(2800, PLATE.slice(0, 3), { tau: 0.08, aSlope: 0.5, tauSlope: 0.6, r }),
    0.08,
  );
  noiseHit(o, 0.26, { tau: 0.07, gain: 0.08, chain: [['bp', 3500, 1.5]], r });
  return o;
});

def('spin', { variants: 3, dur: 0.1 }, (r, v) => {
  const o = buf(0.1);
  const k = jit(r, 0.05) * [1, 1.09, 0.92][v];
  click(o, 0, { gain: 0.5, hp: 4000, r });
  modal(
    o,
    0,
    [
      { f: 3100 * k, a: 1, tau: 0.014 },
      { f: 4700 * k, a: 0.5, tau: 0.01 },
      { f: 6900 * k, a: 0.2, tau: 0.006 },
    ],
    0.4,
  );
  noiseHit(o, 0, { tau: 0.004, gain: 0.3, chain: [['bp', 5000, 1]], r });
  return o;
});

def('switch', { variants: 2, dur: 0.08 }, (r, v) => {
  // Rollover lane switch: a light contact tick.
  const o = buf(0.08);
  const k = [1, 1.14][v] * jit(r, 0.03);
  click(o, 0, { gain: 0.6, hp: 3500, r });
  modal(
    o,
    0,
    [
      { f: 2500 * k, a: 1, tau: 0.008 },
      { f: 4100 * k, a: 0.4, tau: 0.006 },
    ],
    0.35,
  );
  return o;
});

// ---------------------------------------------------------------- ball contacts

def('rubber', { variants: 3, dur: 0.14 }, (r, v) => {
  const o = buf(0.14);
  const k = jit(r, 0.06) * [1, 1.1, 0.9][v];
  thump(o, 0, { f0: 200 * k, f1: 125 * k, glide: 0.012, tau: 0.03, gain: 0.55 });
  noiseHit(o, 0, { tau: 0.02, gain: 0.7, chain: [['bp', 450 * k, 0.8]], r });
  noiseHit(o, 0, { tau: 0.012, gain: 0.5, chain: [['bp', 950 * k, 0.8]], r });
  click(o, 0, { gain: 0.3, hp: 1500, r });
  modal(o, 0, [{ f: 260 * k, a: 0.35, tau: 0.03 }]);
  modal(o, 0, [{ f: 640 * k, a: 0.5, tau: 0.012 }], 0.5);
  return o;
});

def('metal', { variants: 4, dur: 0.4 }, (r, v) => {
  const o = buf(0.4);
  const f0 = [1900, 2350, 2800, 3350][v] * jit(r, 0.03);
  click(o, 0, { gain: 0.5, hp: 4000, r });
  noiseHit(o, 0, { tau: 0.004, gain: 0.35, chain: [['bp', 4200, 1]], r });
  modal(
    o,
    0,
    partials(f0, PLATE.slice(0, 5), { tau: 0.075, aSlope: 0.62, tauSlope: 0.62, r, detune: 0.012 }),
    0.5,
  );
  modal(o, 0, [{ f: 420 + v * 60, a: 0.3, tau: 0.02 }]);
  return o;
});

def('plastic', { variants: 3, dur: 0.14 }, (r, v) => {
  const o = buf(0.14);
  const k = [1, 1.12, 0.9][v] * jit(r, 0.04);
  noiseHit(o, 0, { tau: 0.008, gain: 0.6, chain: [['bp', 1800 * k, 1.2]], r });
  modal(
    o,
    0,
    [
      { f: 900 * k, a: 0.8, tau: 0.014 },
      { f: 1500 * k, a: 0.5, tau: 0.01 },
      { f: 2600 * k, a: 0.25, tau: 0.006 },
    ],
    0.4,
  );
  click(o, 0, { gain: 0.3, hp: 3000, r });
  return o;
});

def('wood', { variants: 3, dur: 0.34 }, (r, v) => {
  const o = buf(0.34);
  const f0 = [175, 205, 150][v] * jit(r, 0.04);
  modal(o, 0, partials(f0, BOX, { tau: 0.09, aSlope: 0.7, tauSlope: 0.7, r, detune: 0.02 }), 0.8);
  thump(o, 0, { f0: 150, f1: 90, glide: 0.015, tau: 0.04, gain: 0.5 });
  noiseHit(o, 0, { tau: 0.008, gain: 0.45, chain: [['lp', 1800, 0.7]], r });
  click(o, 0, { gain: 0.15, hp: 1500, r });
  return o;
});

def('ball-ball', { variants: 2, dur: 0.18 }, (r, v) => {
  const o = buf(0.18);
  const k = [1, 1.1][v] * jit(r, 0.03);
  click(o, 0, { gain: 0.45, hp: 5000, r });
  modal(
    o,
    0,
    [
      { f: 4300 * k, a: 1, tau: 0.022 },
      { f: 6100 * k, a: 0.55, tau: 0.014 },
      { f: 7900 * k, a: 0.3, tau: 0.009 },
    ],
    0.4,
  );
  return o;
});

// ---------------------------------------------------------------- plunger, kickers, holes

def('plunger-tick', { variants: 3, dur: 0.06 }, (r, v) => {
  const o = buf(0.06);
  const k = [1, 1.2, 0.85][v] * jit(r, 0.05);
  click(o, 0, { gain: 0.6, hp: 3000, r });
  modal(
    o,
    0,
    [
      { f: 2100 * k, a: 1, tau: 0.006 },
      { f: 3300 * k, a: 0.4, tau: 0.004 },
    ],
    0.4,
  );
  return o;
});

def('launch', { variants: 2, dur: 0.7 }, (r, v) => {
  const o = buf(0.7);
  const k = jit(r, 0.05) * [1, 1.08][v];
  // Spring released: a quick twang that falls in pitch, then the ball rushes away.
  modal(
    o,
    0,
    [
      { f: 190 * k, f1: 330 * k, bend: 0.06, a: 1, tau: 0.1 },
      { f: 430 * k, f1: 700 * k, bend: 0.05, a: 0.5, tau: 0.06 },
      { f: 920 * k, a: 0.25, tau: 0.04 },
    ],
    0.4,
  );
  thump(o, 0, { f0: 160, f1: 74, glide: 0.02, tau: 0.06, gain: 0.6, drive: 1.3 });
  click(o, 0, { gain: 0.8, hp: 2200, r });
  noiseHit(o, 0, { tau: 0.014, gain: 0.6, chain: [['bp', 1400, 0.9]], r });
  const rush = whiteNoise(Math.round(0.5 * SR), r);
  sweepFilter(rush, 'bp', (t) => 500 + 2600 * Math.min(1, t / 0.18), 1.1);
  for (let i = 0; i < rush.length; i++) {
    const t = i / SR;
    rush[i] *= 0.28 * Math.min(1, t / 0.03) * Math.exp(-t / 0.16);
  }
  mix(o, rush, 0.03);
  modal(
    o,
    0.0,
    partials(1650 * k, PLATE.slice(0, 3), { tau: 0.05, aSlope: 0.5, tauSlope: 0.6, r }),
    0.12,
  );
  return o;
});

def('knocker', { variants: 2, dur: 1.0 }, (r, v) => {
  const o = buf(1.0);
  const k = jit(r, 0.04) * [1, 0.94][v];
  // The plunger's crack: a broadband transient at 1.2 to 2.5 kHz, 5 to 10 ms. This is what makes
  // it read as a wooden whack rather than a thud.
  noiseHit(o, 0, { tau: 0.0035, gain: 3.0, chain: [['bp', 1800 * k, 0.8]], r });
  click(o, 0, { gain: 2.0, hp: 1400, r });
  // The hardwood block: a short body (about 150 ms at most) with modes near 180, 420 and 760 Hz.
  modal(
    o,
    0,
    [
      { f: 180 * k, a: 0.7, tau: 0.03 },
      { f: 420 * k, a: 0.8, tau: 0.024 },
      { f: 760 * k, a: 0.45, tau: 0.016 },
    ],
    0.9,
  );
  // The cabinet panel under it: damped and quiet, so the body keeps its wood colour.
  modal(
    o,
    0,
    partials(205 * k, BOX, { tau: 0.05, aSlope: 0.7, tauSlope: 0.7, r, detune: 0.02 }),
    0.25,
  );
  noiseHit(o, 0, { tau: 0.02, gain: 0.45, chain: [['bp', 900, 0.9]], r });
  // Sub weight, kept short: the solenoid's push, not a boom.
  thump(o, 0, { f0: 110 * k, f1: 62 * k, glide: 0.02, tau: 0.04, gain: 0.3, drive: 1.5 });
  modal(
    o,
    0.004,
    partials(2100, PLATE.slice(0, 3), { tau: 0.012, aSlope: 0.5, tauSlope: 0.6, r }),
    0.12,
  );
  // The rebound.
  thump(o, 0.05, { f0: 110 * k, f1: 68 * k, glide: 0.02, tau: 0.03, gain: 0.18 });
  noiseHit(o, 0.05, { tau: 0.015, gain: 0.25, chain: [['bp', 700, 0.9]], r });
  filt(o, ['lp', 9000, 0.7]);
  return o;
});

def('drain', { variants: 2, dur: 1.5 }, (r, v) => {
  const o = buf(1.5);
  const k = [1, 0.9][v];
  // The ball drops off the apron into the dark: a metal clank and a hollow thud.
  thump(o, 0.02, { f0: 190 * k, f1: 78 * k, glide: 0.035, tau: 0.07, gain: 0.7, drive: 1.4 });
  noiseHit(o, 0.02, { tau: 0.025, gain: 0.7, chain: [['bp', 700, 0.9]], r });
  click(o, 0.02, { gain: 0.6, hp: 1800, r });
  modal(
    o,
    0.02,
    [
      { f: 330 * k, a: 1, tau: 0.05 },
      { f: 590 * k, a: 0.7, tau: 0.04 },
      { f: 980 * k, a: 0.45, tau: 0.03 },
    ],
    0.38,
  );
  modal(
    o,
    0.02,
    partials(640 * k, PLATE.slice(0, 4), { tau: 0.11, aSlope: 0.6, tauSlope: 0.65, r }),
    0.25,
  );
  // Rolling away down the trough, slowing and clanking.
  const roll = whiteNoise(Math.round(0.9 * SR), r);
  filt(roll, ['bp', 900, 1], ['lp', 2600, 0.7]);
  let ph = 0;
  for (let i = 0; i < roll.length; i++) {
    const t = i / SR;
    ph += (34 * Math.exp(-t / 0.55)) / SR;
    roll[i] *= 0.2 * Math.exp(-t / 0.3) * (0.55 + 0.45 * Math.sin(TAU * ph));
  }
  mix(o, roll, 0.06);
  // The descending doom tone: a sag in pitch that stays in the mids.
  thump(o, 0.1, { f0: 360 * k, f1: 96, glide: 0.3, tau: 0.45, gain: 0.34 });
  modal(o, 0.1, [{ f: 140 * k, f1: 190, bend: 0.3, a: 0.2, tau: 0.5 }]);
  filt(o, ['hp', 40, 0.7], ['lp', 5200, 0.7]);
  return o;
});

def('tilt', { dur: 1.3 }, (r) => {
  const o = buf(1.3);
  // Relay slam, then the buzzer.
  thump(o, 0, { f0: 140, f1: 55, glide: 0.03, tau: 0.08, gain: 0.9, drive: 1.6 });
  click(o, 0, { gain: 0.8, hp: 2000, r });
  noiseHit(o, 0, { tau: 0.012, gain: 0.5, chain: [['bp', 1400, 0.9]], r });
  const bz = buf(1.05);
  osc(bz, 0, { f: 156, dur: 1.05, type: 'saw', gain: 0.5, atk: 0.01, rel: 0.12 });
  osc(bz, 0, { f: 160.5, dur: 1.05, type: 'saw', gain: 0.5, atk: 0.01, rel: 0.12 });
  osc(bz, 0, { f: 312, dur: 1.05, type: 'square', gain: 0.22, atk: 0.01, rel: 0.12 });
  filt(bz, ['lp', 1900, 0.8]);
  for (let i = 0; i < bz.length; i++) bz[i] *= 0.68 + 0.32 * Math.sin((TAU * 38 * i) / SR);
  softClip(bz, 1.8);
  mix(o, bz, 0.05, 0.55);
  // Relay chatter.
  for (let i = 0; i < 5; i++) click(o, 0.12 + i * 0.09 + r() * 0.02, { gain: 0.25, hp: 2500, r });
  return o;
});

def('warn', { dur: 0.36 }, (r) => {
  const o = buf(0.36);
  for (let i = 0; i < 2; i++) {
    const t = i * 0.15;
    const b = buf(0.11);
    osc(b, 0, { f: 230, dur: 0.11, type: 'saw', gain: 0.6, atk: 0.003, rel: 0.02 });
    osc(b, 0, { f: 232, dur: 0.11, type: 'square', gain: 0.25, atk: 0.003, rel: 0.02 });
    filt(b, ['lp', 2100, 0.8]);
    mix(o, b, t);
    click(o, t, { gain: 0.45, hp: 2500, r });
  }
  return o;
});

def('hole', { variants: 2, dur: 0.8 }, (r, v) => {
  const o = buf(0.8);
  const k = [1, 0.92][v] * jit(r, 0.04);
  thump(o, 0, { f0: 165 * k, f1: 80 * k, glide: 0.025, tau: 0.075, gain: 0.7, drive: 1.3 });
  modal(
    o,
    0,
    [
      { f: 380 * k, a: 1, tau: 0.03 },
      { f: 690 * k, a: 0.6, tau: 0.022 },
    ],
    0.4,
  );
  noiseHit(o, 0, { tau: 0.014, gain: 0.6, chain: [['bp', 1000, 0.9]], r });
  click(o, 0, { gain: 0.7, hp: 2000, r });
  modal(
    o,
    0,
    partials(880 * k, PLATE.slice(0, 5), {
      tau: 0.14,
      aSlope: 0.62,
      tauSlope: 0.6,
      r,
      detune: 0.015,
    }),
    0.3,
  );
  // The ball settling in the saucer.
  const hits = [0.09, 0.18, 0.26, 0.32, 0.365, 0.395];
  hits.forEach((t, i) => {
    const a = 0.5 * 0.7 ** i;
    modal(
      o,
      t,
      [
        { f: 1500 * jit(r, 0.1), a: 1, tau: 0.01 },
        { f: 2400 * jit(r, 0.1), a: 0.5, tau: 0.008 },
      ],
      a,
    );
    click(o, t, { gain: a * 0.5, hp: 3000, r });
  });
  return o;
});

def('kick', { variants: 3, dur: 0.34 }, (r, v) => {
  const o = buf(0.34);
  const k = jit(r, 0.05) * [1, 1.08, 0.93][v];
  thump(o, 0, { f0: 230 * k, f1: 96 * k, glide: 0.018, tau: 0.05, gain: 0.7, drive: 1.6 });
  // The kicker arm slapping the ball: a steel clack with some wood in it.
  modal(
    o,
    0,
    [
      { f: 420 * k, a: 1, tau: 0.02 },
      { f: 760 * k, a: 0.65, tau: 0.015 },
      { f: 1250 * k, a: 0.45, tau: 0.011 },
    ],
    0.5,
  );
  noiseHit(o, 0, { tau: 0.012, gain: 0.8, chain: [['bp', 1500 * k, 0.8]], r });
  click(o, 0, { gain: 1.0, hp: 2200, r });
  modal(
    o,
    0,
    partials(2300 * k, PLATE.slice(0, 3), { tau: 0.04, aSlope: 0.55, tauSlope: 0.6, r }),
    0.2,
  );
  const w = whiteNoise(Math.round(0.2 * SR), r);
  filt(w, ['bp', 1400, 0.9]);
  for (let i = 0; i < w.length; i++) w[i] *= 0.18 * Math.exp(-(i / SR) / 0.06);
  mix(o, w, 0.015);
  return o;
});

def('lock', { dur: 0.6 }, (r) => {
  const o = buf(0.6);
  click(o, 0, { gain: 1.0, hp: 1800, r });
  modal(
    o,
    0,
    [
      { f: 1400, a: 0.7, tau: 0.02 },
      { f: 2300, a: 0.3, tau: 0.012 },
    ],
    0.5,
  );
  noiseHit(o, 0, { tau: 0.012, gain: 0.6, chain: [['bp', 1500, 1]], r });
  thump(o, 0.03, { f0: 190, f1: 90, glide: 0.022, tau: 0.06, gain: 0.7, drive: 1.4 });
  modal(
    o,
    0.03,
    [
      { f: 460, a: 1, tau: 0.03 },
      { f: 820, a: 0.6, tau: 0.022 },
    ],
    0.4,
  );
  modal(
    o,
    0.03,
    partials(1000, PLATE.slice(0, 4), { tau: 0.11, aSlope: 0.55, tauSlope: 0.6, r }),
    0.26,
  );
  click(o, 0.2, { gain: 0.5, hp: 2500, r });
  modal(o, 0.2, [{ f: 1100, a: 0.5, tau: 0.02 }], 0.34);
  return o;
});

def('chute', { variants: 2, dur: 0.85 }, (r, v) => {
  const o = buf(0.85);
  // The ball starts up a wire ramp: ticks that speed up, then a ringing rattle.
  let t = 0.005;
  for (let i = 0; i < 10; i++) {
    const a = 0.45 + i * 0.05;
    const k = jit(r, 0.08) * (v ? 1.08 : 1);
    modal(
      o,
      t,
      [
        { f: 2400 * k, a: 1, tau: 0.012 },
        { f: 3700 * k, a: 0.5, tau: 0.008 },
        { f: 5200 * k, a: 0.2, tau: 0.005 },
      ],
      a * 0.5,
    );
    click(o, t, { gain: 0.3, hp: 3500, r });
    t += 0.085 - i * 0.0062;
  }
  const w = whiteNoise(Math.round(0.6 * SR), r);
  sweepFilter(w, 'bp', (tt) => 1600 + 1800 * Math.min(1, tt / 0.5), 1.8);
  for (let i = 0; i < w.length; i++) {
    const tt = i / SR;
    w[i] *= 0.16 * Math.min(1, tt / 0.08) * Math.exp(-tt / 0.28);
  }
  mix(o, w, 0.1);
  return o;
});

// ---------------------------------------------------------------- bells, coins, cash

const CHIME_NOTES = [
  ['bell-c', 1046.5],
  ['bell-e', 1318.5],
  ['bell-g', 1568.0],
];
for (const [name, f0] of CHIME_NOTES) {
  // EM chime unit: a struck steel bar. Split modes give the slow shimmer.
  def(name, { dur: 2.3 }, (r) => {
    const o = buf(2.3);
    // All partials start in phase: a struck bar is loudest at the strike, then shimmers.
    const bar = partials(f0, BAR.slice(0, 5), {
      a: 1,
      aSlope: 0.46,
      tau: 0.34,
      tauSlope: 0.42,
      r,
      detune: 0.0015,
    }).map((m) => ({ ...m, ph: 0 }));
    modal(o, 0, bar, 0.55);
    modal(o, 0, [{ f: f0 * 1.0042, a: 0.5, tau: 0.3 }], 0.55);
    modal(o, 0, [{ f: f0 * 2.0, a: 0.12, tau: 0.5 }], 0.55);
    // Solenoid hammer strike and its felt thump.
    click(o, 0, { gain: 0.55, hp: 3000, r });
    noiseHit(o, 0, { tau: 0.004, gain: 0.35, chain: [['bp', 4200, 1]], r });
    thump(o, 0, { f0: f0 * 0.3, f1: f0 * 0.2, glide: 0.01, tau: 0.02, gain: 0.25 });
    return o;
  });
}

def('toll', { variants: 2, dur: 3.6, enc: 'lo' }, (r, v) => {
  // The prison bell: deep, with a sour minor third in the strike. The hum below the prime is kept
  // modest so the strike tone and the tierce still carry on a small speaker.
  const o = buf(3.6);
  const f0 = [196, 174.6][v];
  const amps = [0.4, 1, 0.9, 0.75, 0.85, 0.55, 0.5, 0.38, 0.28];
  const bell = partials(f0, BELL, {
    a: 1,
    aSlope: 1,
    tau: 0.95,
    tauSlope: 0.78,
    r,
    detune: 0.002,
  }).map((m, i) => ({ ...m, a: amps[i] ?? 0.2, ph: 0 }));
  modal(o, 0, bell, 0.5);
  modal(o, 0, [{ f: f0 * 1.0035, a: 0.5, tau: 0.9 }], 0.5);
  noiseHit(o, 0, { tau: 0.02, gain: 0.7, chain: [['bp', 900, 0.8]], r });
  click(o, 0, { gain: 0.6, hp: 1500, r });
  thump(o, 0, { f0: 150, f1: 80, glide: 0.03, tau: 0.08, gain: 0.35, drive: 1.5 });
  return o;
});

def('coin', { variants: 5, dur: 0.42 }, (r, v) => {
  // A coin clinking on coins: bright, short, inharmonic.
  const o = buf(0.42);
  const f0 = [3300, 3650, 4000, 4400, 3000][v] * jit(r, 0.02);
  click(o, 0, { gain: 0.45, hp: 5000, r });
  noiseHit(o, 0, { tau: 0.003, gain: 0.3, chain: [['hp', 6000, 0.7]], r });
  modal(
    o,
    0,
    [
      { f: f0, a: 1, tau: 0.075 },
      { f: f0 * 1.52, a: 0.65, tau: 0.05 },
      { f: f0 * 2.31, a: 0.4, tau: 0.03 },
      { f: f0 * 3.3, a: 0.2, tau: 0.018 },
    ],
    0.5,
  );
  modal(o, 0, [{ f: f0 * 0.5, a: 0.25, tau: 0.04 }], 0.5);
  return o;
});

def('coin-spin', { variants: 2, dur: 0.95 }, (r, v) => {
  // A coin spinning down to rest on metal: pings that accelerate into a buzz.
  const o = buf(0.95);
  const f0 = [3500, 3150][v];
  let t = 0;
  let gap = 0.12;
  let i = 0;
  while (t < 0.6 && gap > 0.007) {
    const a = 0.4 + 0.5 * Math.min(1, i / 8);
    modal(
      o,
      t,
      [
        { f: f0 * jit(r, 0.01), a, tau: 0.04 },
        { f: f0 * 1.55, a: a * 0.5, tau: 0.025 },
        { f: f0 * 2.4, a: a * 0.25, tau: 0.015 },
      ],
      0.5,
    );
    click(o, t, { gain: 0.15 * a, hp: 5000, r });
    t += gap;
    gap *= 0.8;
    i++;
  }
  // The final buzz of the flat coin.
  const b = buf(0.3);
  modal(
    b,
    0,
    [
      { f: f0, a: 1, tau: 0.09 },
      { f: f0 * 1.55, a: 0.5, tau: 0.06 },
    ],
    0.35,
  );
  for (let j = 0; j < b.length; j++) b[j] *= 0.5 + 0.5 * Math.sin(TAU * 190 * (j / SR));
  mix(o, b, t);
  return o;
});

def('coin-tray', { variants: 5, dur: 0.22 }, (r, v) => {
  // A coin dropping on the pile in the tray.
  const o = buf(0.22);
  const k = [1, 1.13, 0.88, 1.25, 0.8][v] * jit(r, 0.03);
  click(o, 0, { gain: 0.5, hp: 4000, r });
  noiseHit(o, 0, { tau: 0.008, gain: 0.35, chain: [['bp', 4500, 1.2]], r });
  modal(
    o,
    0,
    [
      { f: 2600 * k, a: 1, tau: 0.03 },
      { f: 4100 * k, a: 0.6, tau: 0.02 },
      { f: 5700 * k, a: 0.3, tau: 0.012 },
    ],
    0.45,
  );
  return o;
});

def('coin-shower', { variants: 2, dur: 1.5 }, (r) => {
  const o = buf(1.5);
  let t = 0;
  while (t < 1.25) {
    const f0 = between(r, 2500, 5200);
    const a = between(r, 0.35, 1) * Math.exp(-t / 0.9);
    modal(
      o,
      t,
      [
        { f: f0, a: 1, tau: between(r, 0.02, 0.07) },
        { f: f0 * 1.52, a: 0.5, tau: 0.03 },
        { f: f0 * 2.3, a: 0.25, tau: 0.016 },
      ],
      a * 0.4,
    );
    click(o, t, { gain: a * 0.25, hp: 4000, r });
    t += between(r, 0.006, 0.04) * (1 + t * 1.6);
  }
  return o;
});

def('cash', { dur: 1.3 }, (r) => {
  // Cash drawer: the clack of the release, the slide, and the bell.
  const o = buf(1.3);
  thump(o, 0, { f0: 170, f1: 80, glide: 0.02, tau: 0.05, gain: 0.8, drive: 1.4 });
  click(o, 0, { gain: 0.8, hp: 2200, r });
  noiseHit(o, 0, { tau: 0.012, gain: 0.5, chain: [['bp', 1300, 0.9]], r });
  const slide = whiteNoise(Math.round(0.22 * SR), r);
  filt(slide, ['bp', 1100, 0.8]);
  for (let i = 0; i < slide.length; i++) {
    const t = i / SR;
    slide[i] *= 0.2 * Math.sin((Math.PI * t) / 0.22) * (0.7 + 0.3 * Math.sin(TAU * 55 * t));
  }
  mix(o, slide, 0.03);
  // The ding: a small brass bell.
  modal(
    o,
    0.07,
    partials(2350, BELL.slice(1, 7), {
      a: 1,
      aSlope: 0.6,
      tau: 0.38,
      tauSlope: 0.55,
      r,
      detune: 0.002,
    }),
    0.5,
  );
  click(o, 0.07, { gain: 0.4, hp: 3500, r });
  return o;
});

def('cash-count', { dur: 0.7 }, (r) => {
  // A bill counter flicking through notes.
  const o = buf(0.7);
  for (let i = 0; i < 24; i++) {
    const t = 0.01 + i * 0.026 + r() * 0.004;
    noiseHit(o, t, {
      tau: 0.005,
      gain: 0.5 + r() * 0.4,
      chain: [
        ['bp', 2600 + r() * 900, 1.2],
        ['hp', 1500, 0.7],
      ],
      r,
    });
  }
  const b = buf(0.7);
  filt(mix(b, o), ['lp', 6500, 0.7]);
  return b;
});

// ---------------------------------------------------------------- impacts, risers, alarms

def('boom', { variants: 2, dur: 2.4, enc: 'lo' }, (r, v) => {
  const o = buf(2.4);
  const k = [1, 0.85][v];
  // Sub is capped (nothing below ~45 Hz): small speakers cannot play it and the limiter pays for it.
  thump(o, 0, { f0: 96 * k, f1: 48 * k, glide: 0.12, tau: 0.42, gain: 0.7, drive: 1.5 });
  noiseHit(o, 0, { tau: 0.4, gain: 0.55, chain: [['lp', 420, 0.8]], r });
  noiseHit(o, 0, { tau: 0.2, gain: 0.7, chain: [['bp', 340, 0.7]], r });
  noiseHit(o, 0, { tau: 0.03, gain: 0.7, chain: [['bp', 900, 0.8]], r });
  modal(
    o,
    0.01,
    partials(330 * k, PLATE.slice(0, 4), {
      tau: 0.55,
      aSlope: 0.55,
      tauSlope: 0.6,
      r,
      detune: 0.003,
    }),
    0.36,
  );
  filt(o, ['hp', 45, 0.7], ['lp', 4200, 0.7]);
  return o;
});

def('riser', { variants: 2, dur: 2.6, enc: 'lo' }, (r, v) => {
  const L = [1.4, 2.4][v];
  const o = buf(L + 0.05);
  const w = whiteNoise(o.length, r);
  sweepFilter(w, 'bp', (t) => 260 * (6500 / 260) ** (t / L), 1.4);
  for (let i = 0; i < w.length; i++) {
    const t = i / SR / L;
    w[i] *= t * t * Math.min(1, (L - i / SR) / 0.02 + 0.0);
  }
  mix(o, w, 0, 0.9);
  // A tense sine climbing underneath.
  const s = buf(L);
  osc(s, 0, { f: 180, f1: 1500, dur: L, type: 'sine', gain: 0.25, atk: 0.2, rel: 0.02 });
  for (let i = 0; i < s.length; i++) s[i] *= (i / s.length) ** 2;
  mix(o, s, 0);
  return o;
});

def('whoosh', { variants: 2, dur: 0.6, enc: 'lo' }, (r, v) => {
  const L = 0.5;
  const o = whiteNoise(Math.round(L * SR) + 100, r);
  sweepFilter(
    o,
    'bp',
    (t) => (v ? 3200 * (400 / 3200) ** (t / L) : 400 * (3200 / 400) ** (t / L)),
    1.1,
  );
  for (let i = 0; i < o.length; i++) {
    const t = i / SR;
    o[i] *= Math.sin(Math.PI * Math.min(1, t / L)) ** 2 * 0.6;
  }
  return o;
});

def('alarm', { dur: 0.5 }, (r) => {
  // One ring of a prison alarm bell (a ringer hammering a gong): the engine repeats it.
  const L = 0.4;
  const o = buf(0.5);
  const rate = 15;
  for (let i = 0; i * (1 / rate) < L; i++) {
    const t = i / rate;
    const f0 = i % 2 ? 905 : 860;
    modal(
      o,
      t,
      partials(f0, BELL.slice(1, 8), {
        a: 1,
        aSlope: 0.7,
        tau: 0.09,
        tauSlope: 0.75,
        r,
        detune: 0.002,
      }),
      0.3,
    );
    click(o, t, { gain: 0.3, hp: 2500, r });
  }
  return o;
});

// ---------------------------------------------------------------- the cell

def('door-clang', { variants: 2, dur: 2.6, enc: 'lo' }, (r, v) => {
  const o = buf(2.6);
  // Steel panel modes, inharmonic (ratios near 1, 1.6, 2.1, 2.9): the clang lives at 600 to 3000 Hz.
  const f0 = [700, 640][v] * jit(r, 0.03);
  modal(
    o,
    0,
    partials(f0, [1, 1.6, 2.1, 2.9, 3.9], {
      a: 1,
      aSlope: 0.75,
      tau: 0.9,
      tauSlope: 0.7,
      r,
      detune: 0.004,
    }),
    0.55,
  );
  // The stiffeners ring at 2 to 3 kHz.
  modal(
    o,
    0,
    [
      { f: between(r, 2200, 2600), a: 0.5, tau: 0.35 },
      { f: between(r, 2800, 3100), a: 0.25, tau: 0.2 },
    ],
    0.5,
  );
  // A short low body for the weight, then the strike's crack.
  thump(o, 0, { f0: 120, f1: 66, glide: 0.03, tau: 0.06, gain: 0.25, drive: 1.5 });
  noiseHit(o, 0, { tau: 0.012, gain: 1, chain: [['bp', 1900, 0.8]], r });
  click(o, 0, { gain: 0.9, hp: 2000, r });
  // Rattling bars settle.
  for (let i = 0; i < 7; i++) {
    const t = 0.09 + i * 0.07 + r() * 0.03;
    modal(o, t, [{ f: between(r, 1100, 2400), a: 1, tau: 0.03 }], 0.18 * 0.75 ** i);
  }
  filt(o, ['lp', 8000, 0.7]);
  return o;
});

def('door-lock', { dur: 0.75 }, (r) => {
  const o = buf(0.75);
  // Bolt slides: scrape, thunk, second latch.
  const s = whiteNoise(Math.round(0.07 * SR), r);
  filt(s, ['bp', 3200, 1.5]);
  for (let i = 0; i < s.length; i++) s[i] *= 0.3 * Math.sin((Math.PI * i) / s.length);
  mix(o, s, 0);
  click(o, 0.08, { gain: 0.8, hp: 2200, r });
  modal(
    o,
    0.08,
    [
      { f: 1700, a: 0.7, tau: 0.02 },
      { f: 2700, a: 0.3, tau: 0.012 },
    ],
    0.5,
  );
  thump(o, 0.09, { f0: 170, f1: 84, glide: 0.022, tau: 0.07, gain: 0.7, drive: 1.5 });
  modal(
    o,
    0.09,
    [
      { f: 420, a: 1, tau: 0.04 },
      { f: 760, a: 0.65, tau: 0.03 },
    ],
    0.4,
  );
  modal(
    o,
    0.09,
    partials(780, PLATE.slice(0, 4), { tau: 0.14, aSlope: 0.5, tauSlope: 0.6, r }),
    0.28,
  );
  click(o, 0.34, { gain: 0.55, hp: 2500, r });
  modal(o, 0.34, [{ f: 1250, a: 0.6, tau: 0.025 }], 0.4);
  thump(o, 0.34, { f0: 150, f1: 80, glide: 0.02, tau: 0.05, gain: 0.45 });
  modal(o, 0.34, [{ f: 480, a: 1, tau: 0.03 }], 0.25);
  return o;
});

def('creak', { variants: 3, dur: 1.3, enc: 'lo' }, (r, v) => {
  // Stick-slip friction on a hinge: a gliding pulse train through a few resonances.
  const L = 1.2;
  const n = Math.round(L * SR);
  const x = new Float32Array(n);
  let phase = 0;
  const f0 = [48, 62, 40][v];
  const f1 = [86, 52, 74][v];
  for (let i = 0; i < n; i++) {
    const t = i / SR / L;
    const f = f0 + (f1 - f0) * t + Math.sin(TAU * 7 * t) * 3;
    const before = phase;
    phase += f / SR;
    if (Math.floor(phase) !== Math.floor(before)) x[i] = (0.6 + 0.4 * r()) * (r() < 0.2 ? 0.4 : 1);
  }
  const a = x.slice();
  const b = x.slice();
  const c = x.slice();
  biquad('bp', 700 * jit(r, 0.1), 9)(a);
  biquad('bp', 1350 * jit(r, 0.1), 11)(b);
  biquad('bp', 2300 * jit(r, 0.1), 12)(c);
  const o = buf(1.3);
  for (let i = 0; i < n; i++) {
    const t = i / SR / L;
    const env = Math.sin(Math.PI * t) ** 1.5;
    o[i] = (a[i] * 1 + b[i] * 0.8 + c[i] * 0.5) * env * 0.55;
  }
  filt(o, ['lp', 3600, 0.7]);
  return o;
});

def('chain', { variants: 3, dur: 1.2 }, (r, v) => {
  const o = buf(1.2);
  const links = [14, 20, 17][v];
  let t = 0;
  for (let i = 0; i < links; i++) {
    const a = between(r, 0.3, 1) * (1 - i / (links * 1.4));
    const f = between(r, 1500, 3300);
    modal(
      o,
      t,
      [
        { f, a: 1, tau: 0.018 },
        { f: f * 1.9, a: 0.45, tau: 0.012 },
        { f: f * 3.3, a: 0.2, tau: 0.008 },
      ],
      a * 0.5,
    );
    click(o, t, { gain: a * 0.35, hp: 3500, r });
    t += between(r, 0.02, 0.06) * (1 + i * 0.05);
  }
  filt(o, ['hs', 6000, 0.7, -3]);
  return o;
});

def('knock', { variants: 3, dur: 0.5, enc: 'lo' }, (r, v) => {
  // Knuckles on a concrete wall heard from the next cell: a dull body with a knuckle "tok" on top.
  const o = buf(0.5);
  const f = [130, 112, 145][v] * jit(r, 0.04);
  thump(o, 0, { f0: f * 1.5, f1: f * 0.8, glide: 0.018, tau: 0.055, gain: 0.7, drive: 1.3 });
  modal(
    o,
    0,
    partials(f * 1.4, BOX, { tau: 0.05, aSlope: 0.6, tauSlope: 0.7, r, detune: 0.03 }),
    0.5,
  );
  modal(
    o,
    0,
    [
      { f: f * 3.1, a: 1, tau: 0.03 },
      { f: f * 5.2, a: 0.7, tau: 0.022 },
      { f: f * 8.4, a: 0.45, tau: 0.016 },
    ],
    0.45,
  );
  noiseHit(o, 0, { tau: 0.018, gain: 0.7, chain: [['bp', 700, 0.8]], r });
  noiseHit(o, 0, { tau: 0.006, gain: 0.5, chain: [['bp', 1800, 0.9]], r });
  click(o, 0, { gain: 0.35, hp: 1200, r });
  filt(o, ['lp', 3600, 0.7]);
  return o;
});

def('trapdoor', { dur: 1.8, enc: 'lo' }, (r) => {
  const o = buf(1.8);
  click(o, 0, { gain: 1.0, hp: 1600, r });
  modal(o, 0, [{ f: 1500, a: 0.5, tau: 0.02 }], 0.4);
  // The hatch swings free and slams against its stops: oak and iron, not just a sub.
  thump(o, 0.03, { f0: 130, f1: 50, glide: 0.09, tau: 0.28, gain: 0.7, drive: 2 });
  noiseHit(o, 0.03, { tau: 0.16, gain: 0.7, chain: [['lp', 1000, 0.8]], r });
  noiseHit(o, 0.03, { tau: 0.025, gain: 0.85, chain: [['bp', 700, 0.7]], r });
  modal(
    o,
    0.03,
    partials(280, BOX, { tau: 0.12, aSlope: 0.75, tauSlope: 0.7, r, detune: 0.02 }),
    0.7,
  );
  modal(
    o,
    0.03,
    partials(210, PLATE.slice(0, 5), { tau: 0.45, aSlope: 0.55, tauSlope: 0.55, r, detune: 0.004 }),
    0.34,
  );
  // A second, smaller bounce.
  thump(o, 0.27, { f0: 120, f1: 56, glide: 0.06, tau: 0.14, gain: 0.4, drive: 1.5 });
  modal(
    o,
    0.27,
    partials(260, PLATE.slice(0, 4), { tau: 0.25, aSlope: 0.5, tauSlope: 0.55, r }),
    0.2,
  );
  noiseHit(o, 0.27, { tau: 0.03, gain: 0.5, chain: [['bp', 600, 0.8]], r });
  for (let i = 0; i < 6; i++)
    modal(
      o,
      0.1 + i * 0.09 + r() * 0.03,
      [{ f: between(r, 600, 1800), a: 1, tau: 0.03 }],
      0.12 * 0.75 ** i,
    );
  filt(o, ['hp', 40, 0.7], ['lp', 6000, 0.7]);
  return o;
});

def('fall', { dur: 3.2, enc: 'lo' }, (r) => {
  // Falling wind: noise whose cutoff sinks as the light shrinks.
  const L = 3.1;
  const o = whiteNoise(Math.round(L * SR), r);
  sweepFilter(o, 'lp', (t) => 3200 * (110 / 3200) ** (t / L), 0.9);
  sweepFilter(o, 'bp', (t) => 1100 * (150 / 1100) ** (t / L) + 80, 0.6);
  const s = buf(L);
  osc(s, 0, { f: 620, f1: 90, dur: L, type: 'tri', gain: 0.1, atk: 0.1, rel: 0.5 });
  for (let i = 0; i < o.length; i++) {
    const t = i / SR;
    o[i] *= Math.min(1, t / 0.35) * Math.min(1, (L - t) / 0.8) * 1.6;
  }
  mix(o, s, 0);
  return o;
});

def('phone-ring', { dur: 1.6 }, (r) => {
  // Old bell telephone: two gongs struck alternately by one hammer, 'brrrring'.
  const o = buf(1.6);
  const rate = 22;
  for (let i = 0; i / rate < 1.15; i++) {
    const t = i / rate;
    const f0 = i % 2 ? 1235 : 1180;
    modal(
      o,
      t,
      partials(f0, BELL.slice(1, 8), {
        a: 1,
        aSlope: 0.65,
        tau: 0.11,
        tauSlope: 0.7,
        r,
        detune: 0.002,
      }),
      0.28,
    );
    click(o, t, { gain: 0.25, hp: 3000, r });
  }
  // Shell resonance of the telephone body.
  modal(o, 0, [{ f: 470, a: 0.25, tau: 0.1 }]);
  for (let i = 0; i < o.length; i++) {
    const t = i / SR;
    if (t > 1.15) o[i] *= Math.exp(-(t - 1.15) / 0.07);
  }
  return o;
});

def('phone-pick', { dur: 0.45 }, (r) => {
  const o = buf(0.45);
  click(o, 0, { gain: 0.5, hp: 2500, r });
  thump(o, 0.01, { f0: 160, f1: 90, glide: 0.02, tau: 0.05, gain: 0.9 });
  modal(o, 0.01, partials(520, BOX, { tau: 0.04, aSlope: 0.6, tauSlope: 0.7, r }), 0.4);
  modal(o, 0.012, [{ f: 2900, a: 0.4, tau: 0.01 }], 0.3);
  // The cradle bell gives one faint ping as the handset leaves it.
  modal(
    o,
    0.02,
    [
      { f: 1180, a: 0.2, tau: 0.12 },
      { f: 1235, a: 0.2, tau: 0.1 },
    ],
    0.5,
  );
  return o;
});

const ATM_KEYS = [1046, 1175, 1319, 1480];
ATM_KEYS.forEach((f, i) => {
  def(`atm-key-${i + 1}`, { dur: 0.12 }, (r) => {
    const o = buf(0.12);
    osc(o, 0.004, { f, dur: 0.07, type: 'sine', gain: 0.8, atk: 0.003, rel: 0.02 });
    osc(o, 0.004, { f: f * 2, dur: 0.05, type: 'sine', gain: 0.12, atk: 0.003, rel: 0.02 });
    click(o, 0, { gain: 0.3, hp: 3000, r });
    return o;
  });
});

def('atm-ok', { dur: 0.3 }, (r) => {
  const o = buf(0.3);
  osc(o, 0.003, { f: 880, dur: 0.075, type: 'sine', gain: 0.7, atk: 0.003, rel: 0.02 });
  osc(o, 0.09, { f: 1319, dur: 0.12, type: 'sine', gain: 0.7, atk: 0.003, rel: 0.05 });
  click(o, 0, { gain: 0.25, hp: 3000, r });
  return o;
});

def('atm-no', { dur: 0.4 }, (r) => {
  const o = buf(0.4);
  for (let i = 0; i < 2; i++) {
    osc(o, 0.003 + i * 0.16, {
      f: 330,
      dur: 0.11,
      type: 'square',
      gain: 0.4,
      atk: 0.004,
      rel: 0.03,
    });
    osc(o, 0.003 + i * 0.16, { f: 332, dur: 0.11, type: 'saw', gain: 0.3, atk: 0.004, rel: 0.03 });
  }
  filt(o, ['lp', 1500, 0.8]);
  click(o, 0, { gain: 0.25, hp: 2500, r });
  return o;
});

def('cash-out', { dur: 1.6 }, (r) => {
  // ATM dispenser: motor whir, bills flicking out, the clunk of the shutter.
  const o = buf(1.6);
  const m = buf(0.9);
  osc(m, 0, { f: 120, f1: 210, dur: 0.9, type: 'saw', gain: 0.5, atk: 0.1, rel: 0.2 });
  osc(m, 0, { f: 241, f1: 421, dur: 0.9, type: 'saw', gain: 0.3, atk: 0.1, rel: 0.2 });
  filt(m, ['lp', 1500, 0.8]);
  const n = whiteNoise(m.length, r);
  filt(n, ['bp', 600, 0.8]);
  for (let i = 0; i < m.length; i++) m[i] += n[i] * 0.07;
  mix(o, m, 0.05, 0.55);
  for (let i = 0; i < 22; i++) {
    const t = 0.25 + i * 0.03 + r() * 0.006;
    noiseHit(o, t, {
      tau: 0.005,
      gain: 0.4 + r() * 0.3,
      chain: [
        ['bp', 2800 + r() * 800, 1.2],
        ['hp', 1500, 0.7],
      ],
      r,
    });
  }
  thump(o, 1.0, { f0: 140, f1: 70, glide: 0.02, tau: 0.07, gain: 0.8, drive: 1.3 });
  click(o, 1.0, { gain: 0.6, hp: 2500, r });
  modal(
    o,
    1.0,
    partials(900, PLATE.slice(0, 3), { tau: 0.08, aSlope: 0.5, tauSlope: 0.6, r }),
    0.18,
  );
  return o;
});

def('vend-coin', { dur: 0.45 }, (r) => {
  const o = buf(0.45);
  click(o, 0, { gain: 0.5, hp: 4000, r });
  modal(
    o,
    0,
    [
      { f: 3300, a: 1, tau: 0.04 },
      { f: 5000, a: 0.5, tau: 0.025 },
    ],
    0.4,
  );
  // The coin rolls down the chute inside, and the mechanism clunks.
  for (let i = 0; i < 6; i++)
    modal(o, 0.07 + i * 0.03, [{ f: 2100 + i * 90, a: 1, tau: 0.01 }], 0.12);
  thump(o, 0.26, { f0: 150, f1: 85, glide: 0.02, tau: 0.05, gain: 0.7, drive: 1.3 });
  click(o, 0.26, { gain: 0.4, hp: 2500, r });
  return o;
});

def('vend-spiral', { dur: 0.8, enc: 'lo' }, (r) => {
  const o = buf(0.8);
  const L = 0.7;
  const m = buf(L);
  osc(m, 0, { f: 62, f1: 75, dur: L, type: 'saw', gain: 0.6, atk: 0.04, rel: 0.1 });
  filt(m, ['lp', 700, 0.8]);
  for (let i = 0; i < m.length; i++) m[i] *= 0.55 + 0.45 * Math.sin(TAU * 22 * (i / SR));
  mix(o, m, 0);
  for (let i = 0; i < 14; i++) click(o, 0.03 + i * 0.048, { gain: 0.25, hp: 1800, r });
  return o;
});

def('vend-drop', { dur: 0.6 }, (r) => {
  // The item falls into the bin: a hollow thud and the flap swinging.
  const o = buf(0.6);
  thump(o, 0, { f0: 120, f1: 55, glide: 0.04, tau: 0.1, gain: 1, drive: 1.5 });
  modal(o, 0, partials(205, BOX, { tau: 0.09, aSlope: 0.6, tauSlope: 0.65, r }), 0.5);
  // The bin's hollow walls: a harmonic layer at 300 to 800 Hz that survives a small speaker.
  modal(
    o,
    0,
    [
      { f: 340, a: 1, tau: 0.05 },
      { f: 520, a: 0.7, tau: 0.04 },
      { f: 780, a: 0.45, tau: 0.03 },
    ],
    1.0,
  );
  noiseHit(o, 0, { tau: 0.02, gain: 0.5, chain: [['bp', 700, 0.8]], r });
  click(o, 0, { gain: 0.5, hp: 1800, r });
  modal(
    o,
    0.07,
    partials(1200, PLATE.slice(0, 4), { tau: 0.09, aSlope: 0.5, tauSlope: 0.6, r }),
    0.2,
  );
  noiseHit(o, 0.18, { tau: 0.03, gain: 0.25, chain: [['bp', 1000, 0.9]], r });
  return o;
});

def('glass-crack', { variants: 2, dur: 0.9 }, (r, v) => {
  const o = buf(0.9);
  click(o, 0, { gain: 0.9, hp: 3000, r });
  noiseHit(o, 0, { tau: 0.015, gain: 0.6, chain: [['hp', 3500, 0.7]], r });
  const bursts = [0.0, 0.03, 0.06, 0.11, 0.17, 0.24, 0.31].slice(0, 5 + v * 2);
  for (const t of bursts) {
    const f = between(r, 3200, 7600);
    modal(
      o,
      t,
      [
        { f, a: 1, tau: between(r, 0.012, 0.03) },
        { f: f * 1.7, a: 0.4, tau: 0.01 },
      ],
      0.35,
    );
    noiseHit(o, t, { tau: 0.006, gain: 0.3, chain: [['bp', f, 2]], r });
  }
  // Fragments tinkling after.
  for (let i = 0; i < 9; i++) {
    const t = 0.18 + i * 0.05 + r() * 0.03;
    modal(
      o,
      t,
      [{ f: between(r, 4500, 9000), a: 1, tau: between(r, 0.02, 0.06) }],
      0.18 * 0.8 ** i,
    );
  }
  return o;
});

def('rubble', { dur: 2.2, enc: 'lo' }, (r) => {
  // The wall giving way: a sub boom, rolling noise and debris.
  const o = buf(2.2);
  thump(o, 0, { f0: 90, f1: 34, glide: 0.12, tau: 0.5, gain: 0.9, drive: 1.5 });
  // Masonry cracking: a 300 to 800 Hz harmonic layer so the fall reads on a small speaker.
  modal(
    o,
    0.02,
    [
      { f: 380, a: 1, tau: 0.18 },
      { f: 560, a: 0.6, tau: 0.12 },
      { f: 720, a: 0.35, tau: 0.1 },
    ],
    0.6,
  );
  const w = whiteNoise(Math.round(2.0 * SR), r);
  sweepFilter(w, 'lp', (t) => 3400 * (240 / 3400) ** Math.min(1, t / 1.6), 0.8);
  for (let i = 0; i < w.length; i++) {
    const t = i / SR;
    w[i] *= 0.8 * Math.min(1, t / 0.01) * Math.exp(-t / 0.55);
  }
  mix(o, w, 0);
  for (let i = 0; i < 46; i++) {
    const t = 0.05 + i * 0.03 * (1 + i * 0.05) + r() * 0.02;
    modal(
      o,
      t,
      [{ f: between(r, 500, 2000), a: 1, tau: between(r, 0.008, 0.025) }],
      0.25 * Math.exp(-t / 0.7),
    );
    click(o, t, { gain: 0.18 * Math.exp(-t / 0.7), hp: 1500, r });
  }
  return o;
});

// ---------------------------------------------------------------- ambience one-shots

def('drip', { variants: 3, dur: 0.55, enc: 'lo' }, (r, v) => {
  const o = buf(0.55);
  const k = [1, 0.82, 1.18][v];
  // Water drop: a sine that chirps upward, then its small echo.
  for (const [t, a] of [
    [0, 1],
    [0.21, 0.28],
  ]) {
    modal(o, t, [{ f: 1900 * k, f1: 1000 * k, bend: 0.014, a, tau: 0.028 }], 0.7);
    modal(o, t, [{ f: 3800 * k, f1: 2100 * k, bend: 0.012, a: a * 0.3, tau: 0.016 }], 0.5);
  }
  click(o, 0, { gain: 0.2, hp: 3000, r });
  return o;
});

def('pipe', { variants: 2, dur: 2.0, enc: 'lo' }, (r, v) => {
  // A distant pipe knocked somewhere in the building: a long low clank.
  const o = buf(2.0);
  const f0 = [138, 186][v] * jit(r, 0.03);
  modal(o, 0, partials(f0, BAR, { tau: 0.5, aSlope: 0.55, tauSlope: 0.5, r, detune: 0.004 }), 0.5);
  thump(o, 0, { f0: 90, f1: 55, glide: 0.03, tau: 0.08, gain: 0.5 });
  noiseHit(o, 0, { tau: 0.012, gain: 0.35, chain: [['bp', 800, 0.9]], r });
  filt(o, ['lp', 1700, 0.7]);
  return o;
});

def('far-door', { dur: 2.2, enc: 'lo' }, (r) => {
  // A heavy door slamming a long way down the corridor.
  const o = buf(2.2);
  thump(o, 0, { f0: 70, f1: 38, glide: 0.06, tau: 0.3, gain: 1, drive: 1.5 });
  modal(
    o,
    0,
    partials(240, PLATE.slice(0, 4), { tau: 0.35, aSlope: 0.45, tauSlope: 0.55, r }),
    0.25,
  );
  noiseHit(o, 0, { tau: 0.12, gain: 0.5, chain: [['lp', 600, 0.8]], r });
  filt(o, ['lp', 1000, 0.7]);
  return o;
});

def('clock', { variants: 2, dur: 0.16 }, (r, v) => {
  // tick / tock of a cheap wall clock.
  const o = buf(0.16);
  const k = [1, 0.72][v];
  click(o, 0, { gain: 0.55, hp: 3000, r });
  noiseHit(o, 0, { tau: 0.004, gain: 0.5, chain: [['bp', 3200 * k, 4]], r });
  modal(
    o,
    0,
    [
      { f: 1800 * k, a: 0.8, tau: 0.02 },
      { f: 2750 * k, a: 0.35, tau: 0.012 },
    ],
    0.5,
  );
  if (v) thump(o, 0, { f0: 320, f1: 210, glide: 0.01, tau: 0.012, gain: 0.35 });
  return o;
});

// ---------------------------------------------------------------- music kit (table groove)

def('m-kick', { dur: 0.4 }, (r) => {
  const o = buf(0.4);
  thump(o, 0, { f0: 150, f1: 52, glide: 0.03, tau: 0.11, gain: 0.85, drive: 1.8 });
  modal(o, 0, [{ f: 190, f1: 300, bend: 0.012, a: 0.5, tau: 0.03 }]);
  click(o, 0, { gain: 0.6, hp: 1600, r });
  noiseHit(o, 0, { tau: 0.007, gain: 0.4, chain: [['bp', 1500, 1]], r });
  return o;
});

def('m-snare', { dur: 0.35 }, (r) => {
  const o = buf(0.35);
  thump(o, 0, { f0: 215, f1: 175, glide: 0.03, tau: 0.06, gain: 0.55 });
  noiseHit(o, 0, {
    tau: 0.085,
    gain: 0.8,
    chain: [
      ['bp', 2300, 0.6],
      ['hp', 900, 0.7],
    ],
    r,
  });
  noiseHit(o, 0, { tau: 0.012, gain: 0.5, chain: [['hp', 3500, 0.7]], r });
  return o;
});

def('m-hat', { dur: 0.1 }, (r) => {
  const o = buf(0.1);
  noiseHit(o, 0, { tau: 0.016, gain: 0.8, chain: [['hp', 7500, 0.8]], r });
  modal(
    o,
    0,
    [
      { f: 6200, a: 0.3, tau: 0.01 },
      { f: 9300, a: 0.2, tau: 0.008 },
    ],
    0.4,
  );
  return o;
});

def('m-ohat', { dur: 0.42 }, (r) => {
  const o = buf(0.42);
  noiseHit(o, 0, { tau: 0.09, gain: 0.8, chain: [['hp', 7000, 0.8]], r });
  modal(
    o,
    0,
    [
      { f: 6200, a: 0.3, tau: 0.08 },
      { f: 9300, a: 0.2, tau: 0.06 },
    ],
    0.3,
  );
  return o;
});

def('m-rim', { dur: 0.12 }, (r) => {
  const o = buf(0.12);
  click(o, 0, { gain: 0.5, hp: 3000, r });
  modal(
    o,
    0,
    [
      { f: 1700, a: 1, tau: 0.009 },
      { f: 2350, a: 0.45, tau: 0.007 },
      { f: 900, a: 0.4, tau: 0.012 },
    ],
    0.5,
  );
  return o;
});

def('m-tom', { dur: 0.5 }, (r) => {
  const o = buf(0.5);
  thump(o, 0, { f0: 190, f1: 88, glide: 0.05, tau: 0.15, gain: 1, drive: 1.2 });
  noiseHit(o, 0, { tau: 0.012, gain: 0.35, chain: [['bp', 1200, 0.9]], r });
  return o;
});

/** Seeded RNG for a given file name, so every variant renders the same on every machine. */
export function seedFor(name) {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  return h >>> 0;
}

export { rng, midiHz, fade };
