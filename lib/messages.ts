import type { NowPlaying, TrackRef } from './icedrive-dom';
import type { PlaybackSettings } from './queue';

/** Snapshot of the player, sent from the content script to the popup. */
export interface PlayerState {
  /** True when Icedrive's audio player is open on the page. */
  active: boolean;
  nowPlaying: NowPlaying | null;
  paused: boolean;
  currentTime: number;
  duration: number;
  /** Audio files in the open folder. */
  tracks: TrackRef[];
  /** Index into `tracks` of the playing file, or -1. */
  currentIndex: number;
  settings: PlaybackSettings;
  /** Whether "next" has somewhere to go with the current shuffle/repeat settings. */
  hasNext: boolean;
}

/** Messages the popup sends to the content script via browser.tabs.sendMessage. */
export type PlayerCommand =
  | { type: 'getState' }
  | { type: 'togglePlay' }
  | { type: 'seek'; time: number }
  | { type: 'next' }
  | { type: 'previous' }
  | { type: 'playTrack'; id: string }
  | { type: 'toggleShuffle' }
  /** off -> all -> one -> off */
  | { type: 'cycleRepeat' }
  /** Album art as a data: URL (the page's blob: URL can't be shown in the popup). */
  | { type: 'getArt' };

export interface ArtResponse {
  /** The page URL this art came from, so the popup can tell when it changes. */
  sourceUrl: string | null;
  dataUrl: string | null;
}

/**
 * Event used between the isolated content script and the MAIN-world bridge,
 * which can call Icedrive's own page functions. `detail` is a JSON string so
 * it crosses the world boundary safely.
 */
export const BRIDGE_EVENT = 'icedrive-music-ext:open-file';

export interface BridgeOpenFile {
  id: string;
  area: string;
}
