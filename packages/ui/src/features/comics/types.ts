// Domain types shared by the comic project manager, panel and application coordinator.

export interface ComicPageEntry {
  id: string;
  number: number;
  name: string;
  fileName: string;
  width: number;
  height: number;
  notes: string;
}

export interface ComicConfig {
  format: 'nvts-comic-config';
  version: 1;
  projectName: string;
  projectDirectoryName: string;
  projectLocation: string;
  pagesDirectoryName: string;
  exportDirectoryName: string;
  title: string;
  author: string;
  readingDirection: 'ltr' | 'rtl';
  pageWidth: number;
  pageHeight: number;
  dpi: number;
  bleedMm: number;
  marginMm: number;
  gutterMm: number;
  facingPages: boolean;
  pages: ComicPageEntry[];
  updatedAt: number;
}

