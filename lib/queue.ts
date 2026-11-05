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

/** Shuffle never picks one of this many most recently played songs. */
export const RECENT_LIMIT = 5;

/**
 * How many recent songs to avoid in a folder of `size` songs. Small folders
 * avoid fewer, so shuffle doesn't turn into the same fixed loop every time:
 * a folder needs 10+ songs for the full five.
 */
export function recentWindow(size: number): number {
  return Math.min(RECENT_LIMIT, Math.floor(size / 2));
}

/**
 * Decides which file plays next. In order mode it follows the folder; in
 * shuffle mode it keeps one random order for the folder so that "previous"
 * goes back to the song you actually heard and nothing repeats until every
 * song has played. A shuffled pick also skips the last few songs played
 * (see recentWindow), e.g. after a reshuffle or after you jump back to a
 * song by hand.
 */
export class PlayQueue {
  private order: string[] = [];
  private builtFor = '';
  /** Recently played songs, oldest first. */
  private recent: string[] = [];
  /** The song next()/previous() last chose; anything else was picked by hand. */
  private expected: string | null = null;
  /**
   * Furthest position reached in the order. Positions up to it were already
   * heard, so after "previous" a "next" walks forward through them again
   * instead of picking something new.
   */
  private furthest = -1;

  constructor(private readonly random: () => number = Math.random) {}

  /** The play order currently in use (for tests and debugging). */
  get currentOrder(): readonly string[] {
    return this.order;
  }

  /**
   * Rebuilds the order when the folder or the shuffle setting changes, and
   * records the playing song as recently played.
   */
  sync(trackIds: string[], currentId: string | null, shuffle: boolean): void {
    const key = `${shuffle ? 's' : 'o'}|${trackIds.join(',')}`;
    if (key === this.builtFor) {
      this.observe(currentId);
      return;
    }
    this.builtFor = key;
    this.order = shuffle ? this.shuffled(trackIds, currentId) : [...trackIds];
    this.furthest = currentId ? this.order.indexOf(currentId) : -1;
    this.expected = currentId;
    this.observe(currentId);
  }

  /** Records the song that is playing now. Safe to call repeatedly. */
  observe(currentId: string | null): void {
    if (!currentId) return;
    if (this.recent.at(-1) !== currentId) {
      this.recent = [...this.recent.filter((id) => id !== currentId), currentId].slice(-RECENT_LIMIT);
    }
    if (currentId !== this.expected) {
      // Picked by hand: what came after it in the order isn't history to replay.
      this.expected = currentId;
      this.furthest = this.order.indexOf(currentId);
    }
  }

  /** Like next(), but never changes the order. */
  hasNext(currentId: string | null, settings: PlaybackSettings): boolean {
    if (this.order.length === 0) return false;
    const i = currentId ? this.order.indexOf(currentId) : -1;
    return i < 0 || i + 1 < this.order.length || settings.repeat === 'all';
  }

  next(currentId: string | null, settings: PlaybackSettings): string | null {
    if (this.order.length === 0) return null;
    this.observe(currentId);
    const i = currentId ? this.order.indexOf(currentId) : -1;
    if (i < 0) return this.choose(0, settings);
    if (i + 1 < this.order.length) return this.choose(i + 1, settings);
    if (settings.repeat !== 'all') return null;
    // Finished the whole folder: start over, with a fresh order when shuffling.
    if (settings.shuffle && this.order.length > 1) {
      this.order = this.shuffled(this.order, null);
      this.furthest = -1;
    }
    return this.choose(0, settings);
  }

  previous(currentId: string | null, settings: PlaybackSettings): string | null {
    this.observe(currentId);
    const i = currentId ? this.order.indexOf(currentId) : -1;
    let id: string | null = null;
    if (i > 0) id = this.order[i - 1] ?? null;
    else if (i === 0 && settings.repeat === 'all' && this.order.length > 1) id = this.order.at(-1) ?? null;
    if (id) this.expected = id;
    return id;
  }

  /**
   * Returns the song for position `pos`. When shuffling into songs not heard
   * yet, the first song from `pos` on that wasn't played recently is moved to
   * `pos`, so "previous" still goes back through what was actually heard.
   */
  private choose(pos: number, settings: PlaybackSettings): string | null {
    const window = recentWindow(this.order.length);
    if (settings.shuffle && window > 0 && pos > this.furthest) {
      const avoid = new Set(this.recent.filter((id) => this.order.includes(id)).slice(-window));
      const j = this.order.findIndex((id, k) => k >= pos && !avoid.has(id));
      if (j > pos) this.order.splice(pos, 0, ...this.order.splice(j, 1));
    }
    this.furthest = Math.max(this.furthest, pos);
    const id = this.order[pos] ?? null;
    this.expected = id;
    return id;
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
