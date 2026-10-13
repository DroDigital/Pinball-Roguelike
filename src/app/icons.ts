/**
 * Item icons from the art pack's 12-icon atlas, shown with the measured source rectangle of
 * each (contain behaviour, never stretched). Anything outside the atlas gets no icon, so
 * screens keep their current text for it.
 */
import { ART, ATLAS_ICONS } from '../content/art';

const atlas = ART['ui/charm-icon-atlas'];

/**
 * An inline icon sized by its font-size (1em square), or null if the atlas has no art for
 * this charm or contraband id. The atlas image itself comes from the --bc-atlas variable,
 * set once it has loaded, so icons made earlier fill in by themselves.
 */
export function itemIcon(id: string): HTMLElement | null {
  const style = iconStyle(id);
  if (!style) return null;
  const el = document.createElement('span');
  el.className = 'icon';
  el.setAttribute('aria-hidden', 'true');
  el.setAttribute('style', style);
  return el;
}

/** The same icon as an HTML string, for the HUD's innerHTML updates ('' if there is none). */
export function itemIconHtml(id: string): string {
  const style = iconStyle(id);
  return style ? `<span class="icon" aria-hidden="true" style="${style}"></span>` : '';
}

function iconStyle(id: string): string | null {
  const icon = ATLAS_ICONS[id];
  if (!icon) return null;
  const [sx, sy, sw, sh] = icon.source;
  // em per atlas pixel so the longer side of the object exactly fills the 1em box.
  const k = 1 / Math.max(sw, sh);
  const r = (n: number) => Math.round(n * 1e4) / 1e4;
  return `background-size:${r(atlas.width * k)}em ${r(atlas.height * k)}em;background-position:${r(-sx * k + (1 - sw * k) / 2)}em ${r(-sy * k + (1 - sh * k) / 2)}em`;
}

/** The Warden's keyring stands for the Keys resource as well as the charm. */
export const keysIcon = (): HTMLElement | null => itemIcon('wardensKeyring');
export const keysIconHtml = (): string => itemIconHtml('wardensKeyring');
