// Panel template. Event behavior lives in its panel renderer/controller.

export const HISTORY_PANEL_TEMPLATE = `
    <section class="dock-panel history-panel"><header><span>⌄</span><strong>Historial</strong><span id="history-count" class="count">0</span><div class="panel-spacer"></div></header><div id="history-list" class="history-list"></div></section>
`;


export interface HistoryPanelEntry { label: string }

/** Render the document action stack inside the history panel. Newest action appears first. */
export function renderHistoryPanel(
  list: HTMLElement,
  count: HTMLElement,
  entries: readonly HistoryPanelEntry[],
): void {
  list.replaceChildren();
  count.textContent = String(entries.length);
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
