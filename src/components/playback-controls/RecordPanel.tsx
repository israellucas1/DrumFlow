import { useEffect, useState, useSyncExternalStore } from 'react';
import { Circle, Download, Headphones, Play, Square, Trash2, X } from 'lucide-react';
import { useServices } from '../../app/AppState';
import { Recorder } from '../../audio/Recorder';
import type { Exercise } from '../../music/types';
import { Button, cx } from '../ui/primitives';
import { useFeedback } from '../ui/feedback';

function useRecorder() {
  const { recorder } = useServices();
  return { recorder, snap: useSyncExternalStore(recorder.subscribe, recorder.getSnapshot, recorder.getSnapshot) };
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Botão Gravar (fica na linha de controles). */
export function RecordButton({ exercise }: { exercise: Exercise }) {
  const { recorder, snap } = useRecorder();
  const { engine } = useServices();
  const [elapsed, setElapsed] = useState(0);
  const recording = snap.state === 'recording';

  useEffect(() => {
    if (!recording) return;
    const t0 = engine.currentTime;
    const id = setInterval(() => setElapsed(engine.currentTime - t0), 250);
    return () => clearInterval(id);
  }, [recording, engine]);

  if (recording) {
    return (
      <Button variant="danger" onClick={() => void recorder.stop()} aria-label="Parar gravação" className="border-danger bg-danger/15">
        <Square size={13} fill="currentColor" /> Parar gravação <span className="tabular">{clock(elapsed)}</span>
      </Button>
    );
  }
  return (
    <Button
      onClick={() => void recorder.start(exercise.id, exercise.name)}
      disabled={snap.state !== 'idle'}
      title="Grava pelo microfone enquanto o exercício toca desde a contagem. Use fone de ouvido para o clique não entrar na gravação."
    >
      <Circle size={13} className="text-danger" fill="currentColor" /> {snap.state === 'requesting' ? 'Aguardando microfone…' : snap.state === 'processing' ? 'Processando…' : 'Gravar'}
    </Button>
  );
}

/** Lista das gravações deste exercício: ouvir com o clique, ouvir só, baixar, excluir. */
export function RecordingsPanel({ exercise, bpm, onBpm }: { exercise: Exercise; bpm: number; onBpm: (b: number) => void }) {
  const { recorder, snap } = useRecorder();
  const { toast } = useFeedback();
  const takes = snap.takes.filter((t) => t.exerciseId === exercise.id);

  return (
    <>
      {snap.error && (
        <div role="alert" className="flex items-start gap-3 rounded-lg border border-danger/50 bg-danger/10 px-3 py-2 text-sm text-danger">
          <span className="flex-1">{snap.error}</span>
          <button aria-label="Fechar aviso" onClick={() => recorder.clearError()}>
            <X size={16} />
          </button>
        </div>
      )}
      {takes.length > 0 && (
        <div className="rounded-xl border border-line bg-panel p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">Gravações deste exercício</p>
            <label className="flex items-center gap-2 text-xs text-muted" title="Se a gravação soar atrasada em relação ao clique, mova para a direita; adiantada, para a esquerda.">
              Ajuste fino da sincronia
              <input
                type="range"
                min={-150}
                max={150}
                step={5}
                value={snap.nudgeMs}
                onChange={(e) => recorder.setNudge(Number(e.target.value))}
                aria-label="Ajuste fino da sincronia da gravação em milissegundos"
                className="w-32 cursor-pointer"
              />
              <span className="tabular w-14">{snap.nudgeMs > 0 ? '+' : ''}{snap.nudgeMs} ms</span>
            </label>
          </div>
          <ul className="mt-2 divide-y divide-line">
            {takes.map((t) => {
              const replaying = snap.replayId === t.id;
              const sameBpm = Math.abs(t.bpm - bpm) < 0.5;
              return (
                <li key={t.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className={cx('min-w-0 flex-1 text-sm', replaying && 'text-lh')}>
                    {t.name} · {t.bpm} BPM · {clock(t.durationSec)}
                  </span>
                  {sameBpm ? (
                    <Button size="sm" variant={replaying ? 'primary' : 'secondary'} onClick={() => (replaying ? recorder.stopReplay() : void recorder.replay(t.id))}>
                      <Play size={13} /> {replaying ? 'Tocando com o clique' : 'Ouvir com o clique'}
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => onBpm(t.bpm)} title="A gravação foi feita em outro andamento">
                      Ajustar para {t.bpm} BPM
                    </Button>
                  )}
                  <Button size="sm" onClick={() => void recorder.listen(t.id).catch(() => toast('Não foi possível tocar.', 'error'))}>
                    <Headphones size={13} /> Só a gravação
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => recorder.stopListening()} aria-label="Parar a reprodução da gravação">
                    <Square size={12} />
                  </Button>
                  <Button size="sm" onClick={() => recorder.download(t.id)}>
                    <Download size={13} /> WAV
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => recorder.remove(t.id)} aria-label={`Excluir ${t.name}`}>
                    <Trash2 size={13} />
                  </Button>
                </li>
              );
            })}
          </ul>
          <p className="mt-1 text-[11px] text-muted">
            As gravações ficam só nesta aba (somem ao recarregar). Use "WAV" para guardar o arquivo. Dica: grave com fone de ouvido.
          </p>
        </div>
      )}
    </>
  );
}

export const micUnavailableReason = () => Recorder.micSupportMessage();
