import { describe, expect, it } from 'vitest';
import {
  applyPreset,
  clampDb,
  DEFAULT_EQ,
  EQ_BANDS,
  EQ_MAX_DB,
  EQ_MIN_DB,
  EQ_PRESETS,
  formatDb,
  formatFrequency,
  isFlat,
} from '../lib/equalizer';
import { isFromIcedriveTab, parseBackgroundRequest, parseCommand, parseEqPatch, sanitizeEq } from '../lib/validate';

describe('presets', () => {
  it('every preset has one gain per band, within range', () => {
    for (const [id, preset] of Object.entries(EQ_PRESETS)) {
      expect(preset.gains, id).toHaveLength(EQ_BANDS);
      for (const g of [...preset.gains, preset.preamp]) {
        expect(g).toBeGreaterThanOrEqual(EQ_MIN_DB);
        expect(g).toBeLessThanOrEqual(EQ_MAX_DB);
      }
    }
  });

  it('presets that boost lower the preamp so loud songs do not clip', () => {
    for (const [id, preset] of Object.entries(EQ_PRESETS)) {
      const maxBoost = Math.max(0, ...preset.gains);
      if (maxBoost >= 4) expect(preset.preamp, id).toBeLessThan(0);
    }
  });

  it('loads a preset curve and keeps the on/off state', () => {
    const eq = applyPreset({ ...DEFAULT_EQ, enabled: true }, 'bassBoost');
    expect(eq).toEqual({ enabled: true, preset: 'bassBoost', preamp: -5, gains: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0] });
    expect(applyPreset(eq, 'nope')).toEqual(eq);
    expect(isFlat(DEFAULT_EQ)).toBe(true);
    expect(isFlat(eq)).toBe(false);
  });

  it('formats labels', () => {
    expect([32, 1000, 16000].map(formatFrequency)).toEqual(['32', '1k', '16k']);
    expect([3, -4.5, 0].map(formatDb)).toEqual(['+3', '-4.5', '0']);
    expect([100, -100, 2.3, Number.NaN].map(clampDb)).toEqual([12, -12, 2.5, 0]);
  });
});

describe('equalizer messages', () => {
  it('accepts volume, mute, preset and equalizer changes', () => {
    expect(parseCommand({ type: 'setVolume', volume: 0.5 })).toEqual({ type: 'setVolume', volume: 0.5 });
    expect(parseCommand({ type: 'toggleMute' })).toEqual({ type: 'toggleMute' });
    expect(parseCommand({ type: 'setSpeed', speed: 1.25 })).toEqual({ type: 'setSpeed', speed: 1.25 });
    expect(parseCommand({ type: 'eqPreset', preset: 'rock' })).toEqual({ type: 'eqPreset', preset: 'rock' });
    expect(parseCommand({ type: 'setEq', eq: { enabled: true } })).toEqual({ type: 'setEq', eq: { enabled: true } });
    expect(parseCommand({ type: 'setEq', eq: { gains: Array(10).fill(30), preamp: -2.2 } })).toEqual({
      type: 'setEq',
      eq: { gains: Array(10).fill(12), preamp: -2 },
    });
  });

  it('rejects malformed ones', () => {
    for (const bad of [
      { type: 'setVolume', volume: 2 },
      { type: 'setVolume', volume: -0.1 },
      { type: 'setVolume', volume: '1' },
      { type: 'setSpeed', speed: 0 },
      { type: 'setSpeed', speed: 16 },
      { type: 'setSpeed', speed: '2' },
      { type: 'eqPreset', preset: 'toString' },
      { type: 'eqPreset', preset: 'custom' },
      { type: 'setEq', eq: {} },
      { type: 'setEq', eq: { enabled: 'yes' } },
      { type: 'setEq', eq: { gains: [1, 2, 3] } },
      { type: 'setEq', eq: { gains: Array(10).fill(Number.NaN) } },
      { type: 'setEq', eq: { preset: '__proto__' } },
    ])
      expect(parseCommand(bad), JSON.stringify(bad)).toBeNull();
    expect(parseEqPatch(null)).toBeNull();
  });

  it('sanitizes stored settings field by field', () => {
    expect(sanitizeEq(undefined)).toEqual(DEFAULT_EQ);
    expect(sanitizeEq({ enabled: true, preset: 'custom', preamp: 'x', gains: Array(10).fill(1) })).toEqual({
      enabled: true,
      preset: 'custom',
      preamp: 0,
      gains: Array(10).fill(1),
    });
  });

  it('only lets content scripts on Icedrive open the mini player', () => {
    const tab = { id: 1 };
    expect(parseBackgroundRequest({ type: 'openMiniPlayer' })).toEqual({ type: 'openMiniPlayer' });
    expect(parseBackgroundRequest({ type: 'other' })).toBeNull();
    expect(isFromIcedriveTab({ id: 'ext', tab, url: 'https://icedrive.net/dashboard' }, 'ext')).toBe(true);
    expect(isFromIcedriveTab({ id: 'ext', tab, url: 'https://evil.example/' }, 'ext')).toBe(false);
    expect(isFromIcedriveTab({ id: 'ext', tab, url: 'http://icedrive.net/' }, 'ext')).toBe(false);
    expect(isFromIcedriveTab({ id: 'other', tab, url: 'https://icedrive.net/' }, 'ext')).toBe(false);
    expect(isFromIcedriveTab({ id: 'ext', url: 'https://icedrive.net/' }, 'ext')).toBe(false);
  });
});
