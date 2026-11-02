import {
  findAudio,
  findCurrentIndex,
  isPreviewOpen,
  listTracks,
  readNowPlaying,
  type TrackRef,
} from './icedrive-dom';
import { BRIDGE_EVENT, type BridgeOpenFile, type PlayerCommand, type PlayerState } from './messages';

/** Going "previous" after this many seconds restarts the song instead. */
const RESTART_THRESHOLD_S = 3;

/**
 * Reads and drives Icedrive's player from the content script. Works on the
 * live DOM; opening another file is delegated to the MAIN-world bridge,
 * because only page scripts can call Icedrive's previewItem().
 */
export class PlayerController {
  constructor(private readonly doc: Document = document) {}

  getState(): PlayerState {
    const audio = findAudio(this.doc);
    const tracks = listTracks(this.doc);
    const active = audio !== null && isPreviewOpen(this.doc);
    return {
      active,
      nowPlaying: active ? readNowPlaying(this.doc) : null,
      paused: audio?.paused ?? true,
      currentTime: audio?.currentTime ?? 0,
      duration: Number.isFinite(audio?.duration) ? audio!.duration : 0,
      tracks,
      currentIndex: active ? findCurrentIndex(tracks, this.doc) : -1,
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

  /** Index of the track after the current one, or -1 at the end of the folder. */
  nextIndex(): number {
    const { tracks, currentIndex } = this.getState();
    if (currentIndex < 0 || currentIndex + 1 >= tracks.length) return -1;
    return currentIndex + 1;
  }

  next(): boolean {
    const track = this.getState().tracks[this.nextIndex()];
    if (!track) return false;
    this.open(track);
    return true;
  }

  previous(): void {
    const audio = findAudio(this.doc);
    const { tracks, currentIndex } = this.getState();
    if (audio && (audio.currentTime > RESTART_THRESHOLD_S || currentIndex <= 0)) {
      audio.currentTime = 0;
      return;
    }
    const prev = tracks[currentIndex - 1];
    if (prev) this.open(prev);
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
      case 'getState':
      case 'getArt':
        break;
    }
    return this.getState();
  }

  /** Plays the next file when a song finishes (Icedrive just stops). */
  enableAutoAdvance(): () => void {
    // Media events don't bubble, but a capturing listener on the document
    // still sees them, and it survives Icedrive replacing the <audio> element.
    const onEnded = (e: Event) => {
      if (e.target instanceof HTMLMediaElement && e.target === findAudio(this.doc)) this.next();
    };
    this.doc.addEventListener('ended', onEnded, true);
    return () => this.doc.removeEventListener('ended', onEnded, true);
  }

  private open(track: TrackRef): void {
    const detail: BridgeOpenFile = { id: track.id, area: track.area };
    this.doc.dispatchEvent(new CustomEvent(BRIDGE_EVENT, { detail: JSON.stringify(detail) }));
  }
}
