import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { AppSettings, Exercise } from '../music/types';
import { getServices, type Services } from './services';
import { LIBRARY } from '../data/rudiments';
import { duplicateExercise } from '../music/exerciseOps';
import { DEFAULT_SETTINGS } from '../storage/SettingsRepository';
import { clampBpm } from '../music/beatMath';

// ───────────── Serviços ─────────────

const ServicesContext = createContext<Services | null>(null);
export const useServices = (): Services => {
  const s = useContext(ServicesContext);
  if (!s) throw new Error('ServicesContext ausente');
  return s;
};

// ───────────── Configurações ─────────────

interface SettingsApi {
  settings: AppSettings;
  update: (fn: (s: AppSettings) => AppSettings) => void;
  reset: () => void;
}
const SettingsContext = createContext<SettingsApi | null>(null);
export const useSettings = (): SettingsApi => {
  const s = useContext(SettingsContext);
  if (!s) throw new Error('SettingsContext ausente');
  return s;
};

// ───────────── Exercícios ─────────────

interface ExercisesApi {
  userExercises: Exercise[];
  library: readonly Exercise[];
  getById: (id: string) => Exercise | null;
  save: (ex: Exercise) => Exercise;
  remove: (id: string) => void;
  duplicate: (ex: Exercise, name?: string) => Exercise;
  rename: (id: string, name: string) => void;
  restoreDemos: () => number;
}
const ExercisesContext = createContext<ExercisesApi | null>(null);
export const useExercises = (): ExercisesApi => {
  const s = useContext(ExercisesContext);
  if (!s) throw new Error('ExercisesContext ausente');
  return s;
};

// ───────────── Sessão de prática ─────────────

/**
 * Estado da tela Prática que sobrevive à troca de telas: qual exercício está
 * carregado, alterações temporárias (fórmula/subdivisão) e preferências da sessão.
 */
export interface PracticeSession {
  exerciseId: string;
  /** Cópia alterada nesta sessão (não salva), ou null. */
  override: Exercise | null;
  bpm: number;
  loop: boolean;
  countInBars: number;
}
interface PracticeApi {
  session: PracticeSession;
  exercise: Exercise;
  select: (id: string) => void;
  setOverride: (ex: Exercise | null) => void;
  setBpm: (bpm: number) => void;
  setLoop: (on: boolean) => void;
  setCountInBars: (n: number) => void;
}
const PracticeContext = createContext<PracticeApi | null>(null);
export const usePractice = (): PracticeApi => {
  const s = useContext(PracticeContext);
  if (!s) throw new Error('PracticeContext ausente');
  return s;
};

const FALLBACK_ID = LIBRARY[0].id;

