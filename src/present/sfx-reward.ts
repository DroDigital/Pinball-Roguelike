/**
 * The reward layer: an EM-style chime unit (three tuned steel bars, pitched along a pentatonic
 * ladder), coin clinks that climb through combos, escalating combo stingers, fanfares for
 * jackpots and paydays, and the darker beats (drain, the Warden, the trapdoor).
 *
 * Every method schedules its notes on the audio clock, so a burst of calls stays in time.
 */
import type { Core } from './sfx-core';
import { HURRY } from '../content/balance';
import type { SfxBus, SfxName } from './sfx-manifest';
import { CROWD, TICK_GAP, crowdGain, payoutTier } from './sfx-payout';

/** C major pentatonic in semitones above C6, C6 to G7. */
const LADDER = [0, 2, 4, 7, 9, 12, 14, 16, 19];
/** The three physical bars, in semitones above C6. */
const BARS: { name: SfxName; semis: number }[] = [
  { name: 'bellC', semis: 0 },
  { name: 'bellE', semis: 4 },
  { name: 'bellG', semis: 7 },
];

export type BannerKind = 'info' | 'good' | 'big' | 'bad' | 'warn' | 'secret';

interface NoteOpts {
  gain?: number;
  delay?: number;
  pan?: number;
  /** 'sfx' keeps a menu or story bell crisp when the table is muffled. */
  bus?: SfxBus;
}

export class RewardSounds {
  private hurryNext = 0;
  private hurryBeat = 0;
  /** Playback-rate multiplier that transposes every bell with the music's key. */
  private key = 1;
  private density = 0;
  private densityAt = 0;
  private tickAt = -1;

  constructor(private readonly a: Core) {}

  /** Transpose the bells by `semitones` (Sentence rounds move the groove up a semitone). */
  setKey(semitones: number): void {
    this.key = 2 ** (semitones / 12);
  }

  /** One bar of the chime unit by tier: 0 = low (10 pts), 1 = mid (100), 2 = high (1000). */
  chime(tier: 0 | 1 | 2, o: NoteOpts = {}): void {
    this.a.at(o.delay ?? 0, BARS[tier].name, {
      gain: o.gain,
      pan: o.pan,
      rate: this.key,
      bus: o.bus,
    });
  }

  /** A bell at ladder step i (0..8, clamped), nearest bar re-pitched. */
  note(step: number, o: NoteOpts = {}): void {
    const s = LADDER[Math.max(0, Math.min(LADDER.length - 1, Math.floor(step)))];
    let best = BARS[0];
    for (const b of BARS) if (Math.abs(s - b.semis) < Math.abs(s - best.semis)) best = b;
    this.a.at(o.delay ?? 0, best.name, {
      gain: o.gain,
      pan: o.pan,
      rate: 2 ** ((s - best.semis) / 12) * this.key,
      bus: o.bus,
    });
  }

  /** Notes in a row: steps at `gap` seconds apart. */
  run(steps: number[], gap: number, gain = 1, delay = 0, pan = 0, bus?: SfxBus): void {
    steps.forEach((s, i) =>
      this.note(s, {
        gain: gain * (0.85 + 0.15 * (i / steps.length)),
        delay: delay + i * gap,
        pan,
        bus,
      }),
    );
  }

  /** Coin clink; the pitch climbs with the combo level (0..8). */
  coin(level = 0, o: { gain?: number; bus?: SfxBus; delay?: number } = {}): void {
    const l = Math.max(0, Math.min(10, level));
    this.a.at(o.delay ?? 0, 'coin', {
      rate: 1 + l * 0.05,
      gain: (0.75 + l * 0.04) * (o.gain ?? 1),
      bus: o.bus,
    });
  }

