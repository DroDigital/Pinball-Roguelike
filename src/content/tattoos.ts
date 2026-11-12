/**
 * Ink: the level-up upgrades. Coins earned on the table build REP; every REP level lets you
 * pick one of three tattoos between balls. Tattoos stack in ranks (each rank adds its own
 * effect on top of the last), and two tattoos inked to rank II or more unlock a Sleeve: a
 * one-off combination that changes how the table plays.
 *
 * Effects reuse the charm effect record (`CharmFx`, folded the same way: multipliers multiply,
 * additions add) plus one-off effects applied when a rank is inked (`onInk`). Numbers are
 * starting values; tune them with `npm run economy -- --mode physics`.
 */
import type { CharmFx } from './charms';

export type InkRarity = 'common' | 'uncommon' | 'rare' | 'sleeve';
/** When a tattoo pays off: shown on the card so the choice reads at a glance. */
export type InkTiming = 'early' | 'late' | 'risk' | 'any';
export type InkTag = 'Yard' | 'Chute' | 'Bonus' | 'Riot' | 'Luck' | 'Money' | 'Lone' | 'Wanted';

/** Effects applied once, when a rank is inked. */
export interface InkOnce {
  /** Multiplies every future deadline's debt. */
  debtMult?: number;
  /** Levels added to every shot. */
  levelsAll?: number;
}

export interface TattooDef {
  id: string;
  name: string;
  rarity: InkRarity;
  timing: InkTiming;
  tags: InkTag[];
  /** One line per rank: what that rank adds. */
  ranks: { text: string; fx?: CharmFx; once?: InkOnce }[];
  /** Sleeves: the tattoos (and rank) that unlock it. */
  needs?: [string, string];
}

/** Sleeve behaviours the table and the run check by id. */
export type SleeveId =
  | 'kingpin'
  | 'jailhouseRock'
  | 'lifeSentence'
  | 'luckyDevil'
  | 'yardDog'
  | 'whiteCollar'
  | 'serpent'
  | 'deadManWalking';

const rank = (text: string, fx?: CharmFx, once?: InkOnce) => ({ text, fx, once });

