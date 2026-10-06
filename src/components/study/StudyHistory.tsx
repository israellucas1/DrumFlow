import { useMemo, useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronRight } from 'lucide-react';
import { useStudy } from '../../study/StudyContext';
import { computeMetrics, formatDuration } from '../../study/metrics';
import { DRILL_BY_ID } from '../../study/drills';
import { PHASES } from '../../study/program';
import { BLOCK_LABELS } from '../../study/sessionPlan';
import { sessionPracticedSec } from '../../study/sessionMachine';
import type { SessionRecord } from '../../study/types';
import { Button, Panel, cx } from '../ui/primitives';
import { clock, RATING_SHORT, Sparkline, Stat, STEP_STATUS } from './studyUi';

const dateFmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const STATUS_LABEL: Record<SessionRecord['status'], string> = {
  not_started: 'Não iniciada',
  in_progress: 'Em andamento',
  paused: 'Pausada',
  completed: 'Concluída',
  abandoned: 'Interrompida',
};
const MODE_LABEL: Record<SessionRecord['mode'], string> = { main: 'Sequência', repeat: 'Repetição', single: 'Treino livre' };

export function StudyHistory({ onBack }: { onBack: () => void }) {
  const { progress } = useStudy();
  const m = useMemo(() => computeMetrics(progress), [progress]);
  const [open, setOpen] = useState<string | null>(null);
  const maxSkill = Math.max(1, ...m.bySkill.map((s) => s.sec));
  const sessions = [...progress.sessions].reverse();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft size={14} /> Voltar
        </Button>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">Histórico e métricas</h1>
        <p className="text-xs text-muted">
          Tempos = metrônomo tocando durante os exercícios. Avaliações = suas autoavaliações (o app não mede o som da sua execução).
          Datas aparecem só como referência; não contam para a progressão.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="Sessões concluídas" value={m.sessionsCompleted} hint={`${m.sessionsAbandoned} interrompida(s)`} />
        <Stat label="Dias da sequência" value={m.mainDaysCompleted} hint={`próximo: Dia ${m.nextDay}`} />
        <Stat label="Tempo praticado" value={formatDuration(m.totalPracticedSec)} />
        <Stat label="Fases concluídas" value={`${m.phasesCompleted.length}/${PHASES.length}`} />
      </div>

      <Panel className="p-4">
        <p className="text-sm font-semibold">Próximo objetivo técnico</p>
        <p className="mt-1 text-sm text-muted">
          Dia {m.nextDay}: {m.nextFocus}
        </p>
      </Panel>

      <Panel className="p-4">
        <p className="text-sm font-semibold">Testes de referência (Dias 1, 15 e 30)</p>
        <p className="text-xs text-muted">Maior BPM tocado com controle, informado por você.</p>
        <table className="mt-2 w-full text-left text-sm">
          <thead className="text-xs text-muted">
            <tr>
              <th className="py-1 font-medium">Exercício</th>
              <th className="py-1 font-medium">Primeiro</th>
              <th className="py-1 font-medium">Mais recente</th>
              <th className="py-1 font-medium">Evolução</th>
            </tr>
          </thead>
          <tbody>
            {m.tests.map((t) => (
              <tr key={t.drillId} className="border-t border-line">
                <td className="py-1.5">{t.name.replace('Teste: ', '')}</td>
                <td className="tabular py-1.5">{t.first ? `${t.first.bpm} (Dia ${t.first.day})` : '—'}</td>
                <td className="tabular py-1.5">{t.latest ? `${t.latest.bpm} (Dia ${t.latest.day})` : '—'}</td>
                <td className={cx('tabular py-1.5', t.first && t.latest && t.latest.bpm > t.first.bpm && 'text-lh')}>
                  {t.first && t.latest ? `${t.latest.bpm - t.first.bpm >= 0 ? '+' : ''}${t.latest.bpm - t.first.bpm} BPM` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="p-4">
          <p className="text-sm font-semibold">Tempo por habilidade</p>
          {m.bySkill.length === 0 ? (
            <p className="mt-1 text-sm text-muted">Ainda sem prática registrada.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1.5">
              {m.bySkill.map((s) => (
                <li key={s.skill} className="grid grid-cols-[120px_1fr_auto] items-center gap-2 text-xs">
                  <span>{s.label}</span>
                  <span className="h-2 rounded-full bg-lh/70" style={{ width: `${(s.sec / maxSkill) * 100}%` }} />
                  <span className="tabular text-muted">{formatDuration(s.sec)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel className="p-4">
          <p className="text-sm font-semibold">Evolução da autoavaliação</p>
          {m.evaluations.length === 0 ? (
            <p className="mt-1 text-sm text-muted">Aparece após a primeira sessão concluída.</p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-6 text-xs text-muted">
              <div>
                Precisão (1–5) <Sparkline values={m.evaluations.map((e) => e.precision)} max={5} label="Evolução da precisão" />
              </div>
              <div>
                Controle (1–5) <Sparkline values={m.evaluations.map((e) => e.control)} max={5} label="Evolução do controle" />
              </div>
              <div className="tabular">
                Última: precisão {m.evaluations.at(-1)!.precision} · controle {m.evaluations.at(-1)!.control}
              </div>
            </div>
          )}
        </Panel>
      </div>

      <Panel className="p-4">
        <p className="text-sm font-semibold">Exercícios: BPM e frequência de conclusão</p>
        {m.drills.length === 0 ? (
          <p className="mt-1 text-sm text-muted">Ainda sem dados.</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="py-1 font-medium">Exercício</th>
                  <th className="py-1 font-medium">BPM atual</th>
                  <th className="py-1 font-medium">Melhor controlado</th>
                  <th className="py-1 font-medium">Evolução (BPM usado)</th>
                  <th className="py-1 font-medium">Praticado</th>
                  <th className="py-1 font-medium">Concluídos</th>
                </tr>
              </thead>
              <tbody>
                {m.drills.map((d) => (
                  <tr key={d.drillId} className="border-t border-line">
                    <td className="py-1.5">
                      {d.name}
                      {d.needsReview && <span className="ml-1.5 rounded bg-rh/15 px-1.5 text-[10px] text-rh">revisar</span>}
                    </td>
                    <td className="tabular py-1.5">
                      {d.currentBpm} <span className="text-muted">/ {d.targetBpm}</span>
                    </td>
                    <td className="tabular py-1.5">{d.bestControlledBpm ?? '—'}</td>
                    <td className="py-1.5">
                      <Sparkline values={d.log.map((l) => l.bpm)} label={`Evolução do BPM de ${d.name}`} />
                    </td>
                    <td className="tabular py-1.5">{formatDuration(d.practicedSec)}</td>
                    <td className="tabular py-1.5">
                      {d.completed}/{d.prescribed}
                      {d.completionRate !== null ? ` (${Math.round(d.completionRate * 100)}%)` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Sessões</h2>
        {sessions.length === 0 ? (
          <Panel className="p-4 text-sm text-muted">Nenhuma sessão registrada ainda.</Panel>
        ) : (
          <ul className="flex flex-col gap-2">
            {sessions.map((s) => {
              const expanded = open === s.id;
              return (
                <li key={s.id}>
                  <Panel className="p-3">
                    <button className="flex w-full flex-wrap items-center gap-2 text-left text-sm" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : s.id)}>
                      {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                      <span className="font-semibold">Treino #{s.seq}</span>
                      <span>
                        Dia {s.day} · {MODE_LABEL[s.mode]} · {s.durationMin} min
                      </span>
                      <span className={cx('rounded-md px-2 py-0.5 text-xs', s.status === 'completed' ? 'bg-lh/15 text-lh' : 'bg-rh/15 text-rh')}>
                        {STATUS_LABEL[s.status]}
                      </span>
                      <span className="tabular ml-auto text-xs text-muted">
                        tocado {formatDuration(sessionPracticedSec(s))}
                        {s.startedAt ? ` · ${dateFmt.format(new Date(s.startedAt))}` : ''}
                      </span>
                    </button>
                    {expanded && (
                      <div className="mt-2 border-t border-line pt-2 text-xs">
                        <ol className="flex flex-col gap-0.5">
                          {s.steps.map((st) => (
                            <li key={st.index} className="grid grid-cols-[1fr_auto] gap-2">
                              <span>
                                {BLOCK_LABELS[st.kind]}: {st.drillId ? DRILL_BY_ID[st.drillId]?.name : 'avaliação'}{' '}
                                <span className={STEP_STATUS[st.status].tone}>({STEP_STATUS[st.status].label})</span>
                              </span>
                              <span className="tabular text-muted">
                                {st.kind !== 'evaluation' && `${clock(st.practicedSec)}/${clock(st.plannedSec)}`}
                                {st.bpmEnd ? ` · ${st.bpmStart}→${st.bpmEnd} BPM` : ''}
                                {st.rating ? ` · ${RATING_SHORT[st.rating]}` : ''}
                                {st.testBpm ? ` · teste ${st.testBpm}` : ''}
                              </span>
                            </li>
                          ))}
                        </ol>
                        {s.evaluation && (
                          <p className="mt-2 text-muted">
                            Precisão {s.evaluation.precision}/5 · controle {s.evaluation.control}/5
                            {s.evaluation.notes ? ` · ${s.evaluation.notes}` : ''}
                            {s.evaluation.difficulties ? ` · dificuldades: ${s.evaluation.difficulties}` : ''}
                          </p>
                        )}
                      </div>
                    )}
                  </Panel>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
