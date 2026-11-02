/**
 * Runtime checks for every piece of data that crosses a trust boundary:
 * messages between extension contexts, values read from storage, requests
 * passed to the page bridge, and URLs/strings read from Icedrive's DOM.
 *
 * TypeScript types disappear at runtime, so anything that arrives from
 * outside the current script is treated as `unknown` and checked here first.
 */
import type { ArtResponse, BridgeOpenFile, PlayerCommand } from './messages';
import { DEFAULT_SETTINGS, type PlaybackSettings, type RepeatMode } from './queue';

/** Icedrive item ids look like "file-3857256753". */
const FILE_ID = /^file-\d{1,20}$/;
const AREAS = new Set(['cloud', 'crypto']);
const REPEAT_MODES = new Set<RepeatMode>(['off', 'all', 'one']);
/** A day of audio is far beyond any real track; rejects absurd seek values. */
const MAX_SEEK_S = 24 * 60 * 60;
/** Album art we produce ourselves: a downscaled JPEG, base64 encoded. */
const ART_DATA_URL = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/;
/** ~1 MB of base64 is far more than a 320 px JPEG needs. */
const MAX_ART_DATA_URL_LENGTH = 1_400_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isFileId(value: unknown): value is string {
  return typeof value === 'string' && FILE_ID.test(value);
}

export function isArea(value: unknown): value is 'cloud' | 'crypto' {
  return typeof value === 'string' && AREAS.has(value);
}

/**
 * True for messages sent by this extension's own pages (popup, detached
 * window, service worker), whose URL is on our chrome-extension:// origin.
 * Content scripts report the web page's URL instead, so they don't pass.
 */
export function isFromExtensionPage(
  sender: { id?: string; url?: string },
  extensionId: string = browser.runtime.id,
  extensionOrigin: string = browser.runtime.getURL('/'),
): boolean {
  return sender.id === extensionId && typeof sender.url === 'string' && sender.url.startsWith(extensionOrigin);
}

/** Returns a well-formed command, or null for anything else. */
export function parseCommand(value: unknown): PlayerCommand | null {
  if (!isRecord(value) || typeof value.type !== 'string') return null;
  switch (value.type) {
    case 'getState':
    case 'togglePlay':
    case 'next':
    case 'previous':
    case 'toggleShuffle':
    case 'cycleRepeat':
    case 'getArt':
      return { type: value.type };
    case 'seek':
      return typeof value.time === 'number' && Number.isFinite(value.time) && value.time >= 0 && value.time <= MAX_SEEK_S
        ? { type: 'seek', time: value.time }
        : null;
    case 'playTrack':
      return isFileId(value.id) ? { type: 'playTrack', id: value.id } : null;
    default:
      return null;
  }
}

/** Accepts a request for the page bridge only if it is exactly what we send. */
export function parseBridgeRequest(raw: unknown): BridgeOpenFile | null {
  if (typeof raw !== 'string' || raw.length > 200) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value) || !isFileId(value.id) || !isArea(value.area)) return null;
  return { id: value.id, area: value.area };
}

/** Settings from storage, with anything unexpected replaced by the default. */
export function sanitizeSettings(value: unknown): PlaybackSettings {
  if (!isRecord(value)) return { ...DEFAULT_SETTINGS };
  return {
    shuffle: typeof value.shuffle === 'boolean' ? value.shuffle : DEFAULT_SETTINGS.shuffle,
    repeat: REPEAT_MODES.has(value.repeat as RepeatMode) ? (value.repeat as RepeatMode) : DEFAULT_SETTINGS.repeat,
  };
}

/**
 * Album art may only be loaded from the page's own blob: URLs or from
 * Icedrive itself, so a crafted page/style can't make the content script
 * fetch arbitrary addresses (e.g. hosts on a company network).
 */
export function isAllowedArtSource(url: string | null, pageOrigin: string): boolean {
  if (!url) return false;
  let parsed: URL;
  try {
    parsed = new URL(url, pageOrigin);
  } catch {
    return false;
  }
  if (parsed.protocol === 'blob:') return parsed.origin === pageOrigin;
  return parsed.protocol === 'https:' && (parsed.hostname === 'icedrive.net' || parsed.hostname.endsWith('.icedrive.net'));
}

/** The popup only ever puts our own JPEG data: URL into CSS. */
export function isSafeArtDataUrl(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_ART_DATA_URL_LENGTH && ART_DATA_URL.test(value);
}

export function parseArtResponse(value: unknown): ArtResponse | null {
  if (!isRecord(value)) return null;
  const sourceUrl = typeof value.sourceUrl === 'string' ? value.sourceUrl : null;
  const dataUrl = isSafeArtDataUrl(value.dataUrl) ? value.dataUrl : null;
  return { sourceUrl, dataUrl };
}

/** Caps strings read from the page so a hostile DOM can't flood the popup. */
export function clampText(value: string, max = 500): string {
  return value.length > max ? value.slice(0, max) : value;
}
