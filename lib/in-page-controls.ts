import { artToDataUrl } from './album-art';
import type { PlayerCommand } from './messages';
import type { PlayerController } from './player-controller';
import { buildBanner } from './ui/brand';
import { createDeck, type Deck } from './ui/deck';
import { el, icon, ICONS } from './ui/dom';
import { buildEqPanel, renderEqPanel, wireEqPanel } from './ui/eq-panel';
import { buildTrackList, createTrackListRenderer } from './ui/track-list';
import THEME from './ui/theme.css?inline';
import DECK from './ui/deck.css?inline';

const HOST_ID = 'icedrive-music-ext-controls';
const REFRESH_MS = 500;

// Lives in a shadow root so Icedrive's CSS can't touch it and ours can't leak.
// The theme and the deck are the same stylesheets the popup and mini player use;
// this only lays them out for the wider space inside Icedrive's preview.
const STYLE = `
  ${THEME}
  ${DECK}
  :host { all: initial; display: block; font: 13px/1.3 system-ui, -apple-system, 'Segoe UI', sans-serif; color: var(--ice-text); }
  * { box-sizing: border-box; }
  .ip {
    border-radius: 12px; overflow: hidden; background: var(--ice-bg);
    border: 1px solid var(--ice-deck-border); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  }
  .ip-body { padding: 14px; }

  /* The deck, wide: cover on the left, title and visualizer beside it,
     volume | transport | speed on one row under the seek bar. */
  .player { display: grid; grid-template-columns: 1fr auto 1fr; column-gap: 16px; align-items: center; }
  .np-box { grid-column: 1 / -1; display: grid; grid-template-columns: 116px minmax(0, 1fr); column-gap: 16px; }
  .now { display: contents; }
  .art { grid-row: 1 / 3; width: 116px; height: 116px; border-radius: 8px; }
  .art svg { width: 40px; height: 40px; }
  .meta { grid-column: 2; align-self: end; }
  .title { font-size: 17px; }
  .np-bottom { grid-column: 2; }
  .seek-row { grid-column: 1 / -1; }
  .controls { grid-column: 2; grid-row: 3; }
  .volume { display: contents; }
  .vol { grid-column: 1; grid-row: 3; max-width: 220px; margin-top: 4px; }
  .chip { grid-column: 3; grid-row: 3; justify-self: end; margin-top: 4px; }

  /* Equalizer and track list side by side (stacked when narrow). The list
     takes the equalizer's height and scrolls inside it. */
  .ip-panels { display: flex; flex-wrap: wrap; align-items: stretch; gap: 12px; margin-top: 12px; }
  .ip-panels .card { margin: 0; }
  .eq-panel { flex: 3 1 360px; min-width: 0; }
  .track-panel { flex: 2 1 220px; min-width: 0; display: flex; flex-direction: column; }
  .tracks { flex: 1 1 0; min-height: 150px; max-height: none; scrollbar-width: thin; scrollbar-color: var(--ice-track) transparent; }
  .eq-status[data-status='active'] { display: inline-flex; align-items: center; gap: 6px; }
  .eq-status[data-status='active']::before {
    content: ''; width: 7px; height: 7px; border-radius: 50%;
    background: #3ddc84; box-shadow: 0 0 0 3px rgba(61, 220, 132, 0.15);
  }
`;

/**
 * Puts the extension's player inside Icedrive's audio preview, in place of
 * Icedrive's own cover, title and Plyr bar (hidden by
 * assets/icedrive-player-theme.css while ours is there): the same banner
 * and deck as the popup, with the equalizer and the folder's track list
 * side by side under it. Icedrive rebuilds the player for every song, so a
 * MutationObserver re-attaches it.
 */
export function mountInPageControls(
  player: PlayerController,
  doc: Document = document,
  openMiniPlayer: () => void = () => void browser.runtime.sendMessage({ type: 'openMiniPlayer' }),
): () => void {
  let root: ShadowRoot | null = null;
  let deck: Deck | null = null;
  /** The slider being dragged; rendering leaves it alone until it's let go. */
  let dragging: HTMLInputElement | null = null;
  let renderTracks: ReturnType<typeof createTrackListRenderer> | null = null;

  const q = <T extends HTMLElement>(sel: string) => root!.querySelector<T>(sel)!;

  const render = () => {
    if (!root?.host.isConnected) return;
    const state = player.getState();
    if (state.nowPlaying) deck?.render(state);
    renderEqPanel(q('.eq-panel'), state.eq, state.eqStatus, dragging);
    renderTracks?.(state.tracks, state.currentIndex, state.folderName);
  };

  const run = (cmd: PlayerCommand) => {
    player.handle(cmd);
    render();
  };

  const attach = () => {
    const wrap = doc.querySelector('#preview .content .audio-wrap');
    if (!wrap || wrap.querySelector(`#${HOST_ID}`)) return;
    const host = doc.createElement('div');
    host.id = HOST_ID;
    // Closed: Icedrive's scripts can't reach into our controls via host.shadowRoot.
    root = host.attachShadow({ mode: 'closed' });
    dragging = null;
    const style = doc.createElement('style');
    style.textContent = STYLE;

    const mini = el(
      doc,
      'button',
      { type: 'button', class: 'icon-btn', 'data-action': 'mini', title: 'Open the mini player window', 'aria-label': 'Open the mini player window' },
      icon(doc, ICONS.mini),
    );
    deck?.stop();
    deck = createDeck(doc, {
      run,
      preview: (cmd) => player.handle(cmd),
      getArt: (sourceUrl) => artToDataUrl(sourceUrl),
      readSpectrum: (bars) => player.engine?.getSpectrum(bars) ?? null,
    });
    const eqPanel = buildEqPanel(doc);
    const trackPanel = buildTrackList(doc);
    renderTracks = createTrackListRenderer(trackPanel);
    root.append(
      style,
      el(
        doc,
        'div',
        { class: 'ip', role: 'region', 'aria-label': 'Icedrive Music Player+' },
        buildBanner(doc, mini),
        el(doc, 'div', { class: 'ip-body' }, deck.el, el(doc, 'div', { class: 'ip-panels' }, eqPanel, trackPanel)),
      ),
    );

    wireEqPanel(
      eqPanel,
      {
        setEq: (patch) => {
          player.updateEq(patch);
          render();
        },
        preset: (id) => {
          player.applyEqPreset(id);
          render();
        },
      },
      () => player.engine?.getSettings() ?? null,
      (input) => (dragging = input),
    );

    // Ignore clicks synthesized by page scripts; only real user input counts.
    root.addEventListener('click', (e) => {
      if (!e.isTrusted) return;
      const btn = (e.target as Element).closest('button');
      if (btn?.dataset.id) run({ type: 'playTrack', id: btn.dataset.id });
      else if (btn?.dataset.action === 'mini') openMiniPlayer();
    });
    // Keys typed into our controls (arrows on a slider, letters in the
    // preset list) must not also trigger Icedrive's own shortcuts.
    for (const type of ['keydown', 'keyup', 'keypress']) root.addEventListener(type, (e) => e.stopPropagation());

    wrap.append(host);
    render();
  };

  const observer = new MutationObserver(attach);
  observer.observe(doc.body, { childList: true, subtree: true });
  attach();
  const timer = setInterval(render, REFRESH_MS);

  return () => {
    observer.disconnect();
    clearInterval(timer);
    deck?.stop();
    doc.getElementById(HOST_ID)?.remove();
  };
}
