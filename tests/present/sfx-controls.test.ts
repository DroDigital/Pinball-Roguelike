import { describe, expect, it } from 'vitest';
import { controlCue, UI_CUE_NAMES } from '../../src/present/sfx-controls';
import { SFX, type SfxName } from '../../src/present/sfx-manifest';

describe('control cues', () => {
  it('clicks a toggle on or off by its label', () => {
    expect(controlCue({ textContent: 'On' })).toBe('toggleOn');
    expect(controlCue({ textContent: ' off ' })).toBe('toggleOff');
  });

  it('ticks a Settings stepper and sighs at Back', () => {
    expect(controlCue({ textContent: '+', dataset: { k: 'text-+' } })).toBe('slider');
    expect(controlCue({ textContent: '−', dataset: { k: 'shake-' } })).toBe('slider');
    expect(controlCue({ textContent: 'Back', dataset: { k: 'back' } })).toBe('back');
  });

  it('lets a screen name its cue, and ignores a name that is not a cue', () => {
    expect(controlCue({ textContent: 'Buy', dataset: { cue: 'buy' } })).toBe('buy');
    expect(controlCue({ textContent: 'Buy', dataset: { cue: 'nonsense' } })).toBe('select');
  });

  it('defaults to a plain select', () => {
    expect(controlCue({ textContent: 'Deal' })).toBe('select');
    expect(controlCue({ textContent: null })).toBe('select');
  });

  it('plays every named cue from the bank (ui<Name> in the manifest)', () => {
    for (const name of UI_CUE_NAMES) {
      const sound = `ui${name[0].toUpperCase()}${name.slice(1)}` as SfxName;
      expect(SFX[sound], name).toBeDefined();
    }
  });

  it('lists each cue once', () => {
    expect(UI_CUE_NAMES).toContain('toggleOn');
    expect(new Set(UI_CUE_NAMES).size).toBe(UI_CUE_NAMES.length);
  });
});
