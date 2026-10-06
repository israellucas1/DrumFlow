import { useEffect, useState } from 'react';

export type Route =
  | { name: 'practice' }
  | { name: 'rudiments' }
  | { name: 'editor'; id?: string; copyOf?: string }
  | { name: 'mine' }
  | { name: 'study' }
  | { name: 'settings' };

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  switch (parts[0]) {
    case 'rudimentos':
      return { name: 'rudiments' };
    case 'editor':
      if (parts[1] === 'copia' && parts[2]) return { name: 'editor', copyOf: parts[2] };
      if (parts[1] && parts[1] !== 'novo') return { name: 'editor', id: parts[1] };
      return { name: 'editor' };
    case 'meus':
      return { name: 'mine' };
    case 'estudo':
      return { name: 'study' };
    case 'configuracoes':
      return { name: 'settings' };
    default:
      return { name: 'practice' };
  }
}

export function formatRoute(route: Route): string {
  switch (route.name) {
    case 'practice':
      return '#/pratica';
    case 'rudiments':
      return '#/rudimentos';
    case 'mine':
      return '#/meus';
    case 'study':
      return '#/estudo';
    case 'settings':
      return '#/configuracoes';
    case 'editor':
      if (route.copyOf) return `#/editor/copia/${encodeURIComponent(route.copyOf)}`;
      if (route.id) return `#/editor/${encodeURIComponent(route.id)}`;
      return '#/editor/novo';
  }
}

/** Guarda de navegação (ex.: editor com alterações não salvas). Retorna true para permitir. */
let guard: (() => boolean) | null = null;
export function setNavigationGuard(fn: (() => boolean) | null) {
  guard = fn;
}

export function navigate(route: Route) {
  const hash = formatRoute(route);
  if (hash === window.location.hash) return;
  if (guard && !guard()) return;
  window.location.hash = hash;
}

/** Atualiza a URL sem disparar navegação (ex.: novo exercício recém-salvo). */
export function replaceRoute(route: Route) {
  window.history.replaceState(null, '', formatRoute(route));
}

export function useHashRoute(): Route {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    let last = window.location.hash;
    const onChange = () => {
      const next = window.location.hash;
      if (next === last) return;
      if (guard && !guard()) {
        // Navegação pelo histórico do navegador bloqueada: volta para a URL anterior.
        window.history.replaceState(null, '', last);
        return;
      }
      last = next;
      setHash(next);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return parseHash(hash);
}
