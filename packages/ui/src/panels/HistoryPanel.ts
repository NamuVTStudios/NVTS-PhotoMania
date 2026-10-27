// Panel template. Event behavior lives in its panel renderer/controller.

export const HISTORY_PANEL_TEMPLATE = `
    <section class="dock-panel history-panel"><header><span>⌄</span><strong>Historial</strong><span id="history-memory" class="history-memory" title="Memoria aproximada del historial">0 B</span><span id="history-count" class="count">0</span><div class="panel-spacer"></div></header><div id="history-list" class="history-list"></div></section>
`;


export interface HistoryPanelEntry { label: string }

/** Render the document action stack inside the history panel. Newest action appears first. */
export function renderHistoryPanel(
  list: HTMLElement,
  count: HTMLElement,
  entries: readonly HistoryPanelEntry[],
  memoryBytes = 0,
): void {
  list.replaceChildren();
  count.textContent = String(entries.length);
  updateHistoryMemoryIndicator(list.closest('.history-panel') ?? list, memoryBytes);
  if (!entries.length) {
    const empty = document.createElement('div');
    empty.className = 'history-empty';
    empty.textContent = 'Sin acciones todavía';
    list.append(empty);
    return;
  }
  entries.forEach((entry, index) => {
    const row = document.createElement('div');
    row.className = 'history-entry' + (index === 0 ? ' current' : '');
    const marker = document.createElement('span'); marker.textContent = '▢';
    const label = document.createElement('span'); label.textContent = entry.label;
    const number = document.createElement('small'); number.textContent = String(entries.length - index).padStart(2, '0');
    row.append(marker, label, number); row.title = entry.label; list.append(row);
  });
}

export function updateHistoryMemoryIndicator(root: ParentNode, bytes: number): void {
  const memory = root.querySelector<HTMLElement>('#history-memory');
  if (memory) memory.textContent = formatHistoryMemory(bytes);
}

function formatHistoryMemory(bytes: number): string {
  const safeBytes = Math.max(0, Number.isFinite(bytes) ? bytes : 0);
  if (safeBytes < 1024) return `${Math.round(safeBytes)} B`;
  if (safeBytes < 1024 * 1024) return `${(safeBytes / 1024).toFixed(0)} KiB`;
  return `${(safeBytes / (1024 * 1024)).toFixed(1)} MiB`;
}
