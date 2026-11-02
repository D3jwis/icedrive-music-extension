/**
 * Everything that knows how Icedrive's web app (icedrive.net/dashboard) is built.
 *
 * Icedrive plays music inside its preview overlay (#preview). When a file is
 * opened, the app replaces #preview .content with:
 *   #id3-art     album art (background-image, a blob: URL)
 *   #id3-artist  artist from ID3 tags (may be empty)
 *   #id3-title   ID3 title, or the file name until tags load
 *   <audio id="player">  wrapped by Plyr (encrypted files use #audio-player)
 * The file list lives in #file-browser as .item.file elements with
 * data-id="file-<n>", data-filetype, data-in ("cloud" | "crypto") and data-title.
 *
 * If Icedrive changes its markup, this is the only file that should need fixing.
 */

export interface TrackRef {
  /** Icedrive item id, e.g. "file-3857256753". */
  id: string;
  /** File name as shown in the list. */
  fileName: string;
  /** Area passed to Icedrive's previewItem(): "cloud" or "crypto". */
  area: string;
}

export interface NowPlaying {
  title: string;
  artist: string;
  fileName: string;
  /** blob: or http(s) URL of the album art, if Icedrive found one. */
  artUrl: string | null;
}

const AUDIO_SELECTOR = '#preview .content audio';

export function findAudio(doc: Document = document): HTMLAudioElement | null {
  return doc.querySelector<HTMLAudioElement>(AUDIO_SELECTOR);
}

export function isPreviewOpen(doc: Document = document): boolean {
  return doc.querySelector('#preview')?.classList.contains('on') ?? false;
}

/** Audio files in the currently open folder, in the order Icedrive shows them. */
export function listTracks(doc: Document = document): TrackRef[] {
  const items = doc.querySelectorAll<HTMLElement>('#file-browser .item.file[data-filetype="audio"]');
  return Array.from(items, (el) => ({
    id: el.dataset.id ?? '',
    fileName: el.dataset.title ?? el.querySelector('.title span')?.textContent?.trim() ?? '',
    area: el.dataset.in ?? 'cloud',
  })).filter((t) => t.id !== '');
}

/** File name shown in the preview's top bar, e.g. "Artist - Song.flac". */
export function readPreviewFileName(doc: Document = document): string {
  return doc.querySelector('#preview .top .title')?.textContent?.trim() ?? '';
}

function backgroundUrl(el: HTMLElement | null): string | null {
  const bg = el?.style.backgroundImage ?? '';
  const match = /url\(["']?(.*?)["']?\)/.exec(bg);
  return match?.[1] || null;
}

export function readNowPlaying(doc: Document = document): NowPlaying | null {
  if (!findAudio(doc)) return null;
  const fileName = readPreviewFileName(doc);
  const title = doc.querySelector('#id3-title')?.textContent?.trim() || fileName;
  const artist = doc.querySelector('#id3-artist')?.textContent?.trim() ?? '';
  return {
    title,
    artist,
    fileName,
    artUrl: backgroundUrl(doc.querySelector<HTMLElement>('#id3-art')),
  };
}

/**
 * Which entry of `tracks` is playing now. Icedrive doesn't expose the id of
 * the open file, so we match the preview's file name against the list (names
 * are unique within a folder).
 */
export function findCurrentIndex(tracks: TrackRef[], doc: Document = document): number {
  const fileName = readPreviewFileName(doc);
  if (!fileName) return -1;
  return tracks.findIndex((t) => t.fileName === fileName);
}
