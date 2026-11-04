/**
 * Dev panel "Sound" folder: audition any bank sound, UI cue or reward stinger, and see whether
 * the sample bank loaded. (The camera picker under View moves the muffle too.)
 */
import type { Pane } from 'tweakpane';
import { audio, type UiCue } from '../present/audio';
import { SFX, type SfxName } from '../present/sfx-manifest';

const UI_CUES: UiCue[] = [
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
];

export function addAudioFolder(pane: Pane): void {
  const f = pane.addFolder({ title: 'Sound', expanded: false });
  const state = {
    sfx: 'pop' as SfxName,
    ui: 'select' as UiCue,
    cue: 'jackpot',
    combo: 3,
    pay: 0.8,
    loaded: 0,
    failed: '',
  };
  const names = Object.keys(SFX) as SfxName[];
  f.addBinding(state, 'sfx', { options: Object.fromEntries(names.map((n) => [n, n])) });
  f.addButton({ title: 'Play sound' }).on('click', () => audio.play(state.sfx));
  f.addBinding(state, 'ui', { options: Object.fromEntries(UI_CUES.map((c) => [c, c])) });
  f.addButton({ title: 'Play UI cue' }).on('click', () => audio.ui(state.ui));

  const cues: Record<string, () => void> = {
    combo: () => audio.combo(state.combo),
    // The payout in coins: 0.12 pop, 0.4 hole, 0.8 chute, 2 chained chute (tiers: sfx-payout.ts).
    'payout (pay)': () => audio.score(state.pay, state.combo),
    jackpot: () => audio.jackpot(1),
    'super jackpot': () => audio.jackpot(2),
    payday: () => audio.payday(false),
    'super payday': () => audio.payday(true),
    'riot on': () => audio.riot(true),
    'riot off': () => audio.riot(false),
    'ball save': () => audio.save(),
    'extra ball': () => audio.extraBall(),
    'skill shot': () => audio.skillShot(true),
    'job complete': () => audio.jobComplete(),
    'level up': () => audio.levelUp(),
    'deadline paid': () => audio.deadlinePaid(),
    unlocked: () => audio.unlocked(),
    tunnel: () => audio.tunnel(),
    trapdoor: () => audio.trapdoor(),
    knock: () => audio.knock(3),
    phone: () => audio.phoneRing(),
    vend: () => audio.vend(),
    deposit: () => audio.deposit(),
    warden: () => audio.warden(),
    'ball over': () => audio.ballOver(false),
    'hurry-up on': () => audio.hurry(true),
    'hurry-up missed': () => audio.hurry(false, false),
    'ball feed': () => audio.ballFeed(),
    'title card': () => audio.titleCard(),
    'run start': () => audio.runStart(),
    'atm alarm': () => audio.atmAlarm(),
    'ending: paid in full': () => audio.ending('paidInFull'),
    'ending: breakout': () => audio.ending('breakout'),
    'ending: cellmate': () => audio.ending('cellmate'),
    'jailbreak start': () => audio.jailbreak('start', 0),
    'jailbreak escaped': () => audio.jailbreak('escaped', 5),
    'jailbreak failed': () => audio.jailbreak('failed', 0),
  };
  f.addBinding(state, 'cue', { options: Object.fromEntries(Object.keys(cues).map((c) => [c, c])) });
  f.addBinding(state, 'combo', { min: 2, max: 10, step: 1 });
  f.addBinding(state, 'pay', { min: 0.02, max: 4, step: 0.02 });
  f.addButton({ title: 'Play cue' }).on('click', () => cues[state.cue]?.());
  f.addBinding(state, 'loaded', { readonly: true, label: 'files loaded' });
  f.addBinding(state, 'failed', { readonly: true, label: 'failed' });
  f.addButton({ title: 'Refresh status' }).on('click', () => {
    const s = audio.stats();
    state.loaded = s.loaded;
    state.failed = s.failed.join(', ') || 'none';
    f.refresh();
  });
}
