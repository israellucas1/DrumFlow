import type { Exercise } from '../music/types';
import { sanitizeExercise } from '../music/validation';
import { DEMO_EXERCISES } from '../data/exampleExercises';
import type { ExerciseRepository, LocalStorageExerciseRepository } from './ExerciseRepository';

// ───────────── Cliente da API de arquivos ─────────────

export interface RemoteListing {
  initialized: boolean;
  directory: string;
  exercises: unknown[];
}

export interface RemoteStore {
  list(): Promise<RemoteListing>;
  put(ex: Exercise): Promise<void>;
  remove(id: string): Promise<void>;
}

/** Servidor sem a API (ex.: site estático) — usar só o navegador. */
export class RemoteUnavailableError extends Error {}

export class HttpRemoteStore implements RemoteStore {
  constructor(private readonly base = '/api/exercicios') {}

  async list(): Promise<RemoteListing> {
    const r = await fetch(this.base, { cache: 'no-store' });
    const type = r.headers.get('content-type') ?? '';
    if (r.status === 404 || !type.includes('json')) throw new RemoteUnavailableError('API de arquivos ausente');
    if (!r.ok) throw new Error(`Servidor respondeu ${r.status}`);
    return (await r.json()) as RemoteListing;
  }

  async put(ex: Exercise): Promise<void> {
    const r = await fetch(`${this.base}/${encodeURIComponent(ex.id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ex),
    });
    if (!r.ok) throw new Error(`Falha ao salvar (${r.status})`);
  }

  async remove(id: string): Promise<void> {
    const r = await fetch(`${this.base}/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!r.ok) throw new Error(`Falha ao excluir (${r.status})`);
  }
}

// ───────────── Repositório sincronizado ─────────────

export type SyncMode = 'connecting' | 'server' | 'offline' | 'local';

export interface SyncStatus {
  mode: SyncMode;
  /** Pasta onde os arquivos ficam (informada pelo servidor). */
  directory: string | null;
  /** Alterações ainda não gravadas no servidor. */
  pending: number;
  /** Incrementa sempre que a lista local é substituída pelos dados do servidor. */
  dataVersion: number;
}

type PendingOp = 'put' | 'delete';
const RETRY_MS = 5000;

/**
 * Fonte da verdade = arquivos no servidor (pasta `dados/exercicios`).
 * O localStorage serve de cache: o app abre instantaneamente e continua
 * funcionando se o servidor cair; as alterações ficam numa fila e são
 * reenviadas quando a conexão volta.
 */
export class SyncedExerciseRepository implements ExerciseRepository {
  private readonly pending = new Map<string, PendingOp>();
  private status: SyncStatus = { mode: 'connecting', directory: null, pending: 0, dataVersion: 0 };
  private readonly listeners = new Set<() => void>();
  private flushing: Promise<void> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly local: LocalStorageExerciseRepository,
    private readonly remote: RemoteStore,
  ) {}

  get recoveredFromCorruption() {
    return this.local.recoveredFromCorruption;
  }

  // ── leitura: sempre do cache local (síncrona) ──
  list() {
    return this.local.list();
  }
  get(id: string) {
    return this.local.get(id);
  }

  // ── escrita: cache local + fila para o servidor ──
  save(exercise: Exercise): Exercise {
    const saved = this.local.save(exercise);
    this.enqueue(saved.id, 'put');
    return saved;
  }

  remove(id: string): void {
    this.local.remove(id);
    this.enqueue(id, 'delete');
  }

  restoreDemos(): number {
    const n = this.local.restoreDemos();
    for (const d of DEMO_EXERCISES) this.enqueue(d.id, 'put');
    return n;
  }

  // ── estado observável ──
  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };
  getStatus = () => this.status;

  private setStatus(patch: Partial<SyncStatus>) {
    this.status = { ...this.status, ...patch, pending: this.pending.size };
    this.listeners.forEach((l) => l());
  }

  private enqueue(id: string, op: PendingOp) {
    this.pending.set(id, op);
    this.setStatus({});
    if (this.status.mode === 'server' || this.status.mode === 'offline') void this.flush();
  }

  /** Envia a fila ao servidor. Em caso de falha, agenda nova tentativa. */
  flush(): Promise<void> {
    if (this.flushing) return this.flushing;
    if (this.status.mode === 'local') return Promise.resolve();
    this.flushing = (async () => {
      try {
        for (const [id, op] of [...this.pending]) {
          if (op === 'put') {
            const ex = this.local.get(id);
            if (ex) await this.remote.put(ex);
          } else {
            await this.remote.remove(id);
          }
          // Só remove da fila se nada novo foi enfileirado para o mesmo id enquanto enviava.
          if (this.pending.get(id) === op) this.pending.delete(id);
        }
        this.setStatus({ mode: 'server' });
      } catch {
        this.setStatus({ mode: 'offline' });
        this.scheduleRetry();
      } finally {
        this.flushing = null;
      }
      if (this.pending.size > 0 && this.status.mode === 'server') await this.flush();
    })();
    return this.flushing;
  }

  private scheduleRetry() {
    if (this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.sync();
    }, RETRY_MS);
  }

  /**
   * Busca os arquivos do servidor e atualiza o cache. Na primeira vez (pasta ainda
   * não existe) envia o que já está salvo neste navegador. Retorna true se a lista
   * local mudou.
   */
  async sync(): Promise<boolean> {
    let listing: RemoteListing;
    try {
      listing = await this.remote.list();
    } catch (e) {
      this.setStatus({ mode: e instanceof RemoteUnavailableError ? 'local' : 'offline' });
      if (!(e instanceof RemoteUnavailableError)) this.scheduleRetry();
      return false;
    }

    if (!listing.initialized) {
      for (const ex of this.local.list()) if (!this.pending.has(ex.id)) this.pending.set(ex.id, 'put');
      this.local.markSynced();
      this.setStatus({ mode: 'server', directory: listing.directory });
      await this.flush();
      return false;
    }

    const fromServer = new Map<string, Exercise>();
    for (const raw of listing.exercises) {
      const ex = sanitizeExercise(raw);
      if (ex && ex.origin !== 'library') fromServer.set(ex.id, ex);
    }
    // Primeira sincronização deste navegador: nada que só existe aqui pode se perder.
    // Exercícios ausentes na pasta são enviados; em conflito, vale o mais recente.
    if (!this.local.wasSynced()) {
      for (const ex of this.local.list()) {
        const remote = fromServer.get(ex.id);
        // Exemplos recém-criados neste navegador (nunca editados) não sobrescrevem a pasta.
        const editedHere = ex.updatedAt > ex.createdAt;
        if (!remote || (editedHere && ex.updatedAt > remote.updatedAt)) {
          fromServer.set(ex.id, ex);
          if (!this.pending.has(ex.id)) this.pending.set(ex.id, 'put');
        }
      }
      this.local.markSynced();
    }
    // Alterações locais ainda não enviadas prevalecem sobre o servidor.
    for (const [id, op] of this.pending) {
      if (op === 'delete') fromServer.delete(id);
      else {
        const ex = this.local.get(id);
        if (ex) fromServer.set(id, ex);
      }
    }
    const changed = this.local.replaceAll([...fromServer.values()]);
    this.setStatus({
      mode: 'server',
      directory: listing.directory,
      dataVersion: this.status.dataVersion + (changed ? 1 : 0),
    });
    if (this.pending.size > 0) await this.flush();
    return changed;
  }
}
