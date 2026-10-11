/**
 * The Warden's voice: a subtitle line at the bottom of the screen and, if the player turned
 * it on, the browser's speech synthesis pitched low and slow. Reactive lines during play are
 * rate-limited so the Warden comments rather than narrates.
 */
const REACT_COOLDOWN_MS = 12000;
const MS_PER_CHAR = 55;
const MIN_MS = 2600;

export class Subtitles {
  readonly el: HTMLElement;
  private timer = 0;
  private lastReact = -1e9;
  voice = false;
  private chosen: SpeechSynthesisVoice | null = null;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'subtitle';
    parent.append(this.el);
  }

  /** Show (and maybe speak) a line now. `show` false only speaks it (a panel shows it). */
  say(speaker: string, text: string, show = true): void {
    if (this.voice) this.speak(text);
    if (!show) return;
    this.el.replaceChildren();
    // Narration has no speaker label.
    if (speaker) {
      const who = document.createElement('b');
      who.textContent = `${speaker}: `;
      this.el.append(who);
    }
    this.el.append(text);
    this.el.style.opacity = '1';
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(
      () => (this.el.style.opacity = '0'),
      Math.max(MIN_MS, text.length * MS_PER_CHAR),
    );
  }

  /** A reaction to play: dropped if the Warden spoke recently. Returns whether it was said. */
  react(speaker: string, line: () => string, now: number): boolean {
    if (now - this.lastReact < REACT_COOLDOWN_MS) return false;
    this.lastReact = now;
    this.say(speaker, line());
    return true;
  }

  clear(): void {
    window.clearTimeout(this.timer);
    this.el.style.opacity = '0';
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
  }

  private speak(text: string): void {
    if (typeof speechSynthesis === 'undefined') return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (!this.chosen) {
      const voices = speechSynthesis.getVoices();
      this.chosen =
        voices.find((v) => /en-GB/i.test(v.lang) && /male|daniel|george/i.test(v.name)) ??
        voices.find((v) => /^en/i.test(v.lang)) ??
        null;
    }
    if (this.chosen) u.voice = this.chosen;
    u.pitch = 0.35;
    u.rate = 0.82;
    u.volume = 0.9;
    speechSynthesis.speak(u);
  }
}
