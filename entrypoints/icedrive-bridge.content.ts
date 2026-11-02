import { BRIDGE_EVENT } from '@/lib/messages';
import { parseBridgeRequest } from '@/lib/validate';

/**
 * Runs in the page's own JavaScript world so it can call Icedrive's global
 * previewItem(id, area), the same function the app uses when you click a file
 * or the preview's arrows. It only listens for requests from our content script.
 */
export default defineContentScript({
  matches: ['https://icedrive.net/*'],
  world: 'MAIN',
  main() {
    document.addEventListener(BRIDGE_EVENT, (event) => {
      // Only well-formed "open file-<digits> in cloud|crypto" requests pass.
      const req = parseBridgeRequest((event as CustomEvent<unknown>).detail);
      if (!req) return;
      const previewItem = (window as unknown as { previewItem?: (id: string, area: string) => void }).previewItem;
      if (typeof previewItem !== 'function') {
        console.warn('[Icedrive Music Player+] previewItem() not found; Icedrive may have changed.');
        return;
      }
      previewItem(req.id, req.area);
    });
  },
});
