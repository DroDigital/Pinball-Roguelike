import type { P2 } from '../core/math';

/** Physical material ids; restitution/friction per material live in balance.ts. */
export type MaterialId =
  | 'wood'
  | 'metal'
  | 'rubber'
  | 'plastic'
  | 'post'
  | 'drop'
  | 'sling'
  | 'pop'
  | 'flipper';

export type Look = 'cabinet' | 'guide' | 'block' | 'rail' | 'lane' | 'apron' | 'invisible' | 'plug';

export interface WallDef {
  id: string;
  pts: P2[];
  loop?: boolean;
  mat: MaterialId;
  look: Look;
  /** Render height of the wall (units). */
  h?: number;
  /** Walls with a tag are only built when that tag is enabled for the ball (mounts, sentences, contraband). */
  tag?: string;
}

export interface PostDef {
  id: string;
  x: number;
  y: number;
  r: number;
  mat: MaterialId;
  tag?: string;
}

export interface FlipperDef {
  id: string;
  x: number;
  y: number;
  /** Distance between base and tip circle centres. */
  len: number;
  r0: number;
  r1: number;
  /** Angles in degrees of the flipper axis from +x (left flippers) or -x mirrored (right flippers). */
  restDeg: number;
  upDeg: number;
  side: 'left' | 'right';
  button: 'left' | 'right';
  tag?: string;
}

export interface BumperDef {
  id: string;
  x: number;
  y: number;
  r: number;
  tag?: string;
}

/** Slingshot: rubber kick face a->b, c is the back corner. Posts sit on all three corners. */
export interface SlingDef {
  id: string;
  side: 'left' | 'right';
  a: P2;
  b: P2;
  c: P2;
  postR: number;
}

/** A drop target face segment; the scoring face is on the left of a->b. */
export interface DropTargetDef {
  id: string;
  a: P2;
  b: P2;
}

export interface DropBankDef {
  id: string;
  targets: DropTargetDef[];
}

/** A line the ball crosses. Crossing reports dir +1 when moving to the left side of a->b. */
export interface TriggerDef {
  id: string;
  a: P2;
  b: P2;
}

export interface SpinnerDef {
  id: string;
  a: P2;
  b: P2;
}

/** A one-way wall: blocks balls whose centre is on the left side of a->b. */
export interface OneWayDef {
  id: string;
  a: P2;
  b: P2;
  mat: MaterialId;
}

/** A 3D wire/ramp path the ball leaves the 2D world to ride. */
export interface TransportDef {
  id: string;
  /** (x, y, z) control points; z is height above playfield. */
  path: [number, number, number][];
  /** Where the ball is set down and with what velocity. */
  exit: P2;
  exitVel: P2;
  /** Ride time in seconds at the reference speed (scaled by entry speed within limits). */
  time: number;
  /** Visual style for presentation. */
  look: 'ramp' | 'wire' | 'subway';
}

export interface ChuteDef {
  /** Entrance channel polygon where the incline decelerates the ball. */
  incline: P2[];
  /** Unit downhill direction inside the incline. */
  downhill: P2;
  mouth: TriggerDef;
  commit: TriggerDef;
  transport: string;
}

export interface HoleDef {
  id: string;
  x: number;
  y: number;
  /** Capture when the ball centre is within this radius of (x, y). */
  captureR: number;
  /** Bolt wall (Bolted Hole) has this tag. */
  boltTag: string;
  transport: string;
}

export interface PlungerDef {
  x: number;
  y: number;
  /** Shooter lane bounds (for "ball at rest in shooter lane" checks). */
  minX: number;
  maxX: number;
  maxY: number;
}

export interface KickbackDef {
  id: string;
  trigger: TriggerDef;
  x: number;
  y: number;
}

export interface DiverterDef {
  trigger: TriggerDef;
  transport: string;
}

/** A trigger that sends balls crossing it (positive direction) onto a transport. */
export interface ReturnDef {
  trigger: TriggerDef;
  transport: string;
}

export interface MountDef {
  id: string;
  kind: 'post' | 'bumper' | 'flipper' | 'gold';
  /** The tag enabled when this mount is filled. */
  tag: string;
  /** For 'gold': the bumper id it upgrades. */
  ref?: string;
}

export type LampColor =
  | 'red'
  | 'amber'
  | 'yellow'
  | 'white'
  | 'blue'
  | 'green'
  | 'orange'
  | 'violet';

export interface LampDef {
  id: string;
  x: number;
  y: number;
  shape: 'circle' | 'arrow' | 'triangle' | 'rect' | 'star' | 'key';
  size: number;
  /** Rotation in degrees (arrow points along +x at 0). */
  rot: number;
  color: LampColor;
  label?: string;
}

/** Logical shot types used by rules and shot levels. */
export type ShotType =
  | 'yard'
  | 'sling'
  | 'lanes'
  | 'cellblock'
  | 'chute'
  | 'perimeter'
  | 'searchlight'
  | 'hole';

export interface TableDef {
  name: string;
  width: number;
  height: number;
  walls: WallDef[];
  posts: PostDef[];
  oneWays: OneWayDef[];
  flippers: FlipperDef[];
  bumpers: BumperDef[];
  slings: SlingDef[];
  dropBanks: DropBankDef[];
  spinners: SpinnerDef[];
  triggers: TriggerDef[];
  transports: TransportDef[];
  chute: ChuteDef;
  hole: HoleDef;
  plunger: PlungerDef;
  kickback: KickbackDef;
  diverter: DiverterDef;
  /** Wire returns: balls crossing these triggers (positive dir) ride the transport. */
  returns: ReturnDef[];
  /** Balls below this y are drained. */
  drainY: number;
  /** The table boundary polygon; a ball centre outside it has escaped. */
  bounds: P2[];
  mounts: MountDef[];
  lamps: LampDef[];
  /** Points where the watchdog may legitimately find a resting ball (cradles, shooter lane). */
  restSpots: { x: number; y: number; r: number }[];
}
