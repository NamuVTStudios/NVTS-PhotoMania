const PLUGINS_STORAGE_KEY = 'nvts-photomania-plugins-v1';

export interface StoredPlugin {
  id: string;
  name: string;
  fileName: string;
  source: string;
  installedAt: number;
}

function normalizeStoredPlugins(value: unknown): StoredPlugin[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is StoredPlugin => !!item && typeof item === 'object'
    && typeof (item as StoredPlugin).id === 'string' && typeof (item as StoredPlugin).name === 'string'
    && typeof (item as StoredPlugin).fileName === 'string' && typeof (item as StoredPlugin).source === 'string');
}

/** Reads and normalizes the persisted plugin entries, ignoring corrupt storage. */
export function readStoredPlugins(): StoredPlugin[] {
  let value: unknown;
  try { value = JSON.parse(localStorage.getItem(PLUGINS_STORAGE_KEY) ?? '[]') as unknown; }
  catch { return []; }
  return normalizeStoredPlugins(value);
}

/** Writes plugin entries using the existing browser-local storage format. */
export function writeStoredPlugins(plugins: StoredPlugin[]): void {
  localStorage.setItem(PLUGINS_STORAGE_KEY, JSON.stringify(plugins));
}
