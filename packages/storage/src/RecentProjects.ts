import type { DocumentState } from '@nvts/document-model';

const DB_NAME = 'nvts-photomania-local';
const DB_VERSION = 1;
const STORE_NAME = 'recent-projects';
const MAX_RECENT = 24;

export interface RecentProjectInfo {
  id: string;
  name: string;
  width: number;
  height: number;
  updatedAt: number;
}

interface RecentProjectRecord extends RecentProjectInfo {
  data: ArrayBuffer;
}

function openRecentDb(): Promise<IDBDatabase> {
  if (!('indexedDB' in globalThis)) return Promise.reject(new Error('IndexedDB no está disponible en este navegador.'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('No se pudo abrir el almacenamiento local.'));
    request.onblocked = () => reject(new Error('El almacenamiento local está bloqueado por otra pestaña.'));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Falló una operación de almacenamiento local.'));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('Se canceló la operación de almacenamiento local.'));
    tx.onerror = () => reject(tx.error ?? new Error('Falló la operación de almacenamiento local.'));
  });
}

/** Guarda una instantánea completa del proyecto para recuperarlo desde Proyectos recientes. */
export async function rememberRecentProject(doc: Pick<DocumentState, 'id' | 'name' | 'width' | 'height'>, bytes: Uint8Array): Promise<void> {
  const db = await openRecentDb();
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const done = transactionDone(tx);
    const store = tx.objectStore(STORE_NAME);
    const record: RecentProjectRecord = {
      id: doc.id,
      name: doc.name,
      width: doc.width,
      height: doc.height,
      updatedAt: Date.now(),
      data: bytes.slice().buffer,
    };
    const request = store.getAll();
    request.onsuccess = () => {
      const previous = (request.result as RecentProjectRecord[]).filter((item) => item.id !== record.id);
      const ordered = [record, ...previous].sort((a, b) => b.updatedAt - a.updatedAt);
      store.put(record);
      for (const old of ordered.slice(MAX_RECENT)) store.delete(old.id);
    };
    await done;
  } finally {
    db.close();
  }
}

/** Devuelve únicamente metadatos, sin traer los datos pesados de los proyectos a memoria. */
export async function listRecentProjects(): Promise<RecentProjectInfo[]> {
  const db = await openRecentDb();
  try {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const done = transactionDone(tx);
    const all = await requestResult(tx.objectStore(STORE_NAME).getAll()) as RecentProjectRecord[];
    await done;
    return all
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 12)
      .map(({ id, name, width, height, updatedAt }) => ({ id, name, width, height, updatedAt }));
  } finally {
    db.close();
  }
}

/** Recupera los bytes del proyecto local; null si ya no está en el almacenamiento. */
export async function loadRecentProject(id: string): Promise<Uint8Array | null> {
  const db = await openRecentDb();
  try {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const done = transactionDone(tx);
    const record = await requestResult(tx.objectStore(STORE_NAME).get(id)) as RecentProjectRecord | undefined;
    await done;
    return record ? new Uint8Array(record.data) : null;
  } finally {
    db.close();
  }
}
