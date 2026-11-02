# Installing on a work (managed) computer

Company laptops usually run Chrome or Brave under **enterprise policies**. Those
policies decide which extensions may be installed, and they often block
"Load unpacked" (developer mode). This page lists the options from most to
least recommended and gives your IT team what they need to approve it.

> **Ask IT first.** Installing an extension your company has not approved can
> break its security policy even if the extension itself is harmless. Send
> them this page and [SECURITY.md](../SECURITY.md).

## What to tell IT in one paragraph

Icedrive Music Player+ is an open-source Manifest V3 extension for Chrome /
Brave. It runs only on `https://icedrive.net/*`, requests only the `storage`
permission (to remember shuffle/repeat), makes no network requests of its own,
has no telemetry, loads no remote code and enforces a strict CSP
(`default-src 'none'; script-src 'self'; connect-src 'none'`). Source and
build: <https://github.com/D3jwis/icedrive-music-extension>. Every build is
checked by `scripts/verify-build.mjs`, which fails on any new permission,
weaker CSP or unsafe code pattern.

## Option 1 (recommended): Chrome Web Store, unlisted

The extension is published to the Chrome Web Store as **unlisted** (only people
with the link can find it). The store signs it, reviews it, and keeps it updated.

IT then allows it by its extension ID with either policy:

- `ExtensionInstallAllowlist`: add the ID, you install it yourself from the link.
- `ExtensionInstallForcelist`: IT installs it for you, e.g.
  `<extension-id>;https://clients2.google.com/service/update2/crx`.

This works with any management tool (Group Policy / Intune on Windows,
configuration profiles on macOS, Google Admin console for Chrome Browser Cloud
Management) and in Brave, which reads the same policies.

## Option 2: self-hosted, force-installed by IT

For companies that don't want the Web Store. Every GitHub release includes a
signed `icedrive-music-extension-<version>-chrome.crx` and a matching
`update.xml`. The release notes give the fixed extension ID. IT hosts both
files on an internal server (editing `codebase` in `update.xml` to the
`.crx` location) and force-installs the extension with
`ExtensionInstallForcelist`:

```text
<extension-id>;https://intranet.example.com/icedrive-music/update.xml
```

If devices can download from this GitHub repository, the policy can instead
point at `https://github.com/D3jwis/icedrive-music-extension/releases/latest/download/update.xml`.
This only works without signing in if the repository is public.

- Chrome only installs off-store extensions this way on **managed** devices
  (domain-joined, MDM-enrolled or cloud-managed).
- The `.crx` must always be signed with the **same private key**, otherwise the
  extension ID changes. Keep that key out of the repository.
- IT should compare the SHA-256 of the `.crx` and `update.xml` with
  `SHA256SUMS.txt` on the release, and can check the signature and ID with
  `node scripts/crx.mjs verify <file>.crx` or `gh attestation verify`.

## Option 3 (not recommended on work laptops): Load unpacked

`chrome://extensions` → Developer mode → **Load unpacked** → the unzipped
release folder.

Downsides: many companies block developer mode
(`ExtensionDeveloperModeSettings`, `DeveloperToolsAvailability`); Chrome shows a
warning on start-up; there are no automatic updates; and anyone with access to
the folder can change the code. Use it only on a personal computer or if IT
explicitly allows it.

## Extra lock-down IT can apply

Even if the extension were ever compromised, the browser can be told to keep it
on Icedrive only. With the `ExtensionSettings` policy:

```json
{
  "<extension-id>": {
    "installation_mode": "allowed",
    "runtime_blocked_hosts": ["*://*"],
    "runtime_allowed_hosts": ["https://icedrive.net"],
    "blocked_permissions": ["tabs", "cookies", "webRequest", "scripting", "downloads", "history", "clipboardRead", "nativeMessaging", "debugger", "management", "proxy"]
  }
}
```

`runtime_blocked_hosts` stops the extension from touching any site except
Icedrive, and `blocked_permissions` makes the browser refuse to enable the
extension if a future version ever asked for one of those permissions.

For Brave, the same policies live under `Software\Policies\BraveSoftware\Brave`
(Windows) or `com.brave.Browser` (macOS).

## Settings you can tighten yourself

On `chrome://extensions` → Icedrive Music Player+ → **Details**:

- **Site access:** "On specific sites" (only `icedrive.net`, the default) or
  "On click" if you only want it active after clicking the toolbar icon.
- **Allow in Incognito:** leave off.
- **Allow access to file URLs:** leave off.

## Checking a release before installing

1. Download the ZIP from the GitHub release.
2. Compare its SHA-256 with the checksum on the release page:
   - Windows: `Get-FileHash .\icedrive-music-extension-*.zip -Algorithm SHA256`
   - macOS / Linux: `shasum -a 256 icedrive-music-extension-*.zip`
3. Open `manifest.json` inside and check that `permissions` is only
   `["storage"]` and `host_permissions` is only `["https://icedrive.net/*"]`.
