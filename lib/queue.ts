export type RepeatMode = 'off' | 'all' | 'one';

export interface PlaybackSettings {
  shuffle: boolean;
  repeat: RepeatMode;
}

export const DEFAULT_SETTINGS: PlaybackSettings = { shuffle: false, repeat: 'off' };

/** off -> all -> one -> off, like most music players. */
export function nextRepeatMode(mode: RepeatMode): RepeatMode {
  return mode === 'off' ? 'all' : mode === 'all' ? 'one' : 'off';
}

/**
 * Decides which file plays next. In order mode it follows the folder; in
 * shuffle mode it keeps one random order for the folder so that "previous"
 * goes back to the song you actually heard and nothing repeats until every
 * song has played.
 */
export class PlayQueue {
  private order: string[] = [];
  private builtFor = '';

  constructor(private readonly random: () => number = Math.random) {}

  /** The play order currently in use (for tests and debugging). */
  get currentOrder(): readonly string[] {
    return this.order;
  }

  /** Rebuilds the order when the folder or the shuffle setting changes. */
  sync(trackIds: string[], currentId: string | null, shuffle: boolean): void {
    const key = `${shuffle ? 's' : 'o'}|${trackIds.join(',')}`;
    if (key === this.builtFor) return;
    this.builtFor = key;
    this.order = shuffle ? this.shuffled(trackIds, currentId) : [...trackIds];
  }

  /** Like next(), but never changes the order. */
  hasNext(currentId: string | null, settings: PlaybackSettings): boolean {
    if (this.order.length === 0) return false;
    const i = currentId ? this.order.indexOf(currentId) : -1;
    return i < 0 || i + 1 < this.order.length || settings.repeat === 'all';
  }

  next(currentId: string | null, settings: PlaybackSettings): string | null {
    if (this.order.length === 0) return null;
    const i = currentId ? this.order.indexOf(currentId) : -1;
    if (i < 0) return this.order[0] ?? null;
    if (i + 1 < this.order.length) return this.order[i + 1] ?? null;
    if (settings.repeat !== 'all') return null;
    // Finished the whole folder: start over, with a fresh order when shuffling.
    if (settings.shuffle && this.order.length > 1) {
      const fresh = this.shuffled(this.order, null);
      // Don't play the song that just ended again straight away.
      if (fresh[0] === currentId) fresh.push(fresh.shift()!);
      this.order = fresh;
    }
    return this.order[0] ?? null;
  }

  previous(currentId: string | null, settings: PlaybackSettings): string | null {
    const i = currentId ? this.order.indexOf(currentId) : -1;
    if (i > 0) return this.order[i - 1] ?? null;
    if (i === 0 && settings.repeat === 'all' && this.order.length > 1) return this.order.at(-1) ?? null;
    return null;
  }

  /** Fisher–Yates shuffle, with the playing song kept first. */
  private shuffled(ids: readonly string[], firstId: string | null): string[] {
    const rest = ids.filter((id) => id !== firstId);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j]!, rest[i]!];
    }
    return firstId && ids.includes(firstId) ? [firstId, ...rest] : rest;
  }
}