export const TATTOOS: TattooDef[] = [
  // ------------------------------------------------------------------ anytime
  {
    id: 'knuckles',
    name: 'LOVE / HATE',
    rarity: 'common',
    timing: 'any',
    tags: [],
    ranks: [
      rank('Everything pays 8% more.', { payMult: 1.08 }),
      rank('Everything pays 8% more.', { payMult: 1.08 }),
      rank('Everything pays 8% more.', { payMult: 1.08 }),
      rank('Everything pays 8% more.', { payMult: 1.08 }),
    ],
  },
  {
    id: 'swallow',
    name: 'Swallow',
    rarity: 'common',
    timing: 'early',
    tags: ['Lone'],
    ranks: [
      rank('Ball save lasts 3 s longer.', { ballSaveAdd: 3 }),
      rank('Ball save lasts 3 s longer.', { ballSaveAdd: 3 }),
      rank('Ball save lasts 3 s longer.', { ballSaveAdd: 3 }),
    ],
  },
  {
    id: 'star',
    name: 'Nautical Star',
    rarity: 'common',
    timing: 'early',
    tags: [],
    ranks: [
      rank('REP fills 15% faster.', { xpMult: 1.15 }),
      rank('REP fills 15% faster.', { xpMult: 1.15 }),
      rank('REP fills 15% faster.', { xpMult: 1.15 }),
    ],
  },
  {
    id: 'dots',
    name: 'Five Dots',
    rarity: 'common',
    timing: 'any',
    tags: ['Luck'],
    ranks: [
      rank('+4 luck.', { luck: 4 }),
      rank('+4 luck.', { luck: 4 }),
      rank('+4 luck.', { luck: 4 }),
    ],
  },
  {
    id: 'dollar',
    name: 'Dollar Sign',
    rarity: 'common',
    timing: 'late',
    tags: ['Money'],
    ranks: [
      rank('+3% Bank interest; balls cost 10% less.', { interestAdd: 0.03, ballPriceMult: 0.9 }),
      rank('+3% Bank interest; balls cost 10% less.', { interestAdd: 0.03, ballPriceMult: 0.9 }),
      rank('+3% Bank interest; balls cost 10% less.', { interestAdd: 0.03, ballPriceMult: 0.9 }),
    ],
  },
  // ------------------------------------------------------------------ shots
  {
    id: 'anchor',
    name: 'Anchor',
    rarity: 'common',
    timing: 'any',
    tags: ['Yard'],
    ranks: [
      rank('The Yard pays 30% more; Brawls +3 s.', { shotMult: { yard: 1.3 }, brawlSecondsAdd: 3 }),
      rank('The Yard pays 30% more; Brawls +3 s.', { shotMult: { yard: 1.3 }, brawlSecondsAdd: 3 }),
      rank('The Yard pays 30% more; Brawls +3 s.', { shotMult: { yard: 1.3 }, brawlSecondsAdd: 3 }),
    ],
  },
  {
    id: 'snake',
    name: 'Snake',
    rarity: 'common',
    timing: 'any',
    tags: ['Chute'],
    ranks: [
      rank('The Chute and the Perimeter pay 25% more.', {
        shotMult: { chute: 1.25, perimeter: 1.25 },
      }),
      rank('The Chute and the Perimeter pay 25% more.', {
        shotMult: { chute: 1.25, perimeter: 1.25 },
      }),
      rank('The Chute and the Perimeter pay 25% more.', {
        shotMult: { chute: 1.25, perimeter: 1.25 },
      }),
    ],
  },
  {
    id: 'clock',
    name: 'Clock Without Hands',
    rarity: 'uncommon',
    timing: 'any',
    tags: ['Chute'],
    ranks: [
      rank('Combo window +0.75 s; each combo step +0.5.', {
        comboWindowAdd: 0.75,
        comboStepAdd: 0.5,
      }),
      rank('Combo window +0.75 s; each combo step +0.5.', {
        comboWindowAdd: 0.75,
        comboStepAdd: 0.5,
      }),
      rank('Combo window +0.75 s; each combo step +0.5.', {
        comboWindowAdd: 0.75,
        comboStepAdd: 0.5,
      }),
    ],
  },
  {
    id: 'web',
    name: 'Spider Web',
    rarity: 'uncommon',
    timing: 'any',
    tags: ['Bonus'],
    ranks: [
      rank('Bonus X cap +2; the Bonus collects 25% more.', {
        bonusMaxAdd: 2,
        bonusShareMult: 1.25,
      }),
      rank('Bonus X cap +2; the Bonus collects 25% more.', {
        bonusMaxAdd: 2,
        bonusShareMult: 1.25,
      }),
      rank('Bonus X cap +2; the Bonus collects 25% more.', {
        bonusMaxAdd: 2,
        bonusShareMult: 1.25,
      }),
    ],
  },
  {
    id: 'crown',
    name: 'Crown',
    rarity: 'uncommon',
    timing: 'any',
    tags: ['Wanted'],
    ranks: [
      rank('Bounties pay 30% more.', { bountyMult: 1.3 }),
      rank('Bounties pay 30% more; MOST WANTED one bounty sooner.', {
        bountyMult: 1.3,
        mostWantedSooner: 1,
      }),
      rank('Bounties pay 30% more; MOST WANTED one bounty sooner.', {
        bountyMult: 1.3,
        mostWantedSooner: 1,
      }),
    ],
  },
  {
    id: 'wire',
    name: 'Barbed Wire',
    rarity: 'uncommon',
    timing: 'any',
    tags: ['Riot'],
    ranks: [
      rank('RIOT starts with one more ball.', { riotBallsAdd: 1 }),
      rank('PAYDAY pays 50% more.', { paydayMult: 1.5 }),
      rank('RIOT needs only one lock.', { locksNeeded: 1 }),
    ],
  },
  {
    id: 'lightning',
    name: 'Lightning Bolt',
    rarity: 'uncommon',
    timing: 'any',
    tags: ['Yard', 'Bonus'],
    ranks: [
      rank('Timed modes (Sweep, Brawl, Double Shift, PA, Most Wanted) last 40% longer.', {
        modeSecondsMult: 1.4,
      }),
      rank('Timed modes last 40% longer.', { modeSecondsMult: 1.4 }),
      rank('Timed modes last 40% longer.', { modeSecondsMult: 1.4 }),
    ],
  },
  {
    id: 'eye',
    name: 'Watching Eye',
    rarity: 'uncommon',
    timing: 'any',
    tags: ['Luck'],
    ranks: [
      rank('PA announcements come 25% sooner.', { paGapMult: 0.75 }),
      rank('PA announcements come 25% sooner.', { paGapMult: 0.75 }),
      rank('PA announcements come 25% sooner.', { paGapMult: 0.75 }),
    ],
  },
  {
    id: 'chains',
    name: 'Broken Chains',
    rarity: 'uncommon',
    timing: 'early',
    tags: ['Lone'],
    ranks: [
      rank('The kickback is lit at the start of every ball.', { kickbackStart: true }),
      rank('A ball can earn one more extra ball.', { extraBallCapAdd: 1 }),
    ],
  },
  {
    id: 'heart',
    name: 'MOM',
    rarity: 'uncommon',
    timing: 'early',
    tags: ['Money'],
    ranks: [rank('Job rewards are doubled (Keys excepted).', { jobRewardMult: 2 })],
  },
  // ------------------------------------------------------------------ risk
  {
    id: 'teardrop',
    name: 'Teardrop',
    rarity: 'uncommon',
    timing: 'risk',
    tags: ['Luck'],
    ranks: [
      rank('Everything pays 20% more; ball save 4 s shorter.', {
        payMult: 1.2,
        ballSaveAdd: -4,
      }),
      rank('Everything pays 20% more; ball save 4 s shorter.', {
        payMult: 1.2,
        ballSaveAdd: -4,
      }),
      rank('Everything pays 20% more; ball save 4 s shorter.', {
        payMult: 1.2,
        ballSaveAdd: -4,
      }),
    ],
  },
  {
    id: 'skull',
    name: 'Grudge Skull',
    rarity: 'uncommon',
    timing: 'risk',
    tags: ['Lone'],
    ranks: [
      rank('Each ball lost this round makes the next ones pay 20% more.', { grudgePay: 0.2 }),
      rank('Each ball lost this round: +20% more.', { grudgePay: 0.2 }),
      rank('Each ball lost this round: +20% more.', { grudgePay: 0.2 }),
    ],
  },
  // ------------------------------------------------------------------ rare
  {
    id: 'joker',
    name: 'Ace of Spades',
    rarity: 'rare',
    timing: 'any',
    tags: ['Riot'],
    ranks: [
      rank('25% chance each ball brings a second ball (6 s save).', { twinChance: 0.25 }),
      rank('+25% chance of a second ball.', { twinChance: 0.25 }),
      rank('+25% chance of a second ball.', { twinChance: 0.25 }),
      rank('+25% chance of a second ball.', { twinChance: 0.25 }),
    ],
  },
  {
    id: 'hourglass',
    name: 'Hourglass',
    rarity: 'rare',
    timing: 'late',
    tags: ['Bonus'],
    ranks: [
      rank('Everything pays 2% more per REP level you hold.', { payPerRep: 0.02 }),
      rank('+2% more per REP level.', { payPerRep: 0.02 }),
      rank('+2% more per REP level.', { payPerRep: 0.02 }),
    ],
  },
  {
    id: 'barcode',
    name: 'Inmate Number',
    rarity: 'rare',
    timing: 'early',
    tags: ['Money'],
    ranks: [rank('+1 free ball every round.', { freeBalls: 1 })],
  },
  {
    id: 'compass',
    name: 'Compass Rose',
    rarity: 'rare',
    timing: 'any',
    tags: [],
    ranks: [rank('+1 level to every shot.', undefined, { levelsAll: 1 })],
  },
  {
    id: 'scales',
    name: 'Scales of Justice',
    rarity: 'rare',
    timing: 'late',
    tags: ['Money'],
    ranks: [
      rank('Every future debt is 8% smaller.', undefined, { debtMult: 0.92 }),
      rank('Every future debt is 8% smaller.', undefined, { debtMult: 0.92 }),
      rank('Every future debt is 8% smaller.', undefined, { debtMult: 0.92 }),
    ],
  },
  // ------------------------------------------------------------------ sleeves
  {
    id: 'kingpin',
    name: 'KINGPIN SLEEVE',
    rarity: 'sleeve',
    timing: 'any',
    tags: ['Wanted'],
    needs: ['crown', 'knuckles'],
    ranks: [
      rank('Every bounty makes everything pay 5% more for the rest of the ball (up to +50%).'),
    ],
  },
  {
    id: 'jailhouseRock',
    name: 'JAILHOUSE ROCK SLEEVE',
    rarity: 'sleeve',
    timing: 'any',
    tags: ['Riot'],
    needs: ['joker', 'wire'],
    ranks: [rank('While two or more balls are in play, everything pays 50% more.')],
  },
  {
    id: 'lifeSentence',
    name: 'LIFE SENTENCE SLEEVE',
    rarity: 'sleeve',
    timing: 'late',
    tags: ['Bonus'],
    needs: ['hourglass', 'web'],
    ranks: [rank('No Bonus X cap; every ball starts at +1 Bonus X per 4 REP levels.')],
  },
  {
    id: 'luckyDevil',
    name: 'LUCKY DEVIL SLEEVE',
    rarity: 'sleeve',
    timing: 'risk',
    tags: ['Luck'],
    needs: ['dots', 'teardrop'],
    ranks: [rank('The first outlane drain of every ball is always a lucky bounce.')],
  },
  {
    id: 'yardDog',
    name: 'YARD DOG SLEEVE',
    rarity: 'sleeve',
    timing: 'any',
    tags: ['Yard'],
    needs: ['anchor', 'lightning'],
    ranks: [rank('Any bumper starts a Yard BRAWL, and brawls pay x4 instead of x3.')],
  },
  {
    id: 'whiteCollar',
    name: 'WHITE COLLAR SLEEVE',
    rarity: 'sleeve',
    timing: 'late',
    tags: ['Money'],
    needs: ['dollar', 'scales'],
    ranks: [
      rank('The Bank earns a quarter of its interest after every ball, as well as every round.'),
    ],
  },
  {
    id: 'serpent',
    name: 'SERPENT SLEEVE',
    rarity: 'sleeve',
    timing: 'any',
    tags: ['Chute'],
    needs: ['snake', 'clock'],
    ranks: [
      rank('A x3 combo or better raises the shot a level for the rest of the ball (3 per ball).'),
    ],
  },
  {
    id: 'deadManWalking',
    name: 'DEAD MAN WALKING SLEEVE',
    rarity: 'sleeve',
    timing: 'risk',
    tags: ['Lone'],
    needs: ['skull', 'swallow'],
    ranks: [rank('The last ball of every round pays double.')],
  },
];

export const TATTOO_BY_ID = new Map(TATTOOS.map((t) => [t.id, t]));

export function tattooDef(id: string): TattooDef {
  const d = TATTOO_BY_ID.get(id);
  if (!d) throw new Error(`unknown tattoo ${id}`);
  return d;
}

export function maxRank(id: string): number {
  return tattooDef(id).ranks.length;
}

export const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI'];
