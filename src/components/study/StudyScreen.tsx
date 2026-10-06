import { useMemo, useState } from 'react';
import { CalendarDays, Dumbbell, History, Play, RotateCcw, Square } from 'lucide-react';
import { useStudy } from '../../study/StudyContext';
import { dayPlan, PHASES, PROGRAM_DAYS, PROGRAM_NAME, phaseOf } from '../../study/program';
import { buildSessionSteps, BLOCK_LABELS } from '../../study/sessionPlan';
import { abandonSession, resumeSession, sessionPracticedSec, setPreferredDuration, startSession } from '../../study/sessionMachine';
import { reviewDrillIds } from '../../study/progression';
import { DRILL_BY_ID } from '../../study/drills';
import { computeMetrics, formatDuration, programProgress } from '../../study/metrics';
import { DURATIONS, type DurationMin } from '../../study/types';
import { Button, Panel, cx } from '../ui/primitives';
import { useFeedback } from '../ui/feedback';
import { ProgressBar } from './studyUi';
import { SessionRunner } from './SessionRunner';
import { ProgramDays } from './ProgramDays';
import { StudyHistory } from './StudyHistory';
import { DrillsView } from './DrillsView';

type View = 'home' | 'session' | 'history' | 'days' | 'drills';

export const DURATION_LABEL: Record<DurationMin, string> = { 15: '15 min', 30: '30 min', 60: '1 hora', 90: '1h30' };

export function StudyScreen() {
  const { progress, apply } = useStudy();
  const { confirm, toast } = useFeedback();
  const [view, setView] = useState<View>('home');

  const back = () => setView('home');
  if (view === 'session' && progress.activeSession) return <SessionRunner onExit={back} />;
  if (view === 'history') return <StudyHistory onBack={back} />;
  if (view === 'days') return <ProgramDays onBack={back} onStarted={() => setView('session')} />;
  if (view === 'drills') return <DrillsView onBack={back} onStarted={() => setView('session')} />;

  return (
    <StudyHome
      onStart={() => setView('session')}
      onNavigate={setView}
      onAbandon={async () => {
        const ok = await confirm({
          title: 'Encerrar a sessão sem concluir?',
          message: 'O tempo já tocado fica no histórico, mas o dia não avança.',
          confirmLabel: 'Encerrar',
          danger: true,
        });
        if (!ok) return;
        apply(abandonSession, { flush: true });
        toast('Sessão encerrada. O mesmo dia continua disponível.');
      }}
      progress={progress}
      apply={apply}
    />
  );
}

