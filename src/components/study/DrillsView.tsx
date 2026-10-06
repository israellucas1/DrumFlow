import { useState } from 'react';
import { ArrowLeft, PencilLine, Play, Undo2 } from 'lucide-react';
import { useExercises } from '../../app/AppState';
import { navigate } from '../../app/router';
import { useStudy } from '../../study/StudyContext';
import { DRILLS, SKILL_LABELS } from '../../study/drills';
import { buildSingleDrillSteps } from '../../study/sessionPlan';
import { startSession } from '../../study/sessionMachine';
import { getDrillProgress } from '../../study/progression';
import { formatDuration } from '../../study/metrics';
import type { Drill, DrillProgress, SkillId, StudyProgress } from '../../study/types';
import { clampBpm } from '../../music/beatMath';
import { Button, Panel, Select } from '../ui/primitives';
import { useFeedback } from '../ui/feedback';

const withDrill = (p: StudyProgress, id: string, patch: Partial<DrillProgress>): StudyProgress => ({
  ...p,
  drills: { ...p.drills, [id]: { ...getDrillProgress(p, id), ...patch } },
});

export function DrillsView({ onBack, onStarted }: { onBack: () => void; onStarted: () => void }) {
  const { progress } = useStudy();
  const skills = [...new Set(DRILLS.map((d) => d.skill))] as SkillId[];
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft size={14} /> Voltar
        </Button>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">Exercícios e BPM</h1>
        <p className="text-sm text-muted">
          O andamento de cada exercício evolui pelas suas avaliações, não pelo número do dia. Ajuste a prescrição, treine um exercício
          isolado ou edite o padrão no editor.
        </p>
      </div>
      {skills.map((sk) => (
        <section key={sk}>
          <h2 className="mb-2 text-sm font-semibold">{SKILL_LABELS[sk]}</h2>
          <ul className="grid gap-2 lg:grid-cols-2">
            {DRILLS.filter((d) => d.skill === sk).map((d) => (
              <li key={d.id}>
                <DrillCard drill={d} dp={getDrillProgress(progress, d.id)} hasActive={!!progress.activeSession} onStarted={onStarted} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function NumberField({ label, value, onCommit }: { label: string; value: number; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  return (
    <label className="flex flex-col gap-0.5 text-[11px] text-muted">
      {label}
      <input
        inputMode="numeric"
        value={draft}
        onChange={(e) => setDraft(e.target.value.replace(/\D/g, ''))}
        onBlur={() => {
          const v = Number(draft);
          if (v > 0) onCommit(v);
          else setDraft(String(value));
        }}
        className="tabular h-8 w-16 rounded-md border border-line bg-panel-2 px-2 text-sm text-fg"
      />
    </label>
  );
}

function DrillCard({ drill, dp, hasActive, onStarted }: { drill: Drill; dp: DrillProgress; hasActive: boolean; onStarted: () => void }) {
  const { apply } = useStudy();
  const { duplicate, getById } = useExercises();
  const { toast } = useFeedback();
  const [minutes, setMinutes] = useState(10);
  const custom = dp.customExerciseId ? getById(dp.customExerciseId) : null;

  const train = () => {
    const err = apply((p) => startSession(p, { mode: 'single', day: p.nextDay, durationMin: minutes, steps: buildSingleDrillSteps(drill.id, minutes) }));
    if (err) return toast(err, 'error');
    onStarted();
  };

  const editPattern = () => {
    const copy = duplicate({ ...(custom ?? drill.pattern), category: 'study', bpm: dp.currentBpm }, `${drill.name} (meu padrão)`);
    apply((p) => withDrill(p, drill.id, { customExerciseId: copy.id }));
    toast('Cópia criada em "Meus exercícios". As próximas sessões usarão a sua versão.');
    navigate({ name: 'editor', id: copy.id });
  };

  return (
    <Panel className="flex h-full flex-col gap-2 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{drill.name}</p>
          <p className="text-xs text-muted">{drill.goal}</p>
        </div>
        {drill.test && <span className="shrink-0 rounded-md bg-lh/15 px-2 py-0.5 text-[11px] text-lh">teste</span>}
      </div>
      <p className="tabular text-xs text-muted">
        Atual {dp.currentBpm} BPM · melhor controlado {dp.bestControlledBpm ?? '—'} · alvo {dp.targetBpm} · praticado{' '}
        {formatDuration(dp.totalPracticedSec)} · {dp.completed}/{dp.prescribed} concluídos
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <NumberField key={`c${dp.currentBpm}`} label="BPM atual" value={dp.currentBpm} onCommit={(v) => apply((p) => withDrill(p, drill.id, { currentBpm: clampBpm(v), goodStreak: 0 }))} />
        <NumberField key={`s${dp.startBpm}`} label="Inicial" value={dp.startBpm} onCommit={(v) => apply((p) => withDrill(p, drill.id, { startBpm: clampBpm(v) }))} />
        <NumberField key={`t${dp.targetBpm}`} label="Alvo" value={dp.targetBpm} onCommit={(v) => apply((p) => withDrill(p, drill.id, { targetBpm: clampBpm(v) }))} />
        <NumberField key={`p${dp.stepBpm}`} label="Passo" value={dp.stepBpm} onCommit={(v) => apply((p) => withDrill(p, drill.id, { stepBpm: Math.min(20, Math.max(1, v)) }))} />
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
        <Select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} aria-label="Minutos do treino livre" className="h-8 text-xs">
          {[5, 10, 15, 20, 30].map((m) => (
            <option key={m} value={m}>
              {m} min
            </option>
          ))}
        </Select>
        <Button size="sm" variant="primary" onClick={train} disabled={hasActive}>
          <Play size={13} /> Treinar este
        </Button>
        <Button size="sm" onClick={editPattern}>
          <PencilLine size={13} /> {custom ? 'Editar meu padrão' : 'Editar padrão'}
        </Button>
        {dp.customExerciseId && (
          <Button size="sm" variant="ghost" onClick={() => apply((p) => withDrill(p, drill.id, { customExerciseId: null }))}>
            <Undo2 size={13} /> Usar o original
          </Button>
        )}
      </div>
    </Panel>
  );
}