  /**
   * A payout on the table, by what the shot is worth (sfx-payout.ts): the small ones tick a quiet
   * coin, the Chute and Perimeter ring a bell that rides the combo ladder (a hot streak plays a
   * melody), the big ones add a bright coin and a second note. A burst of payouts, say a pop
   * bumper rally, backs off as it builds so the rewards stay a texture, not a wall.
   */
  score(amount: number, combo = 0, big = false): void {
    let tier = payoutTier(amount);
    if (big && tier < 3) tier = 3;
    if (tier === 0) return;
    const now = this.a.now;
    if (tier === 1 && now - this.tickAt < TICK_GAP) return;
    if (tier === 1) this.tickAt = now;
    this.density = this.density * Math.exp(-(now - this.densityAt) / CROWD.decay) + 1;
    this.densityAt = now;
    const crowd = crowdGain(this.density);
    const chain = Math.min(8, combo);
    this.coin(Math.min(8, chain + tier), { gain: [0, 0.8, 0.9, 1, 1][tier] * crowd });
    if (tier === 2) this.note(chain, { gain: 0.65 * crowd, delay: 0.012 });
    else if (tier === 3) this.note(chain + 1, { gain: 0.85 * crowd, delay: 0.012 });
    else if (tier === 4) {
      this.note(chain + 3, { gain: crowd, delay: 0.01 });
      this.note(chain + 5, { gain: 0.75 * crowd, delay: 0.075 });
      this.a.at(0, 'ssCoinHi', { rate: 1 + chain * 0.03, gain: crowd });
    }
  }

  /** The chain climbs: from x2 up, a rising arpeggio that gets taller and fuller each link. */
  combo(count: number): void {
    if (count < 2) return;
    const a = this.a;
    const base = Math.min(5, count - 2);
    const len = Math.min(5, 2 + Math.floor(count / 2));
    const steps: number[] = [];
    for (let i = 0; i < len; i++) steps.push(base + i);
    this.run(steps, 0.055, 0.9, 0.02);
    if (count >= 3) a.at(0, 'whoosh', { gain: 0.5 + count * 0.05, rate: 1 + count * 0.04 });
    if (count >= 5) a.at(0.02, 'ssUpgrade', { gain: 0.7 });
    if (count >= 4) a.mix.duck(0.7, 0.3, 0.6);
  }

  /**
   * A jackpot: a thud, bells cascade up, coins pour. level 2 = the SUPER one. The layers are
   * staggered by a few tens of milliseconds so the fanfare builds rather than lands as one block.
   * The knocker is kept for PAYDAY and the extra ball; a jackpot gets the kicker's slam.
   */
  jackpot(level = 1): void {
    const a = this.a;
    const sup = level >= 2;
    a.at(0, 'kick', { gain: sup ? 0.9 : 0.75, rate: 0.82 });
    a.at(0.03, 'boom', { gain: sup ? 0.5 : 0.3 });
    this.run([0, 2, 3, 5, 6, 7, 8], sup ? 0.06 : 0.07, 1, 0.05);
    a.at(0.09, sup ? 'stAchievement' : 'stBonus', { gain: 0.8 });
    a.at(0.13, 'coinShower', { gain: sup ? 1 : 0.8 });
    if (sup) {
      a.at(0.45, 'coinShower', { gain: 0.8 });
      a.at(0.5, 'cash', { gain: 0.8 });
    }
    a.mix.duck(sup ? 0.25 : 0.4, sup ? 1.6 : 1, 1.1);
  }

  /** PAYDAY at the Chute; super = SUPER PAYDAY at the Hole. The knocker's whack opens it. */
  payday(sup: boolean): void {
    const a = this.a;
    a.at(0, 'knocker', { gain: sup ? 1 : 0.9 });
    // A full chime chord (struck a hair apart, like hammers), then a run up the ladder.
    this.chime(0, { gain: 0.9, delay: 0.07 });
    this.chime(1, { gain: 0.9, delay: 0.082 });
    this.chime(2, { gain: 0.9, delay: 0.094 });
    this.run(sup ? [5, 6, 7, 8, 8] : [4, 5, 7], 0.07, 1, 0.2);
    a.at(0.1, sup ? 'stAchievement' : 'stReward', { gain: 0.8 });
    a.at(0.15, 'coinShower', { gain: sup ? 1 : 0.8 });
    if (sup) {
      a.at(0.1, 'boom', { gain: 0.4 });
      a.at(0.6, 'coinShower', { gain: 0.8 });
    }
    a.mix.duck(sup ? 0.25 : 0.4, sup ? 1.8 : 1.1, 1.1);
  }

  /** RIOT multiball starts (on) or ends (off). */
  riot(on: boolean): void {
    const a = this.a;
    if (on) {
      a.at(0, 'kick', { gain: 0.9, rate: 0.8 });
      a.at(0.03, 'boom', { gain: 0.75 });
      for (let i = 0; i < 4; i++) a.at(0.16 + i * 0.42, 'alarm', { gain: 0.8 - i * 0.12 });
      a.at(0.12, 'stWarning', { gain: 0.8 });
      a.at(0.12, 'riser', { gain: 0.5, variant: 0 });
      a.mix.duck(0.35, 1.5, 1);
    } else {
      a.at(0, 'toll', { gain: 0.6, variant: 1 });
      a.at(0, 'whoosh', { gain: 0.6, rate: 0.7 });
      a.mix.duck(0.55, 0.6, 0.8);
    }
  }

