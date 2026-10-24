/**
 * Pure logic for the researcher-guidance dismiss state (layer 1 of the three
 * explanation layers). Storage is injected so the rules are testable without a
 * DOM; `guidanceStore.ts` binds it to `localStorage`.
 */

export const GUIDANCE_KEY_PREFIX = 'storysphere:guidance-dismissed:';

/** Minimal slice of `Storage` the model needs. */
export interface GuidanceStorage {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function guidanceKey(surface: string): string {
  return `${GUIDANCE_KEY_PREFIX}${surface}`;
}

/** Every dismissed-guidance key currently in storage (any value). */
export function listDismissedKeys(storage: GuidanceStorage): string[] {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const k = storage.key(i);
    if (k !== null && k.startsWith(GUIDANCE_KEY_PREFIX)) keys.push(k);
  }
  return keys;
}

export function countDismissed(storage: GuidanceStorage): number {
  return listDismissedKeys(storage).length;
}

export function isSurfaceDismissed(storage: GuidanceStorage, surface: string): boolean {
  return storage.getItem(guidanceKey(surface)) === '1';
}

export function dismissSurface(storage: GuidanceStorage, surface: string): void {
  storage.setItem(guidanceKey(surface), '1');
}

export function reopenSurface(storage: GuidanceStorage, surface: string): void {
  storage.removeItem(guidanceKey(surface));
}

/** Delete every dismissed-guidance key; returns how many were removed. */
export function resetAllDismissed(storage: GuidanceStorage): number {
  const keys = listDismissedKeys(storage);
  keys.forEach((k) => storage.removeItem(k));
  return keys.length;
}

/**
 * Which of the currently-mounted surfaces are dismissed — the ones the book
 * title bar's reopen button should bring back. Order follows `mounted`.
 */
export function dismissedAmong(
  mounted: readonly string[],
  isDismissed: (surface: string) => boolean,
): string[] {
  return mounted.filter(isDismissed);
}
