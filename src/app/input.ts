/**
 * Input: keyboard (remappable), gamepad and touch, unified into actions. Button transitions are
 * timestamped so the game loop can apply each one on the exact physics step it happened in.
 */

export type Action =
  | 'left'
  | 'right'
  | 'plunger'
  | 'nudge'
  | 'nudgeLeft'
  | 'nudgeRight'
  | 'lockbar'
  | 'slot1'
  | 'slot2'
  | 'slot3'
  | 'slot4'
  | 'slot5'
  | 'lookLeft'
  | 'lookRight'
  | 'pause'
  | 'confirm'
  | 'back';

export const DEFAULT_BINDINGS: Record<Action, string[]> = {
  left: ['KeyZ', 'ShiftLeft', 'ArrowLeft'],
  right: ['Slash', 'ShiftRight', 'ArrowRight'],
  plunger: ['Space', 'ArrowDown'],
  nudge: ['KeyX'],
  nudgeLeft: ['KeyC'],
  nudgeRight: ['KeyV'],
  lockbar: ['KeyB'],
  slot1: ['Digit1'],
  slot2: ['Digit2'],
  slot3: ['Digit3'],
  slot4: ['Digit4'],
  slot5: ['Digit5'],
  lookLeft: ['KeyA'],
  lookRight: ['KeyD'],
  pause: ['Escape'],
  confirm: ['Enter', 'NumpadEnter'],
  back: ['Backspace'],
};

export interface InputEvent {
  time: number;
  action: Action;
  down: boolean;
}

export class Input {
  bindings: Record<Action, string[]> = structuredClone(DEFAULT_BINDINGS);
  readonly held = new Set<Action>();
  /** Timestamped transitions not yet consumed by the game loop. */
  readonly events: InputEvent[] = [];
  /** Analog plunger from touch/gamepad (0..1), -1 when unused. */
  analogPull = -1;
  /** Callback for UI-level presses (menus). */
  onPress: ((a: Action, e?: KeyboardEvent) => void) | null = null;
  /** Set while the player is rebinding a key. */
  capture: ((code: string) => void) | null = null;
  private keyMap = new Map<string, Action[]>();
  private padHeld = new Set<Action>();
  private touchHeld = new Set<Action>();
  private gamepadIndex = -1;
  vibration = true;

  constructor(private readonly target: HTMLElement) {
    this.rebuildKeyMap();
    window.addEventListener('keydown', (e) => this.key(e, true));
    window.addEventListener('keyup', (e) => this.key(e, false));
    window.addEventListener('blur', () => {
      for (const a of [...this.held]) this.release(a, performance.now());
    });
    window.addEventListener('gamepadconnected', (e) => {
      this.gamepadIndex = (e as GamepadEvent).gamepad.index;
    });
    this.setupTouch();
  }

  rebuildKeyMap(): void {
    this.keyMap.clear();
    for (const [a, codes] of Object.entries(this.bindings) as [Action, string[]][])
      for (const c of codes) this.keyMap.set(c, [...(this.keyMap.get(c) ?? []), a]);
  }

  private key(e: KeyboardEvent, down: boolean): void {
    if (this.capture && down) {
      e.preventDefault();
      const cb = this.capture;
      this.capture = null;
      cb(e.code);
      return;
    }
    const acts = this.keyMap.get(e.code);
    if (!acts) return;
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    e.preventDefault();
    if (e.repeat) return;
    const t = performance.now();
    for (const a of acts) {
      if (down) this.press(a, t, e);
      else this.release(a, t);
    }
  }

  press(a: Action, t: number, e?: KeyboardEvent): void {
    if (this.held.has(a)) return;
    this.held.add(a);
    this.events.push({ time: t, action: a, down: true });
    this.onPress?.(a, e);
  }

  release(a: Action, t: number): void {
    if (!this.held.has(a)) return;
    this.held.delete(a);
    this.events.push({ time: t, action: a, down: false });
  }

  isHeld(a: Action): boolean {
    return this.held.has(a);
  }

