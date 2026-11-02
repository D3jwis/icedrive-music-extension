#!/usr/bin/env node
/**
 * Builds the GitHub Release body from .github/release-notes-template.md and
 * the matching section of CHANGELOG.md.
 *
 *   node scripts/release-notes.mjs <version> <output.md> [dir-with-zips]
 *
 * Fails if CHANGELOG.md has no non-empty "## [<version>]" section, so every
 * release has a written changelog.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [version, outFile, zipDir = '.output'] = process.argv.slice(2);
if (!version || !outFile) {
  console.error('usage: release-notes.mjs <version> <output.md> [dir-with-zips]');
  process.exit(2);
}
const repo = process.env.GITHUB_REPOSITORY ?? 'D3jwis/icedrive-music-extension';
const tag = `v${version}`;

const changelog = readFileSync('CHANGELOG.md', 'utf8');
const escaped = version.replace(/\./g, '\\.');
const match = changelog.match(new RegExp(`^## \\[${escaped}\\][^\\n]*\\n([\\s\\S]*?)(?=^## \\[|^\\[[^\\]]+\\]: |(?![\\s\\S]))`, 'm'));
const section = match?.[1].trim();
if (!section) {
  console.error(`CHANGELOG.md has no entries under "## [${version}]". Add them before tagging ${tag}.`);
  process.exit(1);
}
// Changelog headings are "###"; demote them so they sit under "What's new".
// Relative links (SECURITY.md, docs/...) don't resolve in a release body, so
// point them at the tagged files.
const body = section
  .replace(/^### /gm, '#### ')
  .replace(/\]\((?!https?:|#|mailto:)([^)]+)\)/g, (_, path) => `](https://github.com/${repo}/blob/${tag}/${path})`);

const zips = readdirSync(zipDir).filter((f) => f.endsWith('.zip')).sort();
if (zips.length === 0) {
  console.error(`No .zip files in ${zipDir}`);
  process.exit(1);
}
const crxs = readdirSync(zipDir).filter((f) => f.endsWith('.crx')).sort();
const extras = readdirSync(zipDir).filter((f) => f === 'update.xml');
const rows = [...zips, ...crxs, ...extras]
  .map((f) => `| \`${f}\` | \`${createHash('sha256').update(readFileSync(join(zipDir, f))).digest('hex')}\` |`)
  .join('\n');
const mainZip = zips.find((f) => f.endsWith('-chrome.zip')) ?? zips[0];

// Signed package for company-managed browsers, only when the release built one.
let itSection = '';
if (crxs.length > 0) {
  const crx = crxs[0];
  const id = execFileSync(process.execPath, ['scripts/crx.mjs', 'id', join(zipDir, crx)], { encoding: 'utf8' }).trim();
  if (!/^[a-p]{32}$/.test(id)) throw new Error(`unexpected extension ID ${id}`);
  itSection = `## For IT: signed package (managed Chrome / Brave)

\`${crx}\` is signed with the project's release key, so its extension ID is always **\`${id}\`**. Chrome only installs it on managed devices, via policy:

\`\`\`text
ExtensionInstallForcelist: ${id};<URL of update.xml on your server>
\`\`\`

Host \`${crx}\` and \`update.xml\` (edit its \`codebase\` to where you put the \`.crx\`), or point the policy at this release's \`update.xml\` if your devices can download from this repository. Details: [work laptop guide](https://github.com/${repo}/blob/${tag}/docs/enterprise-install.md#option-2-self-hosted-force-installed-by-it).
`;
}

const vars = { VERSION: version, TAG: tag, REPO: repo, CHANGELOG: body, ZIP: mainZip, CHECKSUM_ROWS: rows, IT_SECTION: itSection };
const template = readFileSync('.github/release-notes-template.md', 'utf8');
const notes = template.replace(/\{\{(\w+)\}\}/g, (all, key) => (key in vars ? vars[key] : all));
const leftover = notes.match(/\{\{\w+\}\}/);
if (leftover) {
  console.error(`Unknown placeholder ${leftover[0]} in release-notes-template.md`);
  process.exit(1);
}
writeFileSync(outFile, notes);
console.log(`Wrote ${outFile} for ${tag} (${[...zips, ...crxs].join(', ')})`);
