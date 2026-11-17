import { useCallback, useSyncExternalStore } from 'react';

// 05 §1：開發者檢視打開時可看第 1 層證據與原始 trace；原型預設打開。存在這個瀏覽器的 localStorage。
const KEY = 'storysphere:dev-view';
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** `[devView, setDevView]`，所有用到的元件同步更新。 */
export function useDevView(): [boolean, (on: boolean) => void] {
  const value = useSyncExternalStore(subscribe, read, () => true);
  const set = useCallback((on: boolean) => {
    try {
      localStorage.setItem(KEY, on ? 'on' : 'off');
    } catch {
      // 存不了就只在這次有效。
    }
    listeners.forEach((listener) => listener());
  }, []);
  return [value, set];
}
