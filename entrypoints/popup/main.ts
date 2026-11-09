import '@/lib/ui/theme.css';
import '@/lib/ui/deck.css';
import './style.css';
import type { PlayerCommand, PlayerState } from '@/lib/messages';
import { openMiniPlayer } from '@/lib/mini-player';
import { buildBanner } from '@/lib/ui/brand';
import { createDeck } from '@/lib/ui/deck';
import { el, icon, ICONS } from '@/lib/ui/dom';
import { buildEqPanel, renderEqPanel, wireEqPanel } from '@/lib/ui/eq-panel';
import { buildTrackList, createTrackListRenderer } from '@/lib/ui/track-list';
import { barsForWidth } from '@/lib/ui/visualizer';
import { EQ_PRESETS } from '@/lib/equalizer';
import { parseArtResponse, parseSpectrum } from '@/lib/validate';

const POLL_MS = 500;
const ICEDRIVE_URL = 'https://icedrive.net/*';
/** Which panel tab (track list or equalizer) is open (remembered). */
const TAB_KEY = 'popupTab';
/** The visualizer asks the Icedrive tab for new levels about this often. */
const SPECTRUM_MS = 33;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

async function findIcedriveTab(): Promise<number | undefined> {
  const [active] = await browser.tabs.query({ active: true, currentWindow: true, url: ICEDRIVE_URL });
  if (active?.id !== undefined) return active.id;
  const [any] = await browser.tabs.query({ url: ICEDRIVE_URL });
  return any?.id;
}

let tabId: number | undefined;

async function send<T = PlayerState>(cmd: PlayerCommand): Promise<T | null> {
  tabId ??= await findIcedriveTab();
  if (tabId === undefined) return null;
  try {
    return (await browser.tabs.sendMessage(tabId, cmd)) as T;
  } catch {
    tabId = undefined; // tab closed, or opened before the extension was installed
    return null;
  }
}

const run = async (cmd: PlayerCommand = { type: 'getState' }) => render(await send(cmd));

// ---- Banner and the player deck (the same as inside Icedrive) ----

const DETACHED = new URLSearchParams(location.search).has('detached');
if (DETACHED) document.body.classList.add('detached');

const detachBtn = el(
  document,
  'button',
  { id: 'detach', class: 'icon-btn', type: 'button', title: 'Open as mini player', 'aria-label': 'Open as mini player' },
  icon(document, ICONS.mini),
);
detachBtn.addEventListener('click', async () => {
  await openMiniPlayer();
  window.close();
});
$('banner-slot').replaceWith(buildBanner(document, detachBtn));

let spectrum: number[] | null = null;
const deck = createDeck(document, {
  run: (cmd) => void run(cmd),
  // Slider moves are sent as they happen; rendering waits for the release.
  preview: (cmd) => void send(cmd),
  getArt: async (sourceUrl) => {
    const res = parseArtResponse(await send<unknown>({ type: 'getArt' }));
    return res?.sourceUrl === sourceUrl ? res.dataUrl : null;
  },
  readSpectrum: () => spectrum,
});
deck.el.id = 'player';
deck.el.hidden = true;
$('player-slot').replaceWith(deck.el);
const vizCanvas = deck.el.querySelector('canvas')!;

/** Fetches levels while a song plays, one request at a time. */
async function pollSpectrum() {
  if (deck.wantsSpectrum() && !deck.el.hidden) {
    const bars = barsForWidth(vizCanvas.clientWidth);
    spectrum = parseSpectrum(await send<unknown>({ type: 'getSpectrum', bars }));
  } else {
    spectrum = null;
  }
  setTimeout(() => void pollSpectrum(), SPECTRUM_MS);
}

// ---- Equalizer and track list, as tabs ----

const eqPanel = buildEqPanel(document);
$('eq-slot').append(eqPanel);
const trackPanel = buildTrackList(document);
$('tracks-slot').append(trackPanel);
const renderTracks = createTrackListRenderer(trackPanel);

type Tab = 'tracks' | 'eq';
function showTab(tab: Tab) {
  for (const [id, slot] of [['tracks', 'tracks-slot'], ['eq', 'eq-slot']] as const) {
    $(`tab-${id}`).setAttribute('aria-selected', String(tab === id));
    $(slot).hidden = tab !== id;
  }
}
showTab('tracks');
void browser.storage.local.get(TAB_KEY).then((saved) => showTab(saved[TAB_KEY] === 'eq' ? 'eq' : 'tracks'));
for (const tab of ['tracks', 'eq'] as const) {
  $(`tab-${tab}`).addEventListener('click', () => {
    showTab(tab);
    void browser.storage.local.set({ [TAB_KEY]: tab });
  });
}

let lastState: PlayerState | null = null;
let draggingBand: HTMLInputElement | null = null;

// ---- Rendering ----

function showEmpty(text: string) {
  $('empty').hidden = false;
  $('empty-text').textContent = text;
  deck.el.hidden = true;
}

function render(state: PlayerState | null) {
  lastState = state;
  $('tabs').hidden = !state;
  $('panels').hidden = !state;
  document.body.classList.toggle('full', !!state);
  if (!state) {
    showEmpty('Open Icedrive in your browser. If the tab is already open, reload it.');
    return;
  }

  renderEqPanel(eqPanel, state.eq, state.eqStatus, draggingBand);
  renderTracks(state.tracks, state.currentIndex, state.folderName);
  // A dot on the tab says the equalizer is on; the preset is in the tooltip.
  $('tab-eq').classList.toggle('lit', state.eq.enabled);
  $('tab-eq').title = `Equalizer: ${state.eq.enabled ? (EQ_PRESETS[state.eq.preset]?.label ?? 'Custom') : 'off'}`;

  if (!state.active || !state.nowPlaying) {
    showEmpty(
      state.tracks.length
        ? 'Nothing is playing. Pick a track from the list below.'
        : 'Nothing is playing. Open a music folder in Icedrive.',
    );
    return;
  }
  $('empty').hidden = true;
  deck.el.hidden = false;
  deck.render(state);
}

// ---- Wiring ----

wireEqPanel(
  eqPanel,
  {
    // Slider moves are sent as they happen; rendering waits for the reply.
    setEq: (eq) => void run({ type: 'setEq', eq }),
    preset: (preset) => void run({ type: 'eqPreset', preset }),
  },
  () => lastState?.eq ?? null,
  (input) => (draggingBand = input),
);

trackPanel.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-id]');
  if (btn?.dataset.id) void run({ type: 'playTrack', id: btn.dataset.id });
});

document.addEventListener('keydown', (e) => {
  if (
    e.target instanceof HTMLInputElement ||
    e.target instanceof HTMLSelectElement ||
    e.target instanceof HTMLButtonElement ||
    e.target === vizCanvas
  )
    return;
  if (e.code === 'Space') {
    e.preventDefault();
    void run({ type: 'togglePlay' });
  }
});

void run();
setInterval(() => void run(), POLL_MS);
void pollSpectrum();
