/**
 * Recordings re-voiced from the two CC0 packs staged for this project. Each entry is decoded
 * with ffmpeg, run through an optional filter chain (trim, pitch, filter), levelled and
 * encoded by tools/build-sfx.mjs, so the shipped files can always be rebuilt from the packs.
 *
 * `from` is relative to <src>/<pack dir>. `af` is an ffmpeg -af chain applied after decoding to
 * 44.1 kHz mono. Levels are set by build-sfx.mjs (per class) and peaks are kept under -1 dBFS.
 */
export const PACKS = {
  uisfx: {
    dir: 'uisfx',
    title: 'uisfx 0.4.0 (npm: uisfx), semantic UI sound effects',
    author: 'Romain Simon (Yuki Capital), uisfx.com',
    licence: 'CC0-1.0 (audio; the package code is MIT)',
    url: 'https://github.com/romainsimon/uisfx',
  },
  kenney: {
    dir: 'kenney-digital',
    title: 'Kenney "Digital Audio" (subset), kenney.nl',
    author: 'Kenney (kenney.nl)',
    licence: 'CC0-1.0',
    url: 'https://kenney.nl/assets/digital-audio',
  },
};

/** Trim to `d` seconds with a short fade out. */
const cut = (d, f = 0.03) => `atrim=0:${d},afade=t=out:st=${(d - f).toFixed(3)}:d=${f}`;

export const SOURCED = [
  // ---- Menu cues: the mechanical pack (relay clicks with a short pitched tail) reads as the
  // prison's cheap electronics and stays unobtrusive when repeated.
  { name: 'ui-move', pack: 'uisfx', from: 'mechanical/focus.mp3', af: cut(0.13) },
  { name: 'ui-hover', pack: 'uisfx', from: 'mechanical/hover.mp3', af: cut(0.15) },
  { name: 'ui-tick', pack: 'uisfx', from: 'mechanical/press.mp3', af: cut(0.07, 0.02) },
  { name: 'ui-slider', pack: 'uisfx', from: 'mechanical/snap.mp3', af: cut(0.1, 0.03) },
  { name: 'ui-select', pack: 'uisfx', from: 'mechanical/select.mp3' },
  { name: 'ui-back', pack: 'uisfx', from: 'mechanical/back.mp3' },
  { name: 'ui-open', pack: 'uisfx', from: 'mechanical/open.mp3' },
  { name: 'ui-close', pack: 'uisfx', from: 'mechanical/close.mp3' },
  { name: 'ui-error', pack: 'uisfx', from: 'mechanical/error.mp3' },
  { name: 'ui-buy', pack: 'uisfx', from: 'mechanical/purchase.mp3' },
  { name: 'ui-sell', pack: 'uisfx', from: 'mechanical/refund.mp3' },
  { name: 'ui-deposit', pack: 'uisfx', from: 'mechanical/checkout.mp3' },
  { name: 'ui-reward', pack: 'uisfx', from: 'mechanical/reward.mp3' },
  { name: 'ui-toggle-on', pack: 'uisfx', from: 'mechanical/toggle-on.mp3' },
  { name: 'ui-toggle-off', pack: 'uisfx', from: 'mechanical/toggle-off.mp3' },
  { name: 'ui-lock', pack: 'uisfx', from: 'mechanical/lock.mp3' },
  { name: 'ui-unlock', pack: 'uisfx', from: 'mechanical/unlock.mp3' },
  { name: 'ui-success', pack: 'uisfx', from: 'mechanical/success.mp3' },
  { name: 'ui-warning', pack: 'uisfx', from: 'mechanical/warning.mp3' },
  { name: 'ui-notify', pack: 'uisfx', from: 'mechanical/notification.mp3' },
  { name: 'ui-pause', pack: 'uisfx', from: 'mechanical/pause.mp3' },
  { name: 'ui-resume', pack: 'uisfx', from: 'mechanical/play.mp3' },

  // ---- Stingers: the cinematic pack's low, padded chord hits sit under the bells and give the
  // big moments some weight.
  { name: 'st-achievement', pack: 'uisfx', from: 'cinematic/achievement.mp3', enc: 'lo' },
  { name: 'st-levelup', pack: 'uisfx', from: 'cinematic/level-up.mp3', enc: 'lo' },
  { name: 'st-bonus', pack: 'uisfx', from: 'cinematic/bonus.mp3', enc: 'lo' },
  { name: 'st-reward', pack: 'uisfx', from: 'cinematic/reward.mp3', enc: 'lo' },
  { name: 'st-warning', pack: 'uisfx', from: 'cinematic/warning.mp3', enc: 'lo' },
  { name: 'st-error', pack: 'uisfx', from: 'cinematic/error.mp3', enc: 'lo' },
  { name: 'st-lock', pack: 'uisfx', from: 'cinematic/lock.mp3', enc: 'lo' },

  // ---- Solid-state accents (Kenney's chip sounds): the late-70s machines bleeped as well as
  // chimed, so these ride quietly on top of the electromechanical sounds. All are softened.
  {
    name: 'ss-coin',
    pack: 'kenney',
    from: 'coin2.wav',
    af: 'lowpass=f=5200',
  },
  {
    name: 'ss-coin-hi',
    pack: 'kenney',
    from: 'coin5.wav',
    af: 'lowpass=f=5200',
  },
  {
    name: 'ss-upgrade',
    pack: 'kenney',
    from: 'upgrade4.wav',
    af: 'lowpass=f=4600',
  },
  {
    name: 'ss-secret',
    pack: 'kenney',
    from: 'secret4.wav',
    af: 'lowpass=f=4200',
  },
  {
    name: 'ss-lose',
    pack: 'kenney',
    from: 'lose4.wav',
    af: 'lowpass=f=3000',
  },
  {
    name: 'ss-gameover',
    pack: 'kenney',
    from: 'gameover4.wav',
    af: 'lowpass=f=2400,asetrate=44100*0.84,aresample=44100',
    enc: 'lo',
  },
  // The pack's noise explosion, dropped four semitones and darkened: crumbling concrete.
  {
    name: 'ss-crumble',
    pack: 'kenney',
    from: 'explosion2.wav',
    af: 'asetrate=44100*0.79,aresample=44100,lowpass=f=2400,highpass=f=50',
    enc: 'lo',
  },
];