export function AppStateProvider({ children }: { children: ReactNode }) {
  const services = useMemo(() => getServices(), []);
  const { engine, transport, exercises: repo, settingsRepo } = services;

  // Configurações ---------------------------------------------------------
  const [settings, setSettings] = useState<AppSettings>(services.initialSettings);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const update = useCallback((fn: (s: AppSettings) => AppSettings) => setSettings((s) => fn(s)), []);
  const reset = useCallback(
    () => setSettings((s) => ({ ...structuredClone(DEFAULT_SETTINGS), lastExerciseId: s.lastExerciseId })),
    [],
  );

  useEffect(() => {
    engine.applySettings(settings.audio);
    transport.setClickSubdivisions(settings.audio.clickSubdivisions);
    transport.setPracticeLimit(settings.practiceTimerSeconds);
    document.documentElement.dataset.theme = settings.theme;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => settingsRepo.save(settings), 250);
  }, [settings, engine, transport, settingsRepo]);

  // Exercícios ------------------------------------------------------------
  const [userExercises, setUserExercises] = useState<Exercise[]>(() => repo.list());
  const refresh = useCallback(() => setUserExercises(repo.list()), [repo]);
  const getById = useCallback(
    (id: string) => LIBRARY.find((e) => e.id === id) ?? userExercises.find((e) => e.id === id) ?? null,
    [userExercises],
  );
  const exercisesApi = useMemo<ExercisesApi>(
    () => ({
      userExercises,
      library: LIBRARY,
      getById,
      save: (ex) => {
        const saved = repo.save(ex);
        refresh();
        return saved;
      },
      remove: (id) => {
        repo.remove(id);
        refresh();
      },
      duplicate: (ex, name) => {
        const saved = repo.save(duplicateExercise(ex, name));
        refresh();
        return saved;
      },
      rename: (id, name) => {
        const ex = repo.get(id);
        if (!ex) return;
        repo.save({ ...ex, name });
        refresh();
      },
      restoreDemos: () => {
        const n = repo.restoreDemos();
        refresh();
        return n;
      },
    }),
    [userExercises, getById, repo, refresh],
  );

  // Sessão de prática -----------------------------------------------------
  const [session, setSession] = useState<PracticeSession>(() => {
    const id = settings.lastExerciseId;
    const exists = id && (LIBRARY.some((e) => e.id === id) || repo.get(id));
    const exerciseId = exists ? id! : FALLBACK_ID;
    const ex = LIBRARY.find((e) => e.id === exerciseId) ?? repo.get(exerciseId);
    return {
      exerciseId,
      override: null,
      bpm: settings.lastBpm,
      loop: ex?.loopEnabled ?? true,
      countInBars: settings.countInBars,
    };
  });

  const baseExercise = getById(session.exerciseId) ?? LIBRARY[0];
  const practiceExercise = session.override ?? baseExercise;

  // Se o exercício da sessão foi excluído, volta ao padrão.
  useEffect(() => {
    if (!getById(session.exerciseId)) setSession((s) => ({ ...s, exerciseId: FALLBACK_ID, override: null }));
  }, [getById, session.exerciseId]);

  const practiceApi = useMemo<PracticeApi>(
    () => ({
      session,
      exercise: practiceExercise,
      select: (id) => {
        const ex = getById(id);
        if (!ex) return;
        setSession((s) => ({ ...s, exerciseId: id, override: null, bpm: ex.bpm, loop: ex.loopEnabled }));
        setSettings((s) => ({ ...s, lastExerciseId: id, lastBpm: ex.bpm }));
      },
      setOverride: (ex) => setSession((s) => ({ ...s, override: ex })),
      setBpm: (bpm) => {
        const b = clampBpm(bpm);
        setSession((s) => ({ ...s, bpm: b }));
        setSettings((s) => (s.lastBpm === b ? s : { ...s, lastBpm: b }));
      },
      setLoop: (loop) => setSession((s) => ({ ...s, loop })),
      setCountInBars: (n) => setSession((s) => ({ ...s, countInBars: n })),
    }),
    [session, practiceExercise, getById],
  );

  // Sincroniza com os arquivos do servidor ao abrir e ao voltar para a aba.
  // A tela é atualizada pelo aviso do repositório (dataVersion), não pelo retorno de
  // cada sync — assim nenhuma atualização se perde se duas sincronizações se cruzarem.
  useEffect(() => {
    let version = repo.getStatus().dataVersion;
    const unsubscribe = repo.subscribe(() => {
      const v = repo.getStatus().dataVersion;
      if (v !== version) {
        version = v;
        refresh();
      }
    });
    const run = () => void repo.sync();
    run();
    const onVisible = () => {
      if (document.visibilityState === 'visible') run();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', run);
    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', run);
    };
  }, [repo, refresh]);

  // Carrega os sons próprios do usuário (dados/sons), se houver servidor.
  useEffect(() => {
    void engine.samples.load();
    void engine.backing.refresh();
  }, [engine]);

  // Faixa de acompanhamento ativa → decodifica e entrega ao transporte (que a sincroniza).
  const backingSnap = useSyncExternalStore(engine.backing.subscribe, engine.backing.getSnapshot, engine.backing.getSnapshot);
  const backingId = settings.backingTrackId;
  const backingMeta = backingId ? backingSnap.tracks.find((t) => t.id === backingId) ?? null : null;
  useEffect(() => {
    if (!backingId || !backingMeta) {
      transport.setBacking(null);
      return;
    }
    let alive = true;
    void engine.backing.ensureLoaded(backingId).then((buf) => {
      if (alive) transport.setBacking(buf ? { trackId: backingId, bpm: backingMeta.bpm, offsetSec: backingMeta.offsetSec } : null);
    });
    return () => {
      alive = false;
    };
  }, [engine, transport, backingId, backingMeta]);

  // Limpeza do áudio ao fechar a página.
  useEffect(() => {
    const onHide = () => transport.stop();
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, [transport]);

  return (
    <ServicesContext.Provider value={services}>
      <SettingsContext.Provider value={{ settings, update, reset }}>
        <ExercisesContext.Provider value={exercisesApi}>
          <PracticeContext.Provider value={practiceApi}>{children}</PracticeContext.Provider>
        </ExercisesContext.Provider>
      </SettingsContext.Provider>
    </ServicesContext.Provider>
  );
}
