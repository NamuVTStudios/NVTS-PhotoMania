import { zlibSync, unzlibSync, unzipSync } from 'fflate';

export interface DecodedRasterImage {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
}

const MAX_RASTER_PIXELS = 100_000_000;
const PSD_SIGNATURE = '8BPS';

function ensureDimensions(width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > MAX_RASTER_PIXELS) {
    throw new Error('El archivo contiene dimensiones de imagen no compatibles o demasiado grandes.');
  }
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

/** Reads the flattened composite of an 8-bit RGB or grayscale PSD. Layer stacks are intentionally not reconstructed. */
export function decodePsdComposite(bytes: Uint8Array): DecodedRasterImage {
  if (bytes.byteLength < 34 || readAscii(bytes, 0, 4) !== PSD_SIGNATURE) throw new Error('El archivo no tiene una cabecera PSD válida.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(4, false) !== 1) throw new Error('Solo se admite PSD versión 1 (PSB no está soportado).');

  const channels = view.getUint16(12, false);
  const height = view.getUint32(14, false);
  const width = view.getUint32(18, false);
  const depth = view.getUint16(22, false);
  const colorMode = view.getUint16(24, false);
  ensureDimensions(width, height);
  if (depth !== 8) throw new Error('La importación PSD actual requiere 8 bits por canal.');
  if (colorMode !== 3 && colorMode !== 1) throw new Error('La importación PSD actual admite RGB y escala de grises.');
  const supportedChannels = colorMode === 3 ? [3, 4] : [1, 2];
  if (!supportedChannels.includes(channels)) throw new Error('El PSD contiene canales adicionales o insuficientes; solo se admiten RGB/RGBA o gris/gris con alfa.');

  let offset = 26;
  offset = skipLengthPrefixedSection(view, offset, bytes.byteLength);
  offset = skipLengthPrefixedSection(view, offset, bytes.byteLength);
  offset = skipLengthPrefixedSection(view, offset, bytes.byteLength);
  ensureAvailable(bytes, offset, 2);
  const compression = view.getUint16(offset, false);
  offset += 2;

  const channelSize = width * height;
  const planes = readPsdPlanes(bytes, view, offset, width, height, channels, compression);
  const pixels = new Uint8Array(channelSize * 4);
  const hasAlpha = colorMode === 3 ? channels >= 4 : channels >= 2;
  for (let pixel = 0; pixel < channelSize; pixel++) {
    const base = pixel * 4;
    const gray = planes[0][pixel];
    pixels[base] = colorMode === 3 ? planes[0][pixel] : gray;
    pixels[base + 1] = colorMode === 3 ? planes[1][pixel] : gray;
    pixels[base + 2] = colorMode === 3 ? planes[2][pixel] : gray;
    pixels[base + 3] = hasAlpha ? planes[colorMode === 3 ? 3 : 1][pixel] : 255;
  }
  return { width, height, pixels };
}

function skipLengthPrefixedSection(view: DataView, offset: number, totalLength: number): number {
  ensureAvailable(new Uint8Array(view.buffer, view.byteOffset, view.byteLength), offset, 4);
  const length = view.getUint32(offset, false);
  const next = offset + 4 + length;
  ensureAvailable(new Uint8Array(view.buffer, view.byteOffset, view.byteLength), offset, 4 + length);
  if (next > totalLength) throw new Error('El PSD contiene una sección truncada.');
  return next;
}

function ensureAvailable(bytes: Uint8Array, offset: number, length: number): void {
  if (offset < 0 || length < 0 || offset + length > bytes.byteLength) throw new Error('El archivo está incompleto o dañado.');
}

function readPsdPlanes(
  bytes: Uint8Array,
  view: DataView,
  initialOffset: number,
  width: number,
  height: number,
  channels: number,
  compression: number,
): Uint8Array[] {
  const rowSize = width;
  const planes = Array.from({ length: channels }, () => new Uint8Array(width * height));
  let offset = initialOffset;
  if (compression === 0) {
    const total = width * height * channels;
    ensureAvailable(bytes, offset, total);
    for (const plane of planes) {
      plane.set(bytes.subarray(offset, offset + plane.length));
      offset += plane.length;
    }
    return planes;
  }
  if (compression === 2 || compression === 3) {
    let decoded: Uint8Array;
    try {
      decoded = unzlibSync(bytes.subarray(offset));
    } catch {
      throw new Error('No se pudo descomprimir la composición ZIP del PSD.');
    }
    const expectedLength = width * height * channels;
    if (decoded.length !== expectedLength) throw new Error('La composición ZIP del PSD tiene un tamaño inesperado.');
    if (compression === 3) restorePsdPrediction(decoded, width, height, channels);
    for (let channel = 0; channel < channels; channel++) {
      const start = channel * width * height;
      planes[channel].set(decoded.subarray(start, start + width * height));
    }
    return planes;
  }
  if (compression !== 1) throw new Error(`Compresión PSD no compatible: ${compression}.`);

  const rowCount = channels * height;
  ensureAvailable(bytes, offset, rowCount * 2);
  const rowLengths = new Uint16Array(rowCount);
  for (let row = 0; row < rowCount; row++) rowLengths[row] = view.getUint16(offset + row * 2, false);
  offset += rowCount * 2;
  let rowIndex = 0;
  for (const plane of planes) {
    for (let y = 0; y < height; y++) {
      const encodedLength = rowLengths[rowIndex++];
      ensureAvailable(bytes, offset, encodedLength);
      const decoded = decodePackBits(bytes.subarray(offset, offset + encodedLength), rowSize);
      plane.set(decoded, y * rowSize);
      offset += encodedLength;
    }
  }
  return planes;
}

function restorePsdPrediction(bytes: Uint8Array, width: number, height: number, channels: number): void {
  const planeSize = width * height;
  for (let channel = 0; channel < channels; channel++) {
    const channelStart = channel * planeSize;
    for (let row = 0; row < height; row++) {
      const rowStart = channelStart + row * width;
      for (let column = 1; column < width; column++) {
        bytes[rowStart + column] = (bytes[rowStart + column] + bytes[rowStart + column - 1]) & 0xff;
      }
    }
  }
}

function decodePackBits(source: Uint8Array, expectedLength: number): Uint8Array {
  const output = new Uint8Array(expectedLength);
  let inputOffset = 0;
  let outputOffset = 0;
  while (inputOffset < source.length && outputOffset < expectedLength) {
    const control = source[inputOffset++] > 127 ? source[inputOffset - 1] - 256 : source[inputOffset - 1];
    if (control >= 0) {
      const count = control + 1;
      if (inputOffset + count > source.length || outputOffset + count > expectedLength) throw new Error('La fila comprimida del PSD está dañada.');
      output.set(source.subarray(inputOffset, inputOffset + count), outputOffset);
      inputOffset += count;
      outputOffset += count;
      continue;
    }
    if (control === -128) continue;
    if (inputOffset >= source.length) throw new Error('La fila comprimida del PSD está incompleta.');
    const count = 1 - control;
    output.fill(source[inputOffset++], outputOffset, outputOffset + count);
    outputOffset += count;
  }
  if (outputOffset !== expectedLength) throw new Error('La fila comprimida del PSD no tiene el tamaño esperado.');
  return output;
}

/** Extracts Krita's merged preview. It imports the visible result, not Krita's editable layer tree. */
export function extractKraMergedImage(bytes: Uint8Array): Uint8Array {
  validateKraArchive(bytes);
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error('El archivo KRA no contiene un contenedor ZIP válido.');
  }
  const identity = files.mimetype ? new TextDecoder().decode(files.mimetype).trim() : '';
  if (identity !== 'application/x-krita') throw new Error('El ZIP seleccionado no declara el tipo de documento KRA.');
  const merged = files['mergedimage.png'];
  if (merged) return merged;
  const preview = files['preview.png'];
  if (preview) return preview;
  throw new Error('El KRA no incluye mergedimage.png ni preview.png para importar una composición.');
}

