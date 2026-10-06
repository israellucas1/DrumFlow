import { useEffect, useSyncExternalStore } from 'react';
import { useServices } from '../app/AppState';
import type { TransportSnapshot } from '../transport/Transport';

/** Estado do transporte (muda só em eventos: play, pausa, BPM...). Não muda a cada frame. */
export function useTransportSnapshot(): TransportSnapshot {
  const { transport } = useServices();
  return useSyncExternalStore(transport.subscribe, transport.getSnapshot, transport.getSnapshot);
}

const isTyping = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
};

/**
 * Atalhos de reprodução: Espaço = play/pausa, Enter/Home = reiniciar,
 * Esc = parar, ↑/↓ = BPM ±1 (Shift: ±5) quando nenhuma nota está selecionada.
 */
export function usePlaybackShortcuts(opts: { onBpm: (delta: number) => void; enableArrows: boolean }) {
  const { transport } = useServices();
  const { onBpm, enableArrows } = opts;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      const onButton = (e.target as HTMLElement | null)?.tagName === 'BUTTON';
      if (e.code === 'Space' && !onButton) {
        e.preventDefault();
        void transport.togglePlay();
      } else if (e.key === 'Home') {
        e.preventDefault();
        void transport.restart();
      } else if (e.key === 'Escape') {
        transport.stop();
      } else if (enableArrows && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        onBpm((e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 5 : 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [transport, onBpm, enableArrows]);
}

export { isTyping };
