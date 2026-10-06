import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { StudyProgress } from './types';
import { StudyRepository } from './StudyRepository';
import { StudyRuleError } from './sessionMachine';

interface StudyApi {
  progress: StudyProgress;
  /** Aplica uma regra (função pura) e salva. Retorna a mensagem de erro, se a regra recusar. */
  apply: (fn: (p: StudyProgress) => StudyProgress, opts?: { flush?: boolean }) => string | null;
}

const StudyContext = createContext<StudyApi | null>(null);

export function useStudy(): StudyApi {
  const ctx = useContext(StudyContext);
  if (!ctx) throw new Error('StudyProvider ausente');
  return ctx;
}

let repoSingleton: StudyRepository | null = null;
const getRepo = () => (repoSingleton ??= new StudyRepository());

export function StudyProvider({ children }: { children: ReactNode }) {
  const repo = useMemo(getRepo, []);
  const [progress, setProgress] = useState<StudyProgress>(() => repo.loadLocal());
  const ref = useRef(progress);

  const commit = useCallback(
    (next: StudyProgress, flush = false) => {
      ref.current = next;
      setProgress(next);
      repo.saveLocal(next);
      if (flush) repo.flushNow(next);
      else repo.schedulePush(next);
    },
    [repo],
  );

  const apply = useCallback<StudyApi['apply']>(
    (fn, opts) => {
      try {
        const next = fn(ref.current);
        if (next === ref.current) return null;
        commit({ ...next, updatedAt: Math.max(Date.now(), ref.current.updatedAt + 1) }, opts?.flush);
        return null;
      } catch (e) {
        if (e instanceof StudyRuleError) return e.message;
        throw e;
      }
    },
    [commit],
  );

  // Sincroniza com o arquivo do servidor ao abrir e ao voltar para a aba.
  useEffect(() => {
    const run = () =>
      void repo.sync(ref.current).then((remote) => {
        if (remote && remote.updatedAt > ref.current.updatedAt) {
          ref.current = remote;
          setProgress(remote);
          repo.saveLocal(remote);
        }
      });
    run();
    const onVisible = () => document.visibilityState === 'visible' && run();
    const onHide = () => repo.flushNow(ref.current);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pagehide', onHide);
    };
  }, [repo]);

  const value = useMemo(() => ({ progress, apply }), [progress, apply]);
  return <StudyContext.Provider value={value}>{children}</StudyContext.Provider>;
}
