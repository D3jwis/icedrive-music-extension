import { EQ_PRESETS } from './equalizer';
import type { PlayerController } from './player-controller';
import { el, icon, ICONS } from './ui/dom';
import { buildEqPanel, renderEqPanel, wireEqPanel } from './ui/eq-panel';
import { buildTrackList, createTrackListRenderer } from './ui/track-list';
import { createVisualizer, readVisualizerSetting, VISUALIZER_KEY, type Visualizer } from './ui/visualizer';
import THEME from './ui/theme.css?inline';

const HOST_ID = 'icedrive-music-ext-controls';
const REFRESH_MS = 500;

// Lives in a shadow root so Icedrive's CSS can't touch it and ours can't leak.
// The shared theme is the same stylesheet the popup and mini player use.
const STYLE = `
  ${THEME}
  :host { all: initial; display: block; font: 13px/1.3 system-ui, -apple-system, 'Segoe UI', sans-serif; color: var(--ice-text-2); }
  /* Our buttons start where Icedrive's player controls start (--indent is measured). */
  .bar {
    display: flex; align-items: center; gap: 6px;
    padding: 8px 12px 0 calc(var(--indent, 12px));
  }
  .bar .grow { flex: 1; }
  .viz-strip {
    margin: 12px 12px 0; padding: 8px 10px; border-radius: var(--ice-radius);
    background: var(--ice-deck-glow), var(--ice-deck-bg); border: 1px solid var(--ice-deck-border);
    box-shadow: var(--ice-deck-shadow);
  }
  .viz-strip canvas { display: block; width: 100%; height: 40px; cursor: pointer; }
  .viz-strip.off canvas { height: 18px; }
  .ip-panel {
    margin: 12px 12px 4px; border-radius: var(--ice-radius);
    background: var(--ice-deck-bg); border: 1px solid var(--ice-deck-border); box-shadow: var(--ice-deck-shadow);
  }
  .tabs { display: flex; gap: 2px; padding: 6px 6px 0; }
  .ip-panel.open .tabs { border-bottom: 1px solid var(--ice-deck-border); }
  .ip-panel:not(.open) .tabs { padding-bottom: 6px; }
  .tab {
    display: flex; align-items: center; gap: 6px; height: 34px; padding: 0 14px;
    border: 1px solid transparent; border-radius: 7px; background: transparent;
    color: var(--ice-muted); font: inherit; font-weight: 600; white-space: nowrap; cursor: pointer;
  }
  .tab:hover { color: var(--ice-text); background: var(--ice-hover); }
  .tab svg { width: 16px; height: 16px; fill: currentColor; }
  .tab small { font-weight: 500; font-size: 11px; color: var(--ice-dim); }
  .tab small.state { color: var(--ice-accent); }
  .tab[aria-selected='true'] {
    color: var(--ice-text); background: #1a2134;
    border-color: var(--ice-deck-border); border-bottom-color: #1a2134;
    border-radius: 7px 7px 0 0; margin-bottom: -1px;
  }
  .tab[aria-selected='true'] svg { fill: var(--ice-accent); }
  /* Panels lose their own card frame: the tabbed box is the frame. */
  .ip-panel .card { margin: 0; border: 0; background: transparent; box-shadow: none; }
  .eq-panel .switch-text { font-size: 0; }
  .eq-panel .switch-text::after { content: attr(data-short); font-size: 13px; }
  .eq-status[data-status='active'] { display: inline-flex; align-items: center; gap: 6px; }
  .eq-status[data-status='active']::before {
    content: ''; width: 7px; height: 7px; border-radius: 50%;
    background: #3ddc84; box-shadow: 0 0 0 3px rgba(61, 220, 132, 0.15);
  }
  .track-panel .qhead { display: none; }
  .tracks { max-height: 240px; margin: 0 -4px; scrollbar-width: thin; scrollbar-color: var(--ice-track) transparent; }
  /* Wide enough: two columns, numbered down the first and then the second. */
  .tracks.two-col { display: grid; grid-auto-flow: column; grid-template-columns: 1fr 1fr; column-gap: 18px; }
  .tracks.two-col li { min-width: 0; }
`;

/** Below this width the track list keeps one column. */
const TWO_COLUMNS_MIN_PX = 520;

const REPEAT_LABELS = { off: 'off', all: 'whole folder', one: 'one track' } as const;

function button(doc: Document, id: string, label: string, iconPath: string, kind = ''): HTMLButtonElement {
  const btn = el(doc, 'button', { id, type: 'button', class: `ib ${kind}`.trim(), 'aria-label': label, title: label }, icon(doc, iconPath));
  if (kind === 'toggle') btn.setAttribute('aria-pressed', 'false');
  if (kind === 'panel-btn') btn.setAttribute('aria-expanded', 'false');
  return btn;
}

/**
 * Adds the extension's controls under Icedrive's own Plyr player (which
 * already has play, seek and volume): shuffle, previous, next and repeat
 * lined up with Plyr's controls, a mini player button, the spectrum
 * visualizer, and the equalizer and the folder's track list as two tabs.
 * Icedrive rebuilds the player for every song, so a MutationObserver
 * re-attaches the controls; which panels are open is kept across songs.
 */
