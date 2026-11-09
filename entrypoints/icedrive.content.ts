import { artToDataUrl } from '@/lib/album-art';
import { connectMediaSession } from '@/lib/media-session';
import { mountInPageControls } from '@/lib/in-page-controls';
import { PlayerController } from '@/lib/player-controller';
import { AudioEngine } from '@/lib/audio-engine';
import type { ArtResponse } from '@/lib/messages';
import { isFromExtensionPage, parseCommand, sanitizeEq, sanitizeSettings } from '@/lib/validate';

const SETTINGS_KEY = 'playbackSettings';
const EQ_KEY = 'equalizer';
/** Equalizer sliders fire many changes a second; storage gets the last one. */
const EQ_SAVE_DELAY_MS = 300;
const EQ_SYNC_MS = 1000;

export default defineContentScript({
  matches: ['https://icedrive.net/*'],
  async main() {
    const engine = new AudioEngine();
    const player = new PlayerController(document, Math.random, engine);
    player.enableAutoAdvance();
    connectMediaSession(player);

    // Shuffle/repeat survive reloads and are shared by all Icedrive tabs.
    const saved = await browser.storage.local.get(SETTINGS_KEY);
    player.setSettings(sanitizeSettings(saved[SETTINGS_KEY]));
    player.onSettingsChange = (settings) => void browser.storage.local.set({ [SETTINGS_KEY]: settings });
    browser.storage.onChanged.addListener((changes, area) => {
      const change = changes[SETTINGS_KEY];
      if (area === 'local' && change?.newValue) player.setSettings(sanitizeSettings(change.newValue));
    });

    // The equalizer is shared by all Icedrive tabs and survives reloads too.
    const savedEq = await browser.storage.local.get(EQ_KEY);
    engine.setSettings(sanitizeEq(savedEq[EQ_KEY]));
    let lastSavedEq = '';
    let saveTimer: ReturnType<typeof setTimeout> | undefined;
    engine.onSettingsChange = (eq) => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        lastSavedEq = JSON.stringify(eq);
        void browser.storage.local.set({ [EQ_KEY]: eq });
      }, EQ_SAVE_DELAY_MS);
    };
    browser.storage.onChanged.addListener((changes, area) => {
      const change = changes[EQ_KEY];
      if (area !== 'local' || !change?.newValue) return;
      // Our own save coming back must not undo a slider that has moved on since.
      if (JSON.stringify(change.newValue) === lastSavedEq) return;
      engine.setSettings(sanitizeEq(change.newValue));
    });
    engine.watch();
    setInterval(() => engine.sync(), EQ_SYNC_MS);

    mountInPageControls(player);

    browser.runtime.onMessage.addListener((raw: unknown, sender, sendResponse) => {
      // Only our own extension pages (popup, detached window, service worker)
      // may drive the player. Anything else, or any malformed message, is
      // ignored without a reply.
      if (!isFromExtensionPage(sender)) return;
      const message = parseCommand(raw);
      if (!message) return;
      if (message.type === 'getArt') {
        const sourceUrl = player.getState().nowPlaying?.artUrl ?? null;
        artToDataUrl(sourceUrl).then((dataUrl) => sendResponse({ sourceUrl, dataUrl } satisfies ArtResponse));
        return true; // keep the channel open for the async reply
      }
      sendResponse(player.handle(message));
    });
  },
});
