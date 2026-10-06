import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, LogOut, SkipForward } from 'lucide-react';
import { useExercises, useServices, useSettings } from '../../app/AppState';
import { useStudy } from '../../study/StudyContext';
import { DRILL_BY_ID } from '../../study/drills';
import { dayPlan, phaseOf } from '../../study/program';
import { BLOCK_LABELS, totalPlannedSec } from '../../study/sessionPlan';
import {
  advance,
  completeSession,
  completionCheck,
  currentStep,
  finishStep,
  pauseSession,
  rateStep,
  recordPractice,
  reopenStep,
  sessionStage,
  setStepBpm,
  submitEvaluation,
  abandonSession,
} from '../../study/sessionMachine';
import { getDrillProgress, RATING_LABELS, recommend } from '../../study/progression';
import { formatDuration } from '../../study/metrics';
import type { BpmChoice, Rating, SessionRecord, SessionStep } from '../../study/types';
import { clampBpm } from '../../music/beatMath';
import { PlaybackControls } from '../playback-controls/PlaybackControls';
import { ExerciseView } from '../notation/ExerciseView';
import { Button, Panel, Select, cx } from '../ui/primitives';
import { useFeedback } from '../ui/feedback';
import { clock, ProgressBar, RATING_SHORT, STEP_STATUS } from './studyUi';

export function SessionRunner({ onExit }: { onExit: () => void }) {
  const { progress } = useStudy();
  const s = progress.activeSession;
  if (!s) return null;
  const stage = sessionStage(s);
  const step = currentStep(s);
  const plan = dayPlan(s.day);

  return (
    <div className="flex flex-col gap-4">
      <SessionHeader session={s} onExit={onExit} />
      {stage === 'practice' && step.status === 'active' && step.drillId && (
        <PracticeStage key={`${s.id}-${step.index}-${step.rounds}`} session={s} step={step} onExit={onExit} />
      )}
      {stage === 'practice' && step.status !== 'active' && <ResumeNext />}
      {stage === 'rating' && <RatingStage key={`r-${s.id}-${step.index}-${step.rounds}`} step={step} />}
      {stage === 'evaluation' && <EvaluationStage planTitle={plan.title} />}
      {stage === 'summary' && <SummaryStage session={s} onExit={onExit} />}
    </div>
  );
}

/** Caso raro (ex.: dados antigos): nenhum passo ativo, mas há pendentes. */
function ResumeNext() {
  const { apply } = useStudy();
  return (
    <Panel className="p-4">
      <Button variant="primary" onClick={() => apply(advance)}>
        Ir para o próximo exercício
      </Button>
    </Panel>
  );
}

function SessionHeader({ session, onExit }: { session: SessionRecord; onExit: () => void }) {
  const { apply } = useStudy();
  const plan = dayPlan(session.day);
  const practiceSteps = session.steps.filter((x) => x.kind !== 'evaluation');
  const planned = practiceSteps.reduce((a, x) => a + x.plannedSec, 0);
  const practiced = practiceSteps.reduce((a, x) => a + Math.min(x.practicedSec, x.plannedSec), 0);
  const remaining = session.steps.filter((x) => x.status === 'pending' || x.status === 'active').reduce((a, x) => a + Math.max(0, x.plannedSec - x.practicedSec), 0);
  const modeLabel = session.mode === 'repeat' ? 'Repetição' : session.mode === 'single' ? 'Treino livre' : `Fase ${phaseOf(session.day).id}`;

  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted">
            {modeLabel} · sessão de {session.durationMin} min
          </p>
          <h1 className="text-xl font-semibold tracking-tight">
            {session.mode === 'single' ? 'Treino livre' : `Dia ${session.day} · ${plan.title}`}
          </h1>
        </div>
        <Button
          onClick={() => {
            apply(pauseSession, { flush: true });
            onExit();
          }}
        >
          <LogOut size={15} /> Pausar e sair
        </Button>
      </div>
      <div className="flex items-center gap-3">
        <ProgressBar value={planned ? practiced / planned : 0} label="Progresso da sessão" />
        <span className="tabular shrink-0 text-xs text-muted">
          {formatDuration(practiced)} de {formatDuration(planned)} · faltam ~{formatDuration(remaining)}
        </span>
      </div>
      <ol className="flex gap-1 overflow-x-auto pb-1" aria-label="Exercícios da sessão">
        {session.steps.map((st) => (
          <li
            key={st.index}
            title={`${BLOCK_LABELS[st.kind]}: ${st.drillId ? DRILL_BY_ID[st.drillId]?.name : 'Avaliação'} — ${STEP_STATUS[st.status].label}`}
            className={cx(
              'h-1.5 min-w-6 flex-1 rounded-full',
              st.status === 'done' && 'bg-lh',
              st.status === 'active' && 'bg-fg',
              (st.status === 'incomplete' || st.status === 'skipped') && 'bg-rh',
              st.status === 'pending' && 'bg-panel-2',
            )}
          />
        ))}
      </ol>
    </header>
  );
}