function validateKraArchive(bytes: Uint8Array): void {
  const maxArchiveBytes = 100 * 1024 * 1024;
  const maxExpandedBytes = 256 * 1024 * 1024;
  const maxEntries = 512;
  if (bytes.length > maxArchiveBytes) throw new Error('El KRA supera el límite de importación de 100 MiB.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const searchStart = Math.max(0, bytes.length - 65_557);
  let endRecord = -1;
  for (let offset = bytes.length - 22; offset >= searchStart; offset--) {
    if (view.getUint32(offset, true) === 0x06054b50) { endRecord = offset; break; }
  }
  if (endRecord < 0) throw new Error('El KRA no contiene el directorio ZIP final.');
  const entryCount = view.getUint16(endRecord + 10, true);
  const centralSize = view.getUint32(endRecord + 12, true);
  const centralOffset = view.getUint32(endRecord + 16, true);
  if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff || entryCount > maxEntries) {
    throw new Error('El KRA usa ZIP64 o demasiadas entradas, todavía no admitido.');
  }
  if (centralOffset + centralSize > endRecord || centralOffset + centralSize > bytes.length) throw new Error('El directorio ZIP del KRA está dañado.');
  let offset = centralOffset;
  let expandedBytes = 0;
  const names = new Set<string>();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  for (let index = 0; index < entryCount; index++) {
    if (offset + 46 > centralOffset + centralSize || view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error('Una entrada del directorio ZIP del KRA está dañada.');
    }
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const entryEnd = offset + 46 + nameLength + extraLength + commentLength;
    if (entryEnd > centralOffset + centralSize) throw new Error('Una entrada ZIP del KRA está truncada.');
    if ((flags & 1) !== 0 || (method !== 0 && method !== 8) || compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) {
      throw new Error('El KRA contiene cifrado, ZIP64 o un método de compresión no compatible.');
    }
    let name: string;
    try { name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength)); }
    catch { throw new Error('El KRA contiene un nombre de archivo ZIP no válido.'); }
    if (!name || name.startsWith('/') || name.includes('\\') || name.split('/').includes('..') || name.includes('\0')) {
      throw new Error('El KRA contiene una ruta interna no segura.');
    }
    if (names.has(name)) throw new Error('El KRA contiene nombres de archivo ZIP duplicados.');
    names.add(name);
    expandedBytes += uncompressedSize;
    if (expandedBytes > maxExpandedBytes) throw new Error('El contenido descomprimido del KRA supera 256 MiB.');
    offset = entryEnd;
  }
  if (offset !== centralOffset + centralSize) throw new Error('El directorio ZIP del KRA tiene datos inconsistentes.');
}

