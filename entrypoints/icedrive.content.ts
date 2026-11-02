import { artToDataUrl } from '@/lib/album-art';
import { PlayerController } from '@/lib/player-controller';
import type { ArtResponse, PlayerCommand } from '@/lib/messages';
import type { PlaybackSettings } from '@/lib/queue';

const SETTINGS_KEY = 'playbackSettings';

export default defineContentScript({
  matches: ['https://icedrive.net/*'],
  async main() {
    const player = new PlayerController();
    player.enableAutoAdvance();

    // Shuffle/repeat survive reloads and are shared by all Icedrive tabs.
    const saved = await browser.storage.local.get(SETTINGS_KEY);
    player.setSettings((saved[SETTINGS_KEY] as Partial<PlaybackSettings> | undefined) ?? {});
    player.onSettingsChange = (settings) => void browser.storage.local.set({ [SETTINGS_KEY]: settings });
    browser.storage.onChanged.addListener((changes, area) => {
      const change = changes[SETTINGS_KEY];
      if (area === 'local' && change?.newValue) player.setSettings(change.newValue as PlaybackSettings);
    });

    browser.runtime.onMessage.addListener((message: PlayerCommand, _sender, sendResponse) => {
      if (message.type === 'getArt') {
        const sourceUrl = player.getState().nowPlaying?.artUrl ?? null;
        artToDataUrl(sourceUrl).then((dataUrl) => sendResponse({ sourceUrl, dataUrl } satisfies ArtResponse));
        return true; // keep the channel open for the async reply
      }
      sendResponse(player.handle(message));
    });
  },
});
