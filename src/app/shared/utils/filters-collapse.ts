import { signal, type WritableSignal } from '@angular/core';

const MOBILE_MQ = '(max-width: 959px)';

function isMobileViewport(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(MOBILE_MQ).matches;
}

function storageKey(key: string): string {
  return `guy-filters-collapsed:${key}`;
}

/** En mobile arranca colapsado; recuerda la preferencia en sessionStorage. */
export function createFiltersCollapsed(key: string): {
  collapsed: WritableSignal<boolean>;
  toggleFilters: () => void;
} {
  const read = (): boolean => {
    if (typeof window === 'undefined') return false;
    try {
      const stored = sessionStorage.getItem(storageKey(key));
      if (stored === '1') return true;
      if (stored === '0') return false;
    } catch {
      // ignore
    }
    return isMobileViewport();
  };

  const collapsed = signal(read());

  const toggleFilters = () => {
    collapsed.update((v) => {
      const next = !v;
      try {
        sessionStorage.setItem(storageKey(key), next ? '1' : '0');
      } catch {
        // ignore
      }
      return next;
    });
  };

  return { collapsed, toggleFilters };
}
