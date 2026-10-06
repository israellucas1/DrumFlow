/**
 * Histórico linear de desfazer/refazer baseado em snapshots imutáveis.
 * Cada alteração empilha o estado anterior; desfazer volta um passo; uma nova
 * alteração após desfazer descarta o "futuro" (comportamento padrão de editores).
 * Alterações contínuas (ex.: arrastar o controle de intensidade) podem ser
 * agrupadas com `coalesceKey` para virar um único passo.
 */
export interface History<T> {
  past: T[];
  present: T;
  future: T[];
  lastKey: string | null;
  lastTime: number;
}

export const HISTORY_LIMIT = 100;
const COALESCE_MS = 1200;

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [], lastKey: null, lastTime: 0 };
}

export function pushHistory<T>(
  h: History<T>,
  next: T,
  opts: { coalesceKey?: string; now?: number; limit?: number } = {},
): History<T> {
  if (next === h.present) return h;
  const now = opts.now ?? Date.now();
  const limit = opts.limit ?? HISTORY_LIMIT;
  if (opts.coalesceKey && opts.coalesceKey === h.lastKey && now - h.lastTime < COALESCE_MS && h.past.length > 0) {
    return { ...h, present: next, future: [], lastTime: now };
  }
  return {
    past: [...h.past, h.present].slice(-limit),
    present: next,
    future: [],
    lastKey: opts.coalesceKey ?? null,
    lastTime: now,
  };
}

/** Substitui o estado atual sem criar passo no histórico (ex.: após salvar). */
export function replacePresent<T>(h: History<T>, next: T): History<T> {
  return { ...h, present: next };
}

export function undo<T>(h: History<T>): History<T> {
  if (h.past.length === 0) return h;
  const previous = h.past[h.past.length - 1];
  return { past: h.past.slice(0, -1), present: previous, future: [h.present, ...h.future], lastKey: null, lastTime: 0 };
}

export function redo<T>(h: History<T>): History<T> {
  if (h.future.length === 0) return h;
  const [next, ...rest] = h.future;
  return { past: [...h.past, h.present], present: next, future: rest, lastKey: null, lastTime: 0 };
}

export const canUndo = <T,>(h: History<T>) => h.past.length > 0;
export const canRedo = <T,>(h: History<T>) => h.future.length > 0;
