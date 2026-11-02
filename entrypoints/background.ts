import type { PlayerCommand } from '@/lib/messages';

/** Keyboard shortcuts (manifest "commands") mapped to player commands. */
const SHORTCUTS: Record<string, PlayerCommand> = {
  'play-pause': { type: 'togglePlay' },
  'next-track': { type: 'next' },
  'previous-track': { type: 'previous' },
  'toggle-shuffle': { type: 'toggleShuffle' },
};

/**
 * Shortcuts work from any tab: they go to the Icedrive tab that is playing,
 * or else the most recently used Icedrive tab.
 */
export default defineBackground(() => {
  browser.commands.onCommand.addListener(async (name) => {
    const cmd = SHORTCUTS[name];
    if (!cmd) return;
    const tabs = await browser.tabs.query({ url: 'https://icedrive.net/*' });
    const target =
      tabs.find((t) => t.audible) ?? [...tabs].sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0];
    if (target?.id === undefined) return;
    try {
      await browser.tabs.sendMessage(target.id, cmd);
    } catch {
      // Tab was opened before the extension was installed; it needs a reload.
    }
  });
});
