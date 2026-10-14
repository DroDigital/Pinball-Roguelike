/**
 * Registry of the painted artwork: one painter per art id (src/content/art.ts), each drawing
 * edge to edge on a canvas of that id's size.
 */
import type { ArtId } from '../../content/art';
import { paintLogo } from './logo';
import { paintBackglassArt, paintCabinetSide, paintPlayfieldIllustration } from './machine';
import { HUD_PAINTERS } from './hud';
import { METAL_PAINTERS } from './metal';
import { PAPER_PAINTERS } from './sheets';
import type { Ctx } from './kit';

export type Painter = (g: Ctx, w: number, h: number) => void;

export const PAINTERS: Record<ArtId, Painter> = {
  'branding/title-logo': paintLogo,
  'machine/backglass': paintBackglassArt,
  'machine/playfield-illustration': paintPlayfieldIllustration,
  'machine/cabinet-side-art': paintCabinetSide,
  ...HUD_PAINTERS,
  ...METAL_PAINTERS,
  ...PAPER_PAINTERS,
};

/** CSS font shorthands the painters need loaded before they draw type. */
export const ART_FONTS: readonly string[] = [
  '400 40px "Bebas Neue"',
  '600 40px Oswald',
  '400 40px "Saira Stencil One"',
  '400 40px "Special Elite"',
  '400 40px VT323',
  '600 20px Inter',
];
