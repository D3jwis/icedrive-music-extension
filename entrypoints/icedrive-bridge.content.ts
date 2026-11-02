import { BRIDGE_EVENT, type BridgeOpenFile } from '@/lib/messages';

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
      const raw = (event as CustomEvent<unknown>).detail;
      if (typeof raw !== 'string') return;
      let req: BridgeOpenFile;
      try {
        req = JSON.parse(raw);
      } catch {
        return;
      }
      if (!/^file-\d+$/.test(req.id)) return;
      const previewItem = (window as unknown as { previewItem?: (id: string, area: string) => void }).previewItem;
      if (typeof previewItem !== 'function') {
        console.warn('[Icedrive Music Player+] previewItem() not found; Icedrive may have changed.');
        return;
      }
      previewItem(req.id, req.area === 'crypto' ? 'crypto' : 'cloud');
    });
  },
});
