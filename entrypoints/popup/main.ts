import '@/lib/ui/theme.css';
import './style.css';
import type { PlayerCommand, PlayerState } from '@/lib/messages';
import { formatTime } from '@/lib/format';
import { openMiniPlayer } from '@/lib/mini-player';
import { el, setRangeFill } from '@/lib/ui/dom';
import { buildEqPanel, renderEqPanel, wireEqPanel } from '@/lib/ui/eq-panel';
import { buildTrackList, createTrackListRenderer } from '@/lib/ui/track-list';
import { barsForWidth, createVisualizer, readVisualizerSetting, VISUALIZER_KEY } from '@/lib/ui/visualizer';
import { EQ_PRESETS } from '@/lib/equalizer';
import { formatSpeed, PLAYBACK_SPEEDS } from '@/lib/speed';
import { parseArtResponse, parseSpectrum } from '@/lib/validate';

const POLL_MS = 500;
const ICEDRIVE_URL = 'https://icedrive.net/*';
/** Which panel tab (track list or equalizer) is open (remembered). */
const TAB_KEY = 'popupTab';
/** The visualizer asks the Icedrive tab for new levels about this often. */
const SPECTRUM_MS = 33;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const seek = $<HTMLInputElement>('seek');
const volume = $<HTMLInputElement>('volume');
const speed = $<HTMLSelectElement>('speed');
speed.append(...PLAYBACK_SPEEDS.map((s) => el(document, 'option', { value: String(s) }, formatSpeed(s))));

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

// ---- Equalizer and track list (the same panels as inside Icedrive), as tabs ----

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

// ---- Spectrum visualizer ----

let spectrum: number[] | null = null;
let vizOn = true;
const vizCanvas = $<HTMLCanvasElement>('viz');
const visualizer = createVisualizer(vizCanvas, () => spectrum);

function setVizOn(on: boolean) {
  vizOn = on;
  visualizer.setEnabled(on);
  vizCanvas.setAttribute('aria-pressed', String(on));
  vizCanvas.title = on ? 'Spectrum visualizer: click to turn off' : 'Spectrum visualizer: click to turn on';
  if (!on) spectrum = null;
}
void browser.storage.local.get(VISUALIZER_KEY).then((saved) => setVizOn(readVisualizerSetting(saved[VISUALIZER_KEY])));
browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && VISUALIZER_KEY in changes) setVizOn(readVisualizerSetting(changes[VISUALIZER_KEY]!.newValue));
});
const toggleViz = () => void browser.storage.local.set({ [VISUALIZER_KEY]: !vizOn });
vizCanvas.addEventListener('click', toggleViz);
vizCanvas.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  e.preventDefault();
  toggleViz();
});

/** Fetches levels while a song plays, one request at a time. */
async function pollSpectrum() {
  const playing = vizOn && lastState?.active && !lastState.paused;
  if (playing && !$('player').hidden) {
    const bars = barsForWidth(vizCanvas.clientWidth);
    spectrum = parseSpectrum(await send<unknown>({ type: 'getSpectrum', bars }));
  } else {
    spectrum = null;
  }
  setTimeout(() => void pollSpectrum(), SPECTRUM_MS);
}

let lastState: PlayerState | null = null;
let draggingBand: HTMLInputElement | null = null;

// ---- Rendering ----

let dragging = false;
let draggingVolume = false;
let artSource: string | null | undefined;

function showEmpty(text: string) {
  $('empty').hidden = false;
  $('empty-text').textContent = text;
  $('player').hidden = true;
}

function renderArt(sourceUrl: string | null) {
  if (sourceUrl === artSource) return;
  artSource = sourceUrl;
  const art = $('art');
  art.style.backgroundImage = '';
  art.classList.remove('has-image');
  if (!sourceUrl) return;
  void send<unknown>({ type: 'getArt' }).then((raw) => {
    // Only our own base64 JPEG data: URL ever reaches CSS.
    const res = parseArtResponse(raw);
    if (!res?.dataUrl || res.sourceUrl !== artSource) return;
    art.style.backgroundImage = `url("${res.dataUrl}")`;
    art.classList.add('has-image');
  });
}

function renderSeek(currentTime: number, duration: number) {
  if (dragging) return;
  seek.max = String(duration || 0);
  seek.value = String(currentTime);
  seek.disabled = !duration;
  setRangeFill(seek);
  $('current').textContent = formatTime(currentTime);
  $('duration').textContent = formatTime(duration);
  $('lcd-time').textContent = formatTime(currentTime);
  $('lcd-total').textContent = `/ ${formatTime(duration)}`;
}

