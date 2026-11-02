# Changelog

All notable changes to Icedrive Music Player+ are listed here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and versions follow [Semantic Versioning](https://semver.org/).

Each release's notes on GitHub are built from its section below, so add your
changes under **Unreleased** as you go and rename it when you tag.

## [Unreleased]

## [0.1.0] - 2026-11-02

First public release for Chrome and Brave.

### Added

- **Now playing** in the popup: title, artist, album art and the track's position in the folder.
- **Seek bar** to scrub anywhere in the track.
- **Queue** of every audio file in the open folder, in Icedrive's sort order. Click a track to play it.
- **Auto-advance** to the next track when the current one ends.
- **Shuffle**: each track plays once per round, and *Previous* goes back to the track you actually heard.
- **Repeat**: off, whole folder or a single track. Shuffle and repeat are remembered.
- **Buttons inside Icedrive**: shuffle, previous, next and repeat right under Icedrive's own player.
- **Mini player**: pop the player out into a small window that stays open.
- **Media keys** and the browser / OS media overlay (Media Session API) with track info and artwork.
- **Keyboard shortcuts**: `Alt+Shift+Space` play/pause, `Alt+Shift+.` next, `Alt+Shift+,` previous, `Alt+Shift+S` shuffle. Change them at `chrome://extensions/shortcuts`.
- New extension icon in Icedrive's colours.

### Security

- Runs only on `https://icedrive.net/*` and asks for a single permission (`storage`).
- Strict Content Security Policy for extension pages: no remote code, no `eval`, no network access.
- Every message, stored setting and page value is validated at runtime; the page can't drive the extension.
- In-page buttons live in a closed shadow root and ignore script-generated clicks.
- Build gate (`npm run check:security`) fails the build on new permissions, a weaker CSP or unsafe code.
- Release zips ship with SHA-256 checksums and a signed build provenance attestation.
- See [SECURITY.md](SECURITY.md) and the [work laptop guide](docs/enterprise-install.md).

[Unreleased]: https://github.com/D3jwis/icedrive-music-extension/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/D3jwis/icedrive-music-extension/releases/tag/v0.1.0
