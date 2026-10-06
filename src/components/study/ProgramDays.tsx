import { useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronRight, RotateCcw } from 'lucide-react';
import { useStudy } from '../../study/StudyContext';
import { ALL_PROGRAM_DAYS, PHASES } from '../../study/program';
import { buildSessionSteps, BLOCK_LABELS } from '../../study/sessionPlan';
import { startSession } from '../../study/sessionMachine';
import { DRILL_BY_ID } from '../../study/drills';
import { Button, Panel, cx } from '../ui/primitives';
import { useFeedback } from '../ui/feedback';

export function ProgramDays({ onBack, onStarted }: { onBack: () => void; onStarted: () => void }) {
  const { progress, apply } = useStudy();
  const { toast } = useFeedback();
  const [open, setOpen] = useState<number | null>(null);
  const duration = progress.preferredDuration;
  const timesDone = (day: number) => progress.sessions.filter((s) => s.day === day && s.status === 'completed').length;

  const repeat = (day: number) => {
    const plan = ALL_PROGRAM_DAYS[day - 1];
    const err = apply((p) => startSession(p, { mode: 'repeat', day, durationMin: duration, steps: buildSessionSteps(plan, duration) }));
    if (err) return toast(err, 'error');
    onStarted();
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft size={14} /> Voltar
        </Button>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">Dias do programa</h1>
        <p className="text-sm text-muted">
          Consulte qualquer dia. Dias já liberados podem ser repetidos em {duration} min — repetir não altera a sequência principal (próximo: Dia{' '}
          {progress.nextDay}).
        </p>
      </div>
      {PHASES.map((ph) => (
        <section key={ph.id} aria-labelledby={`fase-${ph.id}`}>
          <h2 id={`fase-${ph.id}`} className="text-sm font-semibold">
            Fase {ph.id} — {ph.name}
          </h2>
          <p className="mb-2 text-xs text-muted">{ph.goal}</p>
          <ul className="flex flex-col gap-2">
            {ALL_PROGRAM_DAYS.filter((d) => d.phase === ph.id).map((d) => {
              const done = timesDone(d.day);
              const isNext = d.day === progress.nextDay;
              const unlocked = d.day < progress.nextDay;
              const expanded = open === d.day;
              return (
                <li key={d.day}>
                  <Panel className={cx('p-3', isNext && 'border-lh/60')}>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        aria-expanded={expanded}
                        onClick={() => setOpen(expanded ? null : d.day)}
                      >
                        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        <span className="tabular w-14 shrink-0 text-sm font-semibold">Dia {d.day}</span>
                        <span className="truncate text-sm">{d.title}</span>
                      </button>
                      <span className={cx('rounded-md px-2 py-0.5 text-xs', done ? 'bg-lh/15 text-lh' : isNext ? 'bg-primary text-primary-fg' : 'bg-panel-2 text-muted')}>
                        {done ? `Concluído${done > 1 ? ` ×${done}` : ''}` : isNext ? 'Próximo' : unlocked ? 'Liberado' : 'A seguir'}
                      </span>
                      {unlocked && (
                        <Button size="sm" onClick={() => repeat(d.day)} disabled={!!progress.activeSession}>
                          <RotateCcw size={13} /> Repetir
                        </Button>
                      )}
                    </div>
                    {expanded && (
                      <div className="mt-2 border-t border-line pt-2 text-xs text-muted">
                        <p className="mb-1">Objetivo: {d.focus}</p>
                        <ol className="list-decimal space-y-0.5 pl-5">
                          {buildSessionSteps(d, duration).map((s) => (
                            <li key={s.index}>
                              {BLOCK_LABELS[s.kind]}: {s.drillId ? DRILL_BY_ID[s.drillId].name : 'avaliação'} · {Math.round(s.plannedSec / 6) / 10} min
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                  </Panel>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
