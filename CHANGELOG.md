# Changelog

All notable changes to Icedrive Music Player+ are listed here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and versions follow [Semantic Versioning](https://semver.org/).

Each release's notes on GitHub are built from its section below, so add your
changes under **Unreleased** as you go and rename it when you tag.

## [Unreleased]

### Added

- **Spectrum visualizer**: animated level bars with falling peak caps, in a new "now playing" box in the popup and mini player (next to a small glowing clock) and as a strip under Icedrive's player. Click it to turn it off or on (shared everywhere). It uses the same audio processing as the equalizer, so it works on songs where the equalizer shows *Active*; with the visualizer on, songs go through that processing even when the equalizer is off (with a flat curve, so they sound the same).
- **Compact mini player**: make the mini player window short and it turns into a bar with the cover, title, buttons and seek bar.

### Changed

- **New popup layout**: a slimmer header; cover, title and folder in one box; times beside the seek bar; playback speed as a small chip next to the volume. The track list and the equalizer are now two tabs (remembered) sharing the space below, so the popup keeps the same height and the list no longer gets pushed out when the equalizer is open.
- **Inside Icedrive**: shuffle, previous, next and repeat line up with Icedrive's player controls, with the mini player button at the end of the row. The equalizer and the track list are labelled tabs (click the open one to close it), and the list uses two columns when there is room.
- The playing track shows small level bars instead of its number.
- **One "deck" look**: the player (now playing, seek, buttons, volume) is one panel, and the tabs, track list, equalizer and visualizer strip share its surface, so nothing stands out on its own.

## [0.4.0] - 2026-11-09

### Added

- **Full equalizer in the popup and mini player**: all 10 bands and the preamp, folded away by default (the arrow next to *Reset* unfolds it; remembered).
- **Playback speed** in the popup and mini player (0.5× – 4×, next to the volume), the same speeds as Icedrive's own player. Icedrive remembers it for the next songs.

### Changed

- **One look everywhere**: the popup, the mini player and the controls inside Icedrive share one stylesheet, with Icedrive's rounded dark panels, its navy/teal colours and white slider knobs like Icedrive's player. The popup no longer switches to a light theme.
- Equalizer sliders fill from 0 dB, so boosts and cuts are visible at a glance.
- *Reset* only shows when the equalizer curve isn't flat (and, in the popup, when the bands are unfolded).
- Track numbers line up with the folder icon above the list.
- The play/pause button's icon is white, like the slider knobs.

## [0.3.0] - 2026-11-09

### Added

- **Equalizer**: 10 bands (32 Hz – 16 kHz), preamp, 17 presets and a limiter against clipping. On/off and presets in the popup; the full equalizer in Icedrive's player. Settings are shared by all Icedrive tabs and remembered.
- **Volume slider and mute** in the popup and mini player, synced with Icedrive's own volume.
- **Track list and mini player button inside Icedrive**, so every option is available right under Icedrive's player without opening the popup.

### Changed

- **Icedrive's player bar matches its dark preview**: navy background, light icons and a teal progress bar instead of Plyr's default white bar with dark icons.

## [0.2.0] - 2026-11-05

### Added

- **Header banner** at the top of the popup and mini player with the extension's icon and name.
- **Folder name** above the queue, so you can see which Icedrive folder is playing, with the number of tracks.
- Releases can publish to the Chrome Web Store automatically (Chrome Web Store API v2), with store listing texts and images in `docs/`.
- `docs/images/render.mjs` renders the popup screenshots from the real build, so README and store images can be refreshed after UI changes.

### Changed

- **The whole interface is in English**: popup, mini player, buttons inside Icedrive, tooltips, keyboard shortcut names and the extension description.
- Scrollbars in the popup and mini player now look like the ones in Icedrive's file list.
- README and Chrome Web Store screenshots show the new English interface.

### Changed

- Shuffle no longer picks any of the last five songs played, also after a reshuffle with repeat all or after picking a song by hand. Folders under 10 songs avoid fewer (half the folder), so shuffle doesn't become a fixed loop.

## [0.1.2] - 2026-11-02

### Fixed

- The signed `.crx` and `update.xml` are now actually published next to the zip. v0.1.1 was released before the signing key was configured and shipped only the zip. The Release workflow now refuses to publish without the key.

## [0.1.1] - 2026-11-02

### Added

- **Signed `.crx` package** for company-managed Chrome / Brave, released next to the zip together with an `update.xml` update manifest. Its extension ID is fixed by the project's signing key, so IT can allow or force-install it by policy.

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

[Unreleased]: https://github.com/D3jwis/icedrive-music-extension/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/D3jwis/icedrive-music-extension/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/D3jwis/icedrive-music-extension/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/D3jwis/icedrive-music-extension/compare/v0.1.2...v0.2.0
[0.1.2]: https://github.com/D3jwis/icedrive-music-extension/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/D3jwis/icedrive-music-extension/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/D3jwis/icedrive-music-extension/releases/tag/v0.1.0
