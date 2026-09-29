// Key-value storage for progress, saves and blueprints: files in the desktop app (so Steam Cloud can sync them),
// localStorage in the browser. Every call is safe when storage is unavailable (private mode, quota).
import { desktop } from './desktop';

export const kv = {
  get(key: string): string | null {
    try {
      const d = desktop();
      return d ? d.store.get(key) : localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      const d = desktop();
      if (d) d.store.set(key, value);
      else localStorage.setItem(key, value);
    } catch {
      /* quota or private mode: ignore */
    }
  },
  remove(key: string) {
    try {
      const d = desktop();
      if (d) d.store.remove(key);
      else localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};
