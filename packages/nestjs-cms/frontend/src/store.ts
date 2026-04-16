import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CmsBlueprint } from './types.js';

type ColorScheme = 'light' | 'dark';

interface ModelPrefs {
  hiddenColumns?: string[];
  take?: number;
  sortBy?: string | null;
  sortDir?: 'asc' | 'desc';
  search?: string;
}

interface CmsStore {
  blueprint: CmsBlueprint | null;
  activeModel: string | null;
  view: 'list' | 'create' | 'edit';
  editRow: Record<string, unknown> | null;
  colorScheme: ColorScheme;
  authenticated: boolean;
  modelPrefs: Record<string, ModelPrefs>;
  sidebarOpen: boolean;
  user: Record<string, unknown> | null;

  setBlueprint: (b: CmsBlueprint) => void;
  setActiveModel: (name: string) => void;
  setAuthenticated: (v: boolean) => void;
  openCreate: () => void;
  openEdit: (row: Record<string, unknown>) => void;
  goBack: () => void;
  toggleColorScheme: () => void;
  setModelPrefs: (model: string, prefs: Partial<ModelPrefs>) => void;
  toggleSidebar: () => void;
  setUser: (user: Record<string, unknown> | null) => void;
}

export const useCmsStore = create<CmsStore>()(
  persist(
    (set) => ({
      blueprint: null,
      activeModel: null,
      view: 'list',
      editRow: null,
      colorScheme: 'dark',
      authenticated: false,
      modelPrefs: {},
      sidebarOpen: true,
      user: null,

      setBlueprint: (blueprint) =>
        set({
          blueprint,
          activeModel: Object.keys(blueprint.models)[0] ?? null,
        }),

      setActiveModel: (activeModel) =>
        set({ activeModel, view: 'list', editRow: null }),

      setAuthenticated: (authenticated) => set({ authenticated }),

      openCreate: () => set({ view: 'create', editRow: null }),
      openEdit: (row) => set({ view: 'edit', editRow: row }),
      goBack: () => set({ view: 'list', editRow: null }),

      toggleColorScheme: () =>
        set((s) => ({
          colorScheme: s.colorScheme === 'dark' ? 'light' : 'dark',
        })),

      setModelPrefs: (model, prefs) =>
        set((s) => ({
          modelPrefs: {
            ...s.modelPrefs,
            [model]: { ...s.modelPrefs[model], ...prefs },
          },
        })),

      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

      setUser: (user) => set({ user }),
    }),
    {
      name: 'cms-ui-prefs',
      partialize: (s) => ({
        colorScheme: s.colorScheme,
        modelPrefs: s.modelPrefs,
        sidebarOpen: s.sidebarOpen,
      }),
    },
  ),
);
