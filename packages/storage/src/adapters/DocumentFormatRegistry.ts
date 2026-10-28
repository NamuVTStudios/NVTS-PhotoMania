import type { DocumentFormatAdapter } from './DocumentFormatAdapter';

/** Resolves formats without making callers depend on a concrete serializer. */
export class DocumentFormatRegistry {
  constructor(private readonly adapters: readonly DocumentFormatAdapter[]) {}

  findReader(bytes: Uint8Array, fileName?: string): DocumentFormatAdapter {
    const adapter = this.adapters.find((candidate) => candidate.canRead(bytes, fileName));
    if (!adapter) throw new Error('No hay un adaptador compatible para este formato de archivo.');
    return adapter;
  }

  findWriter(extension: string): DocumentFormatAdapter {
    const normalized = extension.toLowerCase().startsWith('.') ? extension.toLowerCase() : `.${extension.toLowerCase()}`;
    const adapter = this.adapters.find((candidate) => candidate.extensions.includes(normalized));
    if (!adapter) throw new Error(`No hay un adaptador de escritura para ${normalized}.`);
    return adapter;
  }
}
