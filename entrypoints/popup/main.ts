import type { PlayerCommand, PlayerState } from '@/lib/messages';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

async function findIcedriveTab() {
  const [active] = await browser.tabs.query({ active: true, currentWindow: true, url: 'https://icedrive.net/*' });
  if (active?.id) return active.id;
  const [any] = await browser.tabs.query({ url: 'https://icedrive.net/*' });
  return any?.id;
}

async function send(cmd: PlayerCommand): Promise<PlayerState | null> {
  const tabId = await findIcedriveTab();
  if (tabId === undefined) return null;
  try {
    return await browser.tabs.sendMessage(tabId, cmd);
  } catch {
    return null; // tab opened before the extension was installed: needs a reload
  }
}

function render(state: PlayerState | null) {
  const status = $('status');
  const player = $('player');
  if (!state) {
    status.textContent = 'Otwórz icedrive.net (albo odśwież kartę Icedrive).';
    player.hidden = true;
    return;
  }
  if (!state.active || !state.nowPlaying) {
    status.textContent = `Nic nie gra. Audio w tym folderze: ${state.tracks.length}.`;
    player.hidden = true;
    return;
  }
  status.textContent = '';
  player.hidden = false;
  $('title').textContent = state.nowPlaying.title;
  $('artist').textContent = state.nowPlaying.artist;
  $('time').textContent = `${state.paused ? '⏸' : '▶'} ${formatTime(state.currentTime)} / ${formatTime(state.duration)}`;
  $('queue').textContent = `Utwór ${state.currentIndex + 1} z ${state.tracks.length}`;
}

const refresh = async (cmd: PlayerCommand = { type: 'getState' }) => render(await send(cmd));

$('prev').addEventListener('click', () => refresh({ type: 'previous' }));
$('play').addEventListener('click', () => refresh({ type: 'togglePlay' }));
$('next').addEventListener('click', () => refresh({ type: 'next' }));

void refresh();
setInterval(refresh, 1000);
