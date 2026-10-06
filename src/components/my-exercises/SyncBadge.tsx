import { useSyncExternalStore } from 'react';
import { Cloud, CloudOff, HardDrive, Loader } from 'lucide-react';
import { useServices } from '../../app/AppState';

/** Mostra onde os exercícios estão sendo salvos. */
export function SyncBadge({ detailed = false }: { detailed?: boolean }) {
  const { exercises } = useServices();
  const s = useSyncExternalStore(exercises.subscribe, exercises.getStatus, exercises.getStatus);

  const view = {
    connecting: { icon: Loader, text: 'Conectando ao servidor…', tone: 'text-muted' },
    server: {
      icon: HardDrive,
      text: s.pending > 0 ? `Salvando ${s.pending} alteração(ões) em arquivo…` : 'Salvo em arquivo no computador',
      tone: 'text-fg',
    },
    offline: {
      icon: CloudOff,
      text: `Servidor indisponível — ${s.pending} alteração(ões) aguardando para salvar em arquivo`,
      tone: 'text-rh',
    },
    local: { icon: Cloud, text: 'Salvo apenas neste navegador (sem servidor de arquivos)', tone: 'text-muted' },
  }[s.mode];

  return (
    <div className={`flex flex-col gap-0.5 text-xs ${view.tone}`} role="status">
      <span className="inline-flex items-center gap-1.5">
        <view.icon size={14} aria-hidden="true" className={s.mode === 'connecting' ? 'animate-spin' : ''} />
        {view.text}
      </span>
      {detailed && s.directory && s.mode !== 'local' && (
        <span className="break-all font-mono text-[11px] text-muted">{s.directory}</span>
      )}
    </div>
  );
}
