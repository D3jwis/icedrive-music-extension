import type { PlayerController } from './player-controller';

const SEEK_STEP_S = 10;

/**
 * Connects the player to the browser's Media Session: keyboard media keys,
 * headset buttons, Chrome's media controls in the toolbar, and the OS media
 * overlay (Windows/macOS) all get previous/next/seek, plus title, artist and
 * album art. Icedrive itself sets none of this, so the OS shows only "icedrive.net".
 */
export function connectMediaSession(player: PlayerController, nav: Navigator = navigator): () => void {
  const session = nav.mediaSession;
  if (!session) return () => {};

  const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
    ['play', () => player.setPaused(false)],
    ['pause', () => player.setPaused(true)],
    ['previoustrack', () => player.previous()],
    ['nexttrack', () => player.next()],
    ['seekto', (d) => d.seekTime != null && player.seek(d.seekTime)],
    ['seekbackward', (d) => player.seek(player.getState().currentTime - (d.seekOffset ?? SEEK_STEP_S))],
    ['seekforward', (d) => player.seek(player.getState().currentTime + (d.seekOffset ?? SEEK_STEP_S))],
  ];
  for (const [action, handler] of handlers) {
    try {
      session.setActionHandler(action, handler);
    } catch {
      // Older browsers reject actions they don't know.
    }
  }

  let lastMeta = '';
  const sync = () => {
    const state = player.getState();
    if (!state.active || !state.nowPlaying) {
      if (lastMeta) {
        session.metadata = null;
        session.playbackState = 'none';
        lastMeta = '';
      }
      return;
    }
    const { title, artist, artUrl } = state.nowPlaying;
    const key = `${title}|${artist}|${artUrl}`;
    if (key !== lastMeta) {
      lastMeta = key;
      session.metadata = new MediaMetadata({
        title,
        artist,
        album: 'Icedrive',
        artwork: artUrl ? [{ src: artUrl }] : [],
      });
    }
    session.playbackState = state.paused ? 'paused' : 'playing';
    if (state.duration > 0) {
      try {
        session.setPositionState({
          duration: state.duration,
          position: Math.min(state.currentTime, state.duration),
          playbackRate: 1,
        });
      } catch {
        // Ignore transient invalid states while a new file loads.
      }
    }
  };

  // Icedrive swaps the <audio> element and fills in ID3 tags asynchronously,
  // so a cheap periodic sync is simpler and more robust than chasing events.
  const timer = setInterval(sync, 1000);
  const onMediaEvent = () => sync();
  const events = ['play', 'pause', 'loadedmetadata', 'seeked'];
  for (const e of events) document.addEventListener(e, onMediaEvent, true);
  sync();

  return () => {
    clearInterval(timer);
    for (const e of events) document.removeEventListener(e, onMediaEvent, true);
  };
}
