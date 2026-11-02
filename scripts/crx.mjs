#!/usr/bin/env node
/**
 * Signs the extension as a CRX3 package (the format Chrome installs from an
 * update server) and writes the matching update manifest. No dependencies:
 * the CRX3 container is small enough to build with node:crypto.
 *
 *   node scripts/crx.mjs keygen <key.pem>
 *       Creates a new 2048-bit RSA signing key. Keep it secret and never
 *       change it: the extension ID is derived from it.
 *   node scripts/crx.mjs id <key.pem | file.crx>
 *       Prints the extension ID for a key or a signed package.
 *   node scripts/crx.mjs pack <extension.zip> <key.pem> <out.crx>
 *       Wraps the zip built by `wxt zip` in a signed CRX3 container.
 *   node scripts/crx.mjs verify <file.crx>
 *       Checks the container and its signature, prints the extension ID.
 *   node scripts/crx.mjs update-xml <file.crx> <version> <codebase-url> <out.xml>
 *       Writes the update manifest Chrome polls (ExtensionInstallForcelist).
 *
 * Format: https://chromium.googlesource.com/chromium/src/+/main/components/crx_file/crx3.proto
 */
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const MAGIC = Buffer.from('Cr24');
const SIGNATURE_CONTEXT = Buffer.from('CRX3 SignedData\x00', 'binary');

// --- minimal protobuf (only length-delimited fields are needed) ---

function varint(n) {
  const out = [];
  while (n > 0x7f) {
    out.push((n & 0x7f) | 0x80);
    n >>>= 7;
  }
  out.push(n);
  return Buffer.from(out);
}

function field(num, bytes) {
  return Buffer.concat([varint((num << 3) | 2), varint(bytes.length), bytes]);
}

function readVarint(buf, pos) {
  let result = 0;
  let shift = 0;
  for (;;) {
    if (pos >= buf.length) throw new Error('truncated varint');
    const b = buf[pos++];
    result += (b & 0x7f) * 2 ** shift;
    if (!(b & 0x80)) return [result, pos];
    shift += 7;
    if (shift > 35) throw new Error('varint too long');
  }
}

/** Parses a message made only of length-delimited fields into {num: [Buffer]}. */
function parseFields(buf) {
  const fields = {};
  let pos = 0;
  while (pos < buf.length) {
    let key;
    [key, pos] = readVarint(buf, pos);
    if ((key & 7) !== 2) throw new Error(`unexpected wire type ${key & 7}`);
    let len;
    [len, pos] = readVarint(buf, pos);
    if (pos + len > buf.length) throw new Error('truncated field');
    (fields[Math.floor(key / 8)] ??= []).push(buf.subarray(pos, pos + len));
    pos += len;
  }
  return fields;
}

// --- CRX3 ---

/** Chrome's extension ID: first 16 bytes of SHA-256(public key), as a-p letters. */
function crxIdBytes(spkiDer) {
  return createHash('sha256').update(spkiDer).digest().subarray(0, 16);
}

function idFromBytes(bytes) {
  return [...bytes].map((b) => String.fromCharCode(97 + (b >> 4)) + String.fromCharCode(97 + (b & 15))).join('');
}

function signedPayload(signedHeaderData, archive) {
  const len = Buffer.alloc(4);
  len.writeUInt32LE(signedHeaderData.length);
  return Buffer.concat([SIGNATURE_CONTEXT, len, signedHeaderData, archive]);
}

function loadKey(path) {
  const key = createPrivateKey(readFileSync(path));
  if (key.asymmetricKeyType !== 'rsa') throw new Error('signing key must be RSA');
  return key;
}

function pack(zipPath, keyPath, outPath) {
  const archive = readFileSync(zipPath);
  if (archive.readUInt32LE(0) !== 0x04034b50) throw new Error(`${zipPath} is not a zip file`);
  const privateKey = loadKey(keyPath);
  const spki = createPublicKey(privateKey).export({ type: 'spki', format: 'der' });
  const signedHeaderData = field(1, crxIdBytes(spki)); // SignedData { crx_id }
  const signature = sign('sha256', signedPayload(signedHeaderData, archive), privateKey);
  const header = Buffer.concat([
    field(2, Buffer.concat([field(1, spki), field(2, signature)])), // sha256_with_rsa
    field(10000, signedHeaderData),
  ]);
  const prefix = Buffer.alloc(12);
  MAGIC.copy(prefix, 0);
  prefix.writeUInt32LE(3, 4);
  prefix.writeUInt32LE(header.length, 8);
  writeFileSync(outPath, Buffer.concat([prefix, header, archive]));
  return idFromBytes(crxIdBytes(spki));
}

