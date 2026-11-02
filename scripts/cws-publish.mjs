#!/usr/bin/env node
/**
 * Uploads a zip to an existing Chrome Web Store item and submits it for
 * review, using the Chrome Web Store API v2.
 *
 *   node scripts/cws-publish.mjs <extension.zip>
 *
 * Environment (from GitHub secrets / variables):
 *   CWS_CLIENT_ID, CWS_CLIENT_SECRET, CWS_REFRESH_TOKEN   OAuth client + refresh token
 *   CWS_PUBLISHER_ID                                      Developer Dashboard → Account
 *   CWS_EXTENSION_ID                                      the store item's ID
 *   CWS_PUBLISH_TYPE (optional)  DEFAULT_PUBLISH (go live after review, default)
 *                                or STAGED_PUBLISH (wait for a manual "Publish")
 *
 * The item must already exist: the first upload, store listing and privacy
 * tabs are done once by hand in the Developer Dashboard.
 * API reference: https://developer.chrome.com/docs/webstore/api/reference/rest
 */
import { readFileSync } from 'node:fs';

const API = 'https://chromewebstore.googleapis.com';
const POLL_MS = Number(process.env.CWS_POLL_MS) || 5000;
const POLL_TRIES = 36; // 3 minutes

function env(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

async function call(method, url, { token, body, headers = {} } = {}) {
  const res = await fetch(url, { method, body, headers: { Authorization: `Bearer ${token}`, ...headers } });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) throw new Error(`${method} ${url.replace(API, '')} → HTTP ${res.status}: ${text.slice(0, 1000)}`);
  return json;
}

async function accessToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env('CWS_CLIENT_ID'),
      client_secret: env('CWS_CLIENT_SECRET'),
      refresh_token: env('CWS_REFRESH_TOKEN'),
      grant_type: 'refresh_token',
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    throw new Error(`could not get an access token (HTTP ${res.status} ${json.error ?? ''} ${json.error_description ?? ''}).`
      + ' If the refresh token expired, create a new one (docs/chrome-web-store.md).');
  }
  // Keep the token out of the Actions log even if something echoes it.
  if (process.env.GITHUB_ACTIONS) console.log(`::add-mask::${json.access_token}`);
  return json.access_token;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const [zipPath] = process.argv.slice(2);
  if (!zipPath) throw new Error('usage: cws-publish.mjs <extension.zip>');
  const zip = readFileSync(zipPath);
  if (zip.readUInt32LE(0) !== 0x04034b50) throw new Error(`${zipPath} is not a zip file`);

  const publisher = env('CWS_PUBLISHER_ID');
  const item = env('CWS_EXTENSION_ID');
  if (!/^[a-p]{32}$/.test(item)) throw new Error(`CWS_EXTENSION_ID "${item}" doesn't look like an extension ID`);
  const publishType = process.env.CWS_PUBLISH_TYPE?.trim() || 'DEFAULT_PUBLISH';
  if (!['DEFAULT_PUBLISH', 'STAGED_PUBLISH'].includes(publishType)) throw new Error(`bad CWS_PUBLISH_TYPE ${publishType}`);
  const name = `publishers/${encodeURIComponent(publisher)}/items/${item}`;
  const token = await accessToken();

  console.log(`Uploading ${zipPath} (${zip.length} bytes) to ${item}…`);
  let upload = await call('POST', `${API}/upload/v2/${name}:upload?uploadType=media`, {
    token,
    body: zip,
    headers: { 'Content-Type': 'application/zip' },
  });
  let state = upload.uploadState;
  for (let i = 0; state === 'IN_PROGRESS' && i < POLL_TRIES; i++) {
    await sleep(POLL_MS);
    const status = await call('GET', `${API}/v2/${name}:fetchStatus`, { token });
    state = status.lastAsyncUploadState;
  }
  if (state !== 'SUCCEEDED') throw new Error(`upload did not succeed (state ${state}): ${JSON.stringify(upload)}`);
  console.log(`✓ Uploaded version ${upload.crxVersion ?? '(processing)'}`);

  const result = await call('POST', `${API}/v2/${name}:publish`, {
    token,
    body: JSON.stringify({ publishType }),
    headers: { 'Content-Type': 'application/json' },
  });
  for (const w of result.warningInfo?.warnings ?? []) console.log(`::warning::Chrome Web Store: ${w.reason}: ${w.description}`);
  console.log(`✓ Submitted for review (${publishType}), state: ${result.state ?? 'unknown'}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import('node:fs');
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### Chrome Web Store\n\nUploaded \`${zipPath}\` to [${item}](https://chromewebstore.google.com/detail/${item}) and submitted it for review (${publishType}). State: \`${result.state ?? 'unknown'}\`.\n`,
    );
  }
}

main().catch((err) => {
  console.error(`::error::Chrome Web Store publish failed: ${err.message}`);
  process.exit(1);
});
