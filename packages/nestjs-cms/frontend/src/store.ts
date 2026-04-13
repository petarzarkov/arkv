import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CmsBlueprint } from './types.js';

type ColorScheme = 'light' | 'dark';

interface CmsStore {
  blueprint: CmsBlueprint | null;
  activeModel: string | null;
  view: 'list' | 'create' | 'edit';
  editRow: Record<string, unknown> | null;
  colorScheme: ColorScheme;

  setBlueprint: (b: CmsBlueprint) => void;
  setActiveModel: (name: string) => void;
  openCreate: () => void;
  openEdit: (row: Record<string, unknown>) => void;
  goBack: () => void;
  toggleColorScheme: () => void;
}

export const useCmsStore = create<CmsStore>()(
  persist(
    (set) => ({
      blueprint: null,
      activeModel: null,
      view: 'list',
      editRow: null,
      colorScheme: 'dark',

      setBlueprint: (blueprint) =>
        set({
          blueprint,
          activeModel: Object.keys(blueprint.models)[0] ?? null,
        }),

      setActiveModel: (activeModel) =>
        set({ activeModel, view: 'list', editRow: null }),

      openCreate: () => set({ view: 'create', editRow: null }),
      openEdit: (row) => set({ view: 'edit', editRow: row }),
      goBack: () => set({ view: 'list', editRow: null }),

      toggleColorScheme: () =>
        set((s) => ({
          colorScheme: s.colorScheme === 'dark' ? 'light' : 'dark',
        })),
    }),
    {
      name: 'cms-ui-prefs',
      partialize: (s) => ({ colorScheme: s.colorScheme }),
    },
  ),
);
