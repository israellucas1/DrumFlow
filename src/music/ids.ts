let counter = 0;

/** Gera um id único e estável para eventos e exercícios. */
export function createId(prefix = 'id'): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === 'function') return `${prefix}_${c.randomUUID()}`;
  counter = (counter + 1) % 1e9;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
