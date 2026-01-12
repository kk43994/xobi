import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// 左侧栏状态
type LeftNavState = 'expanded' | 'collapsed' | 'hidden';

// 面板ID
type PanelId = 'agent' | 'assets' | 'jobs';

// 面板状态
interface PanelState {
  open: boolean;
  pinned: boolean; // pinned = Dock模式, unpinned = Drawer模式
  width: number;
}

interface PortalUiState {
  // === 左侧导航 ===
  leftNavState: LeftNavState;
  leftNavWidth: number; // expanded状态下的宽度（可拖拽调整）
  setLeftNavState: (state: LeftNavState) => void;
  setLeftNavWidth: (width: number) => void;
  toggleLeftNav: () => void; // 循环切换: expanded -> collapsed -> hidden -> expanded

  // === 右侧面板系统 ===
  panels: Record<PanelId, PanelState>;
  openPanel: (id: PanelId) => void;
  closePanel: (id: PanelId) => void;
  togglePanel: (id: PanelId) => void;
  pinPanel: (id: PanelId) => void;
  unpinPanel: (id: PanelId) => void;
  togglePinPanel: (id: PanelId) => void;
  setPanelWidth: (id: PanelId, width: number) => void;
  closeAllPanels: () => void;

  // === 主题 ===
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
  toggleTheme: () => void;

  // === 兼容旧API (保持向后兼容) ===
  agentOpen: boolean;
  assetsOpen: boolean;
  jobsOpen: boolean;
  openAgent: () => void;
  closeAgent: () => void;
  openAssets: () => void;
  closeAssets: () => void;
  openJobs: () => void;
  closeJobs: () => void;
  closeAll: () => void;
}

const DEFAULT_PANEL_STATE: PanelState = {
  open: false,
  pinned: false,
  width: 420,
};

const DEFAULT_PANELS: Record<PanelId, PanelState> = {
  agent: { ...DEFAULT_PANEL_STATE, width: 480 },
  assets: { ...DEFAULT_PANEL_STATE, width: 420 },
  jobs: { ...DEFAULT_PANEL_STATE, width: 420 },
};

export const usePortalUiStore = create<PortalUiState>()(
  persist(
    (set, get) => ({
      // === 左侧导航 ===
      leftNavState: 'collapsed' as LeftNavState,
      leftNavWidth: 240,

      setLeftNavState: (state) => set({ leftNavState: state }),
      setLeftNavWidth: (width) => set({ leftNavWidth: Math.max(180, Math.min(360, width)) }),
      toggleLeftNav: () => {
        const current = get().leftNavState;
        const next: LeftNavState =
          current === 'expanded' ? 'collapsed' : current === 'collapsed' ? 'hidden' : 'expanded';
        set({ leftNavState: next });
      },

      // === 右侧面板系统 ===
      panels: DEFAULT_PANELS,

      openPanel: (id) =>
        set((state) => ({
          panels: {
            ...state.panels,
            [id]: { ...state.panels[id], open: true },
          },
        })),

      closePanel: (id) =>
        set((state) => ({
          panels: {
            ...state.panels,
            [id]: { ...state.panels[id], open: false },
          },
        })),

      togglePanel: (id) =>
        set((state) => ({
          panels: {
            ...state.panels,
            [id]: { ...state.panels[id], open: !state.panels[id].open },
          },
        })),

      pinPanel: (id) =>
        set((state) => ({
          panels: {
            ...state.panels,
            [id]: { ...state.panels[id], pinned: true },
          },
        })),

      unpinPanel: (id) =>
        set((state) => ({
          panels: {
            ...state.panels,
            [id]: { ...state.panels[id], pinned: false },
          },
        })),

      togglePinPanel: (id) =>
        set((state) => ({
          panels: {
            ...state.panels,
            [id]: { ...state.panels[id], pinned: !state.panels[id].pinned },
          },
        })),

      setPanelWidth: (id, width) =>
        set((state) => ({
          panels: {
            ...state.panels,
            [id]: { ...state.panels[id], width: Math.max(320, Math.min(800, width)) },
          },
        })),

      closeAllPanels: () =>
        set({
          panels: {
            agent: { ...get().panels.agent, open: false },
            assets: { ...get().panels.assets, open: false },
            jobs: { ...get().panels.jobs, open: false },
          },
        }),

      // === 主题 ===
      theme: 'dark' as 'light' | 'dark',
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),

      // === 兼容旧API ===
      get agentOpen() {
        return get().panels.agent.open;
      },
      get assetsOpen() {
        return get().panels.assets.open;
      },
      get jobsOpen() {
        return get().panels.jobs.open;
      },
      openAgent: () => get().openPanel('agent'),
      closeAgent: () => get().closePanel('agent'),
      openAssets: () => get().openPanel('assets'),
      closeAssets: () => get().closePanel('assets'),
      openJobs: () => get().openPanel('jobs'),
      closeJobs: () => get().closePanel('jobs'),
      closeAll: () => get().closeAllPanels(),
    }),
    {
      name: 'xobi-portal-ui',
      partialize: (state) => ({
        leftNavState: state.leftNavState,
        leftNavWidth: state.leftNavWidth,
        panels: state.panels,
        theme: state.theme,
      }),
    }
  )
);
