/**
 * Loads the art pack's images. Screens render their plain procedural look first and swap the
 * art in once it has decoded, so a slow network or a missing file never blocks play.
 */
import { ART, ART_CRITICAL, ART_DIR, ART_FILES, type ArtId } from '../content/art';

/**
 * A pack file's URL. Resolved against the page (not the stylesheet) so it also works as a CSS
 * custom property value, under a subpath, and from the service worker's cache.
 */
export function artUrl(file: string): string {
  return new URL(`${import.meta.env.BASE_URL}${ART_DIR}/${file}`, document.baseURI).href;
}

const images = new Map<ArtId, HTMLImageElement>();
const pending = new Map<ArtId, Promise<HTMLImageElement | null>>();

/** The decoded image, or null while it is still loading (or if it failed). */
export function readyArt(id: ArtId): HTMLImageElement | null {
  return images.get(id) ?? null;
}

/** Fetch and decode one image. Resolves null if it can't be loaded (offline, missing). */
export function loadArt(id: ArtId): Promise<HTMLImageElement | null> {
  const have = images.get(id);
  if (have) return Promise.resolve(have);
  let p = pending.get(id);
  if (!p) {
    const img = new Image();
    img.decoding = 'async';
    img.src = artUrl(ART[id].file);
    p = img
      .decode()
      .then(() => {
        images.set(id, img);
        return img;
      })
      .catch(() => {
        pending.delete(id);
        return null;
      });
    pending.set(id, p);
  }
  return p;
}

/** Let go of an image that has been copied into a canvas or texture. */
export function releaseArt(id: ArtId): void {
  images.delete(id);
  pending.delete(id);
}

const idle: (cb: () => void) => void = (cb) =>
  typeof requestIdleCallback === 'function'
    ? requestIdleCallback(() => cb(), { timeout: 2000 })
    : void setTimeout(cb, 50);

/**
 * Load what the title screen and the machine need now, then the rest one file at a time
 * while the browser is idle, and ask the service worker to keep all of it for offline play.
 */
export function startArtLoad(): void {
  // Buttons everywhere wear the plate; stylesheets pick it up from this variable.
  void loadArt('ui/button-plate').then((img) => {
    if (img) document.documentElement.style.setProperty('--bc-button-image', `url("${img.src}")`);
  });
  void Promise.all(ART_CRITICAL.map(loadArt)).then(() => {
    const rest = (Object.keys(ART) as ArtId[]).filter((id) => !ART_CRITICAL.includes(id));
    const next = (): void => {
      const id = rest.shift();
      if (!id) {
        keepOffline();
        return;
      }
      idle(() => void loadArt(id).then(next));
    };
    next();
  });
}

/** Offline play: the service worker fetches every art file it doesn't hold yet. */
function keepOffline(): void {
  if (!('serviceWorker' in navigator)) return;
  void navigator.serviceWorker.ready.then((reg) => {
    reg.active?.postMessage({ type: 'warm-art', urls: ART_FILES.map(artUrl) });
  });
}
