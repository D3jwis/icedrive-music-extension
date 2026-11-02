import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const dir = mkdtempSync(join(tmpdir(), 'crx-test-'));
const run = (...args: string[]) => execFileSync(process.execPath, ['scripts/crx.mjs', ...args], { encoding: 'utf8' });

// pack() only needs the archive to start with a zip local file header.
function tinyZip(): Buffer {
  const name = Buffer.from('manifest.json');
  const data = Buffer.from('{}');
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(name.length, 26);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  return Buffer.concat([local, name, data]);
}

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('scripts/crx.mjs', () => {
  const key = join(dir, 'key.pem');
  const zip = join(dir, 'ext.zip');
  const crx = join(dir, 'ext.crx');

  it('signs a zip as CRX3 with a stable extension ID', () => {
    run('keygen', key);
    writeFileSync(zip, tinyZip());
    run('pack', zip, key, crx);
    const id = run('id', key).trim();
    expect(id).toMatch(/^[a-p]{32}$/);
    expect(run('id', crx).trim()).toBe(id);
    expect(readFileSync(crx).subarray(0, 4).toString()).toBe('Cr24');
  });

  it('rejects a tampered package', () => {
    const bytes = readFileSync(crx);
    bytes.writeUInt8(bytes.readUInt8(bytes.length - 1) ^ 0xff, bytes.length - 1);
    const bad = join(dir, 'bad.crx');
    writeFileSync(bad, bytes);
    expect(() => run('verify', bad)).toThrow();
  });

  it('writes an update manifest for the package', () => {
    const xml = join(dir, 'update.xml');
    run('update-xml', crx, '1.2.3', 'https://example.com/ext.crx', xml);
    const text = readFileSync(xml, 'utf8');
    expect(text).toContain(`appid="${run('id', crx).trim()}"`);
    expect(text).toContain('version="1.2.3"');
    expect(() => run('update-xml', crx, '1.2.3', 'http://insecure/ext.crx', xml)).toThrow();
  });

  it('never overwrites an existing key', () => {
    expect(() => run('keygen', key)).toThrow();
  });
});
