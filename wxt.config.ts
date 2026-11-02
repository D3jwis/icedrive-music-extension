import { defineConfig } from 'wxt';

// https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    name: 'Icedrive Music Player+',
    description:
      'Rozszerza odtwarzacz muzyki w Icedrive: informacje o utworze, przewijanie, następny/poprzedni, shuffle i loop.',
    host_permissions: ['https://icedrive.net/*'],
    permissions: ['storage'],
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
  },
});
