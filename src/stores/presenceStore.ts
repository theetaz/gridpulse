import { create } from 'zustand';

/**
 * Global count of other users currently connected to the realtime
 * WebSocket. Updated via `presence` events broadcast by the AreaRoom
 * Durable Object whenever a client joins or leaves.
 */
interface PresenceState {
  onlineCount: number;
  setOnlineCount: (n: number) => void;
}

export const usePresenceStore = create<PresenceState>((set) => ({
  onlineCount: 0,
  setOnlineCount: (n) => set({ onlineCount: n }),
}));
