/**
 * Sentences: revealed when a deadline starts, active on its last round (also round 2 at Hard
 * Time 2+), cancelled by a Bribe. Fair and readable: none invert controls or force a drain.
 * Effects are data the run applies when building a ball (and to prices / the debt).
 */
import type { SimMods } from '../sim/sim-config';

export interface SentenceEffect {
  /** Sim modifiers multiplied in (flipperStrength, ballMass, ...). */
  sim?: Partial<Pick<SimMods, 'flipperStrength' | 'ballMass'>>;
  /** Table tags removed / added (outlanePosts, boltedHole). */
  removeTags?: string[];
  addTags?: string[];
  /** Ball-context changes. */
  yardPays?: false;
  comboWindowMult?: number;
  tiltSensitivityMult?: number;
  lockdown?: true;
  bonusKeepMult?: number;
  noBallSave?: true;
  deadLanes?: true;
  /** Presentation: lamps off except a halo around the ball. */
  blackout?: true;
  /** Run economics. */
  ballPriceMult?: number;
  /** Fraction of the debt added per ball lost. */
  drainDebt?: number;
}

export interface SentenceDef {
  id: string;
  name: string;
  text: string;
  /** 1 mild .. 3 harsh; later deadlines draw harsher Sentences. */
  tier: 1 | 2 | 3;
  effect: SentenceEffect;
}

export const SENTENCES: SentenceDef[] = [
  {
    id: 'blackout',
    name: 'Blackout',
    text: 'The lights go out. Only the ball glows.',
    tier: 2,
    effect: { blackout: true },
  },
  {
    id: 'greased',
    name: 'Greased Flippers',
    text: 'Flippers are 15% weaker.',
    tier: 2,
    effect: { sim: { flipperStrength: 0.85 } },
  },
  {
    id: 'wideOpen',
    name: 'Wide Open',
    text: 'The outlane posts are removed.',
    tier: 3,
    effect: { removeTags: ['outlanePosts'] },
  },
  {
    id: 'rustedYard',
    name: 'Rusted Yard',
    text: 'The Yard bumpers pay nothing.',
    tier: 1,
    effect: { yardPays: false },
  },
  {
    id: 'shortFuse',
    name: 'Short Fuse',
    text: 'The combo window is halved.',
    tier: 1,
    effect: { comboWindowMult: 0.5 },
  },
  {
    id: 'leadBall',
    name: 'Lead Ball',
    text: 'The ball is heavier.',
    tier: 2,
    effect: { sim: { ballMass: 1.6 } },
  },
  {
    id: 'shakedown',
    name: 'Shakedown',
    text: 'Tilt is twice as sensitive.',
    tier: 1,
    effect: { tiltSensitivityMult: 2 },
  },
  {
    id: 'lockdown',
    name: 'Lockdown',
    text: 'Lockup cannot be lit.',
    tier: 2,
    effect: { lockdown: true },
  },
  {
    id: 'inflation',
    name: 'Inflation',
    text: 'Balls cost double.',
    tier: 1,
    effect: { ballPriceMult: 2 },
  },
  {
    id: 'taxman',
    name: 'Taxman',
    text: 'The Warden takes 25% of every Bonus.',
    tier: 1,
    effect: { bonusKeepMult: 0.75 },
  },
  { id: 'noMercy', name: 'No Mercy', text: 'No ball save.', tier: 3, effect: { noBallSave: true } },
  {
    id: 'headCount',
    name: 'Head Count',
    text: 'Every ball lost adds 3% to the debt.',
    tier: 3,
    effect: { drainDebt: 0.03 },
  },
  {
    id: 'boltedHole',
    name: 'Bolted Hole',
    text: 'The Hole is bolted shut.',
    tier: 3,
    effect: { addTags: ['boltedHole'] },
  },
  {
    id: 'deadLanes',
    name: 'Dead Lanes',
    text: 'The top lanes do not raise the Bonus multiplier.',
    tier: 1,
    effect: { deadLanes: true },
  },
];

export function sentenceDef(id: string): SentenceDef {
  const d = SENTENCES.find((s) => s.id === id);
  if (!d) throw new Error(`unknown sentence ${id}`);
  return d;
}

/** Highest Sentence tier allowed at a deadline (0-based). */
export function maxTier(deadline: number): number {
  return deadline < 2 ? 1 : deadline < 5 ? 2 : 3;
}

/** Lowest tier drawn (late deadlines stop drawing the mildest). */
export function minTier(deadline: number): number {
  return deadline >= 6 ? 2 : 1;
}
