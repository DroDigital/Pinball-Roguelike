import { REP } from '../content/balance';

/** REP needed to go from `level` to the next one (shared by the run and the live ball). */
export function repToNext(level: number): number {
  return Math.round(REP.base * Math.pow(REP.growth, Math.max(0, level - 1)));
}
