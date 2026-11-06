import { loadOpenImageIO } from '@nvts/shared-core/libraries/openimageio';

export interface DecodedSharedImage {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
}

const READABLE_EXTENSIONS = new Set(['jpg', 'jpeg', 'tif', 'tiff', 'bmp', 'tga', 'ppm']);
const OIIO_EXTENSION_ALIASES: Readonly<Record<string, string>> = { jpeg: 'jpg', tiff: 'tif' };
let openImageIOPromise: ReturnType<typeof loadOpenImageIO> | undefined;

export function isOpenImageIOFallbackSupported(fileName: string): boolean {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? '';
  return READABLE_EXTENSIONS.has(extension);
}

export async function decodeImageWithSharedCore(file: File): Promise<DecodedSharedImage | null> {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!READABLE_EXTENSIONS.has(extension)) return null;

  openImageIOPromise ??= loadOpenImageIO();
  const runtime = await openImageIOPromise;
  const decoded = runtime.readImage(new Uint8Array(await file.arrayBuffer()), OIIO_EXTENSION_ALIASES[extension] ?? extension);
  return {
    width: decoded.width,
    height: decoded.height,
    pixels: convertFloatPixelsToRgba8(decoded.pixels, decoded.width, decoded.height, decoded.channels),
  };
}

function convertFloatPixelsToRgba8(
  pixels: Float32Array,
  width: number,
  height: number,
  channels: number,
): Uint8Array {
  if (width < 1 || height < 1 || ![1, 2, 3, 4].includes(channels) || pixels.length !== width * height * channels) {
    throw new Error('OpenImageIO returned an unsupported image layout.');
  }
  const output = new Uint8Array(width * height * 4);
  for (let source = 0, target = 0; source < pixels.length; source += channels, target += 4) {
    const red = pixels[source];
    const green = channels >= 3 ? pixels[source + 1] : red;
    const blue = channels >= 3 ? pixels[source + 2] : red;
    const alpha = channels === 2 ? pixels[source + 1] : channels === 4 ? pixels[source + 3] : 1;
    output[target] = toByte(red);
    output[target + 1] = toByte(green);
    output[target + 2] = toByte(blue);
    output[target + 3] = toByte(alpha);
  }
  return output;
}

function toByte(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.min(1, Math.max(0, value)) * 255);
}
