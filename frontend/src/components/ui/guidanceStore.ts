import { useSyncExternalStore } from 'react';

import {
  countDismissed,
  dismissedAmong,
  dismissSurface,
  GUIDANCE_KEY_PREFIX,
  isSurfaceDismissed,
  reopenSurface,
  resetAllDismissed,
  type GuidanceStorage,
} from './guidanceModel';

/**
 * Module-level store for guidance dismissal. A context would add a provider
 * for no gain: the state is `localStorage` plus a tiny in-memory fallback, and
 * every reader (ribbon, book title bar, settings panel) just subscribes.
 *
 * The title bar sits above the page in the tree and the ribbon sits inside it,
 * so the bar learns which surface is on screen through `registerSurface`
 * (ribbon mount) rather than through props.
 */

const listeners = new Set<() => void>();
const mounted = new Map<string, number>(); // surface -> live ribbon count
// Safari private mode reports zero quota: setItem throws. Keep the dismissal
// for this session so the click still does what it says.
const memoryDismissed = new Set<string>();
let storageEventBound = false;

function emit() {
  listeners.forEach((l) => l());
}

function getStorage(): GuidanceStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function storedDismissed(surface: string): boolean {
  const s = getStorage();
  if (!s) return false;
  try {
    return isSurfaceDismissed(s, surface);
  } catch {
    return false;
  }
}

function isDismissed(surface: string): boolean {
  return memoryDismissed.has(surface) || storedDismissed(surface);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!storageEventBound && typeof window !== 'undefined') {
    storageEventBound = true;
    // Another tab dismissed / reset: keep this tab's bar and panel in step.
    window.addEventListener('storage', (e) => {
      if (e.key === null || e.key.startsWith(GUIDANCE_KEY_PREFIX)) emit();
    });
  }
  return () => {
    listeners.delete(listener);
  };
}

export function dismissGuidance(surface: string) {
  const s = getStorage();
  try {
    if (!s) throw new Error('no storage');
    dismissSurface(s, surface);
  } catch {
    memoryDismissed.add(surface);
  }
  emit();
}

export function reopenGuidance(surfaces: readonly string[]) {
  const s = getStorage();
  surfaces.forEach((surface) => {
    memoryDismissed.delete(surface);
    try {
      if (s) reopenSurface(s, surface);
    } catch {
      /* ignore */
    }
  });
  emit();
}

export function resetAllGuidance() {
  memoryDismissed.clear();
  const s = getStorage();
  try {
    if (s) resetAllDismissed(s);
  } catch {
    /* ignore */
  }
  emit();
}

/** A ribbon registers while mounted (shown or dismissed) — see the title bar. */
export function registerSurface(surface: string): () => void {
  mounted.set(surface, (mounted.get(surface) ?? 0) + 1);
  emit();
  return () => {
    const n = (mounted.get(surface) ?? 1) - 1;
    if (n <= 0) mounted.delete(surface);
    else mounted.set(surface, n);
    emit();
  };
}

export function useGuidanceDismissed(surface: string): boolean {
  return useSyncExternalStore(subscribe, () => isDismissed(surface), () => false);
}

/** Dismissed surfaces among those currently on screen (joined: stable snapshot). */
export function useReopenableSurfaces(): string[] {
  const joined = useSyncExternalStore(
    subscribe,
    () => dismissedAmong([...mounted.keys()], isDismissed).join(','),
    () => '',
  );
  return joined ? joined.split(',') : [];
}

/** Dismissed keys in storage, plus session-only ones storage refused to keep. */
export function useDismissedCount(): number {
  return useSyncExternalStore(
    subscribe,
    () => {
      const s = getStorage();
      let stored = 0;
      try {
        stored = s ? countDismissed(s) : 0;
      } catch {
        stored = 0;
      }
      const sessionOnly = [...memoryDismissed].filter((x) => !storedDismissed(x)).length;
      return stored + sessionOnly;
    },
    () => 0,
  );
}
