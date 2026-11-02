import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { connectMediaSession } from '../lib/media-session';
import { PlayerController } from '../lib/player-controller';

const fixture = readFileSync(join(__dirname, 'fixtures/player.html'), 'utf8');

function fakeNavigator() {
  const handlers = new Map<string, (d: Record<string, unknown>) => void>();
  const session = {
    metadata: null as unknown,
    playbackState: 'none',
    setActionHandler: (action: string, h: (d: Record<string, unknown>) => void) => handlers.set(action, h),
    setPositionState: vi.fn(),
  };
  return { nav: { mediaSession: session } as unknown as Navigator, session, handlers };
}

let disconnect = () => {};
beforeEach(() => {
  document.body.innerHTML = fixture;
  vi.stubGlobal('MediaMetadata', class {
    constructor(init: object) {
      Object.assign(this, init);
    }
  });
});
afterEach(() => {
  disconnect();
  vi.unstubAllGlobals();
});

it('publishes the playing song to the media session', () => {
  const { nav, session } = fakeNavigator();
  disconnect = connectMediaSession(new PlayerController(), nav);
  expect(session.metadata).toMatchObject({
    title: 'Second Song',
    artist: 'Artist B',
    artwork: [{ src: 'blob:https://icedrive.net/7286b71d-0bf8-461a-b053-50c6347f12e4' }],
  });
});

it('routes media keys to the player', () => {
  const { nav, handlers } = fakeNavigator();
  const player = new PlayerController();
  const next = vi.spyOn(player, 'next');
  const previous = vi.spyOn(player, 'previous');
  const seek = vi.spyOn(player, 'seek');
  disconnect = connectMediaSession(player, nav);
  handlers.get('nexttrack')!({});
  handlers.get('previoustrack')!({});
  handlers.get('seekto')!({ seekTime: 30 });
  expect(next).toHaveBeenCalledOnce();
  expect(previous).toHaveBeenCalledOnce();
  expect(seek).toHaveBeenCalledWith(30);
});
