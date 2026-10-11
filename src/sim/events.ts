/**
 * Sim events: pooled ring buffer so the hot loop never allocates.
 * Consumers keep their own read cursor (rules read every step, presentation every frame).
 */
export type SimEventType =
  | 'trigger' // id = trigger id, dir = +1/-1 crossing direction, value = ball speed
  | 'pop' // id = bumper id
  | 'sling' // id = sling id
  | 'drop' // id = drop target id, value = index in bank
  | 'dropsReset'
  | 'spin' // id = spinner id, value = half-revolutions counted this step
  | 'chuteEnter'
  | 'chuteFail'
  | 'chuteMade' // value = entry speed
  | 'transportStart' // id = transport id
  | 'transportExit' // id = transport id
  | 'holeCapture'
  | 'holeEject'
  | 'kickback'
  | 'luckyKick'
  | 'drain' // id = cause: 'center' | 'outlaneL' | 'outlaneR' | 'side' | 'tilt'
  | 'launch' // value = speed, dir = 1 auto / 0 manual
  | 'served'
  | 'flipper' // id = flipper id, dir = 1 up / 0 down
  | 'hit' // id = material id, value = approach speed
  | 'flipperHit' // id = flipper id, value = approach speed
  | 'nudge' // x/y = nudge direction
  | 'rescue' // watchdog kick
  | 'reserve' // watchdog gave up and re-served the ball
  | 'escape' // ball left the table (bug)
  | 'diverted'
  | 'locked'
  | 'tilt';

export interface SimEvent {
  type: SimEventType;
  id: string;
  ballId: number;
  dir: number;
  value: number;
  x: number;
  y: number;
  step: number;
}

export class EventRing {
  readonly size: number;
  private readonly buf: SimEvent[];
  /** Total events ever written; the ring index is head % size. */
  head = 0;

  constructor(size = 2048) {
    this.size = size;
    this.buf = [];
    for (let i = 0; i < size; i++)
      this.buf.push({ type: 'hit', id: '', ballId: -1, dir: 0, value: 0, x: 0, y: 0, step: 0 });
  }

  push(
    type: SimEventType,
    id: string,
    ballId: number,
    dir: number,
    value: number,
    x: number,
    y: number,
    step: number,
  ): void {
    const e = this.buf[this.head % this.size];
    e.type = type;
    e.id = id;
    e.ballId = ballId;
    e.dir = dir;
    e.value = value;
    e.x = x;
    e.y = y;
    e.step = step;
    this.head++;
  }

  /** Iterate events written since `cursor`; returns the new cursor. Oldest overwritten events are skipped. */
  read(cursor: number, fn: (e: SimEvent) => void): number {
    let c = Math.max(cursor, this.head - this.size);
    for (; c < this.head; c++) fn(this.buf[c % this.size]);
    return c;
  }

  get(index: number): SimEvent {
    return this.buf[index % this.size];
  }
}
