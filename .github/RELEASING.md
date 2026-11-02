# Releasing

Every push to `master` and every pull request runs **CI** (`npm run verify`:
type-check, tests, build, security gate, `npm audit`). The packaged Chrome/Brave zip is attached to each CI run as an
artifact for 14 days.

To publish a release:

1. In `CHANGELOG.md`, rename `## [Unreleased]` to `## [0.2.0] - YYYY-MM-DD`
   (add a fresh empty `## [Unreleased]` above it and update the links at the
   bottom). Bump `version` in `package.json` and run `npm install` so
   `package-lock.json` follows. Merge that to `master`. CI fails if the
   version has no changelog section.
2. Tag the merge commit and push the tag:

   ```sh
   git checkout master && git pull
   git tag v0.2.0
   git push origin v0.2.0
   ```

3. The **Release** workflow checks that the tag equals `v` + the
   `package.json` version, runs `npm run verify` (types, tests, security
   gate, `npm audit`), builds the zip and publishes a
   GitHub Release with the zip and `SHA256SUMS.txt`. The release text comes
   from `.github/release-notes-template.md`, filled in by
   `scripts/release-notes.mjs` with that version's changelog section and the
   checksums, followed by GitHub's auto-generated list of merged PRs.

## Verifying a download

Each release zip has a signed build provenance attestation, which proves it
was built by this repository's workflow from the tagged commit:

```sh
gh attestation verify icedrive-music-extension-0.2.0-chrome.zip --repo D3jwis/icedrive-music-extension
sha256sum -c SHA256SUMS.txt
```

## Installing a release zip

Unzip it, open `chrome://extensions` (or `brave://extensions`), enable
Developer mode, choose **Load unpacked** and select the unzipped folder.
