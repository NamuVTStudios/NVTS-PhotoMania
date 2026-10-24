import type { ComicConfig, ComicPageEntry } from '../panels/ComicManagerPanel';

type ComicConfigProvider = () => ComicConfig;

/** Gestiona la selección y el orden de páginas; el guardado y la interfaz quedan fuera. */
export class ComicProjectManager {
  private selectedPageId: string | null;

  constructor(private readonly getConfig: ComicConfigProvider, initialPageId: string | null = null) {
    this.selectedPageId = initialPageId;
  }

  get activePageId(): string | null {
    return this.selectedPageId;
  }

  setActivePage(pageId: string | null): void {
    const pageExists = pageId !== null && this.getConfig().pages.some((page) => page.id === pageId);
    this.selectedPageId = pageExists ? pageId : null;
  }

  getActivePage(): ComicPageEntry | undefined {
    return this.getConfig().pages.find((page) => page.id === this.selectedPageId);
  }

  addPage(): ComicPageEntry {
    const config = this.getConfig();
    const number = config.pages.length + 1;
    const page: ComicPageEntry = {
      id: crypto.randomUUID(),
      number,
      name: `Página ${number}`,
      fileName: `comic-page-${String(number).padStart(3, '0')}.nvtsphoto`,
      width: config.pageWidth,
      height: config.pageHeight,
      notes: '',
    };
    config.pages.push(page);
    this.selectedPageId = page.id;
    return page;
  }

  duplicateActivePage(): ComicPageEntry | null {
    const config = this.getConfig();
    const selectedIndex = config.pages.findIndex((page) => page.id === this.selectedPageId);
    if (selectedIndex < 0) return null;

    const selected = config.pages[selectedIndex];
    const number = config.pages.length + 1;
    const copy: ComicPageEntry = {
      ...selected,
      id: crypto.randomUUID(),
      number,
      name: `${selected.name} (copia)`,
      fileName: `comic-page-${String(number).padStart(3, '0')}.nvtsphoto`,
    };
    config.pages.splice(selectedIndex + 1, 0, copy);
    this.selectedPageId = copy.id;
    this.renumberPages();
    return copy;
  }

  deleteActivePage(): boolean {
    const config = this.getConfig();
    const index = config.pages.findIndex((page) => page.id === this.selectedPageId);
    if (index < 0) return false;

    config.pages.splice(index, 1);
    this.renumberPages();
    this.selectedPageId = config.pages[Math.min(index, config.pages.length - 1)]?.id ?? null;
    return true;
  }

  moveActivePage(delta: number): boolean {
    const pages = this.getConfig().pages;
    const index = pages.findIndex((page) => page.id === this.selectedPageId);
    const nextIndex = index + delta;
    if (index < 0 || nextIndex < 0 || nextIndex >= pages.length) return false;

    [pages[index], pages[nextIndex]] = [pages[nextIndex], pages[index]];
    this.renumberPages();
    return true;
  }

  renamePage(pageId: string, nextName: string): boolean {
    const page = this.getConfig().pages.find((entry) => entry.id === pageId);
    if (!page || !nextName.trim()) return false;
    page.name = nextName.trim().slice(0, 160);
    return true;
  }

  private renumberPages(): void {
    this.getConfig().pages.forEach((page, index) => { page.number = index + 1; });
  }
}