// ───────────────────────── Exercício em andamento ─────────────────────────

function PracticeStage({ session, step, onExit }: { session: SessionRecord; step: SessionStep; onExit: () => void }) {
  const { transport } = useServices();
  const { settings } = useSettings();
  const { getById } = useExercises();
  const { progress, apply } = useStudy();
  const { confirm } = useFeedback();
  const drill = DRILL_BY_ID[step.drillId!];
  const dp = getDrillProgress(progress, drill.id);
  const custom = dp.customExerciseId ? getById(dp.customExerciseId) : null;

  const patternId = `study-${session.id}-${step.index}-${step.rounds}`;
  const pattern = useMemo(() => ({ ...(custom ?? drill.pattern), id: patternId, name: drill.name }), [custom, drill, patternId]);
  const [bpm, setBpm] = useState(() => clampBpm(step.bpmEnd ?? dp.currentBpm));
  const [loop, setLoop] = useState(true);
  const [countIn, setCountIn] = useState(settings.countInBars);

  // Tempo deste "round": o cronômetro do transporte conta só com o metrônomo tocando.
  const base = useRef(step.practicedSec);
  const limit = useRef(step.plannedSec - step.practicedSec >= 10 ? step.plannedSec - step.practicedSec : step.plannedSec);
  const extra = useRef(0); // acumulado de execuções anteriores (Parar/Reiniciar zera o transporte)
  const lastElapsed = useRef(0);
  const lastSaved = useRef(step.practicedSec);
  const finished = useRef(false);
  const [live, setLive] = useState(0); // segundos tocados neste round

  const practicedNow = () => base.current + extra.current + lastElapsed.current;

  useEffect(() => {
    transport.load(pattern);
    transport.setLoop(true);
    transport.setCountInBars(countIn);
    transport.setBpm(bpm);
    transport.setPracticeLimit(limit.current);
    apply((p) => setStepBpm(p, bpm));
    return () => {
      const total = practicedNow();
      apply((p) => recordPractice(p, total));
      if (transport.loadedExerciseId === pattern.id) transport.stop();
      transport.setPracticeLimit(settings.practiceTimerSeconds);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pattern.id]);

  useEffect(() => {
    const id = setInterval(() => {
      if (finished.current) return;
      const snap = transport.getSnapshot();
      const mine = snap.exerciseId === pattern.id;
      if (mine && snap.timerFinished) {
        // O tempo do bloco acabou (o transporte terminou o compasso e parou).
        finished.current = true;
        const total = Math.max(practicedNow(), base.current + limit.current);
        apply((p) => finishStep(recordPractice(p, total), 'time'));
        return;
      }
      const e = mine ? transport.getPracticeElapsed() : 0;
      if (e < lastElapsed.current - 0.01) {
        extra.current += lastElapsed.current; // Parar/Reiniciar zerou o relógio: guarda o que já tocou
        transport.setPracticeLimit(Math.max(10, limit.current - extra.current));
      }
      lastElapsed.current = e;
      const roundPlayed = extra.current + e;
      setLive(roundPlayed);
      const total = base.current + roundPlayed;
      if (total - lastSaved.current >= 2) {
        lastSaved.current = total;
        apply((p) => recordPractice(p, total));
      }
    }, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pattern.id]);

  const changeBpm = (b: number) => {
    const v = clampBpm(b);
    setBpm(v);
    transport.setBpm(v);
    apply((p) => setStepBpm(p, v));
  };

  const endStep = async (how: 'manual' | 'skip') => {
    if (how === 'skip') {
      const ok = await confirm({ title: 'Pular este exercício?', message: 'Fica registrado como pulado no histórico da sessão.', confirmLabel: 'Pular' });
      if (!ok) return;
    }
    finished.current = true;
    const total = practicedNow();
    transport.stop();
    apply((p) => finishStep(recordPractice(p, total), how));
  };

  const remaining = Math.max(0, limit.current - live);
  const roundProgress = limit.current ? Math.min(1, live / limit.current) : 0;
  const pct = Math.round((step.plannedSec ? (base.current + live) / step.plannedSec : 0) * 100);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Panel className="flex flex-col gap-2 p-4">
          <p className="text-xs text-muted">
            {BLOCK_LABELS[step.kind]} · exercício {step.index + 1} de {session.steps.length}
            {step.rounds > 1 ? ` · repetição ${step.rounds - 1}` : ''}
            {custom ? ' · padrão editado por você' : ''}
          </p>
          <h2 className="text-lg font-semibold">{drill.name}</h2>
          <p className="text-sm">
            <span className="text-muted">Objetivo: </span>
            {drill.goal}
          </p>
          <p className="text-xs text-muted">Por que hoje: {step.reason}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
            {drill.instructions.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
          <p className="mt-1 rounded-lg bg-panel-2 px-3 py-2 text-sm">
            <span className="font-medium">Critério de sucesso: </span>
            {drill.success}
          </p>
          <p className="text-xs text-muted">
            BPM do exercício: atual {dp.currentBpm} · alvo {dp.targetBpm}
            {dp.bestControlledBpm ? ` · melhor com controle ${dp.bestControlledBpm}` : ''}
          </p>
        </Panel>

        <Panel className="flex flex-col items-center justify-center gap-2 p-4 text-center" aria-live="off">
          <p className="text-xs text-muted">Tempo restante deste exercício</p>
          <p className="tabular text-5xl font-semibold" role="timer" aria-label={`Restam ${clock(remaining)}`}>
            {clock(remaining)}
          </p>
          <ProgressBar value={roundProgress} label="Progresso do exercício" className="max-w-xs" />
          <p className="text-xs text-muted">
            Previsto {formatDuration(step.plannedSec)} · tocado {formatDuration(base.current + live)} ({pct}%)
          </p>
          <p className="text-[11px] text-muted">O tempo só corre com o metrônomo tocando. Pausar não conta.</p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <Button variant="primary" onClick={() => void endStep('manual')}>
              <CheckCircle2 size={15} /> Concluir exercício
            </Button>
            <Button onClick={() => void endStep('skip')}>
              <SkipForward size={15} /> Pular
            </Button>
          </div>
        </Panel>
      </div>

      <PlaybackControls
        exercise={pattern}
        bpm={bpm}
        onBpm={changeBpm}
        loop={loop}
        onLoop={(on) => {
          setLoop(on);
          transport.setLoop(on);
        }}
        countInBars={countIn}
        onCountIn={(n) => {
          setCountIn(n);
          transport.setCountInBars(n);
        }}
        showTimer={false}
      />
      <ExerciseView exercise={pattern} view={settings.view} />
      <button className="self-start text-xs text-muted underline" onClick={onExit}>
        Voltar ao painel (a sessão continua salva)
      </button>
    </div>
  );
}

// ───────────────────────── Autoavaliação do exercício ─────────────────────────

function RatingStage({ step }: { step: SessionStep }) {
  const { progress, apply } = useStudy();
  const drill = DRILL_BY_ID[step.drillId!];
  const dp = getDrillProgress(progress, drill.id);
  const bpmUsed = step.bpmEnd ?? dp.currentBpm;
  const [rating, setRating] = useState<Rating | null>(null);
  const [choice, setChoice] = useState<BpmChoice | null>(null);
  const [testBpm, setTestBpm] = useState(String(bpmUsed));
  const rec = rating ? recommend(dp, bpmUsed, rating) : null;
  const effective = choice ?? rec?.choice ?? 'keep';
  const nextBpm = (c: BpmChoice) => (c === 'up' ? clampBpm(bpmUsed + dp.stepBpm) : c === 'down' ? clampBpm(bpmUsed - dp.stepBpm) : bpmUsed);

  const save = () => {
    if (!rating) return;
    const t = drill.test ? clampBpm(Number(testBpm) || bpmUsed) : null;
    apply((p) => advance(rateStep(p, { rating, choice: effective, testBpm: t })));
  };

  return (
    <Panel className="flex flex-col gap-4 p-4">
      <div>
        <p className="text-xs text-muted">
          {BLOCK_LABELS[step.kind]} · {STEP_STATUS[step.status].label} · tocado {formatDuration(step.practicedSec)} de {formatDuration(step.plannedSec)}
        </p>
        <h2 className="text-lg font-semibold">Como foi “{drill.name}” a {bpmUsed} BPM?</h2>
        <p className="text-xs text-muted">
          O DrumFlow não escuta sua execução — esta avaliação é sua, e é ela que orienta o andamento. Critério: {drill.success}
        </p>
      </div>
      <div role="radiogroup" aria-label="Autoavaliação" className="grid gap-2 sm:grid-cols-3">
        {(Object.keys(RATING_LABELS) as Rating[]).map((r) => (
          <button
            key={r}
            role="radio"
            aria-checked={rating === r}
            onClick={() => {
              setRating(r);
              setChoice(null);
            }}
            className={cx(
              'rounded-xl border p-3 text-left transition-colors',
              rating === r ? 'border-fg bg-panel-2' : 'border-line hover:border-muted/60',
            )}
          >
            <p className="text-sm font-semibold">{RATING_LABELS[r].title}</p>
            <p className="text-xs text-muted">{RATING_LABELS[r].hint}</p>
          </button>
        ))}
      </div>

      {drill.test && (
        <label className="flex max-w-xs flex-col gap-1 text-xs text-muted">
          <span className="font-medium">Maior BPM que você tocou com controle neste teste</span>
          <input
            inputMode="numeric"
            value={testBpm}
            onChange={(e) => setTestBpm(e.target.value.replace(/\D/g, ''))}
            className="tabular h-9 rounded-lg border border-line bg-panel-2 px-2.5 text-sm text-fg"
          />
        </label>
      )}

      {rec && (
        <div className="flex flex-col gap-2">
          <p className="text-sm">
            <span className="font-medium">Recomendação: </span>
            {rec.reason}
          </p>
          <div role="radiogroup" aria-label="Andamento da próxima vez" className="flex flex-wrap gap-2">
            {(['down', 'keep', 'up'] as BpmChoice[]).map((c) => (
              <button
                key={c}
                role="radio"
                aria-checked={effective === c}
                onClick={() => setChoice(c)}
                className={cx(
                  'h-9 rounded-lg border px-3 text-sm',
                  effective === c ? 'border-transparent bg-primary text-primary-fg' : 'border-line bg-panel-2 text-muted hover:text-fg',
                )}
              >
                {c === 'down' ? 'Reduzir para' : c === 'keep' ? 'Manter' : 'Subir para'} {nextBpm(c)} BPM
                {rec.choice === c ? ' (recomendado)' : ''}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <Button variant="primary" disabled={!rating} onClick={save}>
          Salvar e continuar
        </Button>
      </div>
    </Panel>
  );
}

// ───────────────────────── Avaliação da sessão ─────────────────────────

function Scale({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex flex-col gap-1 text-xs text-muted">
      <span className="font-medium">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            role="radio"
            aria-checked={value === n}
            onClick={() => onChange(n)}
            className={cx('h-9 w-9 rounded-lg border text-sm', value === n ? 'border-transparent bg-primary text-primary-fg' : 'border-line bg-panel-2 text-fg')}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

function EvaluationStage({ planTitle }: { planTitle: string }) {
  const { apply } = useStudy();
  const [precision, setPrecision] = useState(0);
  const [control, setControl] = useState(0);
  const [notes, setNotes] = useState('');
  const [difficulties, setDifficulties] = useState('');
  return (
    <Panel className="flex flex-col gap-4 p-4">
      <div>
        <h2 className="text-lg font-semibold">Avaliação e registro</h2>
        <p className="text-xs text-muted">Sobre a sessão “{planTitle}”. Notas de 1 (fraco) a 5 (excelente), na sua percepção.</p>
      </div>
      <div className="flex flex-wrap gap-6">
        <Scale label="Precisão rítmica" value={precision} onChange={setPrecision} />
        <Scale label="Controle e relaxamento" value={control} onChange={setControl} />
      </div>
      <label className="flex flex-col gap-1 text-xs text-muted">
        <span className="font-medium">Observações</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="rounded-lg border border-line bg-panel-2 p-2.5 text-sm text-fg" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        <span className="font-medium">Pontos de dificuldade</span>
        <textarea value={difficulties} onChange={(e) => setDifficulties(e.target.value)} rows={2} className="rounded-lg border border-line bg-panel-2 p-2.5 text-sm text-fg" />
      </label>
      <div>
        <Button variant="primary" disabled={!precision || !control} onClick={() => apply((p) => submitEvaluation(p, { precision, control, notes, difficulties }))}>
          Ver resumo da sessão
        </Button>
      </div>
    </Panel>
  );
}

// ───────────────────────── Conclusão ─────────────────────────

function SummaryStage({ session, onExit }: { session: SessionRecord; onExit: () => void }) {
  const { apply } = useStudy();
  const { toast, confirm } = useFeedback();
  const check = completionCheck(session);
  const practice = session.steps.filter((x) => x.kind !== 'evaluation');
  const [repeatIdx, setRepeatIdx] = useState(practice[0]?.index ?? 0);
  const strengths = practice.filter((x) => x.rating === 'good');
  const attention = practice.filter((x) => x.rating === 'hard' || x.status === 'incomplete' || x.status === 'skipped');
  const isMain = session.mode === 'main';

  const finish = () => {
    const err = apply(completeSession, { flush: true });
    if (err) return toast(err, 'error');
    toast(isMain ? `Dia ${session.day} concluído! O Dia ${session.day + 1} foi liberado.` : 'Treino registrado no histórico.');
    onExit();
  };

  return (
    <div className="flex flex-col gap-4">
      <Panel className="p-4">
        <h2 className="text-lg font-semibold">Resumo da sessão</h2>
        <p className="text-sm text-muted">
          Tocado {formatDuration(check.practicedSec)} de {formatDuration(check.plannedPracticeSec)} previstos ({Math.round(check.ratio * 100)}%) ·
          sessão de {formatDuration(totalPlannedSec(session.steps))}
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="py-1.5 font-medium">Exercício</th>
                <th className="py-1.5 font-medium">Situação</th>
                <th className="py-1.5 font-medium">Tocado / previsto</th>
                <th className="py-1.5 font-medium">BPM início → fim</th>
                <th className="py-1.5 font-medium">Avaliação</th>
              </tr>
            </thead>
            <tbody>
              {practice.map((x) => (
                <tr key={x.index} className="border-t border-line">
                  <td className="py-1.5">{DRILL_BY_ID[x.drillId!]?.name}</td>
                  <td className={cx('py-1.5', STEP_STATUS[x.status].tone)}>{STEP_STATUS[x.status].label}</td>
                  <td className="tabular py-1.5">
                    {clock(x.practicedSec)} / {clock(x.plannedSec)}
                  </td>
                  <td className="tabular py-1.5">
                    {x.bpmStart ?? '—'} → {x.bpmEnd ?? '—'}
                    {x.testBpm ? ` (teste: ${x.testBpm})` : ''}
                  </td>
                  <td className="py-1.5">{x.rating ? RATING_SHORT[x.rating] : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-4 md:grid-cols-2">
        <Panel className="p-4">
          <p className="text-sm font-semibold">Pontos fortes</p>
          <p className="mt-1 text-sm text-muted">{strengths.length ? strengths.map((x) => DRILL_BY_ID[x.drillId!].name).join(', ') : 'Nenhum exercício avaliado como limpo nesta sessão.'}</p>
        </Panel>
        <Panel className="p-4">
          <p className="text-sm font-semibold">Precisa de atenção</p>
          <p className="mt-1 text-sm text-muted">
            {attention.length ? attention.map((x) => `${DRILL_BY_ID[x.drillId!].name} (${x.rating === 'hard' ? 'difícil' : STEP_STATUS[x.status].label.toLowerCase()})`).join(', ') : 'Nada marcado.'}
          </p>
          {session.evaluation && (
            <p className="mt-2 text-xs text-muted">
              Autoavaliação: precisão {session.evaluation.precision}/5 · controle {session.evaluation.control}/5
              {session.evaluation.difficulties ? ` · dificuldades: ${session.evaluation.difficulties}` : ''}
            </p>
          )}
        </Panel>
      </div>

      <Panel className="flex flex-col gap-3 p-4">
        {!check.ok && (
          <div role="alert" className="rounded-lg border border-rh/40 bg-rh/10 px-3 py-2 text-sm text-rh">
            {isMain ? 'O dia ainda não pode ser concluído: ' : 'Ainda não dá para registrar: '}
            {check.reasons.join(' ')} Repita um exercício abaixo para completar o tempo.
          </div>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <Button variant="primary" size="lg" disabled={!check.ok} onClick={finish}>
            <CheckCircle2 size={16} /> {isMain ? 'Concluir dia de treino' : 'Registrar treino'}
          </Button>
          <label className="flex flex-col gap-1 text-xs text-muted">
            <span className="font-medium">Repetir exercício</span>
            <div className="flex gap-2">
              <Select value={repeatIdx} onChange={(e) => setRepeatIdx(Number(e.target.value))} aria-label="Exercício a repetir">
                {practice.map((x) => (
                  <option key={x.index} value={x.index}>
                    {DRILL_BY_ID[x.drillId!]?.name} ({STEP_STATUS[x.status].label})
                  </option>
                ))}
              </Select>
              <Button onClick={() => apply((p) => reopenStep(p, repeatIdx))}>Repetir</Button>
            </div>
          </label>
          <Button
            variant="danger"
            onClick={async () => {
              const ok = await confirm({
                title: 'Encerrar sem concluir?',
                message: 'O tempo tocado fica registrado, mas a sessão não conta como concluída.',
                confirmLabel: 'Encerrar',
                danger: true,
              });
              if (!ok) return;
              apply(abandonSession, { flush: true });
              onExit();
            }}
          >
            Encerrar sem concluir
          </Button>
        </div>
      </Panel>
    </div>
  );
}
