import { useSyncExternalStore } from 'react';

// 跨页面共享“当前选中构件”
let selectedId: string | null = null;
const listeners = new Set<() => void>();

export const selectionStore = {
  get: () => selectedId,
  set(id: string | null) {
    selectedId = id;
    try {
      if (id) sessionStorage.setItem('caihua-selected-member', id);
    } catch {
      /* ignore */
    }
    listeners.forEach((l) => l());
  },
  init() {
    try {
      selectedId = sessionStorage.getItem('caihua-selected-member');
    } catch {
      /* ignore */
    }
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

selectionStore.init();

export function useSelectedMemberId(): [string | null, (id: string | null) => void] {
  const id = useSyncExternalStore(selectionStore.subscribe, selectionStore.get);
  return [id, (v) => selectionStore.set(v)];
}
