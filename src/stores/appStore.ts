import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Tab = 'home' | 'map' | 'feed' | 'stats';

export interface ManualLocation {
  lat: number;
  lon: number;
  name: string; // e.g. "Kandy"
  displayName: string; // e.g. "Kandy, Central Province, Sri Lanka"
}

interface AppState {
  tab: Tab;
  setTab: (tab: Tab) => void;

  selectedOutageId: string | null;
  selectOutage: (id: string | null) => void;

  reportPageOpen: boolean;
  openReportSheet: () => void;
  closeReportSheet: () => void;

  // Map overlay toggles — persisted so user prefs stick across reloads
  showCeb: boolean;
  showCrowd: boolean;
  toggleCeb: () => void;
  toggleCrowd: () => void;

  // Manual location override — when set, all location-aware queries
  // use this instead of the browser's GPS position.
  manualLocation: ManualLocation | null;
  setManualLocation: (loc: ManualLocation | null) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      tab: 'home',
      setTab: (tab) => set({ tab }),

      selectedOutageId: null,
      selectOutage: (id) => set({ selectedOutageId: id }),

      reportPageOpen: false,
      openReportSheet: () => set({ reportPageOpen: true }),
      closeReportSheet: () => set({ reportPageOpen: false }),

      showCeb: true,
      showCrowd: true,
      toggleCeb: () => set((s) => ({ showCeb: !s.showCeb })),
      toggleCrowd: () => set((s) => ({ showCrowd: !s.showCrowd })),

      manualLocation: null,
      setManualLocation: (loc) => set({ manualLocation: loc }),
    }),
    {
      name: 'gridpulse.app',
      partialize: (state) => ({
        showCeb: state.showCeb,
        showCrowd: state.showCrowd,
        manualLocation: state.manualLocation,
      }),
    },
  ),
);
