import type { EqStatus } from './audio-engine';
import {
  CUSTOM_PRESET,
  EQ_FREQUENCIES,
  EQ_MAX_DB,
  EQ_MIN_DB,
  EQ_PRESETS,
  formatDb,
  formatFrequency,
} from './equalizer';
import type { PlayerState } from './messages';
import type { PlayerController } from './player-controller';

const HOST_ID = 'icedrive-music-ext-controls';
const REFRESH_MS = 500;

/** SVG path data for each button (fixed strings, never page data). */
const ICONS = {
  shuffle:
    'M10.59 9.17 5.41 4 4 5.41l5.17 5.17zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4zm.33 9.41-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04z',
  prev: 'M6 6h2v12H6zm3.5 6 8.5 6V6z',
  next: 'M6 18l8.5-6L6 6zM16 6v12h2V6z',
  repeat: 'M7 7h10v3l4-4-4-4v3H5v6h2zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2z',
  eq: 'M7 18h2V6H7zm4 4h2V2h-2zm-8-8h2v-4H3zm12 4h2V6h-2zm4-8v4h2v-4z',
  queue: 'M3 13h2v-2H3zm0 4h2v-2H3zm0-8h2V7H3zm4 4h14v-2H7zm0 4h14v-2H7zM7 7v2h14V7z',
  mini: 'M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3z',
};
const SVG_NS = 'http://www.w3.org/2000/svg';

// Lives in a shadow root so Icedrive's CSS can't touch it and ours can't leak.
// Colours follow Icedrive's dark player (teal #17a1a2 on navy #202639).
const STYLE = `
  :host { all: initial; display: block; font: 13px/1.3 system-ui, sans-serif; color: #c9cfdd; }
  [hidden] { display: none !important; }
  .bar {
    display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 10px;
    padding: 8px 12px 0;
  }
  .sep { width: 1px; height: 22px; background: #313953; margin: 0 4px; }
  button {
    position: relative; width: 36px; height: 36px; padding: 0; border: 0; border-radius: 50%;
    background: transparent; color: #c9cfdd; cursor: pointer; display: grid; place-items: center;
    font: inherit;
  }
  button:hover { background: rgba(255, 255, 255, 0.08); color: #fff; }
  button:focus-visible, select:focus-visible, input:focus-visible { outline: 2px solid #17a1a2; outline-offset: 2px; }
  button:disabled { opacity: 0.35; cursor: default; background: transparent; }
  svg { width: 22px; height: 22px; fill: currentColor; }
  .toggle svg, .panel-btn svg { width: 19px; height: 19px; }
  .toggle, .panel-btn { color: #7d869c; }
  .toggle[aria-pressed='true'], .panel-btn[aria-expanded='true'] { color: #17a1a2; }
  .toggle[aria-pressed='true']::after, .panel-btn.lit::after {
    content: ''; position: absolute; bottom: 3px; left: 50%; width: 4px; height: 4px;
    margin-left: -2px; border-radius: 50%; background: #17a1a2;
  }
  .badge {
    position: absolute; top: 4px; right: 3px; min-width: 12px; height: 12px; border-radius: 6px;
    background: #17a1a2; color: #0d1220; font-size: 9px; font-weight: 700; line-height: 12px; text-align: center;
  }

  .panel {
    margin: 10px 12px 4px; padding: 12px; border-radius: 10px; background: #1a1f30;
    border: 1px solid #2a3148;
  }
  .row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
  .grow { flex: 1; }
  .switch { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; font-weight: 600; color: #e9ecf5; }
  .switch input { appearance: none; margin: 0; width: 32px; height: 18px; border-radius: 9px; background: #313953; position: relative; cursor: pointer; transition: background .15s; }
  .switch input::after { content: ''; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: #c9cfdd; transition: transform .15s; }
  .switch input:checked { background: #17a1a2; }
  .switch input:checked::after { transform: translateX(14px); background: #fff; }
  select {
    font: inherit; color: #e9ecf5; background: #202639; border: 1px solid #313953; border-radius: 6px;
    padding: 4px 6px; max-width: 220px;
  }
  .text-btn {
    width: auto; height: auto; border-radius: 6px; padding: 4px 10px; color: #c9cfdd; border: 1px solid #313953;
  }
  .status { font-size: 12px; color: #8f97ad; }
  .status.warn { color: #e0b252; }

  .bands {
    display: grid; grid-template-columns: repeat(11, minmax(30px, 1fr)); gap: 2px; margin-top: 12px;
    overflow-x: auto;
  }
  .bands.off { opacity: 0.5; }
  .band { display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 30px; }
  .band.preamp { border-right: 1px solid #2a3148; }
  .db, .freq { font-size: 11px; font-variant-numeric: tabular-nums; color: #8f97ad; white-space: nowrap; }
  .freq { color: #c9cfdd; }
  .slot { position: relative; width: 24px; height: 110px; }
  .slot input {
    position: absolute; top: 50%; left: 50%; width: 110px; height: 24px; margin: 0;
    transform: translate(-50%, -50%) rotate(-90deg); background: transparent; appearance: none; cursor: pointer;
  }
  input[type='range']::-webkit-slider-runnable-track { height: 4px; border-radius: 2px; background: #313953; }
  input[type='range']::-webkit-slider-thumb {
    appearance: none; width: 14px; height: 14px; margin-top: -5px; border-radius: 50%; background: #17a1a2;
    border: 2px solid #e9ecf5;
  }
  input[type='range']::-moz-range-track { height: 4px; border-radius: 2px; background: #313953; }
  input[type='range']::-moz-range-thumb { width: 12px; height: 12px; border-radius: 50%; background: #17a1a2; border: 2px solid #e9ecf5; }

  .qhead { display: flex; justify-content: space-between; gap: 10px; margin-bottom: 6px; }
  .folder { font-weight: 600; color: #e9ecf5; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .count { color: #8f97ad; flex: none; }
  ol { list-style: none; margin: 0; padding: 0; max-height: 240px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: #313953 transparent; }
  ol button {
    width: 100%; height: auto; border-radius: 6px; padding: 5px 8px; display: flex; gap: 10px;
    justify-content: flex-start; text-align: left; color: #c9cfdd;
  }
  .num { flex: none; width: 24px; text-align: right; color: #7d869c; font-variant-numeric: tabular-nums; }
  .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  li.current button { color: #17a1a2; font-weight: 600; background: rgba(23, 161, 162, 0.1); }
  li.current .num { color: #17a1a2; }
`;