/** Validates a CRX3 file the way Chrome does and returns its extension ID. */
function verifyCrx(path) {
  const buf = readFileSync(path);
  if (buf.length < 12 || !buf.subarray(0, 4).equals(MAGIC)) throw new Error('not a CRX file');
  if (buf.readUInt32LE(4) !== 3) throw new Error('not CRX version 3');
  const headerLen = buf.readUInt32LE(8);
  const header = parseFields(buf.subarray(12, 12 + headerLen));
  const archive = buf.subarray(12 + headerLen);
  const signedHeaderData = header[10000]?.[0];
  if (!signedHeaderData) throw new Error('missing signed header data');
  const crxId = parseFields(signedHeaderData)[1]?.[0];
  if (!crxId || crxId.length !== 16) throw new Error('missing crx_id');
  const payload = signedPayload(signedHeaderData, archive);
  let idMatched = false;
  for (const proof of header[2] ?? []) {
    const p = parseFields(proof);
    const spki = p[1]?.[0];
    const signature = p[2]?.[0];
    if (!spki || !signature) throw new Error('incomplete key proof');
    const publicKey = createPublicKey({ key: spki, format: 'der', type: 'spki' });
    if (!verify('sha256', payload, publicKey, signature)) throw new Error('bad signature');
    if (crxIdBytes(spki).equals(crxId)) idMatched = true;
  }
  if (!idMatched) throw new Error('no signature from the key that matches crx_id');
  return idFromBytes(crxId);
}

function idOf(path) {
  const buf = readFileSync(path);
  if (buf.subarray(0, 4).equals(MAGIC)) return verifyCrx(path);
  const spki = createPublicKey(loadKey(path)).export({ type: 'spki', format: 'der' });
  return idFromBytes(crxIdBytes(spki));
}

function escapeXml(s) {
  return s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]);
}

const [cmd, ...args] = process.argv.slice(2);
try {
  switch (cmd) {
    case 'keygen': {
      const [out] = args;
      if (!out) throw new Error('usage: keygen <key.pem>');
      const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
      writeFileSync(out, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600, flag: 'wx' });
      console.log(`Wrote ${out}. Extension ID: ${idOf(out)}`);
      break;
    }
    case 'id':
      if (!args[0]) throw new Error('usage: id <key.pem | file.crx>');
      console.log(idOf(args[0]));
      break;
    case 'pack': {
      const [zip, key, out] = args;
      if (!zip || !key || !out) throw new Error('usage: pack <extension.zip> <key.pem> <out.crx>');
      const id = pack(zip, key, out);
      if (verifyCrx(out) !== id) throw new Error('self-check failed');
      console.log(`Wrote ${out} (extension ID ${id})`);
      break;
    }
    case 'verify':
      if (!args[0]) throw new Error('usage: verify <file.crx>');
      console.log(`✓ ${args[0]} is a valid CRX3, extension ID ${verifyCrx(args[0])}`);
      break;
    case 'update-xml': {
      const [crx, version, codebase, out] = args;
      if (!crx || !version || !codebase || !out) throw new Error('usage: update-xml <file.crx> <version> <codebase-url> <out.xml>');
      if (!/^\d+(\.\d+){0,3}$/.test(version)) throw new Error(`bad version ${version}`);
      if (!codebase.startsWith('https://')) throw new Error('codebase must be an https:// URL');
      const id = verifyCrx(crx);
      writeFileSync(
        out,
        `<?xml version="1.0" encoding="UTF-8"?>
<gupdate xmlns="http://www.google.com/update2/response" protocol="2.0">
  <app appid="${id}">
    <updatecheck codebase="${escapeXml(codebase)}" version="${version}" />
  </app>
</gupdate>
`,
      );
      console.log(`Wrote ${out} for ${id} ${version}`);
      break;
    }
    default:
      throw new Error('commands: keygen, id, pack, verify, update-xml');
  }
} catch (err) {
  console.error(`crx: ${err.message}`);
  process.exit(1);
}
