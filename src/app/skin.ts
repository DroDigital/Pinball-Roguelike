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
  SCREEN_ART,
  type Rect,
  type ScreenKey,
} from '../content/art';
import { loadArt, readyArt } from '../present/art';

/** Dark ink on light paper; the stylesheet switches palette on this. */
const PAPER_INK = '#291c12';

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
  el.style.setProperty('--bc-vt', '0');
  el.style.setProperty('--bc-vb', '0');
  el.style.setProperty('--bc-ink', art.ink);
  el.classList.add(`bc-s-${key}`);
  if (art.ink === PAPER_INK) el.classList.add('bc-light');
  if (DENSE_SCREENS.has(key)) el.classList.add('bc-dense');

  refit(el);
}

/**
 * The painted frames are retired: every screen and ticket wears the CSS housing in ui.css.
 * The content/head wrappers stay (screens rely on them for scrolling and focus), and so do
 * the `bc-light` / `bc-dense` classes the stylesheet keys off.
 */
function refit(el: HTMLElement): void {
  el.classList.remove('bc-skin');
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
