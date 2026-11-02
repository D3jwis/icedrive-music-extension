# Security

Icedrive Music Player+ is built to be safe to run on a work laptop: it asks for
as little as possible, ships no remote code, and treats everything it reads from
the web page as untrusted.

## Reporting a vulnerability

Please **do not open a public issue**. Use GitHub's private reporting instead:
**Security → Report a vulnerability** on this repository
(<https://github.com/D3jwis/icedrive-music-extension/security/advisories/new>).
You should get a reply within a few days.

Only the latest release is supported; fixes ship as a new release.

## What the extension can access

| Permission | Why | What it does **not** allow |
| --- | --- | --- |
| `https://icedrive.net/*` (host + content scripts) | Read the player on Icedrive's page and press its buttons; find the Icedrive tab for the popup and shortcuts. | Any other website. No access to other tabs, history, downloads or cookies API. |
| `storage` | Remember shuffle / repeat. | Nothing else is stored. No file names, no account data. |

There is **no** `tabs`, `scripting`, `cookies`, `webRequest`, `<all_urls>`,
`web_accessible_resources` or `externally_connectable`. The extension makes
**no network requests** of its own: no analytics, no telemetry, no update
checks other than the browser's own.

Data never leaves your browser. Song titles and album art only travel from the
Icedrive tab to the extension's popup, inside the browser.

## How it is hardened

- **Strict CSP for extension pages:** `default-src 'none'; script-src 'self';
  connect-src 'none'; object-src 'none'; base-uri 'none'` … No remote scripts,
  no `eval`, no network access from the popup or service worker.
- **No HTML injection:** all UI is built with DOM APIs and `textContent`. Data
  read from Icedrive (titles, artists, file names) is never parsed as HTML.
- **Validated messages:** the content script only obeys messages from this
  extension's own pages (checked by sender id and `chrome-extension://` URL)
  and only after a runtime schema check (`lib/validate.ts`). Unknown or
  malformed messages are dropped.
- **Narrow page bridge:** the one script that runs in Icedrive's page world
  accepts exactly `{ id: "file-<digits>", area: "cloud" | "crypto" }` and only
  calls Icedrive's own `previewItem()`.
- **In-page buttons** live in a *closed* shadow root and ignore synthetic
  (script-generated) clicks.
- **Album art** is only fetched from the page's own `blob:` URLs or
  `https://*.icedrive.net`, re-encoded as JPEG, and the popup only accepts a
  `data:image/jpeg;base64,…` string.
- **Settings from storage** are re-validated on read.
- **Build gate:** `npm run check:security` (`scripts/verify-build.mjs`) fails
  the build if the manifest gains a permission, a host, a weaker CSP or a
  forbidden key, or if shipped code contains `eval`, `new Function`,
  `innerHTML`, inline scripts, source maps or unexpected URLs.
- **Dependencies:** only build-time dev dependencies, pinned to exact versions
  with a lockfile; `npm audit` runs as part of `npm run verify`; Dependabot
  opens update PRs weekly. Nothing from `node_modules` is shipped except the
  tiny WXT runtime that is bundled into the output and covered by the checks
  above.

## Threat model in short

Protected against: a malicious or compromised web page (including a tampered
Icedrive page) trying to use the extension to reach other sites, run code in
the extension, read other tabs or exfiltrate data; other extensions sending
it messages; corrupted local settings.

Out of scope: a compromised browser or operating system, a compromised
Icedrive account, and someone with physical access to an unlocked machine.

For installing on a managed (company) computer see
[docs/enterprise-install.md](docs/enterprise-install.md).