  /**
   * Ball save: a rising swoosh, three quick bells and the feed solenoid re-serving the ball. A
   * relief beat, so there is no knocker.
   */
  save(): void {
    const a = this.a;
    a.at(0, 'whoosh', { gain: 0.8, rate: 0.9 });
    a.at(0.02, 'kick', { gain: 0.35, rate: 0.78 });
    this.run([2, 4, 7], 0.07, 1, 0.07);
    a.at(0.12, 'ssUpgrade', { gain: 0.6 });
    a.at(0.1, 'chute', { gain: 0.45, rate: 1.1 });
    a.mix.duck(0.55, 0.4, 0.7);
  }

  extraBall(): void {
    const a = this.a;
    a.at(0, 'knocker');
    this.run([0, 2, 4, 5, 7, 8], 0.075, 1, 0.14);
    a.at(0.12, 'stLevelUp', { gain: 0.8 });
    a.at(0.2, 'coinShower', { gain: 0.7 });
    a.mix.duck(0.35, 1.1, 1);
  }

  /** The skill shot: the kicker's slam and bells; the super one earns the knocker. */
  skillShot(sup: boolean): void {
    const a = this.a;
    if (sup) a.at(0, 'knocker', { gain: 0.9 });
    else a.at(0, 'kick', { gain: 0.8, rate: 0.9 });
    this.run(sup ? [2, 4, 5, 7, 8] : [2, 4, 7], 0.07, 1, 0.08);
    a.at(0.07, 'stBonus', { gain: 0.7 });
    if (sup) a.at(0.25, 'coinShower', { gain: 0.8 });
    a.mix.duck(0.45, 0.9, 0.9);
  }

  /** A Job is done: three bells and a warm pad under them. */
  jobComplete(): void {
    const a = this.a;
    this.run([0, 2, 4], 0.085, 1, 0.02);
    a.at(0.05, 'ssUpgrade', { gain: 0.6 });
    a.at(0.02, 'stReward', { gain: 0.55 });
    a.mix.duck(0.6, 0.7, 0.8);
  }

  /** A shot level rises, the Hole pays an award, a charm pays off. */
  levelUp(): void {
    this.run([2, 4, 5], 0.06, 0.9, 0.01);
    this.a.at(0.02, 'stLevelUp', { gain: 0.6 });
  }

  /**
   * The deadline is paid: the register rings and the whole bank of chimes answers. It plays at
   * the ATM, with the camera off the table, so the bells ride the crisp bus.
   */
  deadlinePaid(): void {
    const a = this.a;
    a.at(0, 'cash');
    this.run([0, 2, 4, 5, 7, 8], 0.09, 1, 0.14, 0, 'sfx');
    a.at(0.1, 'stAchievement');
    a.at(0.15, 'coinShower', { gain: 0.8, bus: 'sfx' });
    a.mix.duck(0.35, 1.6, 1.2);
  }

  /** A new unlock / rap sheet entry (a menu moment: crisp bus). */
  unlocked(): void {
    const a = this.a;
    a.at(0, 'stAchievement', { gain: 0.9 });
    this.run([4, 5, 7, 8], 0.1, 0.9, 0.12, 0, 'sfx');
    a.at(0.05, 'ssSecret', { gain: 0.5 });
    a.mix.duck(0.45, 1.2, 1);
  }

  /** The neighbor's secret shot. */
  tunnel(): void {
    const a = this.a;
    a.at(0, 'doorClang', { gain: 0.7, rate: 1.1 });
    a.at(0.25, 'ssSecret', { gain: 1 });
    a.at(0.3, 'bellG', { gain: 0.8, rate: 2 });
    a.mix.duck(0.5, 0.8, 0.8);
  }

  /** Bonus count-up: tick i of total (coins climbing, a bell every third). */
  countTick(i: number, total: number): void {
    const k = Math.floor((i / Math.max(1, total)) * 8);
    this.coin(k);
    if (i % 3 === 0) this.note(Math.min(8, Math.floor(k * 0.9)), { gain: 0.6 });
    if (i === total) {
      this.run([5, 7, 8], 0.07, 0.9, 0.05);
      this.a.at(0.04, 'cash', { gain: 0.7 });
    }
  }

