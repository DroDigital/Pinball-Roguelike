import {
  CHUTE,
  FLIPPER,
  HOLE,
  KICKERS,
  MATERIALS,
  NUDGE,
  PHYSICS,
  PLUNGER,
  WATCHDOG,
  type MaterialProps,
} from '../content/balance';

/** Everything the physics sim reads. A fresh deep copy per sim so dev tweaks and modifiers are local. */
export interface SimConfig {
  physics: typeof PHYSICS;
  materials: Record<string, MaterialProps>;
  flipper: typeof FLIPPER;
  kickers: typeof KICKERS;
  plunger: typeof PLUNGER;
  chute: typeof CHUTE;
  hole: typeof HOLE;
  nudge: typeof NUDGE;
  watchdog: typeof WATCHDOG;
  /** Modifiers applied by charms, sentences, inmates and assist mode. */
  mods: SimMods;
}

export interface SimMods {
  /** Flipper power multiplier (Greased Flippers 0.85, Brawler 1.1). */
  flipperStrength: number;
  /** Ball mass multiplier (Lead Ball). */
  ballMass: number;
  /** Pop/sling kick multiplier (Hellfire Rubber). */
  kickStrength: number;
  /** Nudge strength multiplier (Iron Lockbar). */
  nudgeStrength: number;
  /** Chute never rolls back (Greased Rail). */
  greasedRail: boolean;
  /** Gravity multiplier (Assist mode slows the table). */
  gravity: number;
}

export const DEFAULT_MODS: SimMods = {
  flipperStrength: 1,
  ballMass: 1,
  kickStrength: 1,
  nudgeStrength: 1,
  greasedRail: false,
  gravity: 1,
};

/** Live base config (the dev panel edits this object; new sims copy it). */
export const BASE_CONFIG: Omit<SimConfig, 'mods'> = {
  physics: PHYSICS,
  materials: MATERIALS,
  flipper: FLIPPER,
  kickers: KICKERS,
  plunger: PLUNGER,
  chute: CHUTE,
  hole: HOLE,
  nudge: NUDGE,
  watchdog: WATCHDOG,
};

export function makeSimConfig(mods: Partial<SimMods> = {}): SimConfig {
  const base = JSON.parse(JSON.stringify(BASE_CONFIG)) as Omit<SimConfig, 'mods'>;
  return { ...base, mods: { ...DEFAULT_MODS, ...mods } };
}
