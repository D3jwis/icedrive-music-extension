import type { TrackRef } from '../icedrive-dom';
import { el, icon, ICONS } from './dom';

/** File name without its extension. */
export const displayName = (track: TrackRef) => track.fileName.replace(/\.[^.]+$/, '');

export function buildTrackList(doc: Document): HTMLElement {
  return el(
    doc,
    'section',
    { class: 'card track-panel', 'aria-label': 'Tracks in this folder' },
    el(
      doc,
      'div',
      { class: 'qhead' },
      el(doc, 'span', { class: 'folder' }, icon(doc, ICONS.folder), el(doc, 'span', { 'data-q': 'folder' })),
      el(doc, 'span', { class: 'count', 'data-q': 'count' }),
    ),
    el(doc, 'ol', { class: 'tracks', 'data-q': 'list' }),
  );
}

/**
 * Keeps a track list up to date. Rebuilds the rows only when the folder
 * changes, and scrolls the playing song into view when it changes.
 */
export function createTrackListRenderer(panel: HTMLElement) {
  let key = '';
  let current = -2;
  const doc = panel.ownerDocument;
  return (tracks: TrackRef[], currentIndex: number, folderName: string, scroll = true) => {
    const folder = panel.querySelector<HTMLElement>('[data-q="folder"]')!;
    folder.textContent = folderName || 'Tracks in this folder';
    folder.title = folderName ? `Playing from folder: ${folderName}` : '';
    panel.querySelector('[data-q="count"]')!.textContent = `${tracks.length} ${tracks.length === 1 ? 'track' : 'tracks'}`;
    const list = panel.querySelector<HTMLElement>('[data-q="list"]')!;
    const newKey = tracks.map((t) => t.id).join(',');
    if (newKey !== key) {
      key = newKey;
      current = -2;
      list.replaceChildren(
        ...tracks.map((track, i) =>
          el(
            doc,
            'li',
            {},
            el(
              doc,
              'button',
              { type: 'button', 'data-id': track.id, title: track.fileName },
              el(doc, 'span', { class: 'num' }, String(i + 1)),
              el(doc, 'span', { class: 'name' }, displayName(track)),
            ),
          ),
        ),
      );
    }
    if (currentIndex !== current) {
      list.querySelector('.current')?.classList.remove('current');
      const li = list.children[currentIndex];
      if (li) {
        li.classList.add('current');
        if (scroll) li.scrollIntoView({ block: 'nearest' });
      }
      current = currentIndex;
    }
  };
}
