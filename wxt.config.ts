import { defineConfig } from 'wxt';

/**
 * Content Security Policy for the extension's own pages (popup, detached
 * window, service worker). Production allows only files shipped inside the
 * extension: no remote scripts, no eval, no network requests, no plugins.
 * `img-src data:` is for the album art the popup receives as a data: URL.
 * The dev server (`npm run dev`) additionally needs localhost for hot reload.
 */
function extensionPagesCsp(dev: boolean): string {
  return [
    "default-src 'none'",
    "script-src 'self'",
    dev ? "style-src 'self' 'unsafe-inline'" : "style-src 'self'",
    "img-src 'self' data:",
    dev ? "connect-src 'self' http://localhost:* ws://localhost:*" : "connect-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}

// https://wxt.dev/api/config.html
export default defineConfig({
  manifest: ({ command }) => ({
    name: 'Icedrive Music Player+',
    description:
      'Rozszerza odtwarzacz muzyki w Icedrive: informacje o utworze, przewijanie, następny/poprzedni, shuffle i loop.',
    // Security: keep this list minimal. Any change here must also be made in
    // scripts/verify-build.mjs, which fails the build on unexpected permissions.
    host_permissions: ['https://icedrive.net/*'],
    permissions: ['storage'],
    // runtime.getContexts (detached window) needs Chrome 116+.
    minimum_chrome_version: '116',
    content_security_policy: {
      extension_pages: extensionPagesCsp(command === 'serve'),
    },
    // Change these at chrome://extensions/shortcuts (brave://extensions/shortcuts).
    // Chrome allows at most four suggested keys; "global" ones also work when
    // the browser isn't focused, but users must enable that themselves there.
    commands: {
      'play-pause': {
        suggested_key: { default: 'Alt+Shift+Space' },
        description: 'Odtwórz / pauza',
      },
      'next-track': {
        suggested_key: { default: 'Alt+Shift+Period' },
        description: 'Następny utwór',
      },
      'previous-track': {
        suggested_key: { default: 'Alt+Shift+Comma' },
        description: 'Poprzedni utwór',
      },
      'toggle-shuffle': {
        suggested_key: { default: 'Alt+Shift+S' },
        description: 'Włącz / wyłącz losowo',
      },
    },
  }),
});