/** Decodes the flattened raster PDF payload produced by PhotoMania's PDF-compatible AI writer. */
export function decodePdfCompatibleAi(bytes: Uint8Array): DecodedRasterImage | null {
  if (bytes.length < 16 || readAscii(bytes, 0, 5) !== '%PDF-') return null;
  const text = new TextDecoder('latin1').decode(bytes);
  if (!text.includes('NVTS PhotoMania PDF-compatible AI export')) return null;
  const imageMarker = text.indexOf('/Subtype /Image');
  if (imageMarker < 0) throw new Error('El AI PDF-compatible no contiene un objeto de imagen.');
  const dictionaryStart = text.lastIndexOf('<<', imageMarker);
  const dictionaryEnd = text.indexOf('>>', imageMarker);
  if (dictionaryStart < 0 || dictionaryEnd < 0) throw new Error('El AI PDF-compatible contiene un diccionario de imagen dañado.');
  const dictionary = text.slice(dictionaryStart, dictionaryEnd + 2);
  const width = Number(dictionary.match(/\/Width\s+(\d+)/)?.[1]);
  const height = Number(dictionary.match(/\/Height\s+(\d+)/)?.[1]);
  const length = Number(dictionary.match(/\/Length\s+(\d+)/)?.[1]);
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || !Number.isSafeInteger(length)) {
    throw new Error('El AI PDF-compatible no declara dimensiones o longitud válidas.');
  }
  ensureDimensions(width, height);
  if (!dictionary.includes('/ColorSpace /DeviceRGB') || !dictionary.includes('/Filter /FlateDecode') || !dictionary.includes('/BitsPerComponent 8')) {
    throw new Error('El AI PDF-compatible usa un formato de imagen no admitido.');
  }
  const streamMarker = text.indexOf('stream', dictionaryEnd);
  if (streamMarker < 0) throw new Error('El AI PDF-compatible no contiene el flujo de imagen.');
  let dataStart = streamMarker + 'stream'.length;
  if (bytes[dataStart] === 13 && bytes[dataStart + 1] === 10) dataStart += 2;
  else if (bytes[dataStart] === 10 || bytes[dataStart] === 13) dataStart += 1;
  else throw new Error('El flujo de imagen del AI PDF-compatible está mal formado.');
  if (dataStart + length > bytes.length) throw new Error('El flujo de imagen del AI PDF-compatible está truncado.');
  let rgb: Uint8Array;
  try { rgb = unzlibSync(bytes.subarray(dataStart, dataStart + length)); }
  catch { throw new Error('No se pudo descomprimir la imagen del AI PDF-compatible.'); }
  const pixelCount = width * height;
  if (rgb.length !== pixelCount * 3) throw new Error('La imagen del AI PDF-compatible tiene un tamaño inesperado.');
  const pixels = new Uint8Array(pixelCount * 4);
  for (let index = 0; index < pixelCount; index++) {
    const source = index * 3;
    const target = index * 4;
    pixels[target] = rgb[source];
    pixels[target + 1] = rgb[source + 1];
    pixels[target + 2] = rgb[source + 2];
    pixels[target + 3] = 255;
  }
  return { width, height, pixels };
}

