import { describe, expect, it } from 'vitest';
import {
  isAllowedArtSource,
  isFromExtensionPage,
  isSafeArtDataUrl,
  parseArtResponse,
  parseBridgeRequest,
  parseCommand,
  sanitizeSettings,
} from '../lib/validate';

describe('parseCommand', () => {
  it('accepts every real command', () => {
    for (const type of ['getState', 'togglePlay', 'next', 'previous', 'toggleShuffle', 'cycleRepeat', 'getArt'])
      expect(parseCommand({ type })).toEqual({ type });
    expect(parseCommand({ type: 'seek', time: 12.5 })).toEqual({ type: 'seek', time: 12.5 });
    expect(parseCommand({ type: 'playTrack', id: 'file-123' })).toEqual({ type: 'playTrack', id: 'file-123' });
  });

  it('drops extra fields', () => {
    expect(parseCommand({ type: 'next', evil: '<img onerror=alert(1)>' })).toEqual({ type: 'next' });
  });

  it('rejects malformed or unknown messages', () => {
    for (const bad of [
      null,
      undefined,
      'next',
      42,
      [],
      {},
      { type: 'deleteFile' },
      { type: 'seek', time: '10' },
      { type: 'seek', time: Number.NaN },
      { type: 'seek', time: -1 },
      { type: 'seek', time: 1e12 },
      { type: 'playTrack', id: 'folder-1' },
      { type: 'playTrack', id: 'file-1); alert(1' },
      { type: 'playTrack' },
    ])
      expect(parseCommand(bad)).toBeNull();
  });
});

describe('parseBridgeRequest', () => {
  it('accepts what the content script sends', () => {
    expect(parseBridgeRequest(JSON.stringify({ id: 'file-9', area: 'crypto' }))).toEqual({ id: 'file-9', area: 'crypto' });
  });

  it('rejects everything else', () => {
    for (const bad of [
      { id: 'file-9', area: 'cloud' }, // not a string
      'not json',
      'null',
      JSON.stringify({ id: 'file-9' }),
      JSON.stringify({ id: 'file-9', area: 'trash' }),
      JSON.stringify({ id: ['file-9'], area: 'cloud' }),
      JSON.stringify({ id: 'x'.repeat(300), area: 'cloud' }),
    ])
      expect(parseBridgeRequest(bad)).toBeNull();
  });
});

describe('sanitizeSettings', () => {
  it('keeps valid values and replaces the rest with defaults', () => {
    expect(sanitizeSettings({ shuffle: true, repeat: 'one' })).toEqual({ shuffle: true, repeat: 'one' });
    expect(sanitizeSettings({ shuffle: 'yes', repeat: 'forever' })).toEqual({ shuffle: false, repeat: 'off' });
    expect(sanitizeSettings(undefined)).toEqual({ shuffle: false, repeat: 'off' });
  });
});

describe('isFromExtensionPage', () => {
  const id = 'abcdefghijklmnop';
  const origin = `chrome-extension://${id}/`;
  it('accepts our popup, detached window and service worker', () => {
    expect(isFromExtensionPage({ id, url: `${origin}popup.html` }, id, origin)).toBe(true);
    expect(isFromExtensionPage({ id, url: `${origin}popup.html?detached=1` }, id, origin)).toBe(true);
    expect(isFromExtensionPage({ id, url: `${origin}background.js` }, id, origin)).toBe(true);
  });
  it('rejects content scripts and other extensions', () => {
    expect(isFromExtensionPage({ id, url: 'https://icedrive.net/dashboard' }, id, origin)).toBe(false);
    expect(isFromExtensionPage({ id: 'other', url: 'chrome-extension://other/popup.html' }, id, origin)).toBe(false);
    expect(isFromExtensionPage({ id }, id, origin)).toBe(false);
  });
});

describe('album art', () => {
  const origin = 'https://icedrive.net';
  it('only loads art from Icedrive', () => {
    expect(isAllowedArtSource('blob:https://icedrive.net/0b6c-11', origin)).toBe(true);
    expect(isAllowedArtSource('https://cdn.icedrive.net/a.jpg', origin)).toBe(true);
    expect(isAllowedArtSource('blob:https://evil.example/0b6c', origin)).toBe(false);
    expect(isAllowedArtSource('http://icedrive.net/a.jpg', origin)).toBe(false);
    expect(isAllowedArtSource('https://icedrive.net.evil.example/a.jpg', origin)).toBe(false);
    expect(isAllowedArtSource('http://192.168.0.1/admin', origin)).toBe(false);
    expect(isAllowedArtSource('javascript:alert(1)', origin)).toBe(false);
    expect(isAllowedArtSource(null, origin)).toBe(false);
  });

  it('only lets our JPEG data: URL into the popup CSS', () => {
    expect(isSafeArtDataUrl('data:image/jpeg;base64,/9j/4AAQSkZJRg==')).toBe(true);
    expect(isSafeArtDataUrl('data:image/jpeg;base64,abc"); background: url(https://evil.example/')).toBe(false);
    expect(isSafeArtDataUrl('data:image/svg+xml;base64,PHN2Zz4=')).toBe(false);
    expect(isSafeArtDataUrl('https://evil.example/a.jpg')).toBe(false);
    expect(parseArtResponse({ sourceUrl: 'blob:x', dataUrl: 'javascript:1' })).toEqual({ sourceUrl: 'blob:x', dataUrl: null });
  });
});
