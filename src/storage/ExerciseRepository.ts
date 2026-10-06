import type { Exercise } from '../music/types';
import { sanitizeExercise } from '../music/validation';
import { DEMO_EXERCISES } from '../data/exampleExercises';
import { getDefaultStore, readJson, writeJson, type KeyValueStore } from './storage';

/**
 * Contrato de persistência dos exercícios do usuário. A interface não conhece
 * localStorage — um backend remoto pode implementá-la no futuro.
 */
export interface ExerciseRepository {
  list(): Exercise[];
  get(id: string): Exercise | null;
  save(exercise: Exercise): Exercise;
  remove(id: string): void;
  /** Recoloca os exemplos ausentes/alterados sem tocar nos exercícios do usuário. Retorna quantos foram restaurados. */
  restoreDemos(): number;
}

const KEY = 'drumflow.exercises.v1';
const SYNCED_KEY = 'drumflow.synced.v1';

interface StoredPayload {
  version: 1;
  exercises: unknown[];
}

function cloneDemo(ex: Exercise): Exercise {
  const now = Date.now();
  return { ...ex, tempoSignature: { ...ex.tempoSignature }, events: ex.events.map((e) => ({ ...e })), createdAt: now, updatedAt: now };
}

export class LocalStorageExerciseRepository implements ExerciseRepository {
  private cache: Exercise[];
  /** true se os dados salvos estavam corrompidos (uma cópia foi preservada). */
  readonly recoveredFromCorruption: boolean;

  constructor(private readonly store: KeyValueStore = getDefaultStore()) {
    const res = readJson(store, KEY);
    if (!res.ok && res.raw === null) {
      // Primeira execução: semeia com os exemplos.
      this.cache = DEMO_EXERCISES.map(cloneDemo);
      this.recoveredFromCorruption = false;
      this.persist();
      return;
    }
    if (!res.ok || !res.value || typeof res.value !== 'object' || !Array.isArray((res.value as StoredPayload).exercises)) {
      // Dados ilegíveis: guarda uma cópia para recuperação manual e segue com lista vazia.
      const raw = res.ok ? JSON.stringify(res.value) : res.raw;
      if (raw !== null) {
        try {
          store.setItem(`${KEY}.corrupted.${Date.now()}`, raw);
        } catch {
          /* sem espaço — ignora */
        }
      }
      this.cache = [];
      this.recoveredFromCorruption = true;
      this.persist();
      return;
    }
    const seen = new Set<string>();
    this.cache = [];
    for (const raw of (res.value as StoredPayload).exercises) {
      const ex = sanitizeExercise(raw);
      if (!ex || seen.has(ex.id) || ex.origin === 'library') continue;
      seen.add(ex.id);
      this.cache.push(ex);
    }
    this.recoveredFromCorruption = false;
  }

  private persist() {
    const payload: StoredPayload = { version: 1, exercises: this.cache };
    writeJson(this.store, KEY, payload);
  }

  list(): Exercise[] {
    return [...this.cache];
  }

  get(id: string): Exercise | null {
    return this.cache.find((e) => e.id === id) ?? null;
  }

  save(exercise: Exercise): Exercise {
    const saved: Exercise = {
      ...exercise,
      origin: exercise.origin === 'library' ? 'user' : exercise.origin,
      name: exercise.name.trim() || 'Sem nome',
      updatedAt: Date.now(),
    };
    const idx = this.cache.findIndex((e) => e.id === saved.id);
    if (idx >= 0) this.cache[idx] = saved;
    else this.cache.unshift(saved);
    this.persist();
    return saved;
  }

  remove(id: string): void {
    this.cache = this.cache.filter((e) => e.id !== id);
    this.persist();
  }

  /** Este navegador já sincronizou com a pasta de arquivos alguma vez? */
  wasSynced(): boolean {
    try {
      return this.store.getItem(SYNCED_KEY) === '1';
    } catch {
      return false;
    }
  }

  markSynced(): void {
    try {
      this.store.setItem(SYNCED_KEY, '1');
    } catch {
      /* ignora */
    }
  }

  /** Substitui toda a lista (sincronização com o servidor). Retorna true se algo mudou. */
  replaceAll(exercises: Exercise[]): boolean {
    const next = [...exercises].sort((a, b) => b.updatedAt - a.updatedAt);
    if (JSON.stringify(next) === JSON.stringify(this.cache)) return false;
    this.cache = next;
    this.persist();
    return true;
  }

  restoreDemos(): number {
    let restored = 0;
    for (const demo of DEMO_EXERCISES) {
      const idx = this.cache.findIndex((e) => e.id === demo.id);
      if (idx >= 0) {
        this.cache[idx] = cloneDemo(demo);
      } else {
        this.cache.push(cloneDemo(demo));
      }
      restored++;
    }
    this.persist();
    return restored;
  }
}
