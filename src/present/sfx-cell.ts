/**
 * The cell around the machine: the telephone, the ATM, the vending cabinet, the door and its
 * lock, chains, knocking through the wall, the trapdoor, glass, and the tray of coins.
 */
import type { Core } from './sfx-core';

export class CellSounds {
  constructor(private readonly a: Core) {}

  /** The bell telephone: two long rings, a pause between. Stops when the handset is lifted. */
  phoneRing(): void {
    this.a.at(0, 'phoneRing');
    this.a.at(2.3, 'phoneRing', { gain: 0.9 });
  }

  phonePick(): void {
    this.a.stop('phoneRing');
    this.a.play('phonePick');
  }

  /** ATM keypad beep; `i` picks the pitch (0..3), otherwise it rotates. */
  private key = 0;
  atmKey(i?: number): void {
    const v = i ?? this.key++ % 4;
    this.a.play('atmKey', { variant: v });
  }

  atmOk(): void {
    this.a.play('atmOk');
  }

  atmNo(): void {
    this.a.play('atmNo');
  }

  /** Coins into the ATM's hopper: the keypad confirms and the bills flick. */
  deposit(): void {
    this.a.play('uiDeposit', { gain: 0.8 });
    this.a.at(0.08, 'cashCount');
    this.a.at(0.06, 'atmOk', { gain: 0.6 });
  }

  /** A loan: the dispenser whirs and the shutter clunks. */
  cashOut(): void {
    this.a.play('cashOut');
  }

  /** The vending cabinet: coin in, the spiral turns, the item drops. */
  vend(): void {
    const a = this.a;
    a.at(0, 'vendCoin');
    a.at(0.38, 'vendSpiral');
    a.at(1.0, 'vendDrop');
  }

  doorClang(gain = 1): void {
    this.a.play('doorClang', { gain });
  }

  doorLock(): void {
    this.a.play('doorLock');
  }

  chain(): void {
    this.a.play('chain');
  }

  creak(): void {
    this.a.play('creak');
  }

  /** Knocking through the wall: n knocks, the last one a beat late like a person unsure. */
  knock(n = 3): void {
    for (let i = 0; i < n; i++) {
      const delay = i * 0.3 + (i === n - 1 && n > 1 ? 0.14 : 0);
      this.a.at(delay, 'knock', { pan: -0.7, gain: 0.85 + (i === n - 1 ? 0.15 : 0) });
    }
  }

  /** The hatch drops: bang, then the long fall. */
  trapdoor(): void {
    const a = this.a;
    a.at(0, 'trapdoor');
    a.at(0.12, 'boom', { gain: 0.7, variant: 1 });
    a.at(0.25, 'fall');
    a.at(0.9, 'toll', { gain: 0.5, variant: 1 });
    a.mix.duck(0.15, 3, 1.5);
  }

  /** Metal giving way (JAILBREAK posts dropping, the wall coming down). */
  clang(): void {
    const a = this.a;
    a.play('doorClang');
    a.at(0.12, 'chain', { gain: 0.6 });
  }

  glassCrack(): void {
    const a = this.a;
    a.play('glassCrack');
    a.at(0.18, 'glassCrack', { gain: 0.6 });
  }

  /** A coin landing in the tray. */
  clatter(): void {
    this.a.play('coinTray', { pan: 0.35, rate: 0.9 + Math.random() * 0.4 });
  }

  /** The coin tray emptying into the pocket: a longer spill. */
  coinSpill(): void {
    this.a.play('coinShower', { gain: 0.6 });
  }

  /** The wall comes down. */
  wallDown(): void {
    const a = this.a;
    a.at(0, 'rubble');
    a.at(0.05, 'boom', { gain: 0.8 });
    a.at(0.3, 'crumble', { gain: 0.8 });
    a.mix.duck(0.2, 2, 1.5);
  }
}