  /** Poll the gamepad (call once per frame). */
  pollGamepad(): void {
    const pads = navigator.getGamepads?.() ?? [];
    const pad = pads[this.gamepadIndex] ?? pads.find((p) => p);
    if (!pad) return;
    const t = performance.now();
    const b = (i: number) =>
      (pad.buttons[i]?.pressed ?? false) || (pad.buttons[i]?.value ?? 0) > 0.4;
    const map: [Action, boolean][] = [
      ['left', b(4) || b(6)],
      ['right', b(5) || b(7)],
      ['plunger', b(0)],
      ['lockbar', b(1)],
      ['nudge', b(3)],
      ['nudgeLeft', b(14)],
      ['nudgeRight', b(15)],
      ['pause', b(9)],
      ['back', b(8) || b(1)],
      ['lookLeft', (pad.axes[0] ?? 0) < -0.6],
      ['lookRight', (pad.axes[0] ?? 0) > 0.6],
    ];
    for (const [a, on] of map) {
      if (on && !this.padHeld.has(a)) {
        this.padHeld.add(a);
        this.press(a, t);
      } else if (!on && this.padHeld.has(a)) {
        this.padHeld.delete(a);
        this.release(a, t);
      }
    }
    // Right stick pulled down = analog plunger.
    const ry = pad.axes[3] ?? 0;
    this.analogPull =
      ry > 0.08 ? Math.min(1, ry) : this.touchHeld.has('plunger') ? this.analogPull : -1;
  }

  rumble(strong: number, weak: number, ms: number): void {
    if (!this.vibration) return;
    const pads = navigator.getGamepads?.() ?? [];
    const pad = pads[this.gamepadIndex] ?? pads.find((p) => p);
    const act = (
      pad as unknown as {
        vibrationActuator?: { playEffect: (t: string, o: object) => Promise<unknown> };
      }
    )?.vibrationActuator;
    act
      ?.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak })
      .catch(() => {});
  }

  buzz(ms: number): void {
    if (this.vibration && 'vibrate' in navigator) navigator.vibrate?.(ms);
  }

  // ------------------------------------------------------------------ touch

  /** Touch: screen halves are flippers; drag down in the bottom-right corner to plunge. */
  private setupTouch(): void {
    const el = this.target;
    const owners = new Map<number, Action>();
    let plungeStartY = 0;
    // Taps on menus and on-screen buttons are theirs, not the flippers'.
    const ui = (t: EventTarget | null) =>
      !!(t as HTMLElement | null)?.closest?.('.panel, .touch-lockbar, button');
    const zone = (x: number, y: number): Action => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (x > w * 0.82 && y > h * 0.55) return 'plunger';
      return x < w / 2 ? 'left' : 'right';
    };
    el.addEventListener(
      'touchstart',
      (e) => {
        if (ui(e.target)) return;
        const t = performance.now();
        for (const tc of Array.from(e.changedTouches)) {
          const a = zone(tc.clientX, tc.clientY);
          owners.set(tc.identifier, a);
          if (a === 'plunger') {
            plungeStartY = tc.clientY;
            this.analogPull = 0;
          }
          this.touchHeld.add(a);
          this.press(a, t);
        }
        if (e.touches.length >= 3) this.press('nudge', t);
        e.preventDefault();
      },
      { passive: false },
    );
    el.addEventListener(
      'touchmove',
      (e) => {
        if (ui(e.target)) return;
        for (const tc of Array.from(e.changedTouches)) {
          if (owners.get(tc.identifier) === 'plunger')
            this.analogPull = Math.max(
              0,
              Math.min(1, (tc.clientY - plungeStartY) / (window.innerHeight * 0.3)),
            );
        }
        e.preventDefault();
      },
      { passive: false },
    );
    const end = (e: TouchEvent) => {
      const t = performance.now();
      for (const tc of Array.from(e.changedTouches)) {
        const a = owners.get(tc.identifier);
        owners.delete(tc.identifier);
        if (!a) continue;
        if (![...owners.values()].includes(a)) {
          this.touchHeld.delete(a);
          this.release(a, t);
          if (a === 'plunger') setTimeout(() => (this.analogPull = -1), 30);
        }
      }
      this.release('nudge', t);
    };
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
  }
}
