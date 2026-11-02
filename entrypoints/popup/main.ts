import type { ArtResponse, PlayerCommand, PlayerState } from '@/lib/messages';
import type { TrackRef } from '@/lib/icedrive-dom';
import { formatTime } from '@/lib/format';

const POLL_MS = 500;
const ICEDRIVE_URL = 'https://icedrive.net/*';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const seek = $<HTMLInputElement>('seek');

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
  void send<ArtResponse>({ type: 'getArt' }).then((res) => {
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

function updateSeekFill() {
  const max = Number(seek.max) || 0;
  const pct = max ? (Number(seek.value) / max) * 100 : 0;
  seek.style.setProperty('--pct', `${pct}%`);
}

function renderQueue(tracks: TrackRef[], currentIndex: number) {
  const wrap = $('queue-wrap');
  wrap.hidden = tracks.length === 0;
  $('queue-count').textContent = String(tracks.length);

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
    showEmpty('Otwórz Icedrive w przeglądarce. Jeśli karta jest już otwarta, odśwież ją.');
    renderQueue([], -1);
    return;
  }

  renderQueue(state.tracks, state.currentIndex);

  if (!state.active || !state.nowPlaying) {
    showEmpty(
      state.tracks.length
        ? 'Nic teraz nie gra. Wybierz utwór z listy poniżej.'
        : 'Nic teraz nie gra. Otwórz folder z muzyką w Icedrive.',
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
    state.currentIndex >= 0 ? `Utwór ${state.currentIndex + 1} z ${state.tracks.length}` : '';
  renderArt(nowPlaying.artUrl);
  renderSeek(state.currentTime, state.duration);

  // <svg> has no .hidden property, so toggle the attribute directly.
  $('icon-play').toggleAttribute('hidden', !state.paused);
  $('icon-pause').toggleAttribute('hidden', state.paused);
  $('play').setAttribute('aria-label', state.paused ? 'Odtwórz' : 'Pauza');
  $<HTMLButtonElement>('next').disabled = !state.hasNext;
  renderModes(state);
}

const REPEAT_LABELS = { off: 'wyłączone', all: 'cały folder', one: 'jeden utwór' } as const;

function renderModes({ settings }: PlayerState) {
  const shuffle = $('shuffle');
  shuffle.setAttribute('aria-pressed', String(settings.shuffle));
  shuffle.title = `Losowo: ${settings.shuffle ? 'włączone' : 'wyłączone'}`;
  const repeat = $('repeat');
  repeat.setAttribute('aria-pressed', String(settings.repeat !== 'off'));
  repeat.title = `Powtarzanie: ${REPEAT_LABELS[settings.repeat]}`;
  $('repeat-one').hidden = settings.repeat !== 'one';
}

// ---- Detached window ----

const DETACHED = new URLSearchParams(location.search).has('detached');
const DETACHED_URL = browser.runtime.getURL('/popup.html?detached=1');
if (DETACHED) document.body.classList.add('detached');

/** Opens the player in a small separate window, or focuses the one already open. */
async function detach() {
  const contexts = await browser.runtime.getContexts({ contextTypes: ['TAB'], documentUrls: [DETACHED_URL] });
  const existing = contexts.find((c) => c.windowId !== -1);
  if (existing) {
    await browser.windows.update(existing.windowId, { focused: true });
  } else {
    await browser.windows.create({ url: DETACHED_URL, type: 'popup', width: 360, height: 640, focused: true });
  }
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
