// Project files: type checks, compression and limits. Pure functions (no
// database) so they can be unit-tested. Files live in Postgres
// (project_files.data); images arrive already resized and re-encoded by the
// browser, everything compressible is gzipped here before it is stored.
import { promisify } from 'node:util';
import zlib from 'node:zlib';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

export const MAX_FILE_BYTES = 15 * 1024 * 1024;
export const MAX_THUMBNAIL_BYTES = 64 * 1024;
export const MAX_PROJECT_STORED_BYTES = 250 * 1024 * 1024;
export const MAX_FILES_PER_PROJECT = 200;

export const FILE_CATEGORIES = ['design', 'boq', 'image', 'document', 'completion'];

// extension -> [mime, signature family, gzip worth it?]
const TYPES = {
  pdf: ['application/pdf', 'pdf', true],
  jpg: ['image/jpeg', 'jpeg', false],
  jpeg: ['image/jpeg', 'jpeg', false],
  png: ['image/png', 'png', false],
  webp: ['image/webp', 'webp', false],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'zip', false],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'zip', false],
  pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'zip', false],
  xls: ['application/vnd.ms-excel', 'ole', true],
  doc: ['application/msword', 'ole', true],
  ppt: ['application/vnd.ms-powerpoint', 'ole', true],
  dwg: ['image/vnd.dwg', 'dwg', true],
  csv: ['text/csv', 'text', true],
  txt: ['text/plain', 'text', true]
};

// The signed completion page: a photo/scan or a PDF.
const COMPLETION_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'webp'];

export const ALLOWED_EXTENSIONS = Object.keys(TYPES);

const startsWith = (buf, bytes, offset = 0) => bytes.every((b, i) => buf[offset + i] === b);

function family(buf) {
  if (startsWith(buf, [0x25, 0x50, 0x44, 0x46])) return 'pdf';
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47])) return 'png';
  if (startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8)) return 'webp';
  if (startsWith(buf, [0x50, 0x4b, 0x03, 0x04])) return 'zip';
  if (startsWith(buf, [0xd0, 0xcf, 0x11, 0xe0])) return 'ole';
  if (startsWith(buf, [0x41, 0x43, 0x31, 0x30])) return 'dwg'; // "AC10"
  if (!buf.subarray(0, 8192).includes(0)) return 'text';
  return null;
}

const fail = (message) => Object.assign(new Error(message), { status: 400, code: 'VALIDATION' });

export function extensionOf(fileName) {
  const match = /\.([a-z0-9]+)$/i.exec(String(fileName || ''));
  return match ? match[1].toLowerCase() : '';
}

// Checks the declared name against the actual bytes. Returns the stored mime
// type and whether gzip is worth trying. Throws code VALIDATION.
export function inspectFile({ fileName, category, buffer }) {
  if (!FILE_CATEGORIES.includes(category)) throw fail('Unknown file category');
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw fail('The file is empty');
  if (buffer.length > MAX_FILE_BYTES) throw fail(`Files must be ${MAX_FILE_BYTES / (1024 * 1024)} MB or smaller`);
  const ext = extensionOf(fileName);
  const type = TYPES[ext];
  if (!type) throw fail(`.${ext || '?'} files are not allowed. Use PDF, images, Excel, Word, PowerPoint, DWG, CSV or TXT.`);
  if (category === 'completion' && !COMPLETION_EXTENSIONS.includes(ext)) {
    throw fail('The completion document must be a PDF or an image (JPG, PNG, WEBP)');
  }
  const [mime, expected, compressible] = type;
  if (family(buffer) !== expected) throw fail(`This file's contents do not match a .${ext} file`);
  return { mime, compressible };
}

export function checkThumbnail(thumbnail) {
  if (!thumbnail || thumbnail.length === 0) return null;
  if (thumbnail.length > MAX_THUMBNAIL_BYTES) throw fail('Preview image is too large');
  if (family(thumbnail) !== 'jpeg') throw fail('Preview image must be a JPEG');
  return thumbnail;
}

// gzip runs on libuv's thread pool, so a big upload never blocks other
// requests. Only kept when it actually saves space.
export async function packFile(buffer, compressible) {
  if (compressible) {
    const packed = await gzip(buffer, { level: 6 });
    if (packed.length < buffer.length * 0.95) return { data: packed, encoding: 'gzip' };
  }
  return { data: buffer, encoding: 'identity' };
}

export const unpackFile = (data, encoding) => (encoding === 'gzip' ? gunzip(data) : Promise.resolve(data));

// File names reach a Content-Disposition header: keep them single-line.
export const safeFileName = (name) => String(name || 'file').replace(/[\r\n"\\/]/g, '_').slice(0, 180) || 'file';

// Uploads are buffered in memory (≤ MAX_FILE_BYTES each). At most
// UPLOAD_SLOTS run at once per server; later ones wait their turn *before*
// their body is read, so a burst of uploads can't balloon memory or starve
// people who are only viewing.
const UPLOAD_SLOTS = 3;
const MAX_WAITING = 30;
let running = 0;
const waiting = [];

export function acquireUploadSlot() {
  if (running < UPLOAD_SLOTS) {
    running += 1;
    return Promise.resolve(releaseOnce());
  }
  if (waiting.length >= MAX_WAITING) return Promise.reject(Object.assign(new Error('Too many uploads in progress — try again in a minute'), { code: 'BUSY' }));
  return new Promise((resolve) => waiting.push(() => resolve(releaseOnce())));
}

function releaseOnce() {
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const next = waiting.shift();
    if (next) next();
    else running -= 1;
  };
}
