import { PlayerController } from '@/lib/player-controller';
import type { PlayerCommand } from '@/lib/messages';

export default defineContentScript({
  matches: ['https://icedrive.net/*'],
  main() {
    const player = new PlayerController();
    player.enableAutoAdvance();

    browser.runtime.onMessage.addListener((message: PlayerCommand, _sender, sendResponse) => {
      sendResponse(player.handle(message));
    });
  },
});
