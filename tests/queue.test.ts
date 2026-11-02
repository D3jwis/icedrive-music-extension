import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BRIDGE_EVENT } from '../lib/messages';
import { PlayerController } from '../lib/player-controller';
import { nextRepeatMode, PlayQueue } from '../lib/queue';

const ids = ['a', 'b', 'c', 'd', 'e'];
const off = { shuffle: false, repeat: 'off' } as const;
const all = { shuffle: false, repeat: 'all' } as const;

/** Deterministic "random" numbers for repeatable shuffles. */
function seeded(seed = 1) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

describe('PlayQueue in folder order', () => {
  it('follows the folder and stops at the end', () => {
    const q = new PlayQueue();
    q.sync(ids, 'd', false);
    expect(q.next('d', off)).toBe('e');
    expect(q.next('e', off)).toBeNull();
    expect(q.hasNext('e', off)).toBe(false);
    expect(q.previous('a', off)).toBeNull();
  });

  it('wraps around with repeat all', () => {
    const q = new PlayQueue();
    q.sync(ids, 'e', false);
    expect(q.hasNext('e', all)).toBe(true);
    expect(q.next('e', all)).toBe('a');
    expect(q.previous('a', all)).toBe('e');
  });
});

describe('PlayQueue shuffled', () => {
  const shuffle = { shuffle: true, repeat: 'off' } as const;

  it('keeps the playing song first and plays every song once', () => {
    const q = new PlayQueue(seeded());
    q.sync(ids, 'c', true);
    const order = [...q.currentOrder];
    expect(order[0]).toBe('c');
    expect([...order].sort()).toEqual(ids);
    expect(order).not.toEqual(['c', 'a', 'b', 'd', 'e']);

    const heard = ['c'];
    let cur: string | null = 'c';
    while ((cur = q.next(cur, shuffle))) heard.push(cur);
    expect(heard).toEqual(order);
  });

  it('goes back to the song actually heard before', () => {
    const q = new PlayQueue(seeded());
    q.sync(ids, 'c', true);
    const second = q.next('c', shuffle)!;
    expect(q.previous(second, shuffle)).toBe('c');
  });

  it('does not reshuffle while the folder stays the same', () => {
    const q = new PlayQueue(seeded());
    q.sync(ids, 'c', true);
    const order = [...q.currentOrder];
    q.sync(ids, 'a', true);
    expect(q.currentOrder).toEqual(order);
  });

  it('reshuffles after the last song with repeat all, without replaying it at once', () => {
    const q = new PlayQueue(seeded(7));
    q.sync(ids, 'a', true);
    const last = q.currentOrder.at(-1)!;
    const first = q.next(last, { shuffle: true, repeat: 'all' });
    expect(first).not.toBe(last);
    expect([...q.currentOrder].sort()).toEqual(ids);
  });

  it('returns to folder order when shuffle is switched off', () => {
    const q = new PlayQueue(seeded());
    q.sync(ids, 'c', true);
    q.sync(ids, 'c', false);
    expect(q.currentOrder).toEqual(ids);
  });
});

it('cycles repeat off -> all -> one -> off', () => {
  expect(nextRepeatMode('off')).toBe('all');
  expect(nextRepeatMode('all')).toBe('one');
  expect(nextRepeatMode('one')).toBe('off');
});

describe('PlayerController with shuffle and repeat', () => {
  const fixture = readFileSync(join(__dirname, 'fixtures/player.html'), 'utf8');
  const audio = () => document.querySelector('audio') as HTMLAudioElement;
  let opened: string[];
  let listening: AbortController;

  beforeEach(() => {
    document.body.innerHTML = fixture;
    opened = [];
    listening = new AbortController();
    document.addEventListener(BRIDGE_EVENT, (e) => opened.push(JSON.parse((e as CustomEvent<string>).detail).id), {
      signal: listening.signal,
    });
  });
  afterEach(() => listening.abort());

  it('repeat one replays the song when it ends, but "next" still moves on', () => {
    const play = vi.spyOn(audio(), 'play').mockResolvedValue();
    const player = new PlayerController();
    player.setSettings({ repeat: 'one' });
    const stop = player.enableAutoAdvance();
    audio().currentTime = 100;
    audio().dispatchEvent(new Event('ended'));
    stop();
    expect(audio().currentTime).toBe(0);
    expect(play).toHaveBeenCalledOnce();
    expect(opened).toEqual([]);
    player.next();
    expect(opened).toEqual(['file-104']);
  });

  it('repeat all wraps from the last song to the first', () => {
    document.querySelector('#preview .top .title')!.textContent = 'Artist C - Third Song.flac';
    const player = new PlayerController();
    player.setSettings({ repeat: 'all' });
    expect(player.getState().hasNext).toBe(true);
    player.next();
    expect(opened).toEqual(['file-101']);
  });

  it('reports setting changes so they can be saved', () => {
    const player = new PlayerController();
    const saved: unknown[] = [];
    player.onSettingsChange = (s) => saved.push(s);
    player.handle({ type: 'toggleShuffle' });
    const state = player.handle({ type: 'cycleRepeat' });
    expect(saved).toEqual([
      { shuffle: true, repeat: 'off' },
      { shuffle: true, repeat: 'all' },
    ]);
    expect(state.settings).toEqual({ shuffle: true, repeat: 'all' });
  });

  it('shuffle plays songs from the folder in a random order', () => {
    const player = new PlayerController(document, seeded(3));
    player.setSettings({ shuffle: true });
    player.next();
    expect(opened).toHaveLength(1);
    expect(['file-101', 'file-104']).toContain(opened[0]);
  });
});
