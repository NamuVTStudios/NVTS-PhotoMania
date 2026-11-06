import { loadOpenColorIO } from '@nvts/shared-core/libraries/opencolorio';

export interface ColorTransformOptions {
  readonly width: number;
  readonly height: number;
  readonly inputColorSpace: string;
  readonly outputColorSpace: string;
}

let openColorIOPromise: ReturnType<typeof loadOpenColorIO> | undefined;

/** Converts RGBA8 pixels through the verified Shared Core OpenColorIO runtime. */
export async function transformPixelsColorSpace(
  pixels: Uint8Array | Uint8ClampedArray,
  options: ColorTransformOptions,
): Promise<Uint8ClampedArray> {
  validateTransformInput(pixels, options);
  openColorIOPromise ??= loadOpenColorIO();
  const ocio = await openColorIOPromise;
  const output = new Uint8ClampedArray(pixels.length);
  const rowsPerChunk = Math.max(1, Math.floor(1_048_576 / options.width));
  for (let top = 0; top < options.height; top += rowsPerChunk) {
    const chunkHeight = Math.min(rowsPerChunk, options.height - top);
    const start = top * options.width * 4;
    const end = start + chunkHeight * options.width * 4;
    const normalized = normalizePixels(pixels, start, end);
    const transformed = ocio.transformRGBA(normalized, { ...options, height: chunkHeight });
    writeTransformedPixels(transformed, output, start);
  }
  return output;
}

function validateTransformInput(pixels: Uint8Array | Uint8ClampedArray, options: ColorTransformOptions): void {
  if (!Number.isInteger(options.width) || options.width < 1 || !Number.isInteger(options.height) || options.height < 1) {
    throw new RangeError('Color transform dimensions must be positive integers.');
  }
  if (pixels.length !== options.width * options.height * 4) {
    throw new RangeError('Color transform expects one RGBA pixel buffer matching the supplied dimensions.');
  }
  if (!options.inputColorSpace.trim() || !options.outputColorSpace.trim()) {
    throw new TypeError('Color transform spaces must be non-empty.');
  }
}

function normalizePixels(pixels: Uint8Array | Uint8ClampedArray, start: number, end: number): Float32Array {
  const normalized = new Float32Array(end - start);
  for (let index = start; index < end; index += 1) normalized[index - start] = pixels[index] / 255;
  return normalized;
}

function writeTransformedPixels(transformed: Float32Array, output: Uint8ClampedArray, start: number): void {
  for (let index = 0; index < transformed.length; index += 1) {
    output[start + index] = Math.round(Math.min(1, Math.max(0, transformed[index])) * 255);
  }
}
