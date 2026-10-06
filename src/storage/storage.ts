/** Acesso seguro ao localStorage, com fallback em memória (modo privado, bloqueio etc.). */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class MemoryStore implements KeyValueStore {
  private map = new Map<string, string>();
  getItem(key: string) {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
}

export function getDefaultStore(): KeyValueStore {
  try {
    const ls = globalThis.localStorage;
    const probe = '__drumflow_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    return new MemoryStore();
  }
}

export function readJson(store: KeyValueStore, key: string): { ok: true; value: unknown } | { ok: false; raw: string | null } {
  let raw: string | null = null;
  try {
    raw = store.getItem(key);
    if (raw === null) return { ok: false, raw: null };
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false, raw };
  }
}

export function writeJson(store: KeyValueStore, key: string, value: unknown): boolean {
  try {
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
