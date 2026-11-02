import {
  findAudio,
  findCurrentIndex,
  isPreviewOpen,
  listTracks,
  readNowPlaying,
  type TrackRef,
} from './icedrive-dom';
import { BRIDGE_EVENT, type BridgeOpenFile, type PlayerCommand, type PlayerState } from './messages';
import { DEFAULT_SETTINGS, nextRepeatMode, PlayQueue, type PlaybackSettings } from './queue';

/** Going "previous" after this many seconds restarts the song instead. */
const RESTART_THRESHOLD_S = 3;

/**
 * Reads and drives Icedrive's player from the content script. Works on the
 * live DOM; opening another file is delegated to the MAIN-world bridge,
 * because only page scripts can call Icedrive's previewItem().
 */
export class PlayerController {
  private settings: PlaybackSettings = { ...DEFAULT_SETTINGS };
  private readonly queue: PlayQueue;
  /** Called after the user changes shuffle/repeat, so the caller can save them. */
  onSettingsChange?: (settings: PlaybackSettings) => void;

  constructor(
    private readonly doc: Document = document,
    random: () => number = Math.random,
  ) {
    this.queue = new PlayQueue(random);
  }

  getSettings(): PlaybackSettings {
    return { ...this.settings };
  }

  /** Applies saved settings (does not call onSettingsChange). */
  setSettings(settings: Partial<PlaybackSettings>): void {
    this.settings = { ...this.settings, ...settings };
  }

  getState(): PlayerState {
    const audio = findAudio(this.doc);
    const tracks = listTracks(this.doc);
    const active = audio !== null && isPreviewOpen(this.doc);
    const currentIndex = active ? findCurrentIndex(tracks, this.doc) : -1;
    const currentId = tracks[currentIndex]?.id ?? null;
    this.queue.sync(tracks.map((t) => t.id), currentId, this.settings.shuffle);
    return {
      active,
      nowPlaying: active ? readNowPlaying(this.doc) : null,
      paused: audio?.paused ?? true,
      currentTime: audio?.currentTime ?? 0,
      duration: Number.isFinite(audio?.duration) ? audio!.duration : 0,
      tracks,
      currentIndex,
      settings: this.getSettings(),
      hasNext: active && this.queue.hasNext(currentId, this.settings),
    };
  }

  togglePlay(): void {
    const audio = findAudio(this.doc);
    if (!audio) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  }

  seek(time: number): void {
    const audio = findAudio(this.doc);
    if (!audio || !Number.isFinite(time)) return;
    const clamped = Math.max(0, time);
    audio.currentTime = Number.isFinite(audio.duration) ? Math.min(clamped, audio.duration) : clamped;
  }

  /** Opens the next song in play order. Returns false when there is none. */
  next(): boolean {
    const { tracks, currentIndex } = this.getState();
    const nextId = this.queue.next(tracks[currentIndex]?.id ?? null, this.settings);
    const track = tracks.find((t) => t.id === nextId);
    if (!track) return false;
    this.open(track);
    return true;
  }

  /** Restarts the song if it's past 3 s (or there's nothing before it), else opens the previous one. */
  previous(): void {
    const audio = findAudio(this.doc);
    const { tracks, currentIndex } = this.getState();
    const prevId = this.queue.previous(tracks[currentIndex]?.id ?? null, this.settings);
    const prev = tracks.find((t) => t.id === prevId);
    if (audio && (audio.currentTime > RESTART_THRESHOLD_S || !prev)) {
      audio.currentTime = 0;
      return;
    }
    if (prev) this.open(prev);
  }

  toggleShuffle(): void {
    this.settings.shuffle = !this.settings.shuffle;
    this.onSettingsChange?.(this.getSettings());
  }

  cycleRepeat(): void {
    this.settings.repeat = nextRepeatMode(this.settings.repeat);
    this.onSettingsChange?.(this.getSettings());
  }

  playTrack(id: string): void {
    const track = listTracks(this.doc).find((t) => t.id === id);
    if (track) this.open(track);
  }

  handle(cmd: PlayerCommand): PlayerState {
    switch (cmd.type) {
      case 'togglePlay':
        this.togglePlay();
        break;
      case 'seek':
        this.seek(cmd.time);
        break;
      case 'next':
        this.next();
        break;
      case 'previous':
        this.previous();
        break;
      case 'playTrack':
        this.playTrack(cmd.id);
        break;
      case 'toggleShuffle':
        this.toggleShuffle();
        break;
      case 'cycleRepeat':
        this.cycleRepeat();
        break;
      case 'getState':
      case 'getArt':
        break;
    }
    return this.getState();
  }

  /**
   * When a song finishes (Icedrive just stops): replay it in repeat-one mode,
   * otherwise play the next one in play order.
   */
  enableAutoAdvance(): () => void {
    // Media events don't bubble, but a capturing listener on the document
    // still sees them, and it survives Icedrive replacing the <audio> element.
    const onEnded = (e: Event) => {
      const audio = findAudio(this.doc);
      if (!(e.target instanceof HTMLMediaElement) || e.target !== audio) return;
      if (this.settings.repeat === 'one') {
        audio.currentTime = 0;
        void audio.play();
      } else {
        this.next();
      }
    };
    this.doc.addEventListener('ended', onEnded, true);
    return () => this.doc.removeEventListener('ended', onEnded, true);
  }

  private open(track: TrackRef): void {
    const detail: BridgeOpenFile = { id: track.id, area: track.area };
    this.doc.dispatchEvent(new CustomEvent(BRIDGE_EVENT, { detail: JSON.stringify(detail) }));
  }
}
