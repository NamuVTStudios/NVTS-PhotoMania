// Comic project workflow and page management.
import { AppWorkspaceFeatures } from './AppWorkspaceFeatures';
import { renderComicManagerPanel } from '../panels/ComicManagerPanel';
import type { ComicPageEntry } from '../features/comics/types';
import { unpackNvtsPhoto } from '@nvts/storage';
import { COMIC_CONFIG_STORAGE_KEY, safeComicFolderName, safeComicFileName, defaultComicConfig, normalizeComicConfig, readComicConfig, storeComicProjectDirectoryHandle, readStoredComicProjectDirectoryHandle, copyBytesToArrayBuffer, writeFileHandleBytes, isNotFoundError, documentNameFromFile, DirectoryPickerWindow } from './AppUtilities';

export abstract class AppComicFeatures extends AppWorkspaceFeatures {
  protected readComicFields(): void {
      const get = (id: string) => this.root.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`);
      const projectName = get('comic-project-name') as HTMLInputElement | null;
      const title = get('comic-title') as HTMLInputElement | null;
      const author = get('comic-author') as HTMLInputElement | null;
      const direction = get('comic-direction') as HTMLSelectElement | null;
      const width = get('comic-page-width') as HTMLInputElement | null;
      const height = get('comic-page-height') as HTMLInputElement | null;
      const dpi = get('comic-dpi') as HTMLInputElement | null;
      const bleed = get('comic-bleed') as HTMLInputElement | null;
      const margin = get('comic-margin') as HTMLInputElement | null;
      const gutter = get('comic-gutter') as HTMLInputElement | null;
      const facing = this.root.querySelector<HTMLInputElement>('#comic-facing-pages');
      const bounded = (value: string | undefined, fallback: number, min: number, max: number) => {
        const number = Number(value);
        return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
      };
      this.comicConfig.projectName = (projectName?.value.trim() || 'Mi cómic').slice(0, 160);
      if (!this.comicProjectDirectoryHandle && this.comicParentDirectoryHandle) {
        this.comicConfig.projectLocation = `${this.comicParentDirectoryHandle.name}/${safeComicFolderName(this.comicConfig.projectName, 'Mi cómic')}`;
      }
      this.comicConfig.title = (title?.value.trim() || 'Mi cómic').slice(0, 160);
      this.comicConfig.author = (author?.value ?? '').slice(0, 160);
      this.comicConfig.readingDirection = direction?.value === 'rtl' ? 'rtl' : 'ltr';
      this.comicConfig.pageWidth = Math.round(bounded(width?.value, this.comicConfig.pageWidth, 1, 8192));
      this.comicConfig.pageHeight = Math.round(bounded(height?.value, this.comicConfig.pageHeight, 1, 8192));
      this.comicConfig.dpi = Math.round(bounded(dpi?.value, this.comicConfig.dpi, 72, 1200));
      this.comicConfig.bleedMm = bounded(bleed?.value, this.comicConfig.bleedMm, 0, 100);
      this.comicConfig.marginMm = bounded(margin?.value, this.comicConfig.marginMm, 0, 500);
      this.comicConfig.gutterMm = bounded(gutter?.value, this.comicConfig.gutterMm, 0, 500);
      this.comicConfig.facingPages = facing?.checked ?? this.comicConfig.facingPages;
      this.comicConfig.updatedAt = Date.now();
    }

  protected persistComicConfig(message = 'Configuración guardada en este navegador.'): void {
      this.comicConfig.updatedAt = Date.now();
      this.persistComicConfigLocally(message);
      this.queueComicConfigDiskWrite();
    }

  protected persistComicConfigLocally(message: string): void {
      try {
        localStorage.setItem(COMIC_CONFIG_STORAGE_KEY, JSON.stringify(this.comicConfig));
        this.setComicConfigStatus(message);
      } catch (error) {
        this.setComicConfigStatus('No se pudo guardar localmente');
        console.warn('No se pudo guardar la configuración de cómic:', error);
      }
    }

  protected queueComicConfigDiskWrite(): void {
      if (!this.comicProjectDirectoryHandle) return;
      const snapshot = JSON.stringify({ ...this.comicConfig, format: 'nvts-comic-config', version: 1 }, null, 2);
      this.comicConfigWriteChain = this.comicConfigWriteChain
        .then(() => this.writeQueuedComicConfig(snapshot))
        .catch((error: unknown) => this.reportComicConfigWriteFailure(error));
    }

  protected async writeQueuedComicConfig(snapshot: string): Promise<void> {
      const written = await this.writeComicConfigSnapshot(snapshot, false, false);
      if (written) return;
      this.setComicConfigStatus('Cambios guardados localmente; falta permiso para actualizar comicConfig.json en disco.');
    }

  protected reportComicConfigWriteFailure(error: unknown): void {
      const message = error instanceof Error
        ? `Error guardando comicConfig.json: ${error.message}`
        : 'Error guardando comicConfig.json';
      this.setComicConfigStatus(message);
      console.warn('No se pudo actualizar comicConfig.json en disco:', error);
    }

  protected setComicConfigStatus(message: string): void {
      const status = this.root.querySelector<HTMLElement>('#comic-config-status');
      if (status) status.textContent = message;
    }

  protected async writeComicConfigSnapshot(snapshot: string, requestPermission: boolean, updateStatus: boolean): Promise<boolean> {
      const root = this.comicProjectDirectoryHandle;
      if (!root) return false;
      let permission = await root.queryPermission({ mode: 'readwrite' });
      if (permission !== 'granted' && requestPermission) permission = await root.requestPermission({ mode: 'readwrite' });
      if (permission !== 'granted') {
        this.reportComicConfigPermissionRequired(updateStatus);
        return false;
      }
      const configFile = await root.getFileHandle('comicConfig.json', { create: true });
      await writeFileHandleBytes(configFile, new Blob([snapshot], { type: 'application/json;charset=utf-8' }));
      this.reportComicConfigSaved(root, updateStatus);
      return true;
    }

  protected reportComicConfigPermissionRequired(updateStatus: boolean): void {
      if (!updateStatus) return;
      const status = this.root.querySelector<HTMLElement>('#comic-config-status');
      if (status) status.textContent = 'Se requiere volver a autorizar la carpeta del proyecto.';
    }

  protected reportComicConfigSaved(root: FileSystemDirectoryHandle, updateStatus: boolean): void {
      if (!updateStatus) return;
      const status = this.root.querySelector<HTMLElement>('#comic-config-status');
      if (status) status.textContent = `Guardado: ${root.name}/comicConfig.json`;
    }

  protected async writeComicConfigToProject(requestPermission = false): Promise<boolean> {
      await this.comicConfigWriteChain;
      const snapshot = JSON.stringify({ ...this.comicConfig, format: 'nvts-comic-config', version: 1 }, null, 2);
      const written = await this.writeComicConfigSnapshot(snapshot, requestPermission, true);
      if (written) await this.rememberComicProjectHandle();
      return written;
    }

  protected async rememberComicProjectHandle(): Promise<void> {
      try { await storeComicProjectDirectoryHandle(this.comicProjectDirectoryHandle!); }
      catch (error) { console.warn('No se pudo recordar el proyecto de cómic:', error); }
    }

  protected async activateComicProjectDirectory(root: FileSystemDirectoryHandle, loadFromDisk: boolean, requestPermission: boolean): Promise<void> {
      let permission = await root.queryPermission({ mode: 'readwrite' });
      if (permission !== 'granted' && requestPermission) permission = await root.requestPermission({ mode: 'readwrite' });
      if (permission !== 'granted') throw new Error('El navegador no concedió permiso de lectura y escritura para la carpeta elegida.');
      this.comicProjectDirectoryHandle = root;
      if (loadFromDisk) await this.loadComicConfigFromDirectory(root);
      this.comicConfig.projectDirectoryName = root.name;
      if (!this.comicConfig.projectName.trim()) this.comicConfig.projectName = root.name;
      if (!this.comicConfig.projectLocation) this.comicConfig.projectLocation = root.name;
      this.comicPagesDirectoryHandle = await root.getDirectoryHandle(this.comicConfig.pagesDirectoryName || 'páginas', { create: true });
      this.comicExportDirectoryHandle = await root.getDirectoryHandle(this.comicConfig.exportDirectoryName || 'exportación', { create: true });
      await storeComicProjectDirectoryHandle(root).catch((error) => console.warn('No se pudo recordar la carpeta del proyecto:', error));
      this.renderComicManager();
      this.persistComicConfig(`Proyecto vinculado: ${root.name}`);
      await this.writeComicConfigToProject(false);
    }

  protected async loadComicConfigFromDirectory(root: FileSystemDirectoryHandle): Promise<void> {
      try {
        const configHandle = await root.getFileHandle('comicConfig.json');
        const configFile = await configHandle.getFile();
        this.comicConfig = normalizeComicConfig(JSON.parse(await configFile.text()) as unknown);
        this.comicActivePageId = this.comicConfig.pages[0]?.id ?? null;
      } catch (error) {
        this.ignoreMissingComicConfig(error);
      }
    }

  protected ignoreMissingComicConfig(error: unknown): void {
      if (!isNotFoundError(error)) throw error;
    }

  protected async restoreComicProjectDirectory(): Promise<void> {
      try { await this.restoreStoredComicProjectDirectory(); }
      catch (error) { console.warn('No se pudo reconectar el directorio del proyecto de cómic:', error); }
    }

  protected async restoreStoredComicProjectDirectory(): Promise<void> {
      const root = await readStoredComicProjectDirectoryHandle();
      if (!root) return;
      this.comicProjectDirectoryHandle = root;
      const permission = await root.queryPermission({ mode: 'readwrite' });
      if (permission === 'granted') {
        await this.activateComicProjectDirectory(root, true, false);
        return;
      }
      this.showComicProjectPermissionPending(root);
    }

  protected showComicProjectPermissionPending(root: FileSystemDirectoryHandle): void {
      const location = this.root.querySelector<HTMLInputElement>('#comic-project-location');
      if (location) location.value = `Proyecto recordado: ${root.name} (permiso pendiente)`;
      const status = this.root.querySelector<HTMLElement>('#comic-config-status');
      if (status) status.textContent = 'Carpeta recordada. Usá “Vincular proyecto existente…” para volver a autorizarla.';
    }

  protected async chooseComicParentDirectory(): Promise<void> {
      const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
      if (!picker) throw new Error('Este navegador no permite elegir carpetas. Usá una versión reciente de Chrome o Edge en localhost o HTTPS.');
      this.comicParentDirectoryHandle = await picker.call(window, { mode: 'readwrite' });
      this.readComicFields();
      const folderName = safeComicFolderName(this.comicConfig.projectName, 'Mi cómic');
      this.comicConfig.projectLocation = `${this.comicParentDirectoryHandle.name}/${folderName}`;
      this.renderComicManager();
      const status = this.root.querySelector<HTMLElement>('#comic-config-status');
      if (status) status.textContent = `Ubicación elegida: ${this.comicParentDirectoryHandle.name}. Creá la estructura para continuar.`;
    }

  protected async createComicProjectStructure(): Promise<void> {
      this.readComicFields();
      const parent = await this.getComicParentDirectory();
      const projectFolderName = safeComicFolderName(this.comicConfig.projectName, 'Mi cómic');
      const root = await this.resolveNewComicProjectRoot(parent, projectFolderName);
      if (!root) return;
      await this.initializeNewComicProject(parent, root, projectFolderName);
    }

  protected async getComicParentDirectory(): Promise<FileSystemDirectoryHandle> {
      const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
      if (!picker) throw new Error('Este navegador no permite crear carpetas desde la aplicación. Usá Chrome o Edge actualizado en localhost o HTTPS.');
      if (!this.comicParentDirectoryHandle) {
        this.comicParentDirectoryHandle = await picker.call(window, { mode: 'readwrite' });
      }
      return this.comicParentDirectoryHandle;
    }

  protected async resolveNewComicProjectRoot(
      parent: FileSystemDirectoryHandle,
      projectFolderName: string,
    ): Promise<FileSystemDirectoryHandle | null> {
      let root: FileSystemDirectoryHandle;
      try {
        root = await parent.getDirectoryHandle(projectFolderName);
      } catch (error) {
        return this.createMissingComicProjectRoot(parent, projectFolderName, error);
      }
      if (!await this.comicProjectHasConfig(root)) return root;
      const shouldOpen = confirm(`Ya existe el proyecto “${projectFolderName}” con comicConfig.json. ¿Querés abrir ese proyecto y cargar su configuración?`);
      if (!shouldOpen) return null;
      await this.activateComicProjectDirectory(root, true, true);
      return null;
    }

  protected createMissingComicProjectRoot(
      parent: FileSystemDirectoryHandle,
      projectFolderName: string,
      error: unknown,
    ): Promise<FileSystemDirectoryHandle> {
      if (!isNotFoundError(error)) throw error;
      return parent.getDirectoryHandle(projectFolderName, { create: true });
    }

  protected async comicProjectHasConfig(root: FileSystemDirectoryHandle): Promise<boolean> {
      try {
        await root.getFileHandle('comicConfig.json');
        return true;
      } catch (error) {
        return this.configMissingOrThrow(error);
      }
    }

  protected configMissingOrThrow(error: unknown): false {
      if (isNotFoundError(error)) return false;
      throw error;
    }

  protected async initializeNewComicProject(
      parent: FileSystemDirectoryHandle,
      root: FileSystemDirectoryHandle,
      projectFolderName: string,
    ): Promise<void> {
      this.applyNewComicProjectConfig(parent, projectFolderName, root);
      await this.createComicProjectDirectories(root);
      await storeComicProjectDirectoryHandle(root).catch((error) => console.warn('No se pudo recordar el proyecto de cómic:', error));
      this.renderComicManager();
      this.persistComicConfig(`Estructura creada: ${parent.name}/${projectFolderName}`);
      const written = await this.writeComicConfigToProject(true);
      this.showComicProjectCreationStatus(projectFolderName, written);
    }

  protected applyNewComicProjectConfig(
      parent: FileSystemDirectoryHandle,
      projectFolderName: string,
      root: FileSystemDirectoryHandle,
    ): void {
      this.comicConfig.projectName = projectFolderName;
      this.comicConfig.projectDirectoryName = projectFolderName;
      this.comicConfig.projectLocation = `${parent.name}/${projectFolderName}`;
      this.comicConfig.pagesDirectoryName = 'páginas';
      this.comicConfig.exportDirectoryName = 'exportación';
      this.comicProjectDirectoryHandle = root;
    }

  protected async createComicProjectDirectories(root: FileSystemDirectoryHandle): Promise<void> {
      this.comicPagesDirectoryHandle = await root.getDirectoryHandle(this.comicConfig.pagesDirectoryName, { create: true });
      this.comicExportDirectoryHandle = await root.getDirectoryHandle(this.comicConfig.exportDirectoryName, { create: true });
    }

  protected showComicProjectCreationStatus(projectFolderName: string, written: boolean): void {
      const status = this.root.querySelector<HTMLElement>('#comic-config-status');
      if (!status) return;
      status.textContent = written
        ? `Proyecto creado: ${projectFolderName} · comicConfig.json, páginas/ y exportación/ listos.`
        : 'Se crearon las carpetas, pero no se pudo escribir comicConfig.json. Volvé a vincular el proyecto.';
    }

  protected async linkExistingComicProject(): Promise<void> {
      const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
      if (!picker) throw new Error('Este navegador no permite elegir carpetas. Usá una versión reciente de Chrome o Edge.');
      const root = await picker.call(window, { mode: 'readwrite' });
      await this.activateComicProjectDirectory(root, true, true);
    }

  protected async exportComicProjectCopy(): Promise<void> {
      const root = this.requireComicProjectDirectory();
      this.readComicFields();
      this.persistComicConfig('Preparando copia de exportación…');
      await this.ensureComicConfigWritten();
      const exportDirectory = await this.getComicExportDirectory(root);
      await this.writeComicExportConfig(exportDirectory);
      const exportPages = await exportDirectory.getDirectoryHandle(this.comicConfig.pagesDirectoryName || 'páginas', { create: true });
      const counts = await this.copyComicPagesToExport(exportPages);
      this.showComicExportStatus(root.name, counts.copied, counts.missing);
    }

  protected requireComicProjectDirectory(): FileSystemDirectoryHandle {
      if (!this.comicProjectDirectoryHandle) {
        throw new Error('Primero elegí una carpeta base y creá la estructura del proyecto.');
      }
      return this.comicProjectDirectoryHandle;
    }

  protected async ensureComicConfigWritten(): Promise<void> {
      const written = await this.writeComicConfigToProject(true);
      if (!written) {
        throw new Error('No se pudo escribir comicConfig.json. Volvé a vincular la carpeta del proyecto e intentá nuevamente.');
      }
    }

  protected async getComicExportDirectory(root: FileSystemDirectoryHandle): Promise<FileSystemDirectoryHandle> {
      if (!this.comicPagesDirectoryHandle) {
        this.comicPagesDirectoryHandle = await root.getDirectoryHandle(this.comicConfig.pagesDirectoryName || 'páginas', { create: true });
      }
      if (this.comicExportDirectoryHandle) return this.comicExportDirectoryHandle;
      this.comicExportDirectoryHandle = await root.getDirectoryHandle(this.comicConfig.exportDirectoryName || 'exportación', { create: true });
      return this.comicExportDirectoryHandle;
    }

  protected async writeComicExportConfig(exportDirectory: FileSystemDirectoryHandle): Promise<void> {
      const snapshot = JSON.stringify({ ...this.comicConfig, format: 'nvts-comic-config', version: 1 }, null, 2);
      const configFile = await exportDirectory.getFileHandle('comicConfig.json', { create: true });
      await writeFileHandleBytes(configFile, new Blob([snapshot], { type: 'application/json;charset=utf-8' }));
    }

  protected async copyComicPagesToExport(
      exportPages: FileSystemDirectoryHandle,
    ): Promise<{ copied: number; missing: number }> {
      let copied = 0;
      let missing = 0;
      const sourceDirectory = this.comicPagesDirectoryHandle;
      if (!sourceDirectory) return { copied, missing };
      for (const page of this.comicConfig.pages) {
        const result = await this.copyComicPageToExport(sourceDirectory, exportPages, page);
        copied += Number(result === 'copied');
        missing += Number(result === 'missing');
      }
      return { copied, missing };
    }

  protected async copyComicPageToExport(
      sourceDirectory: FileSystemDirectoryHandle,
      exportDirectory: FileSystemDirectoryHandle,
      page: ComicPageEntry,
    ): Promise<'copied' | 'missing'> {
      const fileName = safeComicFileName(page.fileName, `comic-page-${String(page.number).padStart(3, '0')}.nvtsphoto`);
      try {
        const sourceHandle = await sourceDirectory.getFileHandle(fileName);
        const sourceFile = await sourceHandle.getFile();
        return this.copyNonEmptyComicPage(sourceFile, exportDirectory, fileName);
      } catch (error) {
        return this.missingComicPageOrThrow(error);
      }
    }

  protected async copyNonEmptyComicPage(
      sourceFile: File,
      exportDirectory: FileSystemDirectoryHandle,
      fileName: string,
    ): Promise<'copied' | 'missing'> {
      if (!sourceFile.size) return 'missing';
      const targetHandle = await exportDirectory.getFileHandle(fileName, { create: true });
      await writeFileHandleBytes(targetHandle, sourceFile);
      return 'copied';
    }

  protected missingComicPageOrThrow(error: unknown): 'missing' {
      if (isNotFoundError(error)) return 'missing';
      throw error;
    }

  protected showComicExportStatus(projectName: string, copied: number, missing: number): void {
      const status = this.root.querySelector<HTMLElement>('#comic-config-status');
      if (!status) return;
      status.textContent = `Copia exportada a ${projectName}/exportación: comicConfig.json y ${copied} página(s)${missing ? `; ${missing} sin guardar se omitieron` : ''}.`;
    }

  protected async prepareComicPageFile(page: ComicPageEntry): Promise<FileSystemFileHandle | null> {
      const directory = this.comicPagesDirectoryHandle;
      if (!directory) return null;
      const fileName = safeComicFileName(page.fileName, `comic-page-${String(page.number).padStart(3, '0')}.nvtsphoto`);
      const existingFile = await this.findExistingComicPage(directory, fileName);
      if (existingFile && existingFile.size && !this.confirmOverwriteComicPage(fileName)) return null;
      return directory.getFileHandle(fileName, { create: true });
    }

  protected async findExistingComicPage(directory: FileSystemDirectoryHandle, fileName: string): Promise<File | null> {
      try {
        const existing = await directory.getFileHandle(fileName);
        return await existing.getFile();
      } catch (error) {
        return this.ignoreMissingComicPage(error);
      }
    }

  protected ignoreMissingComicPage(error: unknown): null {
      if (isNotFoundError(error)) return null;
      throw error;
    }

  protected confirmOverwriteComicPage(fileName: string): boolean {
      return confirm(`Ya existe “${fileName}” en la carpeta de páginas. El próximo guardado lo sobrescribirá. ¿Continuar?`);
    }

  protected renderComicManager(): void {
      const config = this.comicConfig;
      const projectLocationDisplay = this.comicProjectDirectoryHandle
        ? (config.projectLocation || this.comicProjectDirectoryHandle.name)
        : this.comicParentDirectoryHandle
          ? `${this.comicParentDirectoryHandle.name}/${safeComicFolderName(config.projectName, 'Mi cómic')} (pendiente de crear)`
          : (config.projectLocation || 'Elegí una carpeta base para crear el proyecto');
      renderComicManagerPanel(this.root, config, this.comicActivePageId, projectLocationDisplay, {
        onSelectPage: (pageId) => { this.comicActivePageId = pageId; this.renderComicManager(); },
        onRenamePage: (page, nextName) => { if (!this.comicProjectManager.renamePage(page.id, nextName)) return; this.persistComicConfig(); this.renderComicManager(); },
      });
    }

  protected wireComicManager(): void {
      this.initializeComicManager();
      this.bindComicConfigInputs();
      this.bindComicPresetSelector();
      this.bindComicProjectActions();
      this.bindComicPageActions();
      this.bindComicConfigTransferActions();
    }

  protected initializeComicManager(): void {
      try {
        this.comicConfig = readComicConfig();
      } catch {
        this.comicConfig = defaultComicConfig();
      }
      this.comicActivePageId = this.comicConfig.pages[0]?.id ?? null;
      this.renderComicManager();
      void this.restoreComicProjectDirectory();
    }

  protected bindComicConfigInputs(): void {
      const inputIds = [
        'comic-project-name', 'comic-title', 'comic-author', 'comic-direction',
        'comic-page-width', 'comic-page-height', 'comic-dpi', 'comic-bleed',
        'comic-margin', 'comic-gutter', 'comic-facing-pages',
      ];
      inputIds.forEach((id) => {
        const input = this.root.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`);
        input?.addEventListener('change', () => this.handleComicConfigInputChange());
      });
    }

  protected handleComicConfigInputChange(): void {
      this.readComicFields();
      this.persistComicConfig();
      this.renderComicManager();
    }

  protected bindComicPresetSelector(): void {
      this.q<HTMLSelectElement>('#comic-preset').addEventListener('change', () => {
        const preset = this.q<HTMLSelectElement>('#comic-preset').value;
        const presets: Record<string, { width: number; height: number; direction?: 'ltr' | 'rtl'; facing?: boolean }> = {
          us: { width: 1650, height: 2550, direction: 'ltr', facing: true },
          european: { width: 2100, height: 2970, direction: 'ltr', facing: true },
          manga: { width: 1650, height: 2400, direction: 'rtl', facing: true },
          manhwa: { width: 1600, height: 2560, direction: 'ltr', facing: false },
        };
        const selected = presets[preset];
        if (!selected) return;
        this.comicConfig.pageWidth = selected.width;
        this.comicConfig.pageHeight = selected.height;
        if (selected.direction) this.comicConfig.readingDirection = selected.direction;
        if (selected.facing !== undefined) this.comicConfig.facingPages = selected.facing;
        this.renderComicManager();
        this.persistComicConfig('Formato actualizado y guardado localmente.');
      });
    }

  protected bindComicProjectActions(): void {
      this.bindComicAsyncAction('#comic-select-location', () => this.chooseComicParentDirectory());
      this.bindComicAsyncAction('#comic-create-project', () => this.createComicProjectStructure());
      this.bindComicAsyncAction('#comic-link-project', () => this.linkExistingComicProject());
      this.bindComicAsyncAction('#comic-export-project', () => this.exportComicProjectCopy());
    }

  protected bindComicAsyncAction(selector: string, action: () => Promise<unknown>): void {
      this.q<HTMLButtonElement>(selector).addEventListener('click', () => {
        void action().catch((error: unknown) => this.setComicManagerError(error));
      });
    }

  protected setComicManagerError(error: unknown): void {
      const status = this.q<HTMLElement>('#comic-config-status');
      status.textContent = error instanceof Error ? error.message : String(error);
    }

  protected bindComicPageActions(): void {
      this.bindAddComicPageAction();
      this.bindDuplicateComicPageAction();
      this.bindDeleteComicPageAction();
      this.bindComicPageOrderActions();
      this.bindComicPageCanvasActions();
      this.bindComicPageFileActions();
    }

  protected bindAddComicPageAction(): void {
      this.q<HTMLButtonElement>('#comic-add-page').addEventListener('click', () => this.addComicPage());
    }

  protected addComicPage(): void {
      this.readComicFields();
      this.comicProjectManager.addPage();
      this.persistComicConfig('Página añadida. Configuración guardada localmente.');
      this.renderComicManager();
    }

  protected bindDuplicateComicPageAction(): void {
      this.q<HTMLButtonElement>('#comic-duplicate-page').addEventListener('click', () => this.duplicateActiveComicPage());
    }

  protected duplicateActiveComicPage(): void {
      if (!this.comicProjectManager.duplicateActivePage()) return;
      this.persistComicConfig('Página duplicada.');
      this.renderComicManager();
    }

  protected bindDeleteComicPageAction(): void {
      this.q<HTMLButtonElement>('#comic-delete-page').addEventListener('click', () => this.deleteActiveComicPage());
    }

  protected deleteActiveComicPage(): void {
      const page = this.comicProjectManager.getActivePage();
      if (!page) return;
      const message = `¿Eliminar «${page.name}» de la configuración? No se borrará ningún archivo del disco.`;
      if (!confirm(message)) return;
      if (!this.comicProjectManager.deleteActivePage()) return;
      this.persistComicConfig('Página eliminada de la configuración.');
      this.renderComicManager();
    }

  protected bindComicPageOrderActions(): void {
      this.q<HTMLButtonElement>('#comic-page-up').addEventListener('click', () => this.moveActiveComicPage(-1));
      this.q<HTMLButtonElement>('#comic-page-down').addEventListener('click', () => this.moveActiveComicPage(1));
    }

  protected moveActiveComicPage(delta: number): void {
      if (!this.comicProjectManager.moveActivePage(delta)) return;
      this.persistComicConfig('Orden de páginas actualizado.');
      this.renderComicManager();
    }

  protected bindComicPageCanvasActions(): void {
      this.q<HTMLButtonElement>('#comic-create-canvas').addEventListener('click', () => {
        void this.createComicCanvasForActivePage().catch((error: unknown) => this.setComicManagerError(error));
      });
    }

  protected async createComicCanvasForActivePage(): Promise<void> {
      const page = this.getActiveComicPage();
      if (!page) return;
      const message = `Se reemplazará el documento abierto por un lienzo de ${page.width} × ${page.height} px para «${page.name}». Guardá primero el documento actual si querés conservarlo. ¿Continuar?`;
      if (!confirm(message)) return;
      this.readComicFields();
      const fileName = safeComicFileName(page.fileName, `comic-page-${String(page.number).padStart(3, '0')}.nvtsphoto`);
      const pageHandle = await this.prepareComicPageFile({ ...page, fileName });
      if (this.comicPagesDirectoryHandle && !pageHandle) return;
      this.installComicPageCanvas(page, fileName, pageHandle);
    }

  protected getActiveComicPage(): ComicPageEntry | undefined {
      return this.comicProjectManager.getActivePage();
    }

  protected installComicPageCanvas(page: ComicPageEntry, fileName: string, pageHandle: FileSystemFileHandle | null): void {
      const safeTitle = this.comicConfig.title.trim() || 'Cómic';
      this.newDocument(page.width, page.height, `${safeTitle} - ${page.name}`);
      this.fileHandle = pageHandle;
      page.fileName = fileName;
      page.width = this.ctl.doc.width;
      page.height = this.ctl.doc.height;
      const status = this.comicPagesDirectoryHandle
        ? `Lienzo creado para «${page.name}». Guardar escribirá directamente en páginas/${fileName}.`
        : `Lienzo creado para «${page.name}». Configurá una carpeta de proyecto para guardar páginas automáticamente.`;
      this.persistComicConfig(status);
      this.renderComicManager();
      this.applyWorkspace('comics', false);
    }

  protected bindComicPageFileActions(): void {
      const input = this.q<HTMLInputElement>('#comic-page-open-input');
      this.q<HTMLButtonElement>('#comic-page-open-file').addEventListener('click', () => input.click());
      input.addEventListener('change', () => this.handleComicPageFileSelection(input));
    }

  protected handleComicPageFileSelection(input: HTMLInputElement): void {
      const file = input.files?.[0];
      if (!file) return;
      const page = this.getActiveComicPage();
      if (!page) {
        input.value = '';
        return;
      }
      const message = `Abrir «${file.name}» como «${page.name}» reemplazará el documento actual. Guardá primero lo que necesites conservar. ¿Continuar?`;
      if (!confirm(message)) {
        input.value = '';
        return;
      }
      void this.loadComicPageFile(file, page).catch((error: unknown) => this.setComicManagerError(error)).finally(() => {
        input.value = '';
      });
    }

  protected async loadComicPageFile(file: File, page: ComicPageEntry): Promise<void> {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const unpacked = unpackNvtsPhoto(bytes);
      unpacked.doc.name = documentNameFromFile(file.name);
      this.fileHandle = null;
      this.setDocument(this.documentLifecycle.fromUnpacked(this.engine.module, unpacked));
      await this.refreshLinkedFileLayers(false);
      await this.saveComicPageCopyIfLinked(page, file, bytes);
      page.width = this.ctl.doc.width;
      page.height = this.ctl.doc.height;
      this.persistComicPageLoadStatus(page, file.name);
      this.renderComicManager();
      this.applyWorkspace('comics', false);
    }

  protected async saveComicPageCopyIfLinked(page: ComicPageEntry, file: File, bytes: Uint8Array): Promise<void> {
      page.fileName = safeComicFileName(
        this.comicPagesDirectoryHandle ? page.fileName : file.name,
        `comic-page-${String(page.number).padStart(3, '0')}.nvtsphoto`,
      );
      if (!this.comicPagesDirectoryHandle) return;
      const target = await this.comicPagesDirectoryHandle.getFileHandle(page.fileName, { create: true });
      await writeFileHandleBytes(target, copyBytesToArrayBuffer(bytes));
      this.fileHandle = target;
    }

  protected persistComicPageLoadStatus(page: ComicPageEntry, originalFileName: string): void {
      const message = this.comicPagesDirectoryHandle
        ? `Página «${page.name}» copiada a páginas/${page.fileName}. Guardar actualizará esa copia.`
        : `Página «${page.name}» cargada desde ${originalFileName}. Configurá una carpeta de proyecto para guardarla allí.`;
      this.persistComicConfig(message);
    }

  protected bindComicConfigTransferActions(): void {
      this.q<HTMLButtonElement>('#comic-config-export').addEventListener('click', () => {
        void this.exportComicConfig().catch((error: unknown) => this.setComicManagerError(error));
      });
      const input = this.q<HTMLInputElement>('#comic-config-file');
      this.q<HTMLButtonElement>('#comic-config-import').addEventListener('click', () => input.click());
      input.addEventListener('change', () => this.importComicConfigFile(input));
    }

  protected async exportComicConfig(): Promise<void> {
      this.readComicFields();
      this.persistComicConfig('Guardando comicConfig.json…');
      const written = this.comicProjectDirectoryHandle
        ? await this.writeComicConfigToProject(true)
        : false;
      if (!written) this.downloadComicConfig();
    }

  protected downloadComicConfig(): void {
      const data = JSON.stringify({ ...this.comicConfig, format: 'nvts-comic-config', version: 1 }, null, 2);
      const blob = new Blob([data], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'comicConfig.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.q<HTMLElement>('#comic-config-status').textContent = 'Descargando copia de comicConfig.json';
    }

  protected importComicConfigFile(input: HTMLInputElement): void {
      const file = input.files?.[0];
      if (!file) return;
      void file.text().then((raw) => this.applyImportedComicConfig(raw, file.name))
        .catch((error: unknown) => this.setComicManagerError(error))
        .finally(() => { input.value = ''; });
    }

  protected applyImportedComicConfig(raw: string, fileName: string): void {
      const parsed = normalizeComicConfig(JSON.parse(raw) as unknown);
      this.comicConfig = parsed;
      this.comicActivePageId = parsed.pages[0]?.id ?? null;
      this.renderComicManager();
      this.persistComicConfig(`Configuración importada desde ${fileName}.`);
    }
}
