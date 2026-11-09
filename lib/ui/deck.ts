/**
 * The player "deck", built and drawn the same way in the popup, the mini
 * player and the panel inside Icedrive: cover, title and folder, a clock
 * and the spectrum visualizer, the seek bar, the transport buttons, volume
 * and playback speed. Only how commands travel and where the cover and the
 * levels come from differ, so those are passed in as DeckHost.
 */
import { formatTime } from '../format';
import type { PlayerCommand, PlayerState } from '../messages';
import { formatSpeed, PLAYBACK_SPEEDS } from '../speed';
import { el, icon, ICONS, setRangeFill } from './dom';
import { createVisualizer, readVisualizerSetting, VISUALIZER_KEY } from './visualizer';

export interface DeckHost {
  /** Carries out a command and redraws. */
  run(cmd: PlayerCommand): void;
  /** Carries out a command without waiting to redraw (slider moves). */
  preview?(cmd: PlayerCommand): void;
  /** Our own JPEG data: URL of the cover at `sourceUrl`, or null. */
  getArt(sourceUrl: string): Promise<string | null>;
  /** Latest visualizer levels (0..1), or null. */
  readSpectrum(bars: number): number[] | null;
}

const NOTE = 'M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z';
const PAUSE = 'M6 19h4V5H6zm8-14v14h4V5z';
const PLAY = 'M8 5v14l11-7z';
const VOLUME =
  'M3 9v6h4l5 5V4L7 9zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02M14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77';
const MUTED =
  'M16.5 12A4.5 4.5 0 0 0 14 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63m2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.8 8.8 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71M4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a9 9 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9zM12 4 9.91 6.09 12 8.18z';
const SPEED =
  'M20.38 8.57l-1.23 1.85a8 8 0 0 1-.22 7.58H5.07A8 8 0 0 1 15.58 6.85l1.85-1.23A10 10 0 0 0 3.35 19a2 2 0 0 0 1.72 1h13.85a2 2 0 0 0 1.74-1 10 10 0 0 0-.27-10.44zm-9.79 6.84a2 2 0 0 0 2.83 0l5.66-8.49-8.49 5.66a2 2 0 0 0 0 2.83z';

const REPEAT_LABELS = { off: 'off', all: 'whole folder', one: 'one track' } as const;

export interface Deck {
  /** The deck element (class "player"). */
  el: HTMLElement;
  render(state: PlayerState): void;
  /** True while a song is playing and the visualizer wants levels. */
  wantsSpectrum(): boolean;
  stop(): void;
}

