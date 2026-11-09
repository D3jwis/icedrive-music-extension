import { EQ_PRESETS } from './equalizer';
import type { PlayerController } from './player-controller';
import { el, icon, ICONS } from './ui/dom';
import { buildEqPanel, renderEqPanel, wireEqPanel } from './ui/eq-panel';
import { buildTrackList, createTrackListRenderer } from './ui/track-list';
import THEME from './ui/theme.css?inline';

const HOST_ID = 'icedrive-music-ext-controls';
const REFRESH_MS = 500;

// Lives in a shadow root so Icedrive's CSS can't touch it and ours can't leak.
// The shared theme is the same stylesheet the popup and mini player use.
const STYLE = `
  ${THEME}
  :host { all: initial; display: block; font: 13px/1.3 system-ui, -apple-system, 'Segoe UI', sans-serif; color: var(--ice-text-2); }
  .bar {
    display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 10px;
    padding: 8px 12px 0;
  }
  .sep { width: 1px; height: 22px; background: var(--ice-track); margin: 0 4px; }
  .card { margin: 10px 12px 4px; }
  .tracks { max-height: 240px; scrollbar-width: thin; scrollbar-color: var(--ice-track) transparent; }
`;

const REPEAT_LABELS = { off: 'off', all: 'whole folder', one: 'one track' } as const;

function button(doc: Document, id: string, label: string, iconPath: string, kind = ''): HTMLButtonElement {
  const btn = el(doc, 'button', { id, type: 'button', class: `ib ${kind}`.trim(), 'aria-label': label, title: label }, icon(doc, iconPath));
  if (kind === 'toggle') btn.setAttribute('aria-pressed', 'false');
  if (kind === 'panel-btn') btn.setAttribute('aria-expanded', 'false');
  return btn;
}

/**
 * Adds the extension's controls under Icedrive's own Plyr player (which
 * already has play, seek and volume): shuffle, previous, next and repeat,
 * plus an equalizer panel, the folder's track list and a mini player button.
 * Icedrive rebuilds the player for every song, so a MutationObserver
 * re-attaches the controls; which panels are open is kept across songs.
 */
export function mountInPageControls(
  player: PlayerController,
  doc: Document = document,
  openMiniPlayer: () => void = () => void browser.runtime.sendMessage({ type: 'openMiniPlayer' }),
): () => void {
  let root: ShadowRoot | null = null;
  const open = { eq: false, queue: false };
  /** The slider being dragged; rendering leaves it alone until it's let go. */
  let dragging: HTMLInputElement | null = null;
  let renderTracks: ReturnType<typeof createTrackListRenderer> | null = null;

  const q = <T extends HTMLElement>(sel: string) => root!.querySelector<T>(sel)!;

  const render = () => {
    if (!root?.host.isConnected) return;
    const state = player.getState();
    const shuffle = q('#shuffle');
    shuffle.setAttribute('aria-pressed', String(state.settings.shuffle));
    shuffle.title = `Shuffle: ${state.settings.shuffle ? 'on' : 'off'}`;
    const repeat = q('#repeat');
    repeat.setAttribute('aria-pressed', String(state.settings.repeat !== 'off'));
    repeat.title = `Repeat: ${REPEAT_LABELS[state.settings.repeat]}`;
    q('.badge').hidden = state.settings.repeat !== 'one';
    q<HTMLButtonElement>('#next').disabled = !state.hasNext;

    const eqBtn = q('#eq');
    eqBtn.setAttribute('aria-expanded', String(open.eq));
    eqBtn.classList.toggle('lit', state.eq.enabled);
    eqBtn.title = `Equalizer: ${state.eq.enabled ? (EQ_PRESETS[state.eq.preset]?.label ?? 'Custom') : 'off'}`;
    q('.eq-panel').hidden = !open.eq;
    q('#queue-btn').setAttribute('aria-expanded', String(open.queue));
    q('.track-panel').hidden = !open.queue;
    renderEqPanel(q('.eq-panel'), state.eq, state.eqStatus, dragging);
    if (open.queue) renderTracks?.(state.tracks, state.currentIndex, state.folderName);
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
    const repeat = button(doc, 'repeat', 'Repeat', ICONS.repeat, 'toggle');
    repeat.append(el(doc, 'span', { class: 'badge', hidden: '' }, '1'));
    const bar = el(
      doc,
      'div',
      { class: 'bar', role: 'toolbar', 'aria-label': 'Icedrive Music Player+' },
      button(doc, 'shuffle', 'Shuffle', ICONS.shuffle, 'toggle'),
      button(doc, 'prev', 'Previous', ICONS.prev),
      button(doc, 'next', 'Next', ICONS.next),
      repeat,
      el(doc, 'span', { class: 'sep', 'aria-hidden': 'true' }),
      button(doc, 'eq', 'Equalizer', ICONS.eq, 'panel-btn'),
      button(doc, 'queue-btn', 'Tracks in this folder', ICONS.queue, 'panel-btn'),
      button(doc, 'mini', 'Open the mini player window', ICONS.mini, 'panel-btn'),
    );
    const eqPanel = buildEqPanel(doc);
    const trackPanel = buildTrackList(doc);
    renderTracks = createTrackListRenderer(trackPanel);
    root.append(style, bar, eqPanel, trackPanel);

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
      if (!btn) return;
      if (btn.dataset.id) player.playTrack(btn.dataset.id);
      else if (btn.id === 'shuffle') player.toggleShuffle();
      else if (btn.id === 'prev') player.previous();
      else if (btn.id === 'next') player.next();
      else if (btn.id === 'repeat') player.cycleRepeat();
      else if (btn.id === 'eq') open.eq = !open.eq;
      else if (btn.id === 'queue-btn') open.queue = !open.queue;
      else if (btn.id === 'mini') openMiniPlayer();
      render();
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
    doc.getElementById(HOST_ID)?.remove();
  };
}
