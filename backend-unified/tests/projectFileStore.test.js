import test from 'node:test';
import assert from 'node:assert/strict';
import {
  inspectFile, packFile, unpackFile, checkThumbnail, safeFileName, acquireUploadSlot, MAX_FILE_BYTES
} from '../services/projectFileStore.js';

const pdf = Buffer.from(`%PDF-1.4\n${'scope '.repeat(500)}`);

test('accepts a file whose contents match its extension', () => {
  assert.deepEqual(inspectFile({ fileName: 'Layout.PDF', category: 'design', buffer: pdf }), { mime: 'application/pdf', compressible: true });
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0]);
  assert.equal(inspectFile({ fileName: 'a.jpg', category: 'image', buffer: jpg }).compressible, false);
});

test('rejects disguised, unknown, empty and oversized files', () => {
  assert.throws(() => inspectFile({ fileName: 'a.png', category: 'image', buffer: pdf }), /do not match/);
  assert.throws(() => inspectFile({ fileName: 'a.exe', category: 'document', buffer: pdf }), /not allowed/);
  assert.throws(() => inspectFile({ fileName: 'a.pdf', category: 'document', buffer: Buffer.alloc(0) }), /empty/);
  assert.throws(() => inspectFile({ fileName: 'a.pdf', category: 'nope', buffer: pdf }), /category/);
  const big = Buffer.concat([pdf, Buffer.alloc(MAX_FILE_BYTES)]);
  assert.throws(() => inspectFile({ fileName: 'a.pdf', category: 'document', buffer: big }), /MB or smaller/);
});

test('the completion document must be a PDF or an image', () => {
  const xlsx = Buffer.from('PK\x03\x04rest');
  assert.ok(inspectFile({ fileName: 'boq.xlsx', category: 'boq', buffer: xlsx }));
  assert.throws(() => inspectFile({ fileName: 'done.xlsx', category: 'completion', buffer: xlsx }), /PDF or an image/);
});

test('gzip is used only when it saves space, and round-trips exactly', async () => {
  const packed = await packFile(pdf, true);
  assert.equal(packed.encoding, 'gzip');
  assert.ok(packed.data.length < pdf.length);
  assert.deepEqual(await unpackFile(packed.data, packed.encoding), pdf);

  const random = Buffer.from(Array.from({ length: 2000 }, (_, i) => (i * 7919) % 251));
  const kept = await packFile(Buffer.from([0xff, 0xd8, 0xff, ...random]), false);
  assert.equal(kept.encoding, 'identity');
});

test('thumbnails must be small JPEGs; file names are header-safe', () => {
  assert.equal(checkThumbnail(null), null);
  assert.throws(() => checkThumbnail(pdf), /JPEG/);
  assert.equal(safeFileName('a"b\r\nc/d.pdf'), 'a_b__c_d.pdf');
});

test('upload slots: at most three run together, the rest wait their turn', async () => {
  const releases = await Promise.all([acquireUploadSlot(), acquireUploadSlot(), acquireUploadSlot()]);
  let fourthStarted = false;
  const fourth = acquireUploadSlot().then((release) => { fourthStarted = true; return release; });
  await new Promise((r) => setImmediate(r));
  assert.equal(fourthStarted, false);
  releases[0]();
  releases[0](); // releasing twice is harmless
  const release4 = await fourth;
  assert.equal(fourthStarted, true);
  [release4, releases[1], releases[2]].forEach((release) => release());
});
