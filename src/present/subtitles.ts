/**
 * The Warden's voice: a caption in the notice slot (see app/notices.ts) and, if the player turned
 * it on, the browser's speech synthesis pitched low and slow. Reactive lines during play are
 * rate-limited so the Warden comments rather than narrates.
 */
import type { Notices } from '../app/notices';

const REACT_COOLDOWN_MS = 12000;
/** Who speaks aloud, and how; narration and sounds ("THE WALL") stay on screen only. */
const VOICES: Record<string, { pitch: number; rate: number }> = {
  'THE WARDEN': { pitch: 0.35, rate: 0.82 },
  'THE RED PHONE': { pitch: 0.15, rate: 0.72 },
  'NEXT DOOR': { pitch: 0.95, rate: 0.85 },
};
const MS_PER_CHAR = 55;
const MIN_MS = 2600;

/** Who is speaking, for the caption's colour (the CSS keys off this class). */
function speakerClass(speaker: string): string {
  if (speaker === 'THE RED PHONE') return 'red';
  if (speaker === 'NEXT DOOR' || speaker === 'THE WALL') return 'wall';
  return speaker ? 'warden' : 'plain';
}

export class Subtitles {
  private lastReact = -1e9;
  voice = false;
  private chosen: SpeechSynthesisVoice | null = null;

  constructor(private readonly notices: Notices) {}

  /** Show (and maybe speak) a line now. `show` false only speaks it (a panel shows it). */
  say(speaker: string, text: string, show = true): void {
    const v = VOICES[speaker];
    if (this.voice && v) this.speak(text, v.pitch, v.rate);
    if (!show) return;
    const el = document.createElement('div');
    el.className = `note caption ${speakerClass(speaker)}`;
    el.setAttribute('role', 'status');
    // Narration has no speaker label.
    if (speaker) {
      const who = document.createElement('b');
      who.className = 'cap-who';
      who.textContent = speaker;
      el.append(who);
    }
    const line = document.createElement('span');
    line.className = 'cap-text';
    line.textContent = text;
    el.append(line);
    // One caption at a time: a new line replaces the last.
    this.notices.post({
      kind: 'caption',
      key: 'caption',
      el,
      ms: Math.max(MIN_MS, text.length * MS_PER_CHAR),
    });
  }

  /** A reaction to play: dropped if the Warden spoke recently. Returns whether it was said. */
  react(speaker: string, line: () => string, now: number): boolean {
    if (now - this.lastReact < REACT_COOLDOWN_MS) return false;
    this.lastReact = now;
    this.say(speaker, line());
    return true;
  }

  clear(): void {
    this.notices.clear('caption');
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
  }

  private speak(text: string, pitch: number, rate: number): void {
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
    u.pitch = pitch;
    u.rate = rate;
    u.volume = 0.9;
    speechSynthesis.speak(u);
  }
}
