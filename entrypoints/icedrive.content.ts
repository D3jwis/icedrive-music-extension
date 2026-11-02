import { artToDataUrl } from '@/lib/album-art';
import { PlayerController } from '@/lib/player-controller';
import type { ArtResponse, PlayerCommand } from '@/lib/messages';

export default defineContentScript({
  matches: ['https://icedrive.net/*'],
  main() {
    const player = new PlayerController();
    player.enableAutoAdvance();

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
