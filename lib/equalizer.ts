/**
 * Equalizer settings and presets. Pure data, no Web Audio here, so it can be
 * shared by the content script, the popup and the tests.
 */

/** Centre frequencies of the 10 bands (Hz), like a classic graphic EQ. */
export const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;
export const EQ_BANDS = EQ_FREQUENCIES.length;
/** Range of each band and of the preamp, in dB. */
export const EQ_MIN_DB = -12;
export const EQ_MAX_DB = 12;

export interface EqSettings {
  enabled: boolean;
  /** Id from EQ_PRESETS, or "custom" after moving a band by hand. */
  preset: string;
  /** Gain applied before the bands (dB). Lower it when boosting to avoid clipping. */
  preamp: number;
  /** One gain per band in EQ_FREQUENCIES (dB). */
  gains: number[];
}

export interface EqPreset {
  label: string;
  preamp: number;
  gains: readonly number[];
}

export const CUSTOM_PRESET = 'custom';

/** Built-in presets. Boosting presets lower the preamp so loud songs don't clip. */
export const EQ_PRESETS: Readonly<Record<string, EqPreset>> = {
  flat: { label: 'Flat', preamp: 0, gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  bassBoost: { label: 'Bass boost', preamp: -5, gains: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0] },
  bassReducer: { label: 'Bass reducer', preamp: 0, gains: [-6, -5, -4, -2, 0, 0, 0, 0, 0, 0] },
  trebleBoost: { label: 'Treble boost', preamp: -5, gains: [0, 0, 0, 0, 0, 1, 2, 4, 5, 6] },
  trebleReducer: { label: 'Treble reducer', preamp: 0, gains: [0, 0, 0, 0, 0, -1, -2, -4, -5, -6] },
  vocal: { label: 'Vocal', preamp: -4, gains: [-2, -3, -2, 1, 3, 4, 4, 3, 1, 0] },
  spokenWord: { label: 'Spoken word / podcast', preamp: -4, gains: [-4, -3, -1, 1, 3, 4, 4, 2, 0, -2] },
  rock: { label: 'Rock', preamp: -5, gains: [5, 4, 3, 1, -1, -1, 1, 3, 4, 5] },
  pop: { label: 'Pop', preamp: -4, gains: [-1, 1, 3, 4, 3, 0, -1, -1, 0, 1] },
  dance: { label: 'Dance / electronic', preamp: -5, gains: [6, 5, 2, 0, -2, 1, 1, 2, 4, 5] },
  hipHop: { label: 'Hip-hop', preamp: -5, gains: [5, 5, 3, 2, -1, -1, 1, -1, 2, 3] },
  jazz: { label: 'Jazz', preamp: -3, gains: [3, 2, 1, 2, -1, -1, 0, 1, 2, 3] },
  classical: { label: 'Classical', preamp: -4, gains: [4, 3, 2, 1, -1, -1, 0, 2, 3, 4] },
  acoustic: { label: 'Acoustic', preamp: -3, gains: [4, 3, 2, 1, 1, 1, 2, 3, 3, 2] },
  loudness: { label: 'Loudness', preamp: -5, gains: [6, 4, 1, 0, -1, 0, 0, 1, 4, 5] },
  smallSpeakers: { label: 'Small speakers / laptop', preamp: -5, gains: [0, 6, 5, 3, 1, 0, 0, -1, -1, -2] },
  headphones: { label: 'Headphones', preamp: -3, gains: [3, 2, 1, 0, -1, 0, 1, 2, 3, 2] },
};

export const DEFAULT_EQ: Readonly<EqSettings> = {
  enabled: false,
  preset: 'flat',
  preamp: 0,
  gains: [...EQ_PRESETS.flat!.gains],
};

export function cloneEq(eq: Readonly<EqSettings>): EqSettings {
  return { ...eq, gains: [...eq.gains] };
}

export function isPresetId(value: unknown): value is string {
  return typeof value === 'string' && Object.hasOwn(EQ_PRESETS, value);
}

/** Rounds to 0.5 dB and keeps it within the slider range. */
export function clampDb(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.min(EQ_MAX_DB, Math.max(EQ_MIN_DB, value)) * 2) / 2;
}

/** Settings with the given preset's curve loaded. */
export function applyPreset(eq: Readonly<EqSettings>, presetId: string): EqSettings {
  const preset = EQ_PRESETS[presetId];
  if (!preset) return cloneEq(eq);
  return { ...eq, preset: presetId, preamp: preset.preamp, gains: [...preset.gains] };
}

/** True when the curve does nothing (all bands and the preamp at 0 dB). */
export function isFlat(eq: Readonly<EqSettings>): boolean {
  return eq.preamp === 0 && eq.gains.every((g) => g === 0);
}

/** "1k", "16k", "250" */
export function formatFrequency(hz: number): string {
  return hz >= 1000 ? `${hz / 1000}k` : String(hz);
}

/** "+3", "-4.5", "0" */
export function formatDb(db: number): string {
  return db > 0 ? `+${db}` : String(db);
}
