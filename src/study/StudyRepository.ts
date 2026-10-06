import type { StudyProgress } from './types';
import { DURATIONS } from './types';
import { createProgress, normalizeLoaded } from './sessionMachine';
import { getDefaultStore, readJson, writeJson, type KeyValueStore } from '../storage/storage';

const KEY = 'drumflow.study.v1';

/** Validação leve: dados ausentes/corrompidos voltam a um progresso novo sem quebrar o app. */
export function sanitizeProgress(raw: unknown): StudyProgress | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<StudyProgress>;
  if (r.version !== 1 || typeof r.nextDay !== 'number' || !Array.isArray(r.sessions) || typeof r.drills !== 'object') return null;
  const base = createProgress();
  return normalizeLoaded({
    ...base,
    ...r,
    nextDay: Math.max(1, Math.floor(r.nextDay)),
    completedDays: Array.isArray(r.completedDays) ? r.completedDays.filter((d) => typeof d === 'number') : [],
    preferredDuration: DURATIONS.includes(r.preferredDuration as never) ? r.preferredDuration! : base.preferredDuration,
    seqCounter: typeof r.seqCounter === 'number' ? r.seqCounter : r.sessions.length,
    activeSession: r.activeSession && Array.isArray(r.activeSession.steps) ? r.activeSession : null,
    drills: r.drills ?? {},
    updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : 0,
  } as StudyProgress);
}

/**
 * Persistência do progresso: navegador (imediato) + arquivo no servidor
 * (dados/estudo/progresso.json), o que for mais recente vence.
 */
export class StudyRepository {
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  serverAvailable: boolean | null = null;

  constructor(
    private readonly store: KeyValueStore = getDefaultStore(),
    private readonly endpoint = '/api/estudo',
  ) {}

  loadLocal(): StudyProgress {
    const res = readJson(this.store, KEY);
    const p = res.ok ? sanitizeProgress(res.value) : null;
    if (!p && res.ok === false && res.raw !== null) {
      try {
        this.store.setItem(`${KEY}.corrupted.${Date.now()}`, res.raw);
      } catch {
        /* ignora */
      }
    }
    return p ?? createProgress();
  }

  saveLocal(p: StudyProgress) {
    writeJson(this.store, KEY, p);
  }

  /** Busca a versão do servidor. Retorna-a se for mais nova que `local`; senão envia a local. */
  async sync(local: StudyProgress): Promise<StudyProgress | null> {
    try {
      const r = await fetch(this.endpoint, { cache: 'no-store' });
      if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) throw new Error('sem servidor');
      this.serverAvailable = true;
      const { progress } = (await r.json()) as { progress: unknown };
      const remote = sanitizeProgress(progress);
      if (remote && remote.updatedAt > local.updatedAt) return remote;
      if (local.updatedAt > (remote?.updatedAt ?? -1)) this.schedulePush(local, 0);
      return null;
    } catch {
      this.serverAvailable = false;
      return null;
    }
  }

  /** Envia no máximo uma vez a cada `delay` ms, sempre a versão mais recente. */
  private latest: StudyProgress | null = null;

  schedulePush(p: StudyProgress, delay = 2000) {
    if (this.serverAvailable === false) return;
    this.latest = p;
    if (this.pushTimer) return;
    this.pushTimer = setTimeout(() => {
      this.pushTimer = null;
      const body = this.latest;
      this.latest = null;
      if (!body) return;
      void fetch(this.endpoint, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {});
    }, delay);
  }

  /** Envia imediatamente o que estiver pendente (ex.: ao concluir o dia ou fechar a página). */
  flushNow(p: StudyProgress) {
    if (this.serverAvailable === false) return;
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = null;
    this.latest = null;
    try {
      // keepalive: o envio termina mesmo se a página estiver sendo fechada.
      void fetch(this.endpoint, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p), keepalive: true }).catch(() => {});
    } catch {
      /* ignora */
    }
  }
}
