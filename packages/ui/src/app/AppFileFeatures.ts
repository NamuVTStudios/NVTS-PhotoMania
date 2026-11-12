// History actions and document file operations.
import { AppSamplingFeatures } from './AppSamplingFeatures';
import { DocumentController, type LayerNode } from '@nvts/document-model';
import { readPreferences } from '../panels/PreferencesPanel';
import { documentFormats, saveToDisk, rememberRecentProject, supportsFileSystemAccess } from '@nvts/storage';
import type { Tool } from './AppBase';
import { isPixelShapeTool } from '../tools/ToolsBase';
import { shouldUsePointerUpSample } from '../tools/TabletInput';
import { documentNameFromFile } from './AppUtilities';

export class AppFileFeatures extends AppSamplingFeatures {
  protected doUndo(): void {
      if (!this.prepareHistoryNavigation() || this.blockForUnappliedMaskChanges('deshacer')) return;
      this.handleHistoryResult(this.ctl.undo());
      this.updateHistoryUI();
    }

  protected doRedo(): void {
      if (!this.prepareHistoryNavigation() || this.blockForUnappliedMaskChanges('rehacer')) return;
      this.handleHistoryResult(this.ctl.redo());
      this.updateHistoryUI();
    }

  protected clearHistoryFromMenu(): void {
      if (!this.prepareHistoryNavigation() || this.blockForUnappliedMaskChanges('vaciar el historial')) return;
      this.ctl.clearHistory();
      this.updateHistoryUI();
      this.q<HTMLElement>('#status').textContent = 'Se eliminó el historial de deshacer. Esta acción no se puede deshacer.';
    }

  protected handleHistoryResult(kind: 'pixels' | 'structure' | null): void {
    if (kind === 'pixels') return this.renderFrame();
    if (kind === 'structure') this.refreshAfterStructuralHistory();
  }

  protected refreshAfterStructuralHistory(): void {
      if (!this.ctl.find(this.activeId)) this.activeId = this.topRaster()?.id ?? '';
      this.syncUI(); this.scheduleRefresh();
    }

  protected async save(asNew: boolean): Promise<void> {
      if (this.stroke || this.blockForUnappliedMaskChanges('guardar')) return;
      try { await this.saveDocument(asNew); }
      catch (error) { this.fail(error); }
    }

  protected async saveDocument(asNew: boolean): Promise<void> {
      const doc = this.ctl.doc;
      const read = (layer: LayerNode) => this.ctl.readPixels(layer);
      const encode = (document: DocumentController['doc'], readPixels: (layer: LayerNode) => Uint8Array | null) =>
        documentFormats.findWriter('.nvtsphoto').encode(document, readPixels);
      const handle = await saveToDisk(doc, read, asNew ? undefined : this.fileHandle ?? undefined, encode);
      if (supportsFileSystemAccess() && !handle) return;
      if (handle) this.fileHandle = handle;
      this.syncDocumentHeader();
      const bytes = encode(doc, read);
      if (readPreferences().rememberRecentProjects) await this.rememberSavedProject(doc, bytes);
      this.q<HTMLElement>('#status').textContent = `Guardado · ${doc.width}×${doc.height}`;
    }

  protected async rememberSavedProject(doc: DocumentController['doc'], bytes: Uint8Array): Promise<void> {
      await rememberRecentProject(doc, bytes).catch((error) => console.warn('El archivo se guardó, pero no se pudo actualizar Proyectos recientes:', error));
    }

  protected async open(): Promise<void> {
      if (this.stroke || this.blockForUnappliedMaskChanges('abrir otro documento')) return;
      try { await this.openDocument(); }
      catch (error) { this.fail(error); }
    }

  protected async openDocument(): Promise<void> {
      const selected = await this.pickDocumentFile();
      if (!selected) return;
      if (!/\.nvtsphoto$/i.test(selected.file.name)) {
        await this.openImageAsDocument(selected.file);
        return;
      }
      const bytes = new Uint8Array(await selected.file.arrayBuffer());
      const unpacked = documentFormats.findReader(bytes, selected.file.name).decode(bytes);
      this.fileHandle = selected.handle;
      const documentName = documentNameFromFile(selected.file.name);
      if (documentName) unpacked.doc.name = documentName;
      this.setDocument(this.documentLifecycle.fromUnpacked(this.engine.module, unpacked));
      await this.refreshLinkedFileLayers(false);
      await this.rememberOpenedProject();
    }

  protected async pickDocumentFile(): Promise<{ file: File; handle: FileSystemFileHandle | null } | null> {
      if (typeof window.showOpenFilePicker === 'function') {
        try {
          const [handle] = await window.showOpenFilePicker({
            multiple: false,
            types: [
              { description: 'Proyecto NVTS PhotoMania', accept: { 'application/x-nvtsphoto': ['.nvtsphoto'] } },
              { description: 'Imágenes', accept: {
                'image/png': ['.png'], 'image/jpeg': ['.jpg', '.jpeg'], 'image/gif': ['.gif'],
                'image/svg+xml': ['.svg'], 'image/webp': ['.webp'], 'image/bmp': ['.bmp'],
                'image/tiff': ['.tif', '.tiff'], 'application/octet-stream': ['.psd', '.ai', '.kra'],
              } },
            ],
          });
          return handle ? { file: await handle.getFile(), handle } : null;
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') return null;
          throw error;
        }
      }
      return new Promise((resolve) => {
        const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.nvtsphoto,image/*,.psd,.ai,.kra' });
        input.onchange = () => resolve(input.files?.[0] ? { file: input.files[0], handle: null } : null);
        input.addEventListener('cancel', () => resolve(null), { once: true });
        input.click();
      });
    }

  protected async openImageAsDocument(file: File): Promise<void> {
      const dimensions = await this.getImageFileDimensions(file);
      this.newDocument(dimensions.width, dimensions.height, documentNameFromFile(file.name) || 'Imagen importada');
      await this.importImage(file);
      this.q<HTMLElement>('#status').textContent = this.describeImportedImage(file, false);
      await this.rememberOpenedProject();
    }


  protected commitPointerUpAction(e: PointerEvent | undefined, tool: Tool | null): void {
      if (e && (tool === 'brush' || tool === 'eraser' || tool === 'smudge' || tool === 'liquify')) {
        if (shouldUsePointerUpSample(this.activeStrokePointerType ?? 'mouse')) this.onPointerMove(e, true);
        return;
      }
      if (e && this.shapeStart && tool === 'gradient') { this.commitGradient(this.shapeStart, this.toDoc(e)); return; }
      if (e && this.shapeStart && (tool === 'line' || tool === 'rectangle' || tool === 'ellipse')) {
        this.commitShape(this.shapeStart, this.toDoc(e), tool);
        return;
      }
      if (!e || !this.shapeStart || !isPixelShapeTool(tool)) return;
      if (tool === 'pixel-polyline') this.onPointerMove(e, true);
      this.commitShape(this.shapeStart, this.toDoc(e), tool, this.pixelShapePoints);
    }

  protected fail(e: unknown): void {
      console.error(e);
      alert(e instanceof Error ? e.message : String(e));
    }

  protected q<T extends HTMLElement = HTMLElement>(sel: string): T {
      return this.root.querySelector<T>(sel)!;
    }
}