/** Extracts a JPEG image stream used as a preview in some PDF-compatible Illustrator files. */
export function extractAiRasterPreview(bytes: Uint8Array): Uint8Array {
  const start = findSignature(bytes, [0xff, 0xd8, 0xff]);
  if (start < 0) throw new Error('Este AI no contiene una vista previa JPEG detectable. Los AI vectoriales/PDF requieren un importador PDF completo.');
  const end = findSignature(bytes, [0xff, 0xd9], start + 3);
  if (end < 0) throw new Error('La vista previa JPEG del AI está incompleta.');
  return bytes.slice(start, end + 2);
}

function findSignature(bytes: Uint8Array, signature: number[], from = 0): number {
  for (let index = from; index <= bytes.length - signature.length; index++) {
    let matches = true;
    for (let part = 0; part < signature.length; part++) matches = matches && bytes[index + part] === signature[part];
    if (matches) return index;
  }
  return -1;
}

/** Writes a standards-based flattened RGB PSD with an alpha channel and raw composite data. */
export function encodePsdComposite(width: number, height: number, rgba: Uint8Array): Uint8Array {
  ensureDimensions(width, height);
  if (rgba.length !== width * height * 4) throw new Error('Los píxeles no coinciden con las dimensiones del PSD.');
  const header = new Uint8Array(26);
  const view = new DataView(header.buffer);
  header.set([0x38, 0x42, 0x50, 0x53], 0);
  view.setUint16(4, 1, false);
  view.setUint16(12, 4, false);
  view.setUint32(14, height, false);
  view.setUint32(18, width, false);
  view.setUint16(22, 8, false);
  view.setUint16(24, 3, false);
  const emptySections = new Uint8Array(12);
  const compression = new Uint8Array([0, 0]);
  const planes = new Uint8Array(width * height * 4);
  const pixels = width * height;
  for (let index = 0; index < pixels; index++) {
    const source = index * 4;
    planes[index] = rgba[source];
    planes[pixels + index] = rgba[source + 1];
    planes[pixels * 2 + index] = rgba[source + 2];
    planes[pixels * 3 + index] = rgba[source + 3];
  }
  return concatBytes([header, emptySections, compression, planes]);
}

