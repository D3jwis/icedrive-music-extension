/** Playback speeds offered, the same list as Icedrive's own player (Plyr). */
export const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 4] as const;

export function isPlaybackSpeed(value: unknown): value is number {
  return typeof value === 'number' && (PLAYBACK_SPEEDS as readonly number[]).includes(value);
}

/** "1×", "1.25×", "0.5×" */
export function formatSpeed(speed: number): string {
  return `${speed}×`;
}
