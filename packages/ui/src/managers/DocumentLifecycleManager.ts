import { DocumentController } from '@nvts/document-model';
import type { NvtsEngineModule } from '@nvts/wasm-bindings';
import type { UnpackedDocument } from '@nvts/document-model';

/** Crea y reemplaza documentos; la interfaz y el renderer siguen siendo responsabilidad de App. */
export class DocumentLifecycleManager {
  createBlank(engine: NvtsEngineModule, width: number, height: number, name = 'Sin título'): DocumentController {
    const document = DocumentController.create(engine, width, height, name);
    try {
      const background = document.addRaster('Fondo');
      document.layerPixels(background)!.loadFromRGBA(new Uint8Array(width * height * 4).fill(255));
      document.addRaster('Capa 1');
      document.clearHistory();
      return document;
    } catch (error) {
      document.dispose();
      throw error;
    }
  }

  fromUnpacked(engine: NvtsEngineModule, unpacked: UnpackedDocument): DocumentController {
    return DocumentController.fromUnpacked(engine, unpacked);
  }

  replace(current: DocumentController | undefined, next: DocumentController): DocumentController {
    if (current && current !== next) current.dispose();
    return next;
  }
}
