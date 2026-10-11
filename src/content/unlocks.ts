/**
 * Meta progression: milestones that unlock charms, inmates and Endless. About a third of the
 * charms start locked; every archetype keeps something to build with from the first run.
 * Conditions are small pure functions over the lifetime stats.
 */
export interface LifetimeStats {
  runs: number;
  /** Highest deadline reached (1-based count of deadlines paid). */
  bestDeadline: number;
  biggestPayday: number;
  longestCombo: number;
  balls: number;
  coins: number;
  riots: number;
  tunnels: number;
  neighborAnswers: number;
  maxKeys: number;
  wins: number;
  jailbreaks: number;
}

export function emptyLifetimeStats(): LifetimeStats {
  return {
    runs: 0,
    bestDeadline: 0,
    biggestPayday: 0,
    longestCombo: 0,
    balls: 0,
    coins: 0,
    riots: 0,
    tunnels: 0,
    neighborAnswers: 0,
    maxKeys: 0,
    wins: 0,
    jailbreaks: 0,
  };
}

/** Endings, as recorded on the Rap Sheet. */
export type EndingId = 'paidInFull' | 'breakout' | 'cellmate';

export const ENDING_NAMES: Record<EndingId, string> = {
  paidInFull: 'Paid in Full',
  breakout: 'Breakout',
  cellmate: 'Cellmate',
};

export interface UnlockDef {
  id: string;
  /** The condition, as the Rap Sheet shows it. */
  text: string;
  charms?: string[];
  inmate?: string;
  endless?: boolean;
  /** Met by these lifetime stats, or by reaching one of these endings. */
  check?: (s: LifetimeStats) => boolean;
  ending?: EndingId;
}

export const UNLOCKS: UnlockDef[] = [
  {
    id: 'firstDeadline',
    text: 'Pay a deadline.',
    charms: ['overtime', 'lastRites'],
    check: (s) => s.bestDeadline >= 1,
  },
  {
    id: 'deadline4',
    text: 'Reach deadline 4.',
    charms: ['cellmates', 'chainLink'],
    inmate: 'lifer',
    check: (s) => s.bestDeadline >= 3,
  },
  {
    id: 'riots',
    text: 'Start 5 RIOTs.',
    charms: ['hoarderSack', 'twinYolk'],
    inmate: 'brawler',
    check: (s) => s.riots >= 5,
  },
  {
    id: 'payday',
    text: 'Collect a 50-coin PAYDAY.',
    charms: ['handCrank', 'ninthLife'],
    check: (s) => s.biggestPayday >= 50,
  },
  {
    id: 'coins',
    text: 'Earn 2,000 coins in total.',
    charms: ['hollowBook', 'mattress'],
    inmate: 'embezzler',
    check: (s) => s.coins >= 2000,
  },
  {
    id: 'combo',
    text: 'Make a 5-shot combo.',
    charms: ['crackedMirror', 'heldBreath'],
    check: (s) => s.longestCombo >= 5,
  },
  {
    id: 'keys',
    text: 'Hold 3 Keys at once.',
    charms: ['wardensKeyring'],
    inmate: 'escapeArtist',
    check: (s) => s.maxKeys >= 3,
  },
  {
    id: 'neighbor',
    text: 'Answer the neighbor 3 times.',
    charms: ['patronSaint', 'solitary'],
    inmate: 'snitch',
    check: (s) => s.neighborAnswers >= 3,
  },
  {
    id: 'tunnel',
    text: 'Find the Tunnel.',
    charms: ['glassEye', 'crookedPenny'],
    check: (s) => s.tunnels >= 1,
  },
  {
    id: 'win',
    text: 'Get out, any way you can.',
    charms: ['endlessTally', 'riotShield'],
    endless: true,
    check: (s) => s.wins >= 1,
  },
  { id: 'breakout', text: 'Escape through JAILBREAK.', ending: 'breakout' },
  {
    id: 'cellmate',
    text: 'Help the neighbor every time, then pay deadline 8.',
    ending: 'cellmate',
  },
];

export function unlockDef(id: string): UnlockDef {
  const d = UNLOCKS.find((u) => u.id === id);
  if (!d) throw new Error(`unknown unlock ${id}`);
  return d;
}
