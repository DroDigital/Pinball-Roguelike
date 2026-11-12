/* global console, process */
/**
 * Builds the sample bank in public/sfx/ (and CREDITS.md + public/sfx/LICENSE.txt).
 *
 *  - Procedural foley (tools/lib/foley.mjs) is rendered offline from seeded modal synthesis.
 *  - CC0 recordings (tools/lib/sfx-sourced.mjs) are decoded, re-voiced and levelled with ffmpeg.
 *  Everything ends up as mono mp3, so `npm run sfx:build` reproduces the shipped bank from the
 *  staged sources (see the "Rebuilding" section of CREDITS.md for where those come from).
 *
 *   node tools/build-sfx.mjs [--src DIR] [--only a,b] [--no-sourced]
 *
 * Levels: every file is scaled to a target loudness for its class (LEVELS below, measured as RMS
 * over the active part, so a click and a bell sit at the same perceived level) and kept under
 * its peak ceiling. The manifest's gains are therefore relative intent, not a fix for the files.
 *
 * Better recordings later: add the pack to PACKS and an entry to SOURCED (tools/lib/sfx-sourced.mjs).
 * An entry named like a foley file (say `pop-1`) replaces that file; the manifest, the credits
 * table and the service-worker list follow on their own, so no game code changes.
 *
 * --src   the staged packs (default $SFX_SRC or .cache/sfx-src/staged, which is gitignored):
 *         needs uisfx/<pack>/<cue>.mp3 and kenney-digital/*.wav
 * --only  comma-separated substrings of file names to rebuild (skips CREDITS and the lock file)
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FOLEY, seedFor } from './lib/foley.mjs';
import { PACKS, SOURCED } from './lib/sfx-sourced.mjs';
import {
  SR,
  activeRms,
  biquad,
  fade,
  levelTo,
  linToDb,
  peakOf,
  rmsOf,
  rng,
  spectralStats,
  toF32Buffer,
  trimTail,
} from './lib/dsp.mjs';

/** Bump when tools/lib/foley.mjs changes: the credits state when the procedural files were made. */
const FOLEY_DATE = '2026-10-12';
/** The repository owner, named as the author of the procedural foley. */
const FOLEY_AUTHOR = 'DroDigital (repository owner, github.com/DroDigital)';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : d;
};
const srcDir = arg('--src', process.env.SFX_SRC ?? join(root, '.cache', 'sfx-src', 'staged'));
const only = (arg('--only', '') || '').split(',').filter(Boolean);
const skipSourced = process.argv.includes('--no-sourced');
const outDir = join(root, 'public', 'sfx');
const licDir = join(root, 'tools', 'lib', 'licenses');
const lockFile = join(root, 'tools', 'lib', 'sfx-sources.json');
mkdirSync(outDir, { recursive: true });

/** LAME VBR quality per class: hi for transients, lo for dark or low-passed material. */
const QUALITY = { hi: '3', lo: '5' };

/**
 * Target loudness (active RMS, dBFS) by file-name class; the first match wins. These are the
 * level each class is mixed at before the manifest's own gains, which then only express intent.
 */
const LEVELS = [
  [/^knocker/, -17],
  [/^st-/, -18],
  [/^(flip-up|flip-down|flip-hit)/, -20],
  [/^(pop|sling|kick|hole|lock|launch|drain|tilt|warn|drop|chute)/, -19],
  [/^(rubber|metal|plastic|wood|ball-ball|spin|switch|plunger-tick)/, -24],
  [/^bell-/, -20],
  [/^coin-tray/, -26],
  [/^(coin|coin-spin|coin-shower)/, -22],
  [/^cash/, -21],
  [/^(atm-|vend-|phone-|ss-|glass-crack)/, -22],
  [/^(boom|rubble|trapdoor|fall|door-clang|door-lock|toll|riser|alarm)/, -20],
  [/^(creak|chain|knock|far-door|whoosh)/, -22],
  [/^(drip|pipe|clock)/, -30],
  [/^m-(hat|ohat)/, -26],
  [/^m-/, -21],
  [/^ui-(hover|tick|slider|move)/, -24],
  [/^ui-/, -20],
];
const DEFAULT_LEVEL = -22;
export const levelFor = (name) => LEVELS.find(([re]) => re.test(name))?.[1] ?? DEFAULT_LEVEL;

const wanted = (name) => only.length === 0 || only.some((o) => name.includes(o));