export function createDeck(doc: Document, host: DeckHost): Deck {
  const iconBtn = (name: string, label: string, path: string, kind = '') =>
    el(doc, 'button', { type: 'button', class: `ib ${kind}`.trim(), 'data-d': name, 'aria-label': label, title: label }, icon(doc, path));

  const art = el(doc, 'div', { class: 'art', 'aria-hidden': 'true' }, icon(doc, NOTE));
  const title = el(doc, 'div', { class: 'title' });
  const artist = el(doc, 'div', { class: 'artist' });
  const position = el(doc, 'span');
  const from = el(doc, 'div', { class: 'from' }, icon(doc, ICONS.folder), position);
  const lcdTime = el(doc, 'span', { class: 'lcd-time' }, '0:00');
  const lcdTotal = el(doc, 'span', { class: 'lcd-total' }, '/ 0:00');
  const canvas = el(doc, 'canvas', {
    class: 'viz',
    role: 'button',
    tabindex: '0',
    'aria-label': 'Spectrum visualizer',
    'aria-pressed': 'true',
  });
  const npBox = el(
    doc,
    'div',
    { class: 'np-box' },
    el(doc, 'div', { class: 'now' }, art, el(doc, 'div', { class: 'meta' }, title, artist, from)),
    el(doc, 'div', { class: 'np-bottom' }, el(doc, 'div', { class: 'lcd', 'aria-hidden': 'true' }, lcdTime, lcdTotal), canvas),
  );

  const current = el(doc, 'span', {}, '0:00');
  const duration = el(doc, 'span', {}, '0:00');
  const seek = el(doc, 'input', { class: 'range seek', type: 'range', min: '0', max: '0', step: '0.1', value: '0', 'aria-label': 'Seek' });
  const seekRow = el(doc, 'div', { class: 'seek-row' }, current, seek, duration);

  const shuffle = iconBtn('shuffle', 'Shuffle', ICONS.shuffle, 'toggle');
  shuffle.setAttribute('aria-pressed', 'false');
  const repeat = iconBtn('repeat', 'Repeat', ICONS.repeat, 'toggle');
  repeat.setAttribute('aria-pressed', 'false');
  const repeatOne = el(doc, 'span', { class: 'badge', hidden: '' }, '1');
  repeat.append(repeatOne);
  const playIcon = icon(doc, PLAY);
  const pauseIcon = icon(doc, PAUSE);
  const play = el(doc, 'button', { type: 'button', class: 'ib main', 'data-d': 'play', title: 'Play / pause', 'aria-label': 'Play' }, playIcon, pauseIcon);
  const prev = iconBtn('prev', 'Previous (after 3 s: restart track)', ICONS.prev);
  const next = iconBtn('next', 'Next', ICONS.next);
  const controls = el(doc, 'div', { class: 'controls' }, shuffle, prev, play, next, repeat);

  const volIcon = icon(doc, VOLUME);
  const mutedIcon = icon(doc, MUTED);
  const mute = el(doc, 'button', { type: 'button', class: 'ib small', 'data-d': 'mute', title: 'Mute', 'aria-label': 'Mute' }, volIcon, mutedIcon);
  const volume = el(doc, 'input', { class: 'range', type: 'range', min: '0', max: '1', step: '0.01', value: '1', 'aria-label': 'Volume' });
  const speed = el(doc, 'select', { class: 'speed', 'aria-label': 'Playback speed' });
  speed.append(...PLAYBACK_SPEEDS.map((s) => el(doc, 'option', { value: String(s) }, formatSpeed(s))));
  const chip = el(doc, 'label', { class: 'chip', title: 'Playback speed' }, icon(doc, SPEED), speed);
  const util = el(doc, 'div', { class: 'volume' }, el(doc, 'div', { class: 'vol' }, mute, volume), chip);

  const deck = el(doc, 'section', { class: 'player', 'aria-label': 'Player' }, npBox, seekRow, controls, util);

  // ---- Visualizer (one shared on/off setting) ----
  let vizOn = true;
  const visualizer = createVisualizer(canvas, (bars) => (vizOn ? host.readSpectrum(bars) : null));
  const setVizOn = (on: boolean) => {
    vizOn = on;
    visualizer.setEnabled(on);
    canvas.setAttribute('aria-pressed', String(on));
    canvas.title = on ? 'Spectrum visualizer: click to turn off' : 'Spectrum visualizer: click to turn on';
  };
  setVizOn(true);
  void browser.storage.local.get(VISUALIZER_KEY).then((saved) => setVizOn(readVisualizerSetting(saved[VISUALIZER_KEY])));
  const onStorage = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area === 'local' && VISUALIZER_KEY in changes) setVizOn(readVisualizerSetting(changes[VISUALIZER_KEY]!.newValue));
  };
  browser.storage.onChanged.addListener(onStorage);
  const toggleViz = () => void browser.storage.local.set({ [VISUALIZER_KEY]: !vizOn });

  // ---- Drawing ----
  let draggingSeek = false;
  let draggingVolume = false;
  let artSource: string | null | undefined;
  let last: PlayerState | null = null;

  const renderArt = (sourceUrl: string | null) => {
    if (sourceUrl === artSource) return;
    artSource = sourceUrl;
    art.style.backgroundImage = '';
    art.classList.remove('has-image');
    if (!sourceUrl) return;
    void host.getArt(sourceUrl).then((dataUrl) => {
      // Only our own base64 JPEG data: URL ever reaches CSS.
      if (!dataUrl || sourceUrl !== artSource) return;
      art.style.backgroundImage = `url("${dataUrl}")`;
      art.classList.add('has-image');
    });
  };

  const renderVolume = (level: number, muted: boolean) => {
    if (!draggingVolume) volume.value = String(muted ? 0 : level);
    setRangeFill(volume);
    volume.title = `Volume: ${Math.round(Number(volume.value) * 100)}%`;
    const silent = muted || level === 0;
    volIcon.toggleAttribute('hidden', silent);
    mutedIcon.toggleAttribute('hidden', !silent);
    const label = muted ? 'Unmute' : 'Mute';
    mute.setAttribute('aria-label', label);
    mute.title = label;
  };

  const renderSpeed = (rate: number) => {
    if (doc.activeElement === speed || speed.matches(':focus')) return; // the list may be open
    const value = String(rate);
    // A speed set elsewhere that isn't in our list still shows as it is.
    const other = speed.querySelector<HTMLOptionElement>('[data-other]');
    if (other?.value !== value) other?.remove();
    if (![...speed.options].some((o) => o.value === value))
      speed.append(el(doc, 'option', { value, 'data-other': '' }, formatSpeed(rate)));
    speed.value = value;
  };

  const render = (state: PlayerState) => {
    last = state;
    const np = state.nowPlaying;
    if (!np) {
      artSource = undefined;
      return;
    }
    title.textContent = np.title;
    title.title = np.fileName;
    artist.textContent = np.artist;
    artist.hidden = !np.artist;
    const place = state.currentIndex >= 0 ? `${state.currentIndex + 1} / ${state.tracks.length}` : '';
    position.textContent = [state.folderName, place].filter(Boolean).join(' · ');
    from.hidden = !position.textContent;
    renderArt(np.artUrl);

    if (!draggingSeek) {
      seek.max = String(state.duration || 0);
      seek.value = String(state.currentTime);
      seek.disabled = !state.duration;
      setRangeFill(seek);
      current.textContent = formatTime(state.currentTime);
      lcdTime.textContent = formatTime(state.currentTime);
    }
    duration.textContent = formatTime(state.duration);
    lcdTotal.textContent = `/ ${formatTime(state.duration)}`;
    renderVolume(state.volume, state.muted);
    renderSpeed(state.speed);

    // <svg> has no .hidden property, so toggle the attribute directly.
    playIcon.toggleAttribute('hidden', !state.paused);
    pauseIcon.toggleAttribute('hidden', state.paused);
    play.setAttribute('aria-label', state.paused ? 'Play' : 'Pause');
    next.disabled = !state.hasNext;
    const { settings } = state;
    shuffle.setAttribute('aria-pressed', String(settings.shuffle));
    shuffle.title = `Shuffle: ${settings.shuffle ? 'on' : 'off'}`;
    repeat.setAttribute('aria-pressed', String(settings.repeat !== 'off'));
    repeat.title = `Repeat: ${REPEAT_LABELS[settings.repeat]}`;
    repeatOne.hidden = settings.repeat !== 'one';
  };

  // ---- Wiring (events synthesized by page scripts are ignored) ----
  const preview = host.preview ?? host.run;
  deck.addEventListener('click', (e) => {
    if (!e.isTrusted) return;
    if (e.target === canvas) return toggleViz();
    const name = (e.target as Element).closest<HTMLElement>('button[data-d]')?.dataset.d;
    const commands: Record<string, PlayerCommand> = {
      play: { type: 'togglePlay' },
      prev: { type: 'previous' },
      next: { type: 'next' },
      shuffle: { type: 'toggleShuffle' },
      repeat: { type: 'cycleRepeat' },
      mute: { type: 'toggleMute' },
    };
    if (name && commands[name]) host.run(commands[name]);
  });
  canvas.addEventListener('keydown', (e) => {
    if (!e.isTrusted || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    toggleViz();
  });
  seek.addEventListener('input', (e) => {
    if (!e.isTrusted) return;
    draggingSeek = true;
    setRangeFill(seek);
    current.textContent = formatTime(Number(seek.value));
    lcdTime.textContent = formatTime(Number(seek.value));
  });
  seek.addEventListener('change', (e) => {
    if (!e.isTrusted) return;
    draggingSeek = false;
    host.run({ type: 'seek', time: Number(seek.value) });
  });
  volume.addEventListener('input', (e) => {
    if (!e.isTrusted) return;
    draggingVolume = true;
    renderVolume(Number(volume.value), false);
    preview({ type: 'setVolume', volume: Number(volume.value) });
  });
  volume.addEventListener('change', (e) => {
    if (!e.isTrusted) return;
    draggingVolume = false;
    host.run({ type: 'setVolume', volume: Number(volume.value) });
  });
  speed.addEventListener('change', (e) => {
    if (!e.isTrusted) return;
    host.run({ type: 'setSpeed', speed: Number(speed.value) });
  });

  return {
    el: deck,
    render,
    wantsSpectrum: () => vizOn && !!last?.active && !last.paused,
    stop() {
      visualizer.stop();
      browser.storage.onChanged.removeListener(onStorage);
    },
  };
}
