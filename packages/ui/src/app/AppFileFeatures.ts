// History actions and document file operations.
import { AppSamplingFeatures } from './AppSamplingFeatures';
import { DocumentController, type LayerNode } from '@nvts/document-model';
import { readPreferences } from '../panels/PreferencesPanel';
import { documentFormats, openFromDisk, saveToDisk, rememberRecentProject, supportsFileSystemAccess } from '@nvts/storage';
import type { Tool } from './AppBase';
import { documentNameFromFile } from './AppUtilities';

export class AppFileFeatures extends AppSamplingFeatures {
  protected doUndo(): void {
      if (this.stroke) return;
      this.handleHistoryResult(this.ctl.undo());
      this.updateHistoryUI();
    }

  protected doRedo(): void {
      if (this.stroke) return;
      this.handleHistoryResult(this.ctl.redo());
      this.updateHistoryUI();
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
      if (this.stroke) return;
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
      if (this.stroke) return;
      try { await this.openDocument(); }
      catch (error) { this.fail(error); }
    }

  protected async openDocument(): Promise<void> {
      const result = await openFromDisk((bytes, fileName) => documentFormats.findReader(bytes, fileName).decode(bytes));
      if (!result) return;
      this.fileHandle = result.handle;
      this.applyOpenedFileName(result);
      this.setDocument(this.documentLifecycle.fromUnpacked(this.engine.module, result));
      await this.refreshLinkedFileLayers(false);
      if (readPreferences().rememberRecentProjects) {
        const doc = this.ctl.doc;
        const bytes = documentFormats.findWriter('.nvtsphoto').encode(doc, (layer) => this.ctl.readPixels(layer));
        await rememberRecentProject(doc, bytes).catch((error) => console.warn('No se pudo actualizar Proyectos recientes:', error));
      }
    }

  protected applyOpenedFileName(result: Awaited<ReturnType<typeof openFromDisk>> & {}): void {
      if (result.fileName) result.doc.name = documentNameFromFile(result.fileName);
    }

  protected commitPointerUpAction(e: PointerEvent | undefined, tool: Tool | null): void {
      if (e && (tool === 'brush' || tool === 'eraser' || tool === 'smudge' || tool === 'liquify')) {
        this.onPointerMove(e, true);
        return;
      }
      if (e && this.shapeStart && tool === 'gradient') { this.commitGradient(this.shapeStart, this.toDoc(e)); return; }
      if (e && this.shapeStart && (tool === 'line' || tool === 'rectangle' || tool === 'ellipse')) {
        this.commitShape(this.shapeStart, this.toDoc(e), tool);
      }
    }

  protected fail(e: unknown): void {
      console.error(e);
      alert(e instanceof Error ? e.message : String(e));
    }

  protected q<T extends HTMLElement = HTMLElement>(sel: string): T {
      return this.root.querySelector<T>(sel)!;
    }
}
