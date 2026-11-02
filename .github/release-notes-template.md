<p align="center">
  <img src="https://github.com/{{REPO}}/blob/{{TAG}}/docs/images/banner.png?raw=true" alt="Icedrive Music Player+" width="100%">
</p>

## What's new in {{VERSION}}

{{CHANGELOG}}

## Install (Chrome / Brave)

1. Download **`{{ZIP}}`** below and unzip it to a folder you'll keep.
2. Open `chrome://extensions` (or `brave://extensions`) and turn on **Developer mode**.
3. Click **Load unpacked** and pick the unzipped folder.
4. Open a folder of music on [icedrive.net](https://icedrive.net) and press play.

Updating: unzip the new version over the old folder and click **Reload** on the extension card.

> On a work laptop, ask IT first and send them the [work laptop guide](https://github.com/{{REPO}}/blob/{{TAG}}/docs/enterprise-install.md) and [SECURITY.md](https://github.com/{{REPO}}/blob/{{TAG}}/SECURITY.md).

{{IT_SECTION}}
## Verify the download

| File | SHA-256 |
| --- | --- |
{{CHECKSUM_ROWS}}

```sh
# macOS / Linux
shasum -a 256 {{ZIP}}
# Windows (PowerShell)
Get-FileHash .\{{ZIP}} -Algorithm SHA256
# Proof it was built by this repo's GitHub Actions from tag {{TAG}}
gh attestation verify {{ZIP}} --repo {{REPO}}
```

Signed `.crx`: `node scripts/crx.mjs verify <file>.crx` checks its signature and prints the extension ID.

**Permissions:** `storage` only, on `https://icedrive.net/*` only. No telemetry, no remote code.

---
