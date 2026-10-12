/**
 * Resolution watchdog rules. A device that stays under LOW_FPS steps the internal resolution
 * down one tier at a time. The drop is a runtime cap, kept apart from the player's saved
 * choice: a settings change re-applies the saved choice but keeps the cap, and only an
 * explicit change of the resolution setting clears it.
 */
export const LOW_FPS = 40;
export const LOW_FPS_SECS = 5;
export const MIN_PIXEL_HEIGHT = 180;
/** Drop targets, highest first (native 0 steps down to the first of these). */
export const QUALITY_STEPS: readonly number[] = [360, 240, MIN_PIXEL_HEIGHT];

/** The internal height to render at: the saved choice, lowered by the cap. 0 means native. */
export function effectivePixelHeight(saved: number, cap: number): number {
  if (cap <= 0) return saved;
  return saved > 0 && saved < cap ? saved : cap;
}

/** The next tier down from the current height (0 = native), or null at the floor. */
export function nextQualityStep(px: number): number | null {
  if (px > 0 && px <= MIN_PIXEL_HEIGHT) return null;
  return QUALITY_STEPS.find((s) => px === 0 || s < px) ?? MIN_PIXEL_HEIGHT;
}

/** The cap after a settings change: only changing the saved resolution clears it. */
export function capAfterSettings(cap: number, previousSaved: number, nextSaved: number): number {
  return previousSaved === nextSaved ? cap : 0;
}
