#!/usr/bin/env node
/**
 * Security gate for the production build. Run after `wxt build`:
 *
 *   node scripts/verify-build.mjs [.output/chrome-mv3]
 *
 * Fails (exit code 1) if the built extension asks for more than it needs or
 * contains code patterns we never want to ship. Any intended change to
 * permissions must be made here too, on purpose, in the same pull request.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const dir = process.argv[2] ?? '.output/chrome-mv3';

const ALLOWED_PERMISSIONS = ['storage'];
const ALLOWED_HOST_PERMISSIONS = ['https://icedrive.net/*'];
const ALLOWED_CONTENT_SCRIPT_MATCHES = ['https://icedrive.net/*'];
/** Keys that would widen who can talk to us or where we update from. */
const FORBIDDEN_MANIFEST_KEYS = [
  'web_accessible_resources',
  'externally_connectable',
  'optional_permissions',
  'optional_host_permissions',
  'update_url',
  'sandbox',
  'oauth2',
  'key',
];
const REQUIRED_CSP = ["default-src 'none'", "script-src 'self'", "object-src 'none'", "connect-src 'none'", "base-uri 'none'"];
const FORBIDDEN_CSP = ['unsafe-eval', 'unsafe-inline', 'http:', 'https:', 'wasm-unsafe-eval', '*'];
/** Patterns that must never appear in shipped code. */
const FORBIDDEN_CODE = [
  [/\beval\s*\(/, 'eval()'],
  [/\bnew\s+Function\s*\(/, 'new Function()'],
  [/\.innerHTML\s*=/, 'innerHTML assignment'],
  [/\.outerHTML\s*=/, 'outerHTML assignment'],
  [/insertAdjacentHTML/, 'insertAdjacentHTML'],
  [/document\.write/, 'document.write'],
  [/importScripts\s*\(/, 'importScripts()'],
  [/setTimeout\s*\(\s*["'`]/, 'setTimeout(string)'],
  [/setInterval\s*\(\s*["'`]/, 'setInterval(string)'],
];
/** The only absolute URLs allowed in shipped files. */
const ALLOWED_URLS = new Set(['https://icedrive.net/*', 'http://www.w3.org/2000/svg']);

const errors = [];
const fail = (msg) => errors.push(msg);
const sameSet = (a = [], b = []) => a.length === b.length && [...a].sort().join('\n') === [...b].sort().join('\n');

const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));

if (manifest.manifest_version !== 3) fail(`manifest_version must be 3, got ${manifest.manifest_version}`);
if (!sameSet(manifest.permissions, ALLOWED_PERMISSIONS))
  fail(`permissions ${JSON.stringify(manifest.permissions)} != ${JSON.stringify(ALLOWED_PERMISSIONS)}`);
if (!sameSet(manifest.host_permissions, ALLOWED_HOST_PERMISSIONS))
  fail(`host_permissions ${JSON.stringify(manifest.host_permissions)} != ${JSON.stringify(ALLOWED_HOST_PERMISSIONS)}`);
for (const key of FORBIDDEN_MANIFEST_KEYS) if (key in manifest) fail(`manifest must not contain "${key}"`);

for (const cs of manifest.content_scripts ?? []) {
  if (!sameSet(cs.matches, ALLOWED_CONTENT_SCRIPT_MATCHES)) fail(`content script matches ${JSON.stringify(cs.matches)}`);
  if (cs.all_frames) fail('content scripts must not run in all frames');
  if (cs.match_about_blank || cs.match_origin_as_fallback) fail('content scripts must not match about:blank / fallback origins');
}

const csp = manifest.content_security_policy?.extension_pages;
if (typeof csp !== 'string') {
  fail('content_security_policy.extension_pages is missing');
} else {
  for (const part of REQUIRED_CSP) if (!csp.includes(part)) fail(`CSP is missing "${part}"`);
  const sources = csp.split(';').flatMap((d) => d.trim().split(/\s+/).slice(1));
  for (const bad of FORBIDDEN_CSP)
    if (sources.some((s) => s === bad || s === `'${bad}'` || (bad.endsWith(':') && s.startsWith(bad))))
      fail(`CSP must not allow ${bad}`);
}

function* files(root) {
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else yield path;
  }
}

for (const path of files(dir)) {
  const rel = relative(dir, path);
  if (/\.map$/.test(rel)) fail(`source map shipped: ${rel}`);
  if (!/\.(js|mjs|html|css|json)$/.test(rel)) continue;
  const text = readFileSync(path, 'utf8');
  for (const [re, label] of FORBIDDEN_CODE) if (re.test(text)) fail(`${rel}: contains ${label}`);
  for (const url of text.match(/\bhttps?:\/\/[^\s"'`)<>\\]+/g) ?? [])
    if (!ALLOWED_URLS.has(url)) fail(`${rel}: unexpected URL ${url}`);
  if (/\.html$/.test(rel)) {
    if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(text)) fail(`${rel}: inline <script>`);
    if (/\son[a-z]+\s*=/i.test(text)) fail(`${rel}: inline event handler`);
    if (/<script[^>]*src=["']?https?:/i.test(text)) fail(`${rel}: remote script`);
  }
}

if (errors.length) {
  console.error(`✗ Security check failed for ${dir}:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`✓ Security check passed for ${dir}`);
