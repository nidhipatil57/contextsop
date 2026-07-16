import { create } from "zustand";

interface LayoutState {
  sidebarExpanded: boolean;
  sidebarMobileOpen: boolean;
  activeWorkspace: string | null;
  navigationHistory: string[];
}

interface LayoutActions {
  toggleSidebar: () => void;
  setSidebarExpanded: (value: boolean) => void;
  toggleMobileDrawer: () => void;
  closeMobileDrawer: () => void;
  setActiveWorkspace: (workspace: string) => void;
  pushNavigationHistory: (path: string) => void;
}

export type LayoutStore = LayoutState & LayoutActions;

/**
 * Global layout state for the dashboard shell.
 * Controls desktop sidebar visibility, mobile navigation drawer state,
 * the active workspace section, and tracks recent navigation history.
 */
export const useLayoutStore = create<LayoutStore>((set) => ({
  // Initial state
  sidebarExpanded: true,
  sidebarMobileOpen: false,
  activeWorkspace: null,
  navigationHistory: [],

  // Actions
  toggleSidebar: () =>
    set((state) => ({ sidebarExpanded: !state.sidebarExpanded })),

  setSidebarExpanded: (value) => set({ sidebarExpanded: value }),

  toggleMobileDrawer: () =>
    set((state) => ({ sidebarMobileOpen: !state.sidebarMobileOpen })),

  closeMobileDrawer: () => set({ sidebarMobileOpen: false }),

  setActiveWorkspace: (workspace) => set({ activeWorkspace: workspace }),

  pushNavigationHistory: (path) =>
    set((state) => {
      const filtered = state.navigationHistory.filter((p) => p !== path);
      return {
        navigationHistory: [path, ...filtered].slice(0, 5),
      };
    }),
}));
