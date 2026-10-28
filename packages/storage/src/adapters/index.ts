export * from './DocumentFormatAdapter';
export * from './DocumentFormatRegistry';
export * from './NvtsPhotoFormatAdapter';
import { DocumentFormatRegistry } from './DocumentFormatRegistry';
import { NvtsPhotoFormatAdapter } from './NvtsPhotoFormatAdapter';

export const documentFormats = new DocumentFormatRegistry([new NvtsPhotoFormatAdapter()]);
