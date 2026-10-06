import { useSyncExternalStore } from 'react';
import { Music } from 'lucide-react';
import { useServices, useSettings } from '../../app/AppState';
import { navigate } from '../../app/router';
import { Button, Select } from '../ui/primitives';

/** Escolha da faixa de acompanhamento + aviso de mudança de tom quando o BPM difere do da música. */
export function BackingControl({ bpm, onBpm }: { bpm: number; onBpm: (bpm: number) => void }) {
  const { engine } = useServices();
  const { settings, update } = useSettings();
  const lib = useSyncExternalStore(engine.backing.subscribe, engine.backing.getSnapshot, engine.backing.getSnapshot);
  if (lib.status === 'unavailable') return null;

  const id = settings.backingTrackId;
  const track = id ? lib.tracks.find((t) => t.id === id) ?? null : null;
  const loading = !!id && lib.loadingId === id;
  const ratio = track ? bpm / track.bpm : 1;
  const semitones = track ? 12 * Math.log2(ratio) : 0;

  return (
    <div className="flex flex-col gap-1 text-xs text-muted">
      <span className="font-medium">Acompanhamento</span>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={track ? track.id : ''}
          aria-label="Faixa de acompanhamento"
          onChange={(e) => {
            const v = e.target.value;
            if (v === '__manage') return navigate({ name: 'settings' });
            update((s) => ({ ...s, backingTrackId: v || null }));
          }}
          className="max-w-[200px]"
        >
          <option value="">Nenhum</option>
          {lib.tracks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.bpm} BPM)
            </option>
          ))}
          <option value="__manage">Adicionar/gerenciar faixas…</option>
        </Select>
        {loading && (
          <span className="inline-flex items-center gap-1">
            <Music size={13} /> carregando…
          </span>
        )}
        {track && !loading && Math.abs(ratio - 1) > 0.001 && (
          <>
            <span className="text-rh" title="A música acelera/desacelera junto com o BPM, o que também muda o tom.">
              tom {semitones > 0 ? '+' : ''}
              {semitones.toFixed(1)} semitom
            </span>
            <Button size="sm" onClick={() => onBpm(Math.round(track.bpm))}>
              Usar BPM da música ({track.bpm})
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
