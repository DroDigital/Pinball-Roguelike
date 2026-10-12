/**
 * Inline SVG icons (24x24, drawn with currentColor so a CSS colour tints them). Used for the
 * currencies, the HUD and the screens; no external assets.
 */
const PATHS = {
  coin: `<circle cx="12" cy="12" r="9.6" fill="currentColor"/>
    <circle cx="12" cy="12" r="6.4" fill="none" stroke="#000" stroke-opacity=".3" stroke-width="1.7"/>
    <path d="M9.2 8.6a4.6 4.6 0 0 1 3.4-1.3" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.5" stroke-linecap="round"/>`,
  ticket: `<path fill="currentColor" d="M4 5H20A2 2 0 0 1 22 7V9.6A2.4 2.4 0 0 0 22 14.4V17A2 2 0 0 1 20 19H4A2 2 0 0 1 2 17V14.4A2.4 2.4 0 0 0 2 9.6V7A2 2 0 0 1 4 5Z"/>
    <path d="M14.6 7.2v9.6" stroke="#000" stroke-opacity=".32" stroke-width="1.5" stroke-dasharray="1.7 1.7"/>`,
  key: `<circle cx="7.6" cy="12" r="4.3" fill="none" stroke="currentColor" stroke-width="2.7"/>
    <path d="M11.6 12h9.6M17.6 12v3.6M20.8 12v2.6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>`,
  ball: `<circle cx="12" cy="12" r="9.6" fill="currentColor"/>
    <path d="M7.4 8.4a6 6 0 0 1 4.4-2.6" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="1.9" stroke-linecap="round"/>`,
  lock: `<rect x="5.2" y="10.4" width="13.6" height="10.2" rx="2.2" fill="currentColor"/>
    <path d="M8.4 10.4V8a3.6 3.6 0 0 1 7.2 0v2.4" fill="none" stroke="currentColor" stroke-width="2.1"/>
    <circle cx="12" cy="15.2" r="1.5" fill="#000" fill-opacity=".42"/>`,
  clock: `<circle cx="12" cy="12" r="8.8" fill="none" stroke="currentColor" stroke-width="2.1"/>
    <path d="M12 6.8V12l3.6 2.2" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>`,
  debt: `<ellipse cx="5.8" cy="5.8" rx="4" ry="2.3" transform="rotate(45 5.8 5.8)" fill="none" stroke="currentColor" stroke-width="1.8"/>
    <path d="M9.6 9.6l2.2 2.2" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
    <circle cx="16.4" cy="16.4" r="6" fill="currentColor"/>
    <path d="M13 14.2a4 4 0 0 1 3-1.8" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1.5" stroke-linecap="round"/>`,
  bank: `<path d="M3.2 9.2L12 4l8.8 5.2" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="M6 11v6.2M10 11v6.2M14 11v6.2M18 11v6.2M4 19.4h16" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/>`,
  pocket: `<path d="M9 3.6h6l-1.5 3.2h-3z" fill="currentColor"/>
    <path d="M12 7c5 0 8 3.3 8 7.1 0 3.8-3 6.4-8 6.4s-8-2.6-8-6.4C4 10.3 7 7 12 7z" fill="currentColor"/>
    <path d="M12 11.4v5.4M10.2 12.8c0-.9.8-1.4 1.8-1.4s1.8.5 1.8 1.4" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="1.4" stroke-linecap="round"/>`,
  job: `<rect x="5" y="4.8" width="14" height="15.8" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>
    <rect x="8.4" y="2.8" width="7.2" height="3.8" rx="1" fill="currentColor"/>
    <path d="M8.6 11h6.8M8.6 15h4.6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>`,
  star: `<path fill="currentColor" d="M12 2.6l2.5 5.2 5.7.8-4.1 4 1 5.7L12 15.6 6.9 18.3l1-5.7-4.1-4 5.7-.8z"/>`,
  box: `<path d="M3.6 8.2L12 4l8.4 4.2v8.2L12 20.6l-8.4-4.2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
    <path d="M3.6 8.2L12 12.4l8.4-4.2M12 12.4v8.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>`,
  phone: `<path fill="currentColor" d="M6.6 3.6l3 .9 1 4-2.1 1.5a11.4 11.4 0 0 0 5 5l1.5-2.1 4 1 .9 3c.3 1.2-.7 2.6-2.4 2.6C10.2 19.5 4.5 13.8 4.5 6c0-1.7 1.5-2.7 2.1-2.4z"/>`,
  devil: `<path d="M5.2 3.4c.4 3.2 1.6 5.2 3.7 6.2M18.8 3.4c-.4 3.2-1.6 5.2-3.7 6.2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
    <circle cx="12" cy="14.2" r="7" fill="currentColor"/>
    <path d="M8.6 13.2l2 .9M15.4 13.2l-2 .9M9.6 17.6c1.4 1 3.4 1 4.8 0" fill="none" stroke="#000" stroke-opacity=".55" stroke-width="1.5" stroke-linecap="round"/>`,
  check: `<path d="M5 12.6l4.4 4.4L19 7.4" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>`,
  cross: `<path d="M6.4 6.4l11.2 11.2M17.6 6.4L6.4 17.6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>`,
  plus: `<path d="M12 5.4v13.2M5.4 12h13.2" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/>`,
  minus: `<path d="M5.4 12h13.2" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/>`,
  warn: `<path d="M12 3.6l9.4 16.2H2.6z" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round"/>
    <path d="M12 9.8v4.6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="17.1" r="1.2" fill="currentColor"/>`,
  trophy: `<path d="M7.4 4h9.2v5.2a4.6 4.6 0 0 1-9.2 0z" fill="currentColor"/>
    <path d="M7.4 5.8H4.4c0 3 1.2 4.6 3.4 4.8M16.6 5.8h3c0 3-1.2 4.6-3.4 4.8M12 13.8V18M8.4 20.2h7.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
  up: `<path d="M12 19V6M6.4 11.4L12 5.8l5.6 5.6" fill="none" stroke="currentColor" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round"/>`,
  reroll: `<path d="M19.4 11.2A7.4 7.4 0 0 0 6.2 7.4M4.6 12.8a7.4 7.4 0 0 0 13.2 3.8" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"/>
    <path d="M6.6 3.6v4.2h4.2M17.4 20.4v-4.2h-4.2" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>`,
  chevron: `<path d="M9 5.6l6.4 6.4L9 18.4" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>`,
  gear: `<circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="2.1"/>
    <path d="M12 2.8v3M12 18.2v3M2.8 12h3M18.2 12h3M5.5 5.5l2.1 2.1M16.4 16.4l2.1 2.1M18.5 5.5l-2.1 2.1M7.6 16.4l-2.1 2.1" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/>`,
  pause: `<rect x="6.2" y="5" width="4" height="14" rx="1.1" fill="currentColor"/><rect x="13.8" y="5" width="4" height="14" rx="1.1" fill="currentColor"/>`,
  shield: `<path d="M12 3l7.4 2.8v5.6c0 4.6-3.1 8.2-7.4 9.8-4.3-1.6-7.4-5.2-7.4-9.8V5.8z" fill="currentColor"/>`,
  bolt: `<path d="M13.4 2.6L5.2 13.4h5.4l-1.2 8 8.2-10.8h-5.4z" fill="currentColor"/>`,
  eye: `<path d="M2.6 12S6 6.2 12 6.2 21.4 12 21.4 12 18 17.8 12 17.8 2.6 12 2.6 12z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="12" cy="12" r="2.8" fill="currentColor"/>`,
} as const;

export type IconName = keyof typeof PATHS;

export function iconSvg(name: IconName): string {
  return `<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">${PATHS[name]}</svg>`;
}

/** An icon element; size and colour come from CSS (`.ico`). */
export function icon(name: IconName, cls = ''): HTMLElement {
  const el = document.createElement('span');
  el.className = `ico ico-${name}${cls ? ` ${cls}` : ''}`;
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = iconSvg(name);
  return el;
}