/**
 * Encoder settings tried in order until ffprobe sniffs the file without being told its format.
 * A few very short files confuse a decoder's mp3 probe (Safari and Firefox are pickier than
 * Chromium), so a file that fails is re-encoded constant-bitrate, then padded with silence.
 */
const STRATEGIES = [
  (enc) => ({ args: ['-q:a', QUALITY[enc] ?? QUALITY.hi], pad: 0 }),
  () => ({ args: ['-b:a', '96k'], pad: 0 }),
  () => ({ args: ['-b:a', '96k'], pad: 0.012 }),
  () => ({ args: ['-b:a', '128k'], pad: 0.03 }),
];

function encodeWith(name, x, { args, pad }) {
  const file = join(outDir, `${name}.mp3`);
  const data = pad ? Float32Array.from([...x, ...new Float32Array(Math.round(pad * SR))]) : x;
  const r = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'f32le',
      '-ar',
      String(SR),
      '-ac',
      '1',
      '-i',
      'pipe:0',
      '-c:a',
      'libmp3lame',
      ...args,
      '-map_metadata',
      '-1',
      '-fflags',
      '+bitexact',
      '-flags:a',
      '+bitexact',
      // Without the Xing/Info frame every decoder (and ffprobe) sniffs these short files alike.
      '-write_xing',
      '0',
      // Nor an (empty) ID3 tag in front of the first frame.
      '-id3v2_version',
      '0',
      file,
    ],
    { input: toF32Buffer(data), maxBuffer: 1 << 28 },
  );
  if (r.status !== 0) throw new Error(`ffmpeg encode failed for ${name}: ${r.stderr}`);
  return file;
}

function encode(name, x, enc = 'hi') {
  for (const make of STRATEGIES) {
    const file = encodeWith(name, x, make(enc));
    const probe = spawnSync('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=format_name',
      file,
    ]);
    if (probe.status === 0) return file;
  }
  throw new Error(`${name}: no encoder setting gives a file that ffprobe can sniff`);
}

/**
 * Final shaping shared by every file: DC/sub cut, tail trim, fades, then the class level with a
 * peak ceiling (PEAK_CEIL).
 */
const PEAK_CEIL = -1;

function finish(x, name, { fadeOut = 0.012, fadeIn = 0.0004, keepTail = false }) {
  biquad('hp', 22, 0.7)(x);
  const y = keepTail ? x : trimTail(x, -58, 0.04);
  fade(y, fadeIn, fadeOut);
  levelTo(y, levelFor(name), PEAK_CEIL);
  return y;
}

