import { artToDataUrl } from '@/lib/album-art';
import { connectMediaSession } from '@/lib/media-session';
import { mountInPageControls } from '@/lib/in-page-controls';
import { PlayerController } from '@/lib/player-controller';
import type { ArtResponse } from '@/lib/messages';
import { isFromExtensionPage, parseCommand, sanitizeSettings } from '@/lib/validate';

const SETTINGS_KEY = 'playbackSettings';

export default defineContentScript({
  matches: ['https://icedrive.net/*'],
  async main() {
    const player = new PlayerController();
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