export function mountInPageControls(
  player: PlayerController,
  doc: Document = document,
  openMiniPlayer: () => void = () => void browser.runtime.sendMessage({ type: 'openMiniPlayer' }),
): () => void {
  let root: ShadowRoot | null = null;
  /** The open tab, if any; kept across songs. */
  let open: 'eq' | 'queue' | null = null;
  let vizOn = true;
  let visualizer: Visualizer | null = null;
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

    const eqTab = q('#eq');
    eqTab.setAttribute('aria-selected', String(open === 'eq'));
    q('#eq-state').textContent = state.eq.enabled ? (EQ_PRESETS[state.eq.preset]?.label ?? 'Custom') : 'Off';
    q('#eq-state').classList.toggle('state', state.eq.enabled);
    q('#queue-btn').setAttribute('aria-selected', String(open === 'queue'));
    q('#queue-count').textContent = String(state.tracks.length);
    q('.ip-panel').classList.toggle('open', open !== null);
    q('.eq-panel').hidden = open !== 'eq';
    q('.track-panel').hidden = open !== 'queue';
    renderEqPanel(q('.eq-panel'), state.eq, state.eqStatus, dragging);
    if (open === 'queue') {
      const list = q('.tracks');
      const two = (root.host as HTMLElement).clientWidth >= TWO_COLUMNS_MIN_PX && state.tracks.length > 1;
      list.classList.toggle('two-col', two);
      list.style.gridTemplateRows = two ? `repeat(${Math.ceil(state.tracks.length / 2)}, auto)` : '';
      renderTracks?.(state.tracks, state.currentIndex, state.folderName);
    }
    alignWithPlayer();
    q('.viz-strip').classList.toggle('off', !vizOn);
  };

  /** Lines our buttons up with the left edge of Icedrive's player controls. */
  const alignWithPlayer = () => {
    const host = root!.host as HTMLElement;
    const controls = host.parentElement?.querySelector('.plyr__controls');
    if (!controls) return;
    const offset = controls.getBoundingClientRect().left - host.getBoundingClientRect().left;
    const indent = Math.max(12, Math.min(offset, host.clientWidth - 240));
    q('.bar').style.setProperty('--indent', `${Math.round(indent)}px`);
  };

  const setVizOn = (on: boolean) => {
    vizOn = on;
    visualizer?.setEnabled(on);
    if (root) render();
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
      el(doc, 'span', { class: 'grow' }),
      button(doc, 'mini', 'Open the mini player window', ICONS.mini),
    );
    const canvas = el(doc, 'canvas', {
      role: 'button',
      tabindex: '0',
      'aria-label': 'Spectrum visualizer',
      title: 'Spectrum visualizer: click to turn on or off',
    });
    const vizStrip = el(doc, 'div', { class: 'viz-strip' }, canvas);
    const tab = (id: string, label: string, iconPath: string, smallId: string, smallClass = '') =>
      el(
        doc,
        'button',
        { id, type: 'button', class: 'tab', role: 'tab', 'aria-selected': 'false' },
        icon(doc, iconPath),
        label,
        el(doc, 'small', { id: smallId, class: smallClass }),
      );
    const tabs = el(
      doc,
      'div',
      { class: 'tabs', role: 'tablist', 'aria-label': 'Panels' },
      tab('eq', 'Equalizer', ICONS.eq, 'eq-state', 'state'),
      tab('queue-btn', 'Tracks', ICONS.queue, 'queue-count'),
    );
    const eqPanel = buildEqPanel(doc);
    const trackPanel = buildTrackList(doc);
    renderTracks = createTrackListRenderer(trackPanel);
    const panel = el(doc, 'section', { class: 'ip-panel' }, tabs, eqPanel, trackPanel);
    root.append(style, bar, vizStrip, panel);

    visualizer?.stop();
    visualizer = createVisualizer(canvas, (bars) => player.engine?.getSpectrum(bars) ?? null);
    visualizer.setEnabled(vizOn);
    const toggleViz = () => void browser.storage.local.set({ [VISUALIZER_KEY]: !vizOn });
    canvas.addEventListener('click', (e) => e.isTrusted && toggleViz());
    canvas.addEventListener('keydown', (e) => {
      if (!e.isTrusted || (e.key !== 'Enter' && e.key !== ' ')) return;
      e.preventDefault();
      toggleViz();
    });

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
      else if (btn.id === 'eq') open = open === 'eq' ? null : 'eq';
      else if (btn.id === 'queue-btn') open = open === 'queue' ? null : 'queue';
      else if (btn.id === 'mini') openMiniPlayer();
      render();
    });
    // Keys typed into our controls (arrows on a slider, letters in the
    // preset list) must not also trigger Icedrive's own shortcuts.
    for (const type of ['keydown', 'keyup', 'keypress']) root.addEventListener(type, (e) => e.stopPropagation());

    wrap.append(host);
    render();
  };

  void browser.storage.local.get(VISUALIZER_KEY).then((saved) => setVizOn(readVisualizerSetting(saved[VISUALIZER_KEY])));
  const onStorage = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area === 'local' && VISUALIZER_KEY in changes) setVizOn(readVisualizerSetting(changes[VISUALIZER_KEY]!.newValue));
  };
  browser.storage.onChanged.addListener(onStorage);

  const observer = new MutationObserver(attach);
  observer.observe(doc.body, { childList: true, subtree: true });
  attach();
  const timer = setInterval(render, REFRESH_MS);

  return () => {
    observer.disconnect();
    clearInterval(timer);
    visualizer?.stop();
    browser.storage.onChanged.removeListener(onStorage);
    doc.getElementById(HOST_ID)?.remove();
  };
}