/** Creates an Illustrator-openable PDF-compatible .ai file. Artwork is embedded as one flattened image. */
export function encodePdfCompatibleAi(width: number, height: number, rgba: Uint8Array): Uint8Array {
  ensureDimensions(width, height);
  if (rgba.length !== width * height * 4) throw new Error('Los píxeles no coinciden con las dimensiones AI.');
  const rgb = flattenRgbaToRgb(rgba, width * height);
  const compressed = zlibSync(rgb, { level: 6 });
  const content = asciiBytes(`q\n${width} 0 0 ${height} 0 0 cm\n/Im0 Do\nQ\n`);
  const objects = [
    asciiBytes('<< /Type /Catalog /Pages 2 0 R >>'),
    asciiBytes('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    asciiBytes(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`),
    concatBytes([asciiBytes(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${compressed.length} >>\nstream\n`), compressed, asciiBytes('\nendstream')]),
    concatBytes([asciiBytes(`<< /Length ${content.length} >>\nstream\n`), content, asciiBytes('endstream')]),
    asciiBytes('<< /Creator (NVTS PhotoMania) /Producer (NVTS PhotoMania PDF-compatible AI export) >>'),
  ];
  return buildPdf(objects);
}

function buildPdf(objects: Uint8Array[]): Uint8Array {
  const chunks: Uint8Array[] = [asciiBytes('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')];
  const offsets = [0];
  let offset = chunks[0].length;
  objects.forEach((body, index) => {
    offsets.push(offset);
    const object = concatBytes([asciiBytes(`${index + 1} 0 obj\n`), body, asciiBytes('\nendobj\n')]);
    chunks.push(object);
    offset += object.length;
  });
  const xrefOffset = offset;
  const xref = [`xref\n0 ${objects.length + 1}\n`, '0000000000 65535 f \n'];
  for (let index = 1; index < offsets.length; index++) xref.push(`${String(offsets[index]).padStart(10, '0')} 00000 n \n`);
  xref.push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${objects.length} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
  chunks.push(asciiBytes(xref.join('')));
  return concatBytes(chunks);
}

function flattenRgbaToRgb(rgba: Uint8Array, pixelCount: number): Uint8Array {
  const rgb = new Uint8Array(pixelCount * 3);
  for (let index = 0; index < pixelCount; index++) {
    const source = index * 4;
    const alpha = rgba[source + 3] / 255;
    const target = index * 3;
    rgb[target] = Math.round(rgba[source] * alpha + 255 * (1 - alpha));
    rgb[target + 1] = Math.round(rgba[source + 1] * alpha + 255 * (1 - alpha));
    rgb[target + 2] = Math.round(rgba[source + 2] * alpha + 255 * (1 - alpha));
  }
  return rgb;
}

export function encodeSvgWithEmbeddedPng(width: number, height: number, png: Uint8Array): Uint8Array {
  ensureDimensions(width, height);
  const base64 = bytesToBase64(png);
  const markup = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n  <image width="${width}" height="${height}" href="data:image/png;base64,${base64}" xlink:href="data:image/png;base64,${base64}"/>\n</svg>`;
  return new TextEncoder().encode(markup);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

/** Encodes a single-frame GIF89a using a compact 6×6×6 palette and one transparent entry. */
export function encodeGif89a(width: number, height: number, rgba: Uint8Array, delayCentiseconds = 10): Uint8Array {
  ensureDimensions(width, height);
  if (rgba.length !== width * height * 4) throw new Error('Los píxeles no coinciden con las dimensiones GIF.');
  const palette = createGifPalette();
  const indices = quantizeGifPixels(rgba);
  const lzw = encodeGifLzw(indices);
  const blocks: Uint8Array[] = [
    asciiBytes('GIF89a'),
    littleEndian16(width), littleEndian16(height),
    new Uint8Array([0xf7, 0, 0]),
    palette,
    new Uint8Array([0x21, 0xf9, 0x04, 0x01]),
    littleEndian16(delayCentiseconds),
    new Uint8Array([0, 0]),
    new Uint8Array([0x2c]),
    littleEndian16(0), littleEndian16(0), littleEndian16(width), littleEndian16(height),
    new Uint8Array([0]),
    new Uint8Array([8]),
    ...splitGifSubBlocks(lzw),
    new Uint8Array([0x3b]),
  ];
  return concatBytes(blocks);
}

function createGifPalette(): Uint8Array {
  const palette = new Uint8Array(256 * 3);
  for (let index = 1; index <= 216; index++) {
    const value = index - 1;
    const red = Math.floor(value / 36);
    const green = Math.floor((value % 36) / 6);
    const blue = value % 6;
    const offset = index * 3;
    palette[offset] = red * 51;
    palette[offset + 1] = green * 51;
    palette[offset + 2] = blue * 51;
  }
  return palette;
}

function quantizeGifPixels(rgba: Uint8Array): Uint8Array {
  const output = new Uint8Array(rgba.length / 4);
  for (let source = 0, target = 0; source < rgba.length; source += 4, target++) {
    if (rgba[source + 3] < 128) {
      output[target] = 0;
      continue;
    }
    const red = Math.round(rgba[source] / 51);
    const green = Math.round(rgba[source + 1] / 51);
    const blue = Math.round(rgba[source + 2] / 51);
    output[target] = 1 + red * 36 + green * 6 + blue;
  }
  return output;
}

function encodeGifLzw(indices: Uint8Array): Uint8Array {
  const clearCode = 256;
  const endCode = 257;
  const output: number[] = [];
  let bitBuffer = 0;
  let bitCount = 0;
  let codeSize = 9;
  let nextCode = 258;
  let dictionary = new Map<string, number>();
  const writeCode = (code: number): void => {
    bitBuffer |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      output.push(bitBuffer & 0xff);
      bitBuffer >>>= 8;
      bitCount -= 8;
    }
  };
  const resetDictionary = (): void => {
    dictionary = new Map<string, number>();
    codeSize = 9;
    nextCode = 258;
  };

  writeCode(clearCode);
  if (indices.length === 0) writeCode(endCode);
  if (indices.length > 0) {
    let prefix = indices[0];
    for (let index = 1; index < indices.length; index++) {
      const symbol = indices[index];
      const key = `${prefix},${symbol}`;
      const existing = dictionary.get(key);
      if (existing !== undefined) {
        prefix = existing;
        continue;
      }
      writeCode(prefix);
      const next = extendGifDictionary(key, dictionary, nextCode, codeSize, writeCode, clearCode, resetDictionary);
      nextCode = next.nextCode;
      codeSize = next.codeSize;
      prefix = symbol;
    }
    writeCode(prefix);
    writeCode(endCode);
  }
  if (bitCount > 0) output.push(bitBuffer & 0xff);
  return Uint8Array.from(output);
}

function extendGifDictionary(
  key: string,
  dictionary: Map<string, number>,
  nextCode: number,
  codeSize: number,
  writeCode: (code: number) => void,
  clearCode: number,
  resetDictionary: () => void,
): { nextCode: number; codeSize: number } {
  if (nextCode >= 4096) {
    writeCode(clearCode);
    resetDictionary();
    return { nextCode: 258, codeSize: 9 };
  }
  const updatedCode = nextCode + 1;
  dictionary.set(key, nextCode);
  const shouldGrow = nextCode === (1 << codeSize) && codeSize < 12;
  return { nextCode: updatedCode, codeSize: shouldGrow ? codeSize + 1 : codeSize };
}

function splitGifSubBlocks(data: Uint8Array): Uint8Array[] {
  const blocks: Uint8Array[] = [];
  for (let offset = 0; offset < data.length; offset += 255) {
    const chunk = data.subarray(offset, Math.min(data.length, offset + 255));
    blocks.push(new Uint8Array([chunk.length]), chunk);
  }
  blocks.push(new Uint8Array([0]));
  return blocks;
}

function littleEndian16(value: number): Uint8Array {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff]);
}

function asciiBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