const REPEAT_LABELS = { off: 'off', all: 'whole folder', one: 'one track' } as const;

const STATUS_TEXT: Record<EqStatus, string> = {
  off: '',
  waiting: 'Starts with the next song you play.',
  checking: 'Connecting…',
  active: 'Active',
  unavailable: "Can't process this song: Icedrive's server doesn't allow it. It plays without EQ.",
};

/** Small DOM builder (no innerHTML), so nothing on this path is ever parsed as markup. */
function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  props: Record<string, string> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  for (const [key, value] of Object.entries(props)) node.setAttribute(key, value);
  node.append(...children);
  return node;
}

function icon(doc: Document, pathData: string): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = doc.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', pathData);
  svg.append(path);
  return svg;
}

function button(doc: Document, id: string, label: string, iconPath: string, className = ''): HTMLButtonElement {
  const btn = el(doc, 'button', { id, type: 'button', 'aria-label': label, title: label }, icon(doc, iconPath));
  if (className) btn.className = className;
  if (className === 'toggle') btn.setAttribute('aria-pressed', 'false');
  if (className === 'panel-btn') btn.setAttribute('aria-expanded', 'false');
  return btn;
}

function bandSlider(doc: Document, id: string, label: string, freqText: string): HTMLElement {
  const input = el(doc, 'input', {
    id,
    type: 'range',
    min: String(EQ_MIN_DB),
    max: String(EQ_MAX_DB),
    step: '0.5',
    value: '0',
    'aria-label': label,
  });
  return el(
    doc,
    'div',
    { class: id === 'preamp' ? 'band preamp' : 'band' },
    el(doc, 'span', { class: 'db', 'data-for': id }, '0'),
    el(doc, 'div', { class: 'slot' }, input),
    el(doc, 'span', { class: 'freq' }, freqText),
  );
}

function buildEqPanel(doc: Document): HTMLElement {
  const presetSelect = el(doc, 'select', { id: 'eq-preset', 'aria-label': 'Equalizer preset' });
  for (const [id, preset] of Object.entries(EQ_PRESETS)) presetSelect.append(el(doc, 'option', { value: id }, preset.label));
  presetSelect.append(el(doc, 'option', { value: CUSTOM_PRESET, disabled: '' }, 'Custom'));

  const bands = el(doc, 'div', { class: 'bands', id: 'bands' }, bandSlider(doc, 'preamp', 'Preamp', 'Pre'));
  EQ_FREQUENCIES.forEach((hz, i) =>
    bands.append(bandSlider(doc, `band-${i}`, `${formatFrequency(hz)}Hz`, formatFrequency(hz))),
  );

  return el(
    doc,
    'section',
    { class: 'panel', id: 'eq-panel', 'aria-label': 'Equalizer', hidden: '' },
    el(
      doc,
      'div',
      { class: 'row' },
      el(doc, 'label', { class: 'switch' }, el(doc, 'input', { id: 'eq-on', type: 'checkbox' }), 'Equalizer'),
      presetSelect,
      el(doc, 'button', { id: 'eq-reset', type: 'button', class: 'text-btn', title: 'Set every band to 0 dB' }, 'Reset'),
      el(doc, 'span', { class: 'grow' }),
      el(doc, 'span', { id: 'eq-status', class: 'status', role: 'status' }),
    ),
    bands,
  );
}

