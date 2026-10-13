/**
 * Puts a screen on the art pack's printed frames. A panel (or a button, for job tickets)
 * marked `data-skin="<screen>"` gets its children moved into a content window laid over the
 * PNG's content rect. It keeps the plain procedural look until the art has decoded and the
 * viewport leaves enough room; the DOM, handlers and focus order are the same either way.
 */
import {
  ART,
  DENSE_SCREENS,
  HEAD_RECT,
  HUD_FIT,
  HUD_SCREENS,
  SCREEN_ART,
  SKIN_FIT,
  SKIN_FIT_FOR,
  type Rect,
  type ScreenKey,
} from '../content/art';
import { artUrl, loadArt, readyArt } from '../present/art';

/** Dark ink on light paper; the stylesheet switches palette on this. */
const PAPER_INK = '#291c12';
/** Edge of breathing room around a frame, CSS px. */
const FRAME_MARGIN = 16;

const keyOf = (el: HTMLElement): ScreenKey | null => {
  const k = el.dataset.skin;
  return k && k in SCREEN_ART ? (k as ScreenKey) : null;
};

function setRect(el: HTMLElement, prefix: string, r: Rect): void {
  el.style.setProperty(`--${prefix}x`, String(r[0]));
  el.style.setProperty(`--${prefix}y`, String(r[1]));
  el.style.setProperty(`--${prefix}w`, String(r[2]));
  el.style.setProperty(`--${prefix}h`, String(r[3]));
}

/** Skin `root` and every marked element inside it (job tickets live inside a board). */
export function skinTree(root: HTMLElement): void {
  if (root.dataset.skin) skinOne(root);
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('[data-skin]'))) skinOne(el);
}

/** Re-check every skinned element against the viewport (it was resized or rotated). */
export function refitTree(root: HTMLElement): void {
  if (root.dataset.skinned) refit(root);
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('[data-skinned]'))) refit(el);
}

function skinOne(el: HTMLElement): void {
  const key = keyOf(el);
  if (!key || el.dataset.skinned) return;
  el.dataset.skinned = '1';
  const id = SCREEN_ART[key];
  const art = ART[id];
  const inline = el.tagName === 'BUTTON'; // a button may only hold phrasing content

  // The heading goes on the printed label plate when the art has one.
  const headEl = el.querySelector<HTMLElement>(':scope > [data-slot="head"]');
  const headRect = HEAD_RECT[key];
  let head: HTMLElement | null = null;
  if (headEl && headRect) {
    head = document.createElement(inline ? 'span' : 'div');
    head.className = 'bc-skin__head';
    head.append(headEl);
    setRect(el, 'bc-h', headRect);
  }
  const content = document.createElement(inline ? 'span' : 'div');
  content.className = 'bc-skin__content';
  content.append(...Array.from(el.childNodes));
  // Keyboard and flipper focus can land below the fold of a scrolling window.
  content.addEventListener('focusin', (e) => {
    if (e.target instanceof HTMLElement) e.target.scrollIntoView({ block: 'nearest' });
  });
  if (head) el.append(head);
  el.append(content);

  setRect(el, 'bc-', art.content!);
  el.style.setProperty('--bc-ratio', `${art.width} / ${art.height}`);
  el.style.setProperty('--bc-ratio-n', String(art.width / art.height));
  // How much of the canvas is empty above and below the print (frames laid out in a stack trim it).
  el.style.setProperty('--bc-vt', String(art.visible[1] / art.height));
  el.style.setProperty('--bc-vb', String((art.height - art.visible[3]) / art.height));
  el.style.setProperty('--bc-ink', art.ink);
  el.style.setProperty('--bc-image', `url("${artUrl(art.file)}")`);
  el.classList.add(`bc-s-${key}`);
  if (art.ink === PAPER_INK) el.classList.add('bc-light');
  if (DENSE_SCREENS.has(key)) el.classList.add('bc-dense');

  refit(el);
  if (!readyArt(id)) void loadArt(id).then(() => refit(el));
}

function refit(el: HTMLElement): void {
  const key = keyOf(el);
  if (!key) return;
  el.classList.toggle('bc-skin', readyArt(SCREEN_ART[key]) !== null && fits(key));
}

export type HudLayout = 'landscape' | 'portrait' | 'plain';

/** How the HUD is laid out at this viewport size: frames in the gutters, a banner, or text. */
export function hudLayout(): HudLayout {
  if (innerWidth / innerHeight > 1.2)
    return innerWidth >= HUD_FIT.landscape.width && innerHeight >= HUD_FIT.landscape.height
      ? 'landscape'
      : 'plain';
  return innerWidth >= HUD_FIT.portraitMinWidth ? 'portrait' : 'plain';
}

/** Does the frame leave its content window enough room at this viewport size? */
function fits(key: ScreenKey): boolean {
  // A ticket's size comes from its grid cell, not the viewport.
  if (key === 'jobs') return true;
  if (HUD_SCREENS.has(key)) return hudLayout() !== 'plain';
  const art = ART[SCREEN_ART[key]];
  const [, , cw, ch] = art.content!;
  const ratio = art.width / art.height;
  const w = Math.min(innerWidth - FRAME_MARGIN, (innerHeight - FRAME_MARGIN) * ratio);
  const need = SKIN_FIT_FOR[key] ?? (DENSE_SCREENS.has(key) ? SKIN_FIT.dense : SKIN_FIT.normal);
  return w * cw >= need.width && (w / ratio) * ch >= need.height;
}

/**
 * The title heading: plain text until the logo has decoded, then the logo (its alt text is the
 * title, so it reads the same to a screen reader and if the image goes missing).
 */
export function titleLogo(): HTMLElement {
  const h1 = document.createElement('h1');
  h1.className = 'logo';
  h1.dataset.slot = 'head';
  h1.textContent = 'Ball & Chain';
  const swap = (img: HTMLImageElement | null): void => {
    if (!img) return;
    const logo = new Image();
    logo.src = img.src;
    logo.alt = 'Ball & Chain';
    logo.draggable = false;
    h1.replaceChildren(logo);
    h1.classList.add('has-art');
  };
  const have = readyArt('branding/title-logo');
  if (have) swap(have);
  else void loadArt('branding/title-logo').then(swap);
  return h1;
}