function StudyHome({
  progress,
  apply,
  onStart,
  onNavigate,
  onAbandon,
}: {
  progress: ReturnType<typeof useStudy>['progress'];
  apply: ReturnType<typeof useStudy>['apply'];
  onStart: () => void;
  onNavigate: (v: View) => void;
  onAbandon: () => void;
}) {
  const { toast } = useFeedback();
  const day = progress.nextDay;
  const plan = dayPlan(day);
  const phase = phaseOf(day);
  const duration = progress.preferredDuration;
  const review = useMemo(() => reviewDrillIds(progress), [progress]);
  const steps = useMemo(() => buildSessionSteps(plan, duration, review), [plan, duration, review]);
  const metrics = useMemo(() => computeMetrics(progress), [progress]);
  const active = progress.activeSession;

  const start = () => {
    const err = apply((p) => startSession(p, { mode: 'main', day, durationMin: duration, steps }));
    if (err) return toast(err, 'error');
    onStart();
  };

  const groups = steps.reduce<{ kind: string; min: number; drills: string[] }[]>((acc, s) => {
    const last = acc[acc.length - 1];
    const name = s.drillId ? DRILL_BY_ID[s.drillId].name : 'Autoavaliação e anotações';
    if (last && last.kind === BLOCK_LABELS[s.kind]) {
      last.min += s.plannedSec / 60;
      last.drills.push(name);
    } else acc.push({ kind: BLOCK_LABELS[s.kind], min: s.plannedSec / 60, drills: [name] });
    return acc;
  }, []);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">Planos de Estudo</p>
        <h1 className="text-xl font-semibold tracking-tight">{PROGRAM_NAME}</h1>
        <div className="flex max-w-xl items-center gap-3">
          <ProgressBar value={programProgress(progress)} label="Progresso do programa" />
          <span className="tabular shrink-0 text-xs text-muted">
            {Math.min(progress.completedDays.length, PROGRAM_DAYS)}/{PROGRAM_DAYS} dias · {metrics.phasesCompleted.length}/{PHASES.length} fases
          </span>
        </div>
        <p className="text-xs text-muted">
          A sequência avança por treinos concluídos, não por datas: pular dias não muda o próximo treino nem zera nada.
        </p>
      </header>

      {active && (
        <Panel className="flex flex-col gap-3 border-lh/50 p-4 sm:flex-row sm:items-center">
          <div className="flex-1">
            <p className="text-sm font-semibold">
              Sessão {active.status === 'paused' ? 'pausada' : 'em andamento'}: Dia {active.day}
              {active.mode === 'repeat' ? ' (repetição)' : active.mode === 'single' ? ' (treino livre)' : ''}
            </p>
            <p className="text-xs text-muted">
              Exercício {Math.min(active.current + 1, active.steps.length)} de {active.steps.length} · tocado{' '}
              {formatDuration(sessionPracticedSec(active))} de {active.durationMin} min
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" onClick={onAbandon}>
              <Square size={14} /> Encerrar sem concluir
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                apply(resumeSession);
                onStart();
              }}
            >
              <Play size={15} /> Continuar treino
            </Button>
          </div>
        </Panel>
      )}

      <Panel className="flex flex-col gap-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs text-muted">
              Próximo treino · Fase {phase.id}: {phase.name}
              {plan.cycle ? ` · ciclo de consolidação ${plan.cycle}` : ''}
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">
              Dia {day} · {plan.title}
            </h2>
            <p className="mt-1 text-sm text-muted">Objetivo: {plan.focus}</p>
            {plan.tests && <p className="mt-1 text-xs text-lh">Inclui os testes de referência (Dias 1, 15 e 30) para medir sua evolução.</p>}
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium text-muted">Tempo disponível hoje</p>
          <div role="radiogroup" aria-label="Duração da sessão" className="flex flex-wrap gap-2">
            {DURATIONS.map((d) => (
              <button
                key={d}
                role="radio"
                aria-checked={duration === d}
                onClick={() => apply((p) => setPreferredDuration(p, d))}
                className={cx(
                  'h-10 rounded-lg border px-4 text-sm font-medium transition-colors',
                  duration === d ? 'border-transparent bg-primary text-primary-fg' : 'border-line bg-panel-2 text-muted hover:text-fg',
                )}
              >
                {DURATION_LABEL[d]}
              </button>
            ))}
          </div>
        </div>

        <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {groups.map((g, i) => (
            <li key={i} className="rounded-lg border border-line bg-panel-2/50 p-3">
              <p className="flex items-baseline justify-between gap-2 text-sm font-medium">
                {g.kind}
                <span className="tabular text-xs text-muted">{Math.round(g.min * 10) / 10} min</span>
              </p>
              <ul className="mt-1 list-disc pl-4 text-xs text-muted">
                {g.drills.map((d, k) => (
                  <li key={k}>{d}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
        {review.length > 0 && duration >= 30 && (
          <p className="text-xs text-rh">
            Revisão incluída pelo seu desempenho: {review.slice(0, duration >= 60 ? 2 : 1).map((id) => DRILL_BY_ID[id]?.name).join(', ')}.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="primary" size="lg" onClick={start} disabled={!!active}>
            <Play size={16} /> Iniciar treino ({DURATION_LABEL[duration]})
          </Button>
          {active && <span className="self-center text-xs text-muted">Conclua ou encerre a sessão atual para iniciar outra.</span>}
        </div>
      </Panel>

      <nav aria-label="Mais opções do plano" className="grid gap-2 sm:grid-cols-3">
        <Button size="lg" onClick={() => onNavigate('history')}>
          <History size={16} /> Histórico e métricas
        </Button>
        <Button size="lg" onClick={() => onNavigate('days')}>
          <CalendarDays size={16} /> Dias do programa (repetir treinos)
        </Button>
        <Button size="lg" onClick={() => onNavigate('drills')}>
          <Dumbbell size={16} /> Exercícios e BPM
        </Button>
      </nav>

      {metrics.review.length > 0 && (
        <Panel className="p-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <RotateCcw size={15} /> Precisam de revisão
          </p>
          <p className="mt-1 text-xs text-muted">Com base nas suas autoavaliações recentes.</p>
          <ul className="mt-2 flex flex-wrap gap-2 text-xs">
            {metrics.review.map((d) => (
              <li key={d.drillId} className="rounded-md bg-rh/10 px-2 py-1 text-rh">
                {d.name} · {d.currentBpm} BPM
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