function renderVolume(level: number, muted: boolean) {
  if (!draggingVolume) volume.value = String(muted ? 0 : level);
  setRangeFill(volume);
  volume.title = `Volume: ${Math.round(Number(volume.value) * 100)}%`;
  const silent = muted || level === 0;
  $('icon-volume').toggleAttribute('hidden', silent);
  $('icon-muted').toggleAttribute('hidden', !silent);
  const label = muted ? 'Unmute' : 'Mute';
  $('mute').setAttribute('aria-label', label);
  $('mute').title = label;
}

function renderSpeed(rate: number) {
  if (document.activeElement === speed) return; // the list may be open
  const value = String(rate);
  // A speed set elsewhere that isn't in our list still shows as it is.
  const other = speed.querySelector<HTMLOptionElement>('[data-other]');
  if (other?.value !== value) other?.remove();
  if (![...speed.options].some((o) => o.value === value))
    speed.append(el(document, 'option', { value, 'data-other': '' }, formatSpeed(rate)));
  speed.value = value;
}

const REPEAT_LABELS = { off: 'off', all: 'whole folder', one: 'one track' } as const;

function renderModes({ settings }: PlayerState) {
  const shuffle = $('shuffle');
  shuffle.setAttribute('aria-pressed', String(settings.shuffle));
  shuffle.title = `Shuffle: ${settings.shuffle ? 'on' : 'off'}`;
  const repeat = $('repeat');
  repeat.setAttribute('aria-pressed', String(settings.repeat !== 'off'));
  repeat.title = `Repeat: ${REPEAT_LABELS[settings.repeat]}`;
  $('repeat-one').hidden = settings.repeat !== 'one';
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
  $('tab-tracks-count').textContent = String(state.tracks.length);
  $('tab-eq-state').textContent = state.eq.enabled ? (EQ_PRESETS[state.eq.preset]?.label ?? 'Custom') : 'Off';
  $('tab-eq-state').classList.toggle('state', state.eq.enabled);

  if (!state.active || !state.nowPlaying) {
    showEmpty(
      state.tracks.length
        ? 'Nothing is playing. Pick a track from the list below.'
        : 'Nothing is playing. Open a music folder in Icedrive.',
    );
    artSource = undefined;
    return;
  }

  const { nowPlaying } = state;
  $('empty').hidden = true;
  $('player').hidden = false;
  $('title').textContent = nowPlaying.title;
  $('title').title = nowPlaying.fileName;
  $('artist').textContent = nowPlaying.artist;
  $('artist').hidden = !nowPlaying.artist;
  const place = state.currentIndex >= 0 ? `${state.currentIndex + 1} / ${state.tracks.length}` : '';
  $('position').textContent = [state.folderName, place].filter(Boolean).join(' · ');
  ($('position').parentElement as HTMLElement).hidden = !$('position').textContent;
  renderArt(nowPlaying.artUrl);
  renderSeek(state.currentTime, state.duration);
  renderVolume(state.volume, state.muted);
  renderSpeed(state.speed);

  // <svg> has no .hidden property, so toggle the attribute directly.
  $('icon-play').toggleAttribute('hidden', !state.paused);
  $('icon-pause').toggleAttribute('hidden', state.paused);
  $('play').setAttribute('aria-label', state.paused ? 'Play' : 'Pause');
  $<HTMLButtonElement>('next').disabled = !state.hasNext;
  renderModes(state);
}

// ---- Detached window ----

const DETACHED = new URLSearchParams(location.search).has('detached');
if (DETACHED) document.body.classList.add('detached');

/** Opens the player in a small separate window, or focuses the one already open. */
async function detach() {
  await openMiniPlayer();
  window.close();
}

// ---- Wiring ----

const run = async (cmd: PlayerCommand = { type: 'getState' }) => render(await send(cmd));

$('prev').addEventListener('click', () => run({ type: 'previous' }));
$('play').addEventListener('click', () => run({ type: 'togglePlay' }));
$('next').addEventListener('click', () => run({ type: 'next' }));
$('detach').addEventListener('click', () => void detach());
$('shuffle').addEventListener('click', () => run({ type: 'toggleShuffle' }));
$('repeat').addEventListener('click', () => run({ type: 'cycleRepeat' }));

seek.addEventListener('input', () => {
  dragging = true;
  setRangeFill(seek);
  $('current').textContent = formatTime(Number(seek.value));
});
seek.addEventListener('change', () => {
  dragging = false;
  void run({ type: 'seek', time: Number(seek.value) });
});

volume.addEventListener('input', () => {
  draggingVolume = true;
  renderVolume(Number(volume.value), false);
  void send({ type: 'setVolume', volume: Number(volume.value) });
});
volume.addEventListener('change', () => {
  draggingVolume = false;
  void run({ type: 'setVolume', volume: Number(volume.value) });
});
$('mute').addEventListener('click', () => run({ type: 'toggleMute' }));
speed.addEventListener('change', () => void run({ type: 'setSpeed', speed: Number(speed.value) }));

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
