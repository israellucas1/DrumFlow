import { useEffect, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { MAX_BPM, MIN_BPM, clampBpm } from '../../music/beatMath';
import { Button } from '../ui/primitives';

/**
 * Controle de andamento: deslizante, campo numérico e incrementos.
 * O valor exibido é sempre o `bpm` recebido (o mesmo usado pelo transporte);
 * o campo de texto só guarda um rascunho enquanto o usuário digita.
 */
export function BpmControl({ bpm, onChange, className = '' }: { bpm: number; onChange: (bpm: number) => void; className?: string }) {
  const [draft, setDraft] = useState(String(bpm));
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(String(bpm));
  }, [bpm, editing]);

  const commit = () => {
    setEditing(false);
    const n = Number(draft.replace(',', '.'));
    if (Number.isFinite(n) && draft.trim() !== '') onChange(clampBpm(n));
    setDraft(String(clampBpm(Number.isFinite(n) && draft.trim() !== '' ? n : bpm)));
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Button size="icon" variant="ghost" aria-label="Diminuir andamento (Shift: −5)" onClick={(e) => onChange(clampBpm(bpm - (e.shiftKey ? 5 : 1)))}>
        <Minus size={16} />
      </Button>
      <div className="flex flex-col items-center">
        <label className="sr-only" htmlFor="df-bpm-input">
          Andamento em BPM
        </label>
        <input
          id="df-bpm-input"
          inputMode="numeric"
          className="tabular h-9 w-16 rounded-lg border border-line bg-panel-2 text-center text-lg font-semibold text-fg outline-none"
          value={draft}
          onFocus={() => setEditing(true)}
          onChange={(e) => setDraft(e.target.value.replace(/[^\d.,]/g, ''))}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              setDraft(String(bpm));
              setEditing(false);
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
      </div>
      <Button size="icon" variant="ghost" aria-label="Aumentar andamento (Shift: +5)" onClick={(e) => onChange(clampBpm(bpm + (e.shiftKey ? 5 : 1)))}>
        <Plus size={16} />
      </Button>
      <span className="text-xs font-medium text-muted">BPM</span>
      <input
        type="range"
        min={MIN_BPM}
        max={MAX_BPM}
        step={1}
        value={bpm}
        aria-label="Andamento"
        aria-valuetext={`${bpm} batidas por minuto`}
        onChange={(e) => onChange(Number(e.target.value))}
        className="ml-1 w-full min-w-[110px] cursor-pointer sm:w-44"
      />
    </div>
  );
}
