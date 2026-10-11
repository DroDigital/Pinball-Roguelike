/**
 * Every gameplay tunable lives here. Geometry lives in table.ts.
 * Units: lengths in ball diameters (27 mm), time in seconds, speeds in units/s.
 */

export const PHYSICS = {
  hz: 240,
  velocityIterations: 8,
  positionIterations: 3,
  /** Slope component of gravity along -y. */
  slopeGravity: 20,
  ballRadius: 0.5,
  ballDensity: 1,
  /** Air drag (proportional). Rolling losses are modelled separately as a constant decel. */
  ballLinearDamping: 0.03,
  /** Constant rolling resistance (units/s^2), ~9% of slope gravity like a real ball. */
  rollingResistance: 2.2,
  ballAngularDamping: 1.5,
  /** Hard cap on ball speed (kept far below maxTranslation * hz = 480). */
  maxBallSpeed: 150,
  ballBallRestitution: 0.85,
  ballBallFriction: 0.05,
};

export interface MaterialProps {
  restitution: number;
  friction: number;
  /** Rubber gets deader at high impact speed: e = restitution * (1 - speedLoss * min(1, v / 80)). */
  speedLoss: number;
}

export const MATERIALS: Record<string, MaterialProps> = {
  wood: { restitution: 0.45, friction: 0.1, speedLoss: 0.1 },
  metal: { restitution: 0.42, friction: 0.08, speedLoss: 0.1 },
  plastic: { restitution: 0.42, friction: 0.1, speedLoss: 0.1 },
  rubber: { restitution: 0.72, friction: 0.25, speedLoss: 0.35 },
  post: { restitution: 0.6, friction: 0.25, speedLoss: 0.35 },
  drop: { restitution: 0.3, friction: 0.15, speedLoss: 0 },
  sling: { restitution: 0.7, friction: 0.2, speedLoss: 0.3 },
  pop: { restitution: 0.4, friction: 0.1, speedLoss: 0 },
  flipper: { restitution: 0.55, friction: 0.55, speedLoss: 0.3 },
};

export const FLIPPER = {
  density: 2.2,
  /** Motor speed while stroking / holding (rad/s). */
  strokeSpeed: 20,
  /** Torque while stroking, before end-of-stroke. */
  strokeTorque: 24000,
  /** Weaker hold torque once end-of-stroke is reached (lets impacts push the flipper). */
  holdTorque: 3500,
  /** Return spring. */
  returnSpeed: 28,
  returnTorque: 9000,
  /** Fraction of the stroke at which the EOS switch opens. */
  eosFraction: 0.97,
  /** Rubber restitution at the base and at the tip (interpolated along the bat). */
  baseRestitution: 0.32,
  tipRestitution: 0.62,
  friction: 0.55,
};

export const KICKERS = {
  /** Pop bumper: outward normal speed after a hit. */
  popKickSpeed: 21,
  popCooldown: 0.07,
  /** Slingshot: minimum approach speed into the face to fire, and the kick speed. */
  slingThreshold: 2.5,
  slingKickSpeed: 14,
  /** +- fractional variation of pop/sling kick strength, and sling kick angle jitter (deg). */
  kickVariance: 0.12,
  slingAngleJitter: 5,
  /** Rotate sling kicks down toward the opposite flipper (deg). */
  slingKickTilt: 12,
  slingTangentKeep: 0.75,
  slingCooldown: 0.12,
  /** Kickback launch speed (straight up the outlane). */
  kickbackSpeed: 40,
  /** Lucky bounce: an outlaned ball kicked back into play. */
  luckyKickSpeed: 33,
  /** Spinner: revolutions per unit of ball speed, and decay. */
  spinnerGain: 0.11,
  spinnerDrag: 2.2,
  spinnerBallSpeedKeep: 0.96,
  /** Drop targets: minimum normal impact speed to knock one down. */
  dropThreshold: 3,
};

export const PLUNGER = {
  /** Seconds to reach full pull while holding. */
  pullTime: 1.0,
  /**
   * Pull (0..1) -> speed the ball should have when it leaves the top of the shooter lane.
   * Piecewise linear; the middle band is stretched so each top lane gets a fair window.
   * Launch speed is derived from this and the climb, so it stays right if gravity changes.
   */
  exitCurve: [
    [0, 0],
    [0.2, 14],
    [0.55, 22.0],
    [0.85, 27.3],
    [1, 32.4],
  ] as [number, number][],
  /** Height the ball climbs from the plunger to the shooter lane exit. */
  climb: 25.75,
  /** Compensation for rolling losses on the way up. */
  lossComp: 1.015,
  /** Pull centred on each top lane's window (A, B, C) for the Roll Call skill shot. */
  lanePull: [0.805, 0.715, 0.605] as [number, number, number],
  /** Pull used for auto-launches (ball save, multiball): a full orbit to the right flipper. */
  autoPull: 0.92,
  /** Ball counts as resting in the shooter lane below this speed. */
  restSpeed: 1.5,
};

export const CHUTE = {
  /** Extra downhill acceleration inside the entrance incline. */
  inclineAccel: 110,
  /** Ride time scales with entry speed: time * clamp(refSpeed / speed, 0.75, 1.3). */
  refSpeed: 45,
};

export const HOLE = {
  /** How long the Hole holds a ball before ejecting (s). */
  holdTime: 1.6,
};

export const NUDGE = {
  /** Velocity change applied to every ball by a nudge. */
  strength: 6,
  sideStrength: 4.5,
  /** Nudges can't be spammed faster than this. */
  cooldown: 0.25,
};

export const TILT = {
  /** Meter added per nudge; warning at 1.0. */
  perNudge: 0.42,
  /** Decay per second. */
  decay: 0.28,
  /** After a warning the meter drops to this. */
  afterWarning: 0.45,
  warnings: 2,
};

export const WATCHDOG = {
  /** A field ball slower than this for `stuckTime` seconds outside a rest spot is stuck. */
  stuckSpeed: 0.8,
  stuckTime: 3.0,
  rescueSpeed: 10,
  /** After this many rescues without leaving the spot, the ball is re-served. */
  maxRescues: 3,
};

export const BALL = {
  /** Ball save duration from the first playfield switch. */
  ballSave: 8,
  /** Grace after ball save ends during which a drain is still saved (feel). */
  ballSaveGrace: 0.5,
  /** A drain cause is attributed to an outlane/centre trigger crossed within this window. */
  drainCauseWindow: 3,
};

/** Base coin values at shot level 1 (each level adds +50%). */
export const SCORE = {
  pop: 0.3,
  sling: 0.15,
  lane: 0.4,
  laneSet: 2,
  inlane: 0.2,
  outlane: 1,
  drop: 0.8,
  cellBlock: 3,
  chute: 2.5,
  perimeter: 2,
  searchlightSpin: 0.06,
  hole: 2.5,
  skillShot: 4,
  superSkillShot: 10,
  /** Each shot level adds this fraction of base value. */
  levelStep: 0.5,
};

export const ECONOMY = {
  startCoins: 15,
  startDebt: 75,
  debtGrowth: 2.4,
  deadlines: 8,
  roundsPerDeadline: 3,
  maxBallsPerRound: 5,
  ballPriceBase: 3,
  /** Ball price added per deadline after the first. */
  ballPricePerDeadline: 2,
  interest: 0.1,
};
