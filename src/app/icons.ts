/**
 * Item icons: one glyph per charm and contraband (game-icons.net, CC BY 3.0, see README), drawn
 * as inline SVG in the text colour so they follow the card, rarity and palette they sit on.
 * The generated data is in icon-paths.ts. Anything without a glyph gets no icon, so screens
 * keep their current text for it.
 */
import { ICON_BODIES } from './icon-paths';
import { hasRelicModel, relicStage } from '../present/relics';

/** The relic's rendered portrait, or '' when there is no model or no WebGL. */
const portrait = (id: string): string => (hasRelicModel(id) ? relicStage.portrait(id) : '');

const svg = (body: string): string =>
  `<svg viewBox="0 0 512 512" focusable="false" fill="currentColor">${body}</svg>`;

/**
 * An inline icon sized by its font-size (1em square), or null if there is no glyph for this
 * charm or contraband id.
 */
export function itemIcon(id: string): HTMLElement | null {
  const src = portrait(id);
  const body = ICON_BODIES[id];
  if (!src && !body) return null;
  const el = document.createElement('span');
  el.className = src ? 'icon relic' : 'icon';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = src ? `<img src="${src}" alt="" draggable="false">` : svg(body);
  return el;
}

/** The relic turning on a little turntable (shop cards, the rack); falls back to the icon. */
export function relicLive(id: string): HTMLElement | null {
  if (!portrait(id)) return itemIcon(id);
  const el = document.createElement('span');
  el.className = 'relic-stage';
  el.setAttribute('aria-hidden', 'true');
  el.append(relicStage.turntable(id));
  return el;
}

/** The same icon as an HTML string, for the HUD's innerHTML updates ('' if there is none). */
export function itemIconHtml(id: string): string {
  const src = portrait(id);
  if (src)
    return `<span class="icon relic" aria-hidden="true"><img src="${src}" alt="" draggable="false"></span>`;
  const body = ICON_BODIES[id];
  return body ? `<span class="icon" aria-hidden="true">${svg(body)}</span>` : '';
}

/** The Warden's keyring stands for the Keys resource as well as the charm. */
export const keysIcon = (): HTMLElement | null => itemIcon('wardensKeyring');
export const keysIconHtml = (): string => itemIconHtml('wardensKeyring');
