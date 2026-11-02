# Chrome Web Store

Every release can be sent to the Chrome Web Store automatically: the
**Release** workflow's `chrome-web-store` job downloads the released zip,
checks it against `SHA256SUMS.txt`, uploads it with the Chrome Web Store API
and submits it for review. The store then signs it with Google's key, which is
what lets anyone install it with one click (a self-signed `.crx` gets
`CRX_REQUIRED_PROOF_MISSING` outside managed devices).

The API can only update an item that already exists, so the steps below are
done **once** by hand.

## 1. First upload (Developer Dashboard)

1. Go to the [Developer Dashboard](https://chrome.google.com/webstore/devconsole)
   → **Add new item** and upload `icedrive-music-extension-<version>-chrome.zip`
   from the latest GitHub release.
2. Fill in the tabs with the texts below and the images from `docs/store/`.
3. **Distribution → Visibility:** *Unlisted* (only people with the link can
   find it) or *Public*. Choose it now: the API publishes with the visibility
   set here.
4. Submit for review. Copy the item's **ID** (32 letters, shown on the item
   page). It differs from the self-signed `.crx` ID, which is only used for
   policy installs from GitHub.

## 2. API access (Google Cloud, ~10 minutes)

Your Google account needs 2-step verification to publish.

1. In the [Google Cloud console](https://console.cloud.google.com/) create a
   project (e.g. `icedrive-music-cws`) and enable the **Chrome Web Store API**.
2. **APIs & Services → OAuth consent screen:** User type *External*, fill in the
   app name and your e-mail, add yourself as a **test user**, and then
   **Publish app** (move it to *In production*). In *Testing*, refresh tokens
   expire after 7 days.
3. **Credentials → Create credentials → OAuth client ID**, type *Web
   application*, authorized redirect URI
   `https://developers.google.com/oauthplayground`. Save the client ID and
   secret.
4. Open the [OAuth 2.0 Playground](https://developers.google.com/oauthplayground),
   gear icon → *Use your own OAuth credentials* → paste the client ID and secret.
   In *Input your own scopes* enter `https://www.googleapis.com/auth/chromewebstore`,
   **Authorize APIs**, sign in with the account that owns the store item, then
   **Exchange authorization code for tokens** and copy the **refresh token**.
5. Your **publisher ID** is under Developer Dashboard → **Account**.

## 3. GitHub settings

**Settings → Secrets and variables → Actions:**

| Kind | Name | Value |
| --- | --- | --- |
| Secret | `CWS_CLIENT_ID` | OAuth client ID |
| Secret | `CWS_CLIENT_SECRET` | OAuth client secret |
| Secret | `CWS_REFRESH_TOKEN` | refresh token from the Playground |
| Variable | `CWS_PUBLISHER_ID` | publisher ID |
| Variable | `CWS_EXTENSION_ID` | store item ID (turns the job on) |
| Variable (optional) | `CWS_PUBLISH_TYPE` | `STAGED_PUBLISH` to wait for your manual "Publish" after review; default `DEFAULT_PUBLISH` goes live as soon as it passes |

From then on, every **Release** run publishes to the store too. If the store
step fails (expired token, review blocked…), the GitHub release is already
out; fix the cause and click **Re-run failed jobs** on that run. A new store
upload always needs a higher version in `package.json`.

## Store listing texts

**Name:** Icedrive Music Player+

**Summary** (max 132 characters):

> Adds next/previous, shuffle, repeat, a queue, media keys and a mini player to the Icedrive web music player.

**Category:** Tools (or Entertainment). **Language:** English.

**Description:**

```text
Icedrive Music Player+ turns the basic audio preview on icedrive.net into a proper music player.

Open a folder of songs on Icedrive, press play, and you get:

• Now playing: title, artist, album art and the track's position in the folder
• Seek bar to scrub anywhere in the track
• Queue of every audio file in the folder, in Icedrive's order. Click one to play it
• Auto-advance to the next track
• Shuffle: every track once per round, and Previous goes back to what you actually heard
• Repeat: off, whole folder, or one track. Remembered between sessions
• Shuffle, previous, next and repeat buttons right under Icedrive's own player
• Mini player window that stays open while you work in other tabs
• Media keys and the system media overlay, with track info and artwork
• Keyboard shortcuts (Alt+Shift+Space, Alt+Shift+. and Alt+Shift+, by default), changeable at chrome://extensions/shortcuts

Privacy and security
• Works only on icedrive.net and asks for a single permission (storage)
• Collects nothing, sends nothing, no analytics, no remote code
• Open source

This is an unofficial, community-made extension. It isn't affiliated with or endorsed by Icedrive.
```

**Images** (in `docs/store/`, re-render with `node docs/store/render.mjs`):

- Store icon: `public/icon/128.png`
- Screenshots (1280×800): `screenshot-1-popup.png`, `screenshot-2-mini-player.png`, `screenshot-3-in-icedrive.png`
- Small promo tile (440×280): `promo-small-440x280.png`

## Privacy tab

**Single purpose:**

> Adds playback controls (queue, next/previous, shuffle, repeat, media keys, mini player) to the music player on icedrive.net.

**Permission justifications:**

- `storage`: Saves the user's shuffle and repeat settings so they persist between sessions. Nothing else is stored.
- Host permission `https://icedrive.net/*`: The extension's content script reads the currently playing track and the folder's file list from the Icedrive page, and presses Icedrive's own player controls. It runs on no other site.

**Remote code:** No, I am not using remote code. All code is bundled in the package and the extension pages enforce a strict Content Security Policy.

**Data usage:** tick nothing. The extension does not collect or transmit any user data. Track titles and album art are only passed from the Icedrive tab to the extension's own popup, inside the browser. Then confirm the three certifications (no selling, no unrelated use, no creditworthiness).

**Privacy policy URL:** needed only if the dashboard asks for it. It must be publicly reachable, so if this repository stays private, publish a short statement elsewhere (e.g. a public gist): *"Icedrive Music Player+ does not collect, store or transmit any personal data. Settings (shuffle/repeat) are stored locally in your browser."*
