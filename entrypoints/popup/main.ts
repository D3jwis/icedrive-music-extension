import type { PlayerCommand, PlayerState } from '@/lib/messages';
import type { TrackRef } from '@/lib/icedrive-dom';
import { formatTime } from '@/lib/format';
import { openMiniPlayer } from '@/lib/mini-player';
import { CUSTOM_PRESET, EQ_PRESETS } from '@/lib/equalizer';
import type { EqStatus } from '@/lib/audio-engine';
import { parseArtResponse } from '@/lib/validate';

const POLL_MS = 500;
const ICEDRIVE_URL = 'https://icedrive.net/*';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const seek = $<HTMLInputElement>('seek');
const volume = $<HTMLInputElement>('volume');
const presetSelect = $<HTMLSelectElement>('eq-preset');

for (const [id, preset] of Object.entries(EQ_PRESETS)) presetSelect.add(new Option(preset.label, id));
const customOption = new Option('Custom', CUSTOM_PRESET);
customOption.disabled = true;
presetSelect.add(customOption);

/** File name without its extension, used in the queue. */
function displayName(track: TrackRef): string {
  return track.fileName.replace(/\.[^.]+$/, '');
}

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

// ---- Rendering ----

let dragging = false;
let artSource: string | null | undefined;
let renderedQueueKey = '';
let renderedCurrent = -2;

function showEmpty(text: string) {
  $('empty').hidden = false;
  $('empty-text').textContent = text;
  $('now').hidden = true;
  $('transport').hidden = true;
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
  updateSeekFill();
  $('current').textContent = formatTime(currentTime);
  $('duration').textContent = formatTime(duration);
}

function updateFill(input: HTMLInputElement) {
  const max = Number(input.max) || 0;
  const pct = max ? (Number(input.value) / max) * 100 : 0;
  input.style.setProperty('--pct', `${pct}%`);
}

const updateSeekFill = () => updateFill(seek);

let draggingVolume = false;

function renderVolume(level: number, muted: boolean) {
  if (!draggingVolume) volume.value = String(muted ? 0 : level);
  updateFill(volume);
  $('volume-pct').textContent = `${Math.round(Number(volume.value) * 100)}%`;
  const silent = muted || level === 0;
  $('icon-volume').toggleAttribute('hidden', silent);
  $('icon-muted').toggleAttribute('hidden', !silent);
  const label = muted ? 'Unmute' : 'Mute';
  $('mute').setAttribute('aria-label', label);
  $('mute').title = label;
}

const EQ_STATUS_TEXT: Partial<Record<EqStatus, string>> = {
  checking: 'Equalizer: connecting…',
  unavailable: "Equalizer can't process this song (Icedrive's server doesn't allow it).",
};

function renderEq({ eq, eqStatus }: PlayerState) {
  $<HTMLInputElement>('eq-on').checked = eq.enabled;
  presetSelect.value = eq.preset;
  presetSelect.disabled = !eq.enabled;
  const status = $('eq-status');
  status.textContent = EQ_STATUS_TEXT[eqStatus] ?? '';
  status.hidden = !status.textContent;
  status.classList.toggle('warn', eqStatus === 'unavailable');
}

function renderQueue(tracks: TrackRef[], currentIndex: number, folderName = '') {
  const wrap = $('queue-wrap');
  wrap.hidden = tracks.length === 0;
  $('queue-count').textContent = `${tracks.length} ${tracks.length === 1 ? 'track' : 'tracks'}`;
  const folder = $('folder-name');
  folder.textContent = folderName || 'Tracks in this folder';
  folder.title = folderName ? `Playing from folder: ${folderName}` : '';

  const list = $('queue');
  const key = tracks.map((t) => t.id).join(',');
  if (key !== renderedQueueKey) {
    renderedQueueKey = key;
    renderedCurrent = -2;
    list.replaceChildren(
      ...tracks.map((track, i) => {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.title = track.fileName;
        btn.dataset.id = track.id;
        const num = document.createElement('span');
        num.className = 'num';
        num.textContent = String(i + 1);
        const name = document.createElement('span');
        name.className = 'name';
        name.textContent = displayName(track);
        btn.append(num, name);
        li.append(btn);
        return li;
      }),
    );
  }

  if (currentIndex !== renderedCurrent) {
    list.querySelector('.current')?.classList.remove('current');
    const li = list.children[currentIndex];
    if (li) {
      li.classList.add('current');
      // Scroll the playing song into view the first time and when it changes.
      li.scrollIntoView({ block: 'nearest' });
    }
    renderedCurrent = currentIndex;
  }
}

function render(state: PlayerState | null) {
  if (!state) {
    showEmpty('Open Icedrive in your browser. If the tab is already open, reload it.');
    renderQueue([], -1);
    return;
  }

  renderQueue(state.tracks, state.currentIndex, state.folderName);

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
  $('now').hidden = false;
  $('transport').hidden = false;
  $('title').textContent = nowPlaying.title;
  $('title').title = nowPlaying.fileName;
  $('artist').textContent = nowPlaying.artist;
  $('artist').hidden = !nowPlaying.artist;
  $('position').textContent =
    state.currentIndex >= 0 ? `Track ${state.currentIndex + 1} of ${state.tracks.length}` : '';
  renderArt(nowPlaying.artUrl);
  renderSeek(state.currentTime, state.duration);
  renderVolume(state.volume, state.muted);
  renderEq(state);

  // <svg> has no .hidden property, so toggle the attribute directly.
  $('icon-play').toggleAttribute('hidden', !state.paused);
  $('icon-pause').toggleAttribute('hidden', state.paused);
  $('play').setAttribute('aria-label', state.paused ? 'Play' : 'Pause');
  $<HTMLButtonElement>('next').disabled = !state.hasNext;
  renderModes(state);
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
  updateSeekFill();
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
$<HTMLInputElement>('eq-on').addEventListener('change', (e) =>
  run({ type: 'setEq', eq: { enabled: (e.target as HTMLInputElement).checked } }),
);
presetSelect.addEventListener('change', () => run({ type: 'eqPreset', preset: presetSelect.value }));

$('queue').addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-id]');
  if (btn?.dataset.id) void run({ type: 'playTrack', id: btn.dataset.id });
});

document.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (e.code === 'Space') {
    e.preventDefault();
    void run({ type: 'togglePlay' });
  }
});

void run();
setInterval(() => void run(), POLL_MS);