function buildQueuePanel(doc: Document): HTMLElement {
  return el(
    doc,
    'section',
    { class: 'panel', id: 'queue-panel', 'aria-label': 'Tracks in this folder', hidden: '' },
    el(doc, 'div', { class: 'qhead' }, el(doc, 'span', { class: 'folder', id: 'folder' }), el(doc, 'span', { class: 'count', id: 'count' })),
    el(doc, 'ol', { id: 'queue' }),
  );
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
  let renderedQueueKey = '';
  let renderedCurrent = -2;

  const q = <T extends HTMLElement>(sel: string) => root!.querySelector<T>(sel)!;

  const renderEq = (state: PlayerState) => {
    const { eq, eqStatus } = state;
    q<HTMLInputElement>('#eq-on').checked = eq.enabled;
    q<HTMLSelectElement>('#eq-preset').value = eq.preset;
    q('#bands').classList.toggle('off', !eq.enabled);
    const status = q('#eq-status');
    status.textContent = STATUS_TEXT[eqStatus];
    status.classList.toggle('warn', eqStatus === 'unavailable');
    const values: [string, number][] = [['preamp', eq.preamp], ...eq.gains.map((g, i): [string, number] => [`band-${i}`, g])];
    for (const [id, value] of values) {
      const input = q<HTMLInputElement>(`#${id}`);
      if (input !== dragging) input.value = String(value);
      q(`.db[data-for="${id}"]`).textContent = formatDb(Number(input.value));
    }
    const eqBtn = q('#eq');
    eqBtn.classList.toggle('lit', eq.enabled);
    eqBtn.title = `Equalizer: ${eq.enabled ? (EQ_PRESETS[eq.preset]?.label ?? 'Custom') : 'off'}`;
  };

  const renderQueue = (state: PlayerState) => {
    q('#folder').textContent = state.folderName || 'Tracks in this folder';
    q('#count').textContent = `${state.tracks.length} ${state.tracks.length === 1 ? 'track' : 'tracks'}`;
    const list = q('#queue');
    const key = state.tracks.map((t) => t.id).join(',');
    if (key !== renderedQueueKey) {
      renderedQueueKey = key;
      renderedCurrent = -2;
      list.replaceChildren(
        ...state.tracks.map((track, i) =>
          el(
            doc,
            'li',
            {},
            el(
              doc,
              'button',
              { type: 'button', 'data-id': track.id, title: track.fileName },
              el(doc, 'span', { class: 'num' }, String(i + 1)),
              el(doc, 'span', { class: 'name' }, track.fileName.replace(/\.[^.]+$/, '')),
            ),
          ),
        ),
      );
    }
    if (state.currentIndex !== renderedCurrent) {
      list.querySelector('.current')?.classList.remove('current');
      const li = list.children[state.currentIndex];
      if (li) {
        li.classList.add('current');
        if (open.queue) li.scrollIntoView({ block: 'nearest' });
      }
      renderedCurrent = state.currentIndex;
    }
  };

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

    q('#eq').setAttribute('aria-expanded', String(open.eq));
    q('#eq-panel').hidden = !open.eq;
    q('#queue-btn').setAttribute('aria-expanded', String(open.queue));
    q('#queue-panel').hidden = !open.queue;
    renderEq(state);
    if (open.queue) renderQueue(state);
  };

  const sliderValue = (input: HTMLInputElement): number => Number(input.value);

  const onSlider = (input: HTMLInputElement) => {
    const eq = player.engine?.getSettings();
    if (!eq) return;
    if (input.id === 'preamp') {
      player.updateEq({ preamp: sliderValue(input) });
    } else {
      const i = Number(input.id.slice('band-'.length));
      const gains = [...eq.gains];
      gains[i] = sliderValue(input);
      player.updateEq({ gains });
    }
  };

  const attach = () => {
    const wrap = doc.querySelector('#preview .content .audio-wrap');
    if (!wrap || wrap.querySelector(`#${HOST_ID}`)) return;
    const host = doc.createElement('div');
    host.id = HOST_ID;
    // Closed: Icedrive's scripts can't reach into our controls via host.shadowRoot.
    root = host.attachShadow({ mode: 'closed' });
    renderedQueueKey = '';
    renderedCurrent = -2;
    const style = doc.createElement('style');
    style.textContent = STYLE;
    const repeat = button(doc, 'repeat', 'Repeat', ICONS.repeat, 'toggle');
    const badge = el(doc, 'span', { class: 'badge', hidden: '' }, '1');
    repeat.append(badge);
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
    root.append(style, bar, buildEqPanel(doc), buildQueuePanel(doc));

    // Ignore events synthesized by page scripts; only real user input counts.
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
      else if (btn.id === 'eq-reset') player.applyEqPreset('flat');
      render();
    });
    root.addEventListener('input', (e) => {
      if (!e.isTrusted || !(e.target instanceof HTMLInputElement) || e.target.type !== 'range') return;
      dragging = e.target;
      onSlider(e.target);
      render();
    });
    root.addEventListener('change', (e) => {
      if (!e.isTrusted) return;
      const target = e.target;
      if (target instanceof HTMLInputElement && target.id === 'eq-on') player.updateEq({ enabled: target.checked });
      else if (target instanceof HTMLSelectElement && target.id === 'eq-preset') player.applyEqPreset(target.value);
      else if (target instanceof HTMLInputElement && target.type === 'range') dragging = null;
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