function decodeSource(file, af) {
  const args = ['-hide_banner', '-loglevel', 'error', '-i', file, '-ac', '1', '-ar', String(SR)];
  if (af) args.push('-af', af);
  args.push('-f', 'f32le', 'pipe:1');
  const r = spawnSync('ffmpeg', args, { maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`ffmpeg decode failed for ${file}: ${r.stderr}`);
  const b = r.stdout;
  return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
}

const rows = [];
const produced = [];
const sources = new Map();

// A recording with the same name replaces the synthesised file.
const sourcedNames = new Set(skipSourced ? [] : SOURCED.map((s) => s.name));

// ---- procedural foley
for (const f of FOLEY) {
  for (let v = 0; v < f.variants; v++) {
    const name = f.variants > 1 ? `${f.name}-${v + 1}` : f.name;
    if (!wanted(name) || sourcedNames.has(name)) continue;
    const r = rng(seedFor(name));
    const raw = f.make(r, v);
    const x = finish(Float32Array.from(raw), name, { fadeOut: 0.012 });
    const file = encode(name, x, f.enc);
    rows.push(measure(name, 'foley', x, file));
    produced.push({ name, kind: 'foley' });
  }
}

// ---- CC0 recordings
if (!skipSourced) {
  for (const s of SOURCED) {
    if (!wanted(s.name)) continue;
    const pack = PACKS[s.pack];
    const from = join(srcDir, pack.dir, s.from);
    if (!existsSync(from)) {
      console.warn(`skip ${s.name}: ${from} not found (set --src or SFX_SRC to the staged packs)`);
      continue;
    }
    sources.set(
      `${pack.dir}/${s.from}`,
      createHash('sha256').update(readFileSync(from)).digest('hex'),
    );
    const raw = decodeSource(from, s.af);
    const x = finish(raw, s.name, { fadeOut: s.fadeOut ?? 0.02 });
    const file = encode(s.name, x, s.enc);
    rows.push(measure(s.name, s.pack, x, file));
    produced.push({ name: s.name, kind: s.pack });
  }
}

function measure(name, kind, x, file) {
  return {
    name,
    kind,
    dur: x.length / SR,
    peak: linToDb(peakOf(x)),
    rms: linToDb(rmsOf(x)),
    act: linToDb(activeRms(x)),
    bytes: statSync(file).size,
    ...spectralStats(x),
  };
}

rows.sort((a, b) => a.name.localeCompare(b.name));
let total = 0;
console.log(
  'file               kind      dur    peak    rms    act  centroid  <250  small      bytes',
);
for (const r of rows) {
  total += r.bytes;
  console.log(
    `${r.name.padEnd(18)} ${r.kind.padEnd(8)} ${r.dur.toFixed(2).padStart(5)}s ${r.peak.toFixed(1).padStart(6)} ${r.rms.toFixed(1).padStart(6)} ${r.act.toFixed(1).padStart(6)}  ${String(Math.round(r.centroid)).padStart(6)} Hz ${String(Math.round(r.low * 100)).padStart(3)}%  ${r.small.toFixed(1).padStart(6)}  ${String(r.bytes).padStart(7)} B`,
  );
}
console.log(`${rows.length} files, ${(total / 1024).toFixed(0)} KiB`);

// The machine's hits must still read on a laptop or phone speaker: with a 180 Hz high-pass in
// front of them the loudest 100 ms may lose at most this much (sustained buzzes and the sub-bass
// stingers are exempt: the hum and the drone have their own checks in the audio lab).
const SMALL_SPEAKER_LIMIT = -6.5;
const WATCHED =
  /^(flip-up|flip-down|flip-hit|pop|sling|drop|kick|knocker|knock|hole|lock|launch|door-lock|drain|trapdoor|door-clang|rubber)(-\d)?$/;
const thin = rows.filter((r) => WATCHED.test(r.name) && r.small < SMALL_SPEAKER_LIMIT);
if (thin.length) {
  console.error(
    `too thin for a small speaker (${SMALL_SPEAKER_LIMIT} dB limit): ${thin.map((r) => `${r.name} ${r.small.toFixed(1)}`).join(', ')}`,
  );
  process.exitCode = 1;
}

// ---- source lock, credits and licence text (only when the whole bank was built)
if (only.length === 0) {
  checkSourceLock();
  writeCredits();
}

/** Records the SHA-256 of every recording used; a later build warns if a source has changed. */
function checkSourceLock() {
  const lock = existsSync(lockFile) ? JSON.parse(readFileSync(lockFile, 'utf8')) : {};
  const changed = [...sources].filter(([k, v]) => lock[k] && lock[k] !== v).map(([k]) => k);
  if (changed.length) console.warn(`source files differ from the lock: ${changed.join(', ')}`);
  const next = Object.fromEntries([...sources].sort(([a], [b]) => a.localeCompare(b)));
  if (sources.size) writeFileSync(lockFile, `${JSON.stringify(next, null, 2)}\n`);
}

function writeCredits() {
  const foley = [];
  const replaced = new Set(SOURCED.map((s) => s.name));
  for (const f of FOLEY)
    for (let v = 0; v < f.variants; v++) {
      const name = f.variants > 1 ? `${f.name}-${v + 1}` : f.name;
      if (!replaced.has(name)) foley.push(name);
    }
  const lines = [];
  const total = foley.length + SOURCED.length;
  lines.push('# Credits', '');
  lines.push(
    `Ball & Chain ships a small sample bank in \`public/sfx/\` (${total} mono mp3 files). Every file is rebuilt from its sources by \`npm run sfx:build\`. ${SOURCED.length} are CC0 (public domain) recordings that were trimmed, filtered, pitched and levelled with ffmpeg; the other ${foley.length} are original synthesis by ${FOLEY_AUTHOR}, rendered ${FOLEY_DATE}. Attribution is not required by CC0, but the authors are credited here anyway.`,
    '',
    '## Sources',
    '',
  );
  for (const p of Object.values(PACKS))
    lines.push(`- **${p.title}**: ${p.author}. Licence: ${p.licence}. ${p.url}`);
  lines.push(
    `- **Procedural foley**: synthesised by \`tools/lib/foley.mjs\` (modal resonators, filtered noise and`,
    `  sub thumps; seeded and deterministic). Author: ${FOLEY_AUTHOR}. Rendered ${FOLEY_DATE}. No`,
    '  third-party audio. Dedicated to the public domain under CC0 1.0 Universal like the recordings above.',
    '',
    'The game also synthesises music, ambience beds and a few effects live with the Web Audio API',
    '(`src/present/music.ts`, `src/present/sfx-synth.ts`); those are original too.',
    '',
    'The upstream licence texts ship verbatim in `public/sfx/` (`LICENSE-uisfx.txt`,',
    '`LICENSE-kenney.txt`) next to `public/sfx/LICENSE.txt`, which states the terms of the rest.',
    '',
    '## Rebuilding',
    '',
    'The recordings are not committed. Stage them once under `.cache/sfx-src/staged/` (gitignored):',
    '',
    '1. uisfx 0.4.0: `npm pack uisfx@0.4.0`, extract it, and copy the cue files into',
    '   `staged/uisfx/<pack>/<cue>.mp3` for the twelve packs (arcade, cinematic, dreamy, glass,',
    '   mechanical, minimal, organic, rubber, scifi, soft, studio, zen).',
    '2. Kenney Digital Audio (CC0): download the pack from https://kenney.nl/assets/digital-audio and copy',
    '   the wav files listed in `tools/lib/sfx-sourced.mjs` into `staged/kenney-digital/`.',
    '3. `npm run sfx:build` (or `SFX_SRC=/path/to/staged npm run sfx:build`).',
    '',
    '`tools/lib/sfx-sources.json` records the SHA-256 of every recording used. A build warns when a',
    'staged file differs from that record, so a rebuild can be checked against the shipped bank.',
    '',
  );
  for (const key of Object.keys(PACKS)) {
    const p = PACKS[key];
    lines.push(`## ${p.title}`, '', `${p.author}. Licence: ${p.licence}.`, '');
    lines.push('| File | Source file | Processing |', '| --- | --- | --- |');
    for (const s of SOURCED.filter((s) => s.pack === key))
      lines.push(
        `| \`${s.name}.mp3\` | \`${s.from}\` | ${s.af ? `\`${s.af}\`, ` : ''}level ${levelFor(s.name)} dBFS |`,
      );
    lines.push('');
  }
  lines.push(
    `## Procedural foley (original, ${FOLEY_AUTHOR}, ${FOLEY_DATE})`,
    '',
    'Generated by `tools/lib/foley.mjs`:',
    '',
  );
  lines.push(foley.map((n) => `\`${n}.mp3\``).join(', '), '');
  writeFileSync(join(root, 'CREDITS.md'), lines.join('\n'));

  const lic = [
    'Sound files in this folder',
    '==========================',
    '',
    'ui-*, st-*  re-voiced from the uisfx package by Romain Simon (Yuki Capital), https://uisfx.com',
    '            The audio is dedicated to the public domain under CC0 1.0 Universal',
    '            (https://creativecommons.org/publicdomain/zero/1.0/legalcode).',
    '            Upstream text: LICENSE-uisfx.txt',
    'ss-*        re-voiced from Kenney "Digital Audio" (https://kenney.nl), CC0 1.0 Universal.',
    '            Upstream text: LICENSE-kenney.txt',
    `all others  original procedural synthesis rendered by tools/lib/foley.mjs on ${FOLEY_DATE}`,
    `            for this project by ${FOLEY_AUTHOR}.`,
    '            Dedicated to the public domain under CC0 1.0 Universal: to the extent possible',
    '            under law, all copyright and related rights are waived.',
    '',
    'See CREDITS.md in the repository root for the per-file source list.',
    '',
  ];
  copyFileSync(join(licDir, 'uisfx-LICENSE-AUDIO.txt'), join(outDir, 'LICENSE-uisfx.txt'));
  copyFileSync(join(licDir, 'kenney-License.txt'), join(outDir, 'LICENSE-kenney.txt'));
  writeFileSync(join(outDir, 'LICENSE.txt'), lic.join('\n'));
  // The service worker precaches whatever this lists.
  const files = readdirSync(outDir)
    .filter((f) => f.endsWith('.mp3'))
    .sort();
  writeFileSync(join(outDir, 'files.json'), `${JSON.stringify(files)}\n`);
}
