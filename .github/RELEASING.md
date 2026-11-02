# Releasing

Every push to `master` and every pull request runs **CI** (type-check, tests,
build). The packaged Chrome/Brave zip is attached to each CI run as an
artifact for 14 days.

To publish a release:

1. Bump `version` in `package.json` (e.g. `0.2.0`) and run `npm install` so
   `package-lock.json` follows. Merge that to `master`.
2. Tag the merge commit and push the tag:

   ```sh
   git checkout master && git pull
   git tag v0.2.0
   git push origin v0.2.0
   ```

3. The **Release** workflow checks that the tag equals `v` + the
   `package.json` version, runs the tests, builds the zip and publishes a
   GitHub Release with the zip, `SHA256SUMS.txt` and auto-generated notes.

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
