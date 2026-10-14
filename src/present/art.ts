/**
 * Paints the app's artwork (src/present/artwork) once, on demand, and keeps the result as an
 * image. Nothing is fetched: a frame is a few milliseconds of canvas drawing, turned into a PNG
 * blob so CSS backgrounds, textures and canvases can all use it. Screens render their plain
 * look first and swap the art in once it is ready.
 */
import { ART, ART_CRITICAL, type ArtId } from '../content/art';
import { ART_FONTS, PAINTERS } from './artwork';

const images = new Map<ArtId, HTMLImageElement>();
const pending = new Map<ArtId, Promise<HTMLImageElement | null>>();

/** The painted image, or null while it is still being made (or if it failed). */
export function readyArt(id: ArtId): HTMLImageElement | null {
  return images.get(id) ?? null;
}

let fonts: Promise<unknown> | null = null;

/** The painters write live type (plates, the logo): wait for the faces they use. */
function fontsReady(): Promise<unknown> {
  fonts ??= Promise.all(ART_FONTS.map((f) => document.fonts.load(f))).catch(() => undefined);
  return fonts;
}

/** Paint one image. Resolves null if the browser can't make it. */
export function loadArt(id: ArtId): Promise<HTMLImageElement | null> {
  const have = images.get(id);
  if (have) return Promise.resolve(have);
  let p = pending.get(id);
  if (!p) {
    p = paint(id).catch(() => {
      pending.delete(id);
      return null;
    });
    pending.set(id, p);
  }
  return p;
}

async function paint(id: ArtId): Promise<HTMLImageElement> {
  await fontsReady();
  const { width, height } = ART[id];
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  PAINTERS[id](canvas.getContext('2d')!, width, height);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
  if (!blob) throw new Error(`could not encode ${id}`);
  const img = new Image();
  img.decoding = 'async';
  img.src = URL.createObjectURL(blob);
  await img.decode();
  images.set(id, img);
  return img;
}

/** Let go of an image that has been copied into a canvas or texture. */
export function releaseArt(id: ArtId): void {
  const img = images.get(id);
  if (img) URL.revokeObjectURL(img.src);
  images.delete(id);
  pending.delete(id);
}

/** Paint what the title screen and the machine need now, then the rest while the browser is idle. */
export function startArtLoad(): void {
  void Promise.all(ART_CRITICAL.map(loadArt)).then(() => {
    const rest = (Object.keys(ART) as ArtId[]).filter((id) => !ART_CRITICAL.includes(id));
    const idle = (cb: () => void): void =>
      'requestIdleCallback' in window ? void requestIdleCallback(cb) : void setTimeout(cb, 50);
    const next = (): void => {
      const id = rest.shift();
      if (!id) return;
      void loadArt(id).then(() => idle(next));
    };
    idle(next);
  });
}
