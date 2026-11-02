import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { findCurrentIndex, listTracks, readNowPlaying } from '../lib/icedrive-dom';
import { PlayerController } from '../lib/player-controller';
import { BRIDGE_EVENT } from '../lib/messages';

const fixture = readFileSync(join(__dirname, 'fixtures/player.html'), 'utf8');

function audio() {
  return document.querySelector('audio') as HTMLAudioElement;
}

/** Collects the files the controller asks Icedrive to open. */
function captureOpens() {
  const opened: { id: string; area: string }[] = [];
  document.addEventListener(BRIDGE_EVENT, (e) => opened.push(JSON.parse((e as CustomEvent<string>).detail)));
  return opened;
}

beforeEach(() => {
  document.body.innerHTML = fixture;
});

describe('reading the Icedrive page', () => {
  it('lists only audio files, in page order', () => {
    expect(listTracks()).toEqual([
      { id: 'file-101', fileName: 'Artist A - First Song.flac', area: 'cloud' },
      { id: 'file-103', fileName: 'Artist B - Second Song.mp3', area: 'cloud' },
      { id: 'file-104', fileName: 'Artist C - Third Song.flac', area: 'crypto' },
    ]);
  });

  it('reads the playing song from ID3 fields and the preview title', () => {
    expect(readNowPlaying()).toEqual({
      title: 'Second Song',
      artist: 'Artist B',
      fileName: 'Artist B - Second Song.mp3',
      artUrl: 'blob:https://icedrive.net/7286b71d-0bf8-461a-b053-50c6347f12e4',
    });
    expect(findCurrentIndex(listTracks())).toBe(1);
  });

  it('falls back to the file name before ID3 tags load', () => {
    document.querySelector('#id3-title')!.textContent = '';
    expect(readNowPlaying()?.title).toBe('Artist B - Second Song.mp3');
  });

  it('reports nothing when no audio is open', () => {
    document.querySelector('#preview .content')!.innerHTML = '';
    expect(readNowPlaying()).toBeNull();
    expect(new PlayerController().getState()).toMatchObject({ active: false, currentIndex: -1 });
  });
});

describe('PlayerController', () => {
  it('opens the next and previous audio file, skipping non-audio', () => {
    const opened = captureOpens();
    const player = new PlayerController();
    player.next();
    player.previous();
    expect(opened).toEqual([
      { id: 'file-104', area: 'crypto' },
      { id: 'file-101', area: 'cloud' },
    ]);
  });

  it('restarts the song on "previous" after 3 seconds', () => {
    const opened = captureOpens();
    audio().currentTime = 42;
    new PlayerController().previous();
    expect(audio().currentTime).toBe(0);
    expect(opened).toEqual([]);
  });

  it('does nothing on "next" at the end of the folder', () => {
    document.querySelector('#preview .top .title')!.textContent = 'Artist C - Third Song.flac';
    const opened = captureOpens();
    expect(new PlayerController().next()).toBe(false);
    expect(opened).toEqual([]);
  });

  it('seeks within the song', () => {
    new PlayerController().seek(-5);
    expect(audio().currentTime).toBe(0);
    new PlayerController().seek(12.5);
    expect(audio().currentTime).toBe(12.5);
  });

  it('toggles play and pause', () => {
    const play = vi.spyOn(audio(), 'play').mockResolvedValue();
    const player = new PlayerController();
    player.togglePlay();
    expect(play).toHaveBeenCalledOnce();
  });

  it('plays the next file when the song ends', () => {
    const opened = captureOpens();
    const stop = new PlayerController().enableAutoAdvance();
    audio().dispatchEvent(new Event('ended'));
    stop();
    audio().dispatchEvent(new Event('ended'));
    expect(opened).toEqual([{ id: 'file-104', area: 'crypto' }]);
  });
});

describe('formatTime', () => {
  it('formats minutes and hours', async () => {
    const { formatTime } = await import('../lib/format');
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(75.9)).toBe('1:15');
    expect(formatTime(3725)).toBe('1:02:05');
    expect(formatTime(Number.NaN)).toBe('0:00');
  });
});
