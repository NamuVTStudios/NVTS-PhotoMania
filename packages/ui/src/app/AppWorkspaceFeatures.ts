// Workspace selection and panel layout.
import { AppDocumentFeatures } from './AppDocumentFeatures';
import type { WorkspaceDefinition, WorkspaceId } from '../workspaces';
import type { WorkspacePanelElements } from './AppBase';

export abstract class AppWorkspaceFeatures extends AppDocumentFeatures {
  protected applyWorkspace(workspace: WorkspaceId, announce = true): void {
      const selectedWorkspace = this.resolveWorkspace(workspace);
      this.dockLayout?.saveCurrentWorkspace();
      this.workspace = selectedWorkspace;
      this.workspaceManager.setCurrent(selectedWorkspace);
      const panels = this.getWorkspacePanelElements();
      if (!panels) return;
      const preset = this.workspaceManager.getDefinition(selectedWorkspace);
      this.applyWorkspacePanelPreset(selectedWorkspace, preset, panels);
      this.dockLayout?.applyWorkspace(selectedWorkspace);
      this.refreshWorkspaceMenuChecks(selectedWorkspace);
      this.refreshPanelMenuChecks(panels);
      this.updateWorkspacePanelToggleState(panels);
      if (announce) this.announceWorkspace(selectedWorkspace);
    }

  protected resolveWorkspace(workspace: WorkspaceId): WorkspaceId {
      return this.workspaceManager.isWorkspaceId(workspace) ? workspace : 'general';
    }

  protected getWorkspacePanelElements(): WorkspacePanelElements | null {
      const panel = <T extends HTMLElement = HTMLElement>(selector: string): T | null => this.root.querySelector<T>(selector);
      const advanced = panel('.advanced-tool-panel');
      const history = panel('.history-panel');
      const layers = panel('.layers-panel');
      const comic = panel('.comic-manager-panel');
      const storyboard = panel('.storyboard-panel');
      const timeline = panel('.animation-timeline-panel');
      const dock = panel('.right-dock');
      if (!advanced || !history || !layers || !comic || !storyboard || !timeline || !dock) return null;
      return { advanced, history, layers, comic, storyboard, timeline, dock };
    }

  protected applyWorkspacePanelPreset(
      workspace: WorkspaceId,
      preset: WorkspaceDefinition,
      panels: WorkspacePanelElements,
    ): void {
      panels.advanced.hidden = !preset.visible.advanced;
      panels.history.hidden = !preset.visible.history;
      panels.layers.hidden = !preset.visible.layers;
      panels.comic.hidden = !preset.visible.comic;
      panels.storyboard.hidden = !preset.visible.storyboard;
      panels.timeline.hidden = !preset.visible.timeline;
      const panelById: Record<string, HTMLElement> = {
        advanced: panels.advanced, history: panels.history, layers: panels.layers,
        comic: panels.comic, storyboard: panels.storyboard, timeline: panels.timeline,
      };
      preset.order.forEach((id, index) => {
        const panel = panelById[id];
        if (!panel) return;
        const slot = panel.closest<HTMLElement>('.dock-panel-slot');
        if (slot) slot.style.order = String(index);
        else panel.style.order = String(index);
      });
      panels.dock.dataset.workspace = workspace;
      panels.dock.classList.remove('panels-hidden');
      const noVisiblePanels = !preset.visible.advanced && !preset.visible.history && !preset.visible.layers
        && !preset.visible.comic && !preset.visible.storyboard && !preset.visible.timeline;
      panels.dock.classList.toggle('panels-empty', noVisiblePanels);
    }

  protected refreshWorkspaceMenuChecks(workspace: WorkspaceId): void {
      this.root.querySelectorAll<HTMLButtonElement>('[data-workspace]').forEach((button) => {
        const selected = button.dataset.workspace === workspace;
        button.setAttribute('aria-checked', String(selected));
        const check = button.querySelector<HTMLElement>('.menu-check');
        if (check) check.textContent = selected ? '✓' : '';
      });
    }

  protected refreshPanelMenuChecks(panels: WorkspacePanelElements): void {
      const viewDropdown = this.root.querySelector<HTMLElement>('#view-menu-dropdown');
      const panelsDropdown = this.root.querySelector<HTMLElement>('#panels-menu-dropdown');
      if (!viewDropdown || !panelsDropdown) return;
      this.getWorkspacePanelMenuEntries(panels).forEach(([selector, panel]) => {
        const button = this.root.querySelector<HTMLButtonElement>(selector);
        if (!button) return;
        const visible = !panel.hidden;
        button.setAttribute('aria-checked', String(visible));
        const check = button.querySelector<HTMLElement>('.menu-check');
        if (check) check.textContent = visible ? '✓' : '';
      });
    }

  protected getWorkspacePanelMenuEntries(panels: WorkspacePanelElements): Array<[string, HTMLElement]> {
      return [
        ['#toggle-panel-advanced', panels.advanced],
        ['#toggle-panel-history', panels.history],
        ['#toggle-panel-layers', panels.layers],
        ['#toggle-panel-comic', panels.comic],
        ['#toggle-panel-storyboard', panels.storyboard],
        ['#toggle-panel-timeline', panels.timeline],
      ];
    }

  protected updateWorkspacePanelToggleState(panels: WorkspacePanelElements): void {
      const workspaceElement = this.root.querySelector<HTMLElement>('.workspace');
      const allPanelsVisible = !panels.dock.classList.contains('panels-hidden')
        && !workspaceElement?.classList.contains('panels-hidden');
      this.root.querySelector<HTMLButtonElement>('#toggle-panels')?.setAttribute('aria-pressed', String(allPanelsVisible));
      const panelsWithMenuEntries = this.getWorkspacePanelMenuEntries(panels);
      panels.dock.classList.toggle('panels-empty', panelsWithMenuEntries.every(([, panel]) => {
        return panel.hidden || !panel.closest('.dock-panel-slot');
      }));
    }

  protected announceWorkspace(workspace: WorkspaceId): void {
      const label = this.workspaceManager.getLabel(workspace) || 'General';
      const status = this.root.querySelector<HTMLElement>('#status');
      if (status) status.textContent = `Espacio de trabajo: ${label}`;
    }
}
