import type { NowPlaying, TrackRef } from './icedrive-dom';
import type { EqStatus } from './audio-engine';
import type { EqSettings } from './equalizer';
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
  /** Name of the folder open in Icedrive ("" if unknown). */
  folderName: string;
  /** Index into `tracks` of the playing file, or -1. */
  currentIndex: number;
  settings: PlaybackSettings;
  /** Whether "next" has somewhere to go with the current shuffle/repeat settings. */
  hasNext: boolean;
  /** Volume of Icedrive's player, 0..1. */
  volume: number;
  muted: boolean;
  /** Playback speed of Icedrive's player (1 = normal). */
  speed: number;
  eq: EqSettings;
  eqStatus: EqStatus;
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
  /** 0..1 */
  | { type: 'setVolume'; volume: number }
  | { type: 'toggleMute' }
  /** One of PLAYBACK_SPEEDS. */
  | { type: 'setSpeed'; speed: number }
  /** Changes any of the equalizer settings; the rest stay as they are. */
  | { type: 'setEq'; eq: Partial<EqSettings> }
  /** Loads a built-in preset's curve. */
  | { type: 'eqPreset'; preset: string }
  /** Album art as a data: URL (the page's blob: URL can't be shown in the popup). */
  | { type: 'getArt' }
  /** Loudness of `bars` frequency bands for the visualizer (number[] or null in reply). */
  | { type: 'getSpectrum'; bars: number };

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

/** Messages a content script sends to the background service worker. */
export type BackgroundRequest = { type: 'openMiniPlayer' };
