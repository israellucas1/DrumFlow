import type { ReactNode } from 'react';
import { Drum, FolderOpen, GraduationCap, ListMusic, PencilRuler, Settings, Square } from 'lucide-react';
import { navigate, type Route } from '../../app/router';
import { useServices } from '../../app/AppState';
import { useTransportSnapshot } from '../../hooks/useTransport';
import { cx } from '../ui/primitives';

const NAV: { route: Route; label: string; short: string; icon: typeof Drum }[] = [
  { route: { name: 'practice' }, label: 'Prática', short: 'Prática', icon: Drum },
  { route: { name: 'rudiments' }, label: 'Biblioteca', short: 'Biblioteca', icon: ListMusic },
  { route: { name: 'editor' }, label: 'Editor de viradas', short: 'Editor', icon: PencilRuler },
  { route: { name: 'study' }, label: 'Planos de Estudo', short: 'Estudo', icon: GraduationCap },
  { route: { name: 'mine' }, label: 'Meus exercícios', short: 'Meus', icon: FolderOpen },
  { route: { name: 'settings' }, label: 'Configurações', short: 'Config.', icon: Settings },
];

function NowPlaying({ current }: { current: Route }) {
  const { transport } = useServices();
  const snap = useTransportSnapshot();
  const active = snap.state === 'playing' || snap.state === 'countIn' || snap.state === 'paused';
  // Nas telas com grade o controle completo já está visível.
  if (!active || current.name === 'practice' || current.name === 'editor' || current.name === 'study') return null;
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg border border-line bg-panel-2 py-1 pl-3 pr-1 text-xs">
      <span className={cx('h-2 w-2 shrink-0 rounded-full', snap.state === 'paused' ? 'bg-muted' : 'bg-rh')} aria-hidden="true" />
      <span className="truncate">
        {snap.state === 'paused' ? 'Pausado' : snap.state === 'countIn' ? 'Contagem' : 'Tocando'}: {snap.exerciseName} · {snap.bpm} BPM
      </span>
      <button
        className="grid h-7 w-7 place-items-center rounded-md hover:bg-panel"
        aria-label="Parar reprodução"
        onClick={() => transport.stop()}
      >
        <Square size={12} fill="currentColor" />
      </button>
    </div>
  );
}

export function AppShell({ route, children }: { route: Route; children: ReactNode }) {
  const isCurrent = (r: Route) => r.name === route.name;
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-panel focus:px-3 focus:py-2">
        Pular para o conteúdo
      </a>
      <header className="border-b border-line bg-panel">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-4 px-4">
          <a
            href="#/pratica"
            onClick={(e) => {
              e.preventDefault();
              navigate({ name: 'practice' });
            }}
            className="flex items-center gap-2 font-semibold tracking-tight"
          >
            <span className="grid h-7 w-7 place-items-center rounded-full border-2 border-rh" aria-hidden="true">
              <span className="h-2 w-2 rounded-full bg-lh" />
            </span>
            DrumFlow
          </a>
          <nav aria-label="Principal" className="hidden lg:block">
            <ul className="flex items-center gap-1">
              {NAV.map((n) => (
                <li key={n.route.name}>
                  <button
                    onClick={() => navigate(n.route)}
                    aria-current={isCurrent(n.route) ? 'page' : undefined}
                    className={cx(
                      'inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm transition-colors',
                      isCurrent(n.route) ? 'bg-panel-2 text-fg' : 'text-muted hover:text-fg',
                    )}
                  >
                    <n.icon size={16} aria-hidden="true" />
                    {n.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          <div className="ml-auto min-w-0">
            <NowPlaying current={route} />
          </div>
        </div>
      </header>

      <main id="conteudo" className="mx-auto w-full max-w-[1600px] flex-1 px-4 pb-24 pt-4 lg:pb-10">
        {children}
      </main>

      {/* Navegação inferior no celular */}
      <nav aria-label="Principal (celular)" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-panel/95 backdrop-blur lg:hidden">
        <ul className="grid grid-cols-6">
          {NAV.map((n) => (
            <li key={n.route.name}>
              <button
                onClick={() => navigate(n.route)}
                aria-current={isCurrent(n.route) ? 'page' : undefined}
                aria-label={n.label}
                className={cx(
                  'flex w-full flex-col items-center gap-0.5 py-2 text-[11px]',
                  isCurrent(n.route) ? 'text-fg' : 'text-muted',
                )}
              >
                <n.icon size={20} aria-hidden="true" />
                {n.short}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
