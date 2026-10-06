import { useEffect, useRef, useState } from 'react';
import { Timer } from 'lucide-react';
import { useServices, useSettings } from '../../app/AppState';
import { useTransportSnapshot } from '../../hooks/useTransport';
import { sanitizeTimer } from '../../storage/SettingsRepository';
import { Select } from '../ui/primitives';
import { useFeedback } from '../ui/feedback';

const PRESETS = [60, 120, 180, 300, 600, 900, 1200, 1800];

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`;
}

/** Aceita "5" (minutos), "2:30" (min:seg) ou "1:05:00" (h:min:seg). */
export function parseDuration(text: string): number | null {
  const parts = text.trim().replace(',', '.').split(':').map((p) => p.trim());
  if (parts.length === 0 || parts.some((p) => p === '' || !/^\d+(\.\d+)?$/.test(p))) return null;
  const n = parts.map(Number);
  const secs = n.length === 1 ? n[0] * 60 : n.length === 2 ? n[0] * 60 + n[1] : n[0] * 3600 + n[1] * 60 + n[2];
  return sanitizeTimer(secs);
}

/**
 * Cronômetro de treino: escolhe a duração e mostra o tempo restante. A contagem
 * vem do transporte (relógio de áudio); aqui só se exibe.
 */
export function PracticeTimer({ exerciseId, onEnableLoop }: { exerciseId: string; onEnableLoop: () => void }) {
  const { transport } = useServices();
  const { settings, update } = useSettings();
  const { prompt, toast } = useFeedback();
  const snap = useTransportSnapshot();
  const limit = settings.practiceTimerSeconds;
  const mine = snap.exerciseId === exerciseId;
  const [elapsed, setElapsed] = useState(0);
  const lastFinished = useRef(false);

  // Atualiza a exibição ~5×/s (só exibição; o tempo real vem do relógio de áudio).
  useEffect(() => {
    if (!limit) return;
    const id = setInterval(() => setElapsed(transport.getPracticeElapsed()), 200);
    setElapsed(transport.getPracticeElapsed());
    return () => clearInterval(id);
  }, [transport, limit, snap.state]);

  useEffect(() => {
    if (mine && snap.timerFinished && !lastFinished.current && limit) {
      toast(`Treino concluído: ${formatClock(limit)} tocando. 🎉`);
    }
    lastFinished.current = snap.timerFinished;
  }, [mine, snap.timerFinished, limit, toast]);

  const setLimit = (seconds: number | null) => {
    update((s) => ({ ...s, practiceTimerSeconds: seconds }));
    if (seconds) onEnableLoop();
  };

  const onSelect = async (value: string) => {
    if (value === 'off') return setLimit(null);
    if (value === 'custom') {
      const text = await prompt({
        title: 'Duração do treino',
        label: 'Minutos (ex.: 7) ou min:seg (ex.: 2:30)',
        initial: limit ? formatClock(limit) : '5',
        confirmLabel: 'Definir',
      });
      if (text === null) return;
      const secs = parseDuration(text);
      if (!secs) return toast('Duração inválida. Use, por exemplo, 7 ou 2:30 (mínimo 10 s).', 'error');
      return setLimit(secs);
    }
    setLimit(Number(value));
  };

  const active = mine && (snap.state === 'playing' || snap.state === 'countIn' || snap.state === 'paused');
  const remaining = limit ? Math.max(0, limit - (active ? elapsed : 0)) : 0;
  const progress = limit && active ? Math.min(1, elapsed / limit) : 0;
  const expired = mine && snap.timerExpired;
  const finished = mine && snap.timerFinished && snap.state === 'stopped';
  const isPreset = limit !== null && PRESETS.includes(limit);

  return (
    <div className="flex flex-col gap-1 text-xs text-muted">
      <span className="font-medium">Cronômetro</span>
      <div className="flex h-9 items-center gap-2">
        <Select
          value={limit === null ? 'off' : isPreset ? String(limit) : 'current'}
          onChange={(e) => void onSelect(e.target.value)}
          aria-label="Duração do treino"
        >
          <option value="off">Desligado</option>
          {PRESETS.map((p) => (
            <option key={p} value={p}>
              {p / 60} min
            </option>
          ))}
          {limit !== null && !isPreset && <option value="current">{formatClock(limit)}</option>}
          <option value="custom">Personalizado…</option>
        </Select>
        {limit !== null && (
          <div
            className={`relative flex h-9 min-w-[92px] items-center gap-1.5 overflow-hidden rounded-lg border px-2.5 ${
              finished ? 'border-transparent bg-primary text-primary-fg' : 'border-line bg-panel-2 text-fg'
            }`}
            role="timer"
            aria-label={finished ? 'Treino concluído' : `Tempo restante ${formatClock(remaining)}`}
          >
            <span
              aria-hidden="true"
              className="absolute inset-y-0 left-0 bg-lh/20 transition-[width] duration-200"
              style={{ width: `${progress * 100}%` }}
            />
            <Timer size={14} className="relative" aria-hidden="true" />
            <span className="tabular relative text-sm font-semibold">
              {finished ? 'Concluído' : expired ? 'Terminando…' : formatClock(remaining)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
