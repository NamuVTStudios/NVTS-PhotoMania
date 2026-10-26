"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isPixelLayerType = exports.NVTS_VERSION = exports.NVTS_FORMAT = void 0;
// nvtsphoto.ts — Manifiesto de proyecto nativo NVTS PhotoMania.
// Las nuevas propiedades son opcionales para mantener compatibilidad con .nvtsphoto 0.1.x anteriores.
exports.NVTS_FORMAT = 'nvtsphoto';
exports.NVTS_VERSION = '0.1.0';
const isPixelLayerType = (type) => type === 'paint' || type === 'raster' || type === 'fill' || type === 'file' || type === 'vector' || type === 'text';
exports.isPixelLayerType = isPixelLayerType;
