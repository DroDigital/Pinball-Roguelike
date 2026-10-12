/* global console, process, window, Buffer */
/**
 * Offline level check for the audio engine. Opens tools/audio-lab.html under a running Vite dev
 * server, decodes the whole sample bank, renders scenarios (a busy rally, everything at once,
 * cue reels, the music layers) on an OfflineAudioContext, and prints peak / RMS / loudest
 * 400 ms for each segment. WAVs and spectrograms land in --out for a closer look with ffmpeg.
 * Exits non-zero if the bank fails to decode, the stress test clips, or a ball contact falls more
 * than CONTACT_GAP dB under the flippers in the machine reel (the table must stay audible).
 *
 *   npm run audio:check -- [--only rally,ui] [--out DIR] [--port 5190]
 *
 * It starts its own Vite dev server unless --url points at one that is already running.
 */
import { chromium } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : d;
};
let url = arg('--url', '');
let server = null;
if (!url) {
  server = await createServer({
    root: resolve(dirname(fileURLToPath(import.meta.url)), '..'),
    server: { port: Number(arg('--port', '5190')) },
    logLevel: 'error',
  });
  await server.listen();
  url = server.resolvedUrls?.local[0]?.replace(/\/$/, '') ?? 'http://localhost:5190';
}
const out = arg('--out', 'tools/out/audio');
const only = (arg('--only', '') || '').split(',').filter(Boolean);
const spectro = !process.argv.includes('--no-spectrograms');
/** A ball contact may sit this far under the loudest flipper (loudest-400 ms level). */
const CONTACT_GAP = 8;
const CONTACTS = ['rubber', 'metal', 'wood', 'plastic', 'ball-ball', 'spin', 'lane'];
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const problems = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') problems.push(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
let failed = false;

try {
  await page.goto(`${url}/tools/audio-lab.html`);
  await page.waitForFunction(() => window.labReady === true, null, { timeout: 60000 });

  const bank = await page.evaluate(() => window.lab.checkBank());
  const bad = bank.filter((b) => b.error);
  const slowLead = bank.filter((b) => !b.error && b.lead > 0.012);
  console.log(`bank: ${bank.length} files, ${bad.length} failed to decode`);
  for (const b of bad) console.log(`  FAILED ${b.stem}: ${b.error}`);
  if (slowLead.length)
    console.log(`  late onset (>12 ms): ${slowLead.map((b) => `${b.stem} ${b.lead}s`).join(', ')}`);
  const quiet = bank.filter((b) => !b.error && b.peak < -14);
  if (quiet.length)
    console.log(`  quiet files: ${quiet.map((b) => `${b.stem} ${b.peak}dB`).join(', ')}`);
  if (bad.length) failed = true;

  const names = await page.evaluate(() => window.lab.names);
  for (const name of names) {
    if (only.length && !only.includes(name)) continue;
    const r = await page.evaluate((n) => window.lab.runScenario(n), name);
    const raw = Buffer.from(r.pcm, 'base64');
    const wav = `${out}/${name}.wav`;
    const enc = spawnSync(
      'ffmpeg',
      [
        '-y',
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        's16le',
        '-ar',
        String(r.sr),
        '-ac',
        '2',
        '-i',
        'pipe:0',
        wav,
      ],
      { input: raw, maxBuffer: 1 << 28 },
    );
    if (enc.status !== 0) console.log(`wav failed: ${enc.stderr}`);
    if (spectro)
      spawnSync('ffmpeg', [
        '-y',
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        wav,
        '-lavfi',
        'showspectrumpic=s=1600x540:legend=1:fscale=log:scale=log:drange=90:limit=0:color=intensity',
        `${out}/${name}.png`,
      ]);
    console.log(
      `\n== ${name}  (${r.dur.toFixed(1)}s)  whole: peak ${r.whole.peak}  rms ${r.whole.rms}  loudest400 ${r.whole.mom}  small ${r.whole.small}   bank loaded ${r.stats.loaded}, failed [${r.stats.failed}]`,
    );
    if (r.segs.length > 1)
      for (const s of r.segs)
        console.log(
          `   ${s.label.padEnd(22)} peak ${String(s.peak).padStart(6)}  rms ${String(s.rms).padStart(6)}  loudest400 ${String(s.mom).padStart(6)}  bright ${String(s.hf).padStart(6)}  small ${String(s.small).padStart(6)}`,
        );
    if (name === 'machine') {
      const seg = (label) => r.segs.find((s) => s.label === label);
      const ref = Math.max(seg('flipper up')?.mom ?? -99, seg('flipper hit')?.mom ?? -99);
      const weak = CONTACTS.filter((l) => seg(l) && seg(l).mom < ref - CONTACT_GAP);
      if (weak.length) {
        console.log(
          `   !! contacts more than ${CONTACT_GAP} dB under the flippers: ${weak.join(', ')}`,
        );
        failed = true;
      }
    }
    if (name === 'stress' && r.whole.peak > -0.8) {
      console.log('   !! stress test clips');
      failed = true;
    }
    if (r.stats.failed.length) failed = true;
  }
  writeFileSync(`${out}/bank.json`, JSON.stringify(bank, null, 1));
} catch (e) {
  console.log('audio check stopped:', String(e).slice(0, 400));
  failed = true;
}
console.log(problems.length ? `\nconsole problems:\n${problems.join('\n')}` : '\nconsole clean');
if (problems.length) failed = true;
await browser.close();
await server?.close();
process.exit(failed ? 1 : 0);
