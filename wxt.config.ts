import { defineConfig } from 'wxt';

// https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    name: 'Icedrive Music Player+',
    description:
      'Rozszerza odtwarzacz muzyki w Icedrive: informacje o utworze, przewijanie, następny/poprzedni, shuffle i loop.',
    host_permissions: ['https://icedrive.net/*'],
  },
});
