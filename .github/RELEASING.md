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
2. Start the release, either way:

   - **From GitHub:** Actions → **Release** → **Run workflow** on `master`.
     It tags the current `master` commit as `v` + the `package.json` version
     once the build and checks pass.
   - **From a terminal:** tag the merge commit and push the tag:

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

## Signed .crx (one-time setup)

Each release also publishes `icedrive-music-extension-<version>-chrome.crx`
and `update.xml` for company-managed browsers (see
[docs/enterprise-install.md](../docs/enterprise-install.md)). They are signed
with a private key stored as the `CRX_PRIVATE_KEY` repository secret. Without
the secret, the release still works but skips the `.crx` with a warning.

1. Create the key on your own computer (either command):

   ```sh
   node scripts/crx.mjs keygen crx-key.pem
   # or: openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out crx-key.pem
   ```

2. Copy the whole file, including the `-----BEGIN/END PRIVATE KEY-----` lines,
   into **Settings → Secrets and variables → Actions → New repository
   secret** named `CRX_PRIVATE_KEY`.
3. Back the file up somewhere safe (e.g. a password manager), then delete it
   from disk. **Never commit it.** The extension ID is derived from this key:
   if it is lost or changed, managed installs see a different extension.

`node scripts/crx.mjs id crx-key.pem` prints the extension ID for the key.

## Verifying a download

Each release zip has a signed build provenance attestation, which proves it
was built by this repository's workflow from the tagged commit:

```sh
gh attestation verify icedrive-music-extension-0.2.0-chrome.zip --repo D3jwis/icedrive-music-extension
sha256sum -c SHA256SUMS.txt
node scripts/crx.mjs verify icedrive-music-extension-0.2.0-chrome.crx
```

## Installing a release zip

Unzip it, open `chrome://extensions` (or `brave://extensions`), enable
Developer mode, choose **Load unpacked** and select the unzipped folder.
