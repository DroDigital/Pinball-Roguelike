/**
 * Table <-> world mapping. Table space: x right, y up the table (units = ball diameters).
 * World space (Three.js): x right, y up (height above playfield), z toward the player.
 * The playfield is centred on the origin; the whole table group is then tilted in scene.ts.
 */
import { TABLE } from '../content/table';

export const TW = TABLE.width;
export const TH = TABLE.height;
export const CX = TW / 2;
export const CY = TH / 2;

export function wx(x: number): number {
  return x - CX;
}

export function wz(y: number): number {
  return -(y - CY);
}

/** Table angle (radians, CCW in table space) -> rotation about world Y. */
export function wrot(a: number): number {
  return a;
}
