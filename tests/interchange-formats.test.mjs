import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createViteTestServer } from './helpers/vite-test-server.mjs';
import { deflateSync } from 'node:zlib';

let vite;
let encodePsdComposite;
let decodePsdComposite;
let encodeGif89a;
let encodePdfCompatibleAi;
let decodePdfCompatibleAi;
let encodeSvgWithEmbeddedPng;
let extractKraMergedImage;

function createStoredZip(entries) {
  const encoder = new TextEncoder();
  const locals = [];
  const centrals = [];
  let localOffset = 0;
  for (const [name, value] of entries) {
    const nameBytes = encoder.encode(name);
    const data = value instanceof Uint8Array ? value : encoder.encode(value);
    const crc = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    locals.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint32(42, localOffset, true);
    central.set(nameBytes, 46);
    centrals.push(central);
    localOffset += local.length;
  }
  const centralSize = centrals.reduce((sum, item) => sum + item.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, localOffset, true);
  return concat([...locals, ...centrals, end]);
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function concat(chunks) {
  const output = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
  return output;
}

before(async () => {
  vite = await createViteTestServer();
  ({
    encodePsdComposite,
    decodePsdComposite,
    encodeGif89a,
    encodePdfCompatibleAi,
    decodePdfCompatibleAi,
    encodeSvgWithEmbeddedPng,
    extractKraMergedImage,
  } = await vite.ssrLoadModule('/packages/storage/src/InterchangeFormats.ts'));
});

after(async () => {
  await vite?.close();
});

test('PSD export/import round-trips a flattened RGBA composite', () => {
  const pixels = Uint8Array.from([255, 0, 20, 255, 10, 40, 90, 100]);
  const encoded = encodePsdComposite(2, 1, pixels);
  const decoded = decodePsdComposite(encoded);
  assert.equal(String.fromCharCode(...encoded.subarray(0, 4)), '8BPS');
  assert.equal(decoded.width, 2);
  assert.equal(decoded.height, 1);
  assert.deepEqual([...decoded.pixels], [...pixels]);
});

test('PSD decoder imports ZIP-compressed 8-bit composites', () => {
  const pixels = Uint8Array.from([1, 2, 3, 255, 4, 5, 6, 255]);
  const raw = encodePsdComposite(2, 1, pixels);
  const compressed = new Uint8Array(40 + deflateSync(raw.subarray(40)).length);
  compressed.set(raw.subarray(0, 38), 0);
  compressed.set([0, 2], 38);
  compressed.set(deflateSync(raw.subarray(40)), 40);
  assert.deepEqual([...decodePsdComposite(compressed).pixels], [...pixels]);
});

test('PSD decoder rejects unsupported bit depth and damaged payloads clearly', () => {
  const encoded = encodePsdComposite(1, 1, Uint8Array.from([1, 2, 3, 255]));
  const unsupported = encoded.slice();
  new DataView(unsupported.buffer).setUint16(22, 16, false);
  assert.throws(() => decodePsdComposite(unsupported), /8 bits por canal/);
  assert.throws(() => decodePsdComposite(encoded.slice(0, 40)), /incompleto|truncada/);
  const unsupportedChannels = encodePsdComposite(1, 1, Uint8Array.from([1, 2, 3, 255]));
  new DataView(unsupportedChannels.buffer).setUint16(12, 5, false);
  assert.throws(() => decodePsdComposite(unsupportedChannels), /canales adicionales/);
});

test('GIF export produces a GIF89a file with one frame and a trailer', () => {
  const gif = encodeGif89a(1, 1, Uint8Array.from([220, 30, 70, 255]));
  assert.equal(new TextDecoder().decode(gif.subarray(0, 6)), 'GIF89a');
  assert.equal(gif.at(-1), 0x3b);
});

test('AI export is a PDF-compatible .ai byte stream and SVG embeds PNG data', () => {
  const pixels = Uint8Array.from([20, 30, 40, 255]);
  const ai = encodePdfCompatibleAi(1, 1, pixels);
  assert.equal(new TextDecoder().decode(ai.subarray(0, 8)), '%PDF-1.4');
  assert.match(new TextDecoder().decode(ai), /\/Subtype \/Image/);
  const decodedAi = decodePdfCompatibleAi(ai);
  assert.deepEqual([...decodedAi.pixels], [20, 30, 40, 255]);
  const svg = encodeSvgWithEmbeddedPng(1, 1, Uint8Array.from([137, 80, 78, 71]));
  const markup = new TextDecoder().decode(svg);
  assert.match(markup, /<svg/);
  assert.match(markup, /data:image\/png;base64,/);
});

test('KRA import extracts the flattened merged image only', async () => {
  const imageBytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const kra = createStoredZip([['mimetype', 'application/x-krita'], ['mergedimage.png', imageBytes]]);
  assert.deepEqual([...extractKraMergedImage(kra)], [...imageBytes]);
  assert.throws(() => extractKraMergedImage(new Uint8Array([1, 2, 3])), /directorio ZIP final/);
});