  bonusMult(mult: number): void {
    this.run([Math.min(5, mult), Math.min(8, mult + 2)], 0.07, 0.9);
  }

  /** Charm ability fired. */
  active(): void {
    this.a.play('kick', { gain: 0.7 });
    this.note(3, { gain: 0.6, delay: 0.04 });
  }

  /** Lockup ball locked (n of needed). */
  lock(n: number): void {
    const a = this.a;
    a.play('lock');
    this.note(Math.min(5, n * 2), { gain: 0.8, delay: 0.06 });
    a.at(0.04, 'stLock', { gain: 0.5 });
  }

  /** The hurry-up lights: a klaxon blip and a rising swell. If it ran out unpaid, a sour sag. */
  hurry(on: boolean, paid = false): void {
    const a = this.a;
    if (on) {
      a.at(0, 'warn', { gain: 1 });
      a.at(0.04, 'riser', { gain: 0.45, variant: 0 });
      a.mix.duck(0.7, 0.4, 0.6);
      this.hurryNext = 0;
      this.hurryBeat = 0;
    } else if (!paid) {
      a.at(0, 'ssLose', { gain: 1 });
      a.at(0.05, 'whoosh', { gain: 0.55, rate: 0.6 });
    }
  }

  /** The hurry-up's countdown pulse: beeps that climb in pitch and rate as the seconds run out. */
  hurryTick(left: number): void {
    if (left <= 0) {
      this.hurryNext = 0;
      return;
    }
    const a = this.a;
    const now = a.now;
    if (now < this.hurryNext) return;
    const k = 1 - Math.min(1, left / HURRY.seconds);
    this.hurryNext = now + 0.66 - 0.5 * k * k;
    const accent = this.hurryBeat++ % 4 === 0;
    a.play('hurryTick', {
      variant: accent ? 2 : 1,
      gain: accent ? 1 : 0.65,
      rate: 0.9 + k * 0.6,
    });
  }

  /** Lucky sparks on the plunge. */
  spark(): void {
    this.run([4, 7, 8], 0.05, 0.6);
    this.a.at(0.02, 'ssSecret', { gain: 0.4 });
  }

  // ------------------------------------------------------------------ darker beats

  /** The ball is gone: a low bell answers the drain's thud (and a sag if it was a tilt). */
  ballOver(tilted: boolean): void {
    const a = this.a;
    a.at(0.35, 'toll', { gain: 0.4, variant: 0 });
    if (tilted) a.at(0.45, 'ssLose', { gain: 0.5 });
    a.mix.duck(0.5, 0.8, 0.9);
  }

  /** The Warden speaks: a low toll and a door somewhere. */
  warden(): void {
    const a = this.a;
    a.at(0, 'toll', { gain: 0.55, variant: 1 });
    a.at(0.5, 'farDoor', { gain: 0.9 });
    a.mix.duck(0.55, 1.2, 1);
  }

  /** DMD banners: kind picks a short whoosh and bell figure. Callouts also come through here. */
  banner(kind: BannerKind = 'info', priority = 3): void {
    const a = this.a;
    switch (kind) {
      case 'info':
        if (priority >= 3) this.note(2, { gain: 0.35 + priority * 0.03 });
        break;
      case 'good':
        a.at(0, 'whoosh', { gain: 0.45, rate: 1.1 });
        this.run([2, 4], 0.06, 0.8, 0.04);
        break;
      case 'big':
        a.at(0, 'whoosh', { gain: 0.7, rate: 0.9 });
        this.run([2, 4, 7], 0.06, 1, 0.05);
        a.at(0.05, 'stBonus', { gain: 0.45 });
        a.mix.duck(0.55, 0.6, 0.7);
        break;
      case 'bad':
        a.at(0, 'stError', { gain: 0.6 });
        break;
      case 'warn':
        a.at(0, 'warn', { gain: 0.8 });
        break;
      case 'secret':
        a.at(0, 'ssSecret', { gain: 0.8 });
        break;
    }
  }

  /** A DMD callout by its priority (2 = routine shot ... 10 = the big ones): a single soft bell. */
  callout(priority: number): void {
    if (priority < 3 || priority > 6) return;
    this.note(priority >= 5 ? 3 : 2, { gain: 0.26 + priority * 0.03 });
  }
}
