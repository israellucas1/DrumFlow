/**
 * Regras da sessão de estudo, em funções puras (StudyProgress → StudyProgress).
 *
 * - O próximo dia vem de `nextDay`, que só avança quando uma sessão PRINCIPAL é
 *   concluída de forma válida. Nenhuma regra lê a data atual.
 * - Repetir um dia antigo (`repeat`) ou treinar um exercício solto (`single`)
 *   registra a prática e atualiza o BPM, mas não mexe na sequência principal.
 * - O tempo praticado de cada passo é um valor absoluto (não incremento) e só é
 *   somado ao histórico do exercício pela diferença ainda não aplicada — recarregar
 *   a página não conta nada duas vezes.
 */
import type {
  BpmChoice,
  DurationMin,
  Rating,
  SessionEvaluation,
  SessionMode,
  SessionRecord,
  SessionStep,
  StudyProgress,
} from './types';
import { PROGRAM_ID } from './program';
import { applyRating, getDrillProgress } from './progression';

/** Fração mínima do tempo de prática previsto para o dia contar como concluído. */
export const MIN_COMPLETION_RATIO = 0.7;
/** Concluir um exercício manualmente com pelo menos esta fração do tempo conta como "feito". */
export const STEP_DONE_RATIO = 0.8;

export class StudyRuleError extends Error {}

export function createProgress(): StudyProgress {
  return {
    version: 1,
    programId: PROGRAM_ID,
    nextDay: 1,
    completedDays: [],
    preferredDuration: 30,
    seqCounter: 0,
    activeSession: null,
    sessions: [],
    drills: {},
    updatedAt: 0,
  };
}

/** Ao carregar (página recarregada, app reaberto): sessão "em andamento" vira "pausada". */
export function normalizeLoaded(p: StudyProgress): StudyProgress {
  const s = p.activeSession;
  if (!s || s.status !== 'in_progress') return p;
  return { ...p, activeSession: { ...s, status: 'paused' } };
}

function withSession(p: StudyProgress, fn: (s: SessionRecord) => SessionRecord): StudyProgress {
  if (!p.activeSession) throw new StudyRuleError('Nenhuma sessão em andamento.');
  return { ...p, activeSession: fn(p.activeSession) };
}

function patchStep(s: SessionRecord, index: number, patch: Partial<SessionStep>): SessionRecord {
  return { ...s, steps: s.steps.map((st) => (st.index === index ? { ...st, ...patch } : st)) };
}

export function startSession(
  p: StudyProgress,
  o: { mode: SessionMode; day: number; durationMin: DurationMin | number; steps: SessionStep[]; now?: Date },
): StudyProgress {
  if (p.activeSession) throw new StudyRuleError('Já existe uma sessão em andamento. Continue ou encerre essa sessão primeiro.');
  if (o.mode === 'main' && o.day !== p.nextDay) throw new StudyRuleError(`A sequência principal está no Dia ${p.nextDay}.`);
  if (o.mode === 'repeat' && o.day >= p.nextDay) throw new StudyRuleError('Só é possível repetir dias já liberados.');
  const seq = p.seqCounter + 1;
  const session: SessionRecord = {
    id: `s${seq}`,
    seq,
    day: o.day,
    mode: o.mode,
    durationMin: o.durationMin,
    status: 'in_progress',
    steps: o.steps.map((st, i) => ({ ...st, index: i, status: i === 0 ? 'active' : 'pending' })),
    current: 0,
    awaitingRating: false,
    evaluation: null,
    startedAt: (o.now ?? new Date()).toISOString(),
    finishedAt: null,
  };
  return { ...p, seqCounter: seq, activeSession: session };
}

export function pauseSession(p: StudyProgress): StudyProgress {
  return withSession(p, (s) => ({ ...s, status: 'paused' }));
}

export function resumeSession(p: StudyProgress): StudyProgress {
  return withSession(p, (s) => ({ ...s, status: 'in_progress' }));
}

export function currentStep(s: SessionRecord): SessionStep {
  return s.steps[s.current];
}

/** Atualiza o tempo praticado do passo atual (valor absoluto; nunca diminui). */
export function recordPractice(p: StudyProgress, practicedSec: number, bpm?: number): StudyProgress {
  return withSession(p, (s) => {
    const st = currentStep(s);
    if (st.kind === 'evaluation' || st.status !== 'active') return s;
    return patchStep(s, st.index, {
      practicedSec: Math.max(st.practicedSec, Math.round(practicedSec * 10) / 10),
      bpmStart: st.bpmStart ?? bpm ?? null,
      bpmEnd: bpm ?? st.bpmEnd,
    });
  });
}

export function setStepBpm(p: StudyProgress, bpm: number): StudyProgress {
  return withSession(p, (s) => {
    const st = currentStep(s);
    return patchStep(s, st.index, { bpmStart: st.bpmStart ?? bpm, bpmEnd: bpm });
  });
}

/**
 * Encerra o passo atual. "time" = cronômetro do bloco acabou; "manual" = o usuário
 * concluiu antes (vira "incompleto" se tocou menos de 80% do previsto); "skip" = pulado.
 * Soma ao histórico do exercício apenas o tempo ainda não aplicado.
 */
export function finishStep(p: StudyProgress, how: 'time' | 'manual' | 'skip'): StudyProgress {
  const s = p.activeSession;
  if (!s) throw new StudyRuleError('Nenhuma sessão em andamento.');
  const st = currentStep(s);
  if (st.kind === 'evaluation' || st.status !== 'active') return p;
  const status: SessionStep['status'] =
    how === 'skip' ? 'skipped' : how === 'time' || st.practicedSec >= st.plannedSec * STEP_DONE_RATIO ? 'done' : 'incomplete';
  let drills = p.drills;
  if (st.drillId) {
    const dp = getDrillProgress(p, st.drillId);
    const delta = Math.max(0, st.practicedSec - st.appliedSec);
    drills = {
      ...drills,
      [st.drillId]: {
        ...dp,
        totalPracticedSec: dp.totalPracticedSec + delta,
        prescribed: dp.prescribed + (st.counted ? 0 : 1),
        completed: dp.completed + (status === 'done' && !st.doneCounted ? 1 : 0),
      },
    };
  }
  const session = patchStep(s, st.index, {
    status,
    appliedSec: st.practicedSec,
    counted: true,
    doneCounted: st.doneCounted || status === 'done',
  });
  const awaitingRating = how !== 'skip' && !!st.drillId && st.practicedSec > 0;
  const next: StudyProgress = { ...p, drills, activeSession: { ...session, awaitingRating } };
  // Sem nada para avaliar (pulado ou não tocado): segue direto para o próximo exercício.
  return awaitingRating ? next : advance(next);
}

/** Autoavaliação do passo que acabou de terminar (e decisão de BPM). */
export function rateStep(p: StudyProgress, r: { rating: Rating; choice: BpmChoice; testBpm?: number | null }): StudyProgress {
  const s = p.activeSession;
  if (!s || !s.awaitingRating) return p;
  const st = currentStep(s);
  if (!st.drillId) return p;
  const dp = getDrillProgress(p, st.drillId);
  const bpmUsed = st.bpmEnd ?? dp.currentBpm;
  const updated = applyRating(dp, { seq: s.seq, day: s.day, bpmUsed, rating: r.rating, choice: r.choice, testBpm: r.testBpm });
  const session = patchStep(s, st.index, { rating: r.rating, bpmChoice: r.choice, testBpm: r.testBpm ?? null });
  return { ...p, drills: { ...p.drills, [st.drillId]: updated }, activeSession: { ...session, awaitingRating: false } };
}

/** Vai para o próximo passo pendente (ou fica no resumo se não houver). */
export function advance(p: StudyProgress): StudyProgress {
  return withSession(p, (s) => {
    if (s.awaitingRating) return s;
    const next = s.steps.find((st) => st.status === 'pending');
    if (!next) return s;
    return { ...patchStep(s, next.index, { status: 'active' }), current: next.index };
  });
}

/** Repetir um exercício da sessão (ex.: a partir do resumo). O tempo continua somando. */
export function reopenStep(p: StudyProgress, index: number): StudyProgress {
  return withSession(p, (s) => {
    const st = s.steps[index];
    if (!st || st.kind === 'evaluation') return s;
    return { ...patchStep(s, index, { status: 'active', rounds: st.rounds + 1 }), current: index, awaitingRating: false };
  });
}

export function submitEvaluation(p: StudyProgress, ev: SessionEvaluation): StudyProgress {
  return withSession(p, (s) => {
    const evalStep = s.steps.find((st) => st.kind === 'evaluation');
    const next = { ...s, evaluation: { ...ev, notes: ev.notes.slice(0, 2000), difficulties: ev.difficulties.slice(0, 2000) } };
    return evalStep ? { ...patchStep(next, evalStep.index, { status: 'done' }), current: evalStep.index } : next;
  });
}

export type SessionStage = 'practice' | 'rating' | 'evaluation' | 'summary';

export function sessionStage(s: SessionRecord): SessionStage {
  if (s.awaitingRating) return 'rating';
  const st = currentStep(s);
  if (st.status === 'active' && st.kind !== 'evaluation') return 'practice';
  const practicePending = s.steps.some((x) => x.kind !== 'evaluation' && (x.status === 'pending' || x.status === 'active'));
  if (practicePending) return 'practice';
  if (!s.evaluation) return 'evaluation';
  return 'summary';
}

export interface CompletionCheck {
  ok: boolean;
  reasons: string[];
  practicedSec: number;
  plannedPracticeSec: number;
  ratio: number;
}

export function completionCheck(s: SessionRecord): CompletionCheck {
  const practiceSteps = s.steps.filter((x) => x.kind !== 'evaluation');
  const practicedSec = practiceSteps.reduce((a, x) => a + Math.min(x.practicedSec, x.plannedSec), 0);
  const plannedPracticeSec = practiceSteps.reduce((a, x) => a + x.plannedSec, 0);
  const ratio = plannedPracticeSec ? practicedSec / plannedPracticeSec : 0;
  const reasons: string[] = [];
  const open = practiceSteps.filter((x) => x.status === 'pending' || x.status === 'active').length;
  if (open) reasons.push(`${open} exercício(s) ainda não foram feitos ou pulados.`);
  if (s.awaitingRating) reasons.push('Falta avaliar o último exercício.');
  if (!s.evaluation) reasons.push('Falta preencher a avaliação da sessão.');
  if (ratio < MIN_COMPLETION_RATIO) {
    reasons.push(`Foram tocados ${Math.round(ratio * 100)}% do tempo previsto; o mínimo é ${Math.round(MIN_COMPLETION_RATIO * 100)}%.`);
  }
  return { ok: reasons.length === 0, reasons, practicedSec, plannedPracticeSec, ratio };
}

/** Conclui a sessão. Só a sessão principal avança a sequência (para o dia seguinte ao concluído). */
export function completeSession(p: StudyProgress, now?: Date): StudyProgress {
  const s = p.activeSession;
  if (!s) throw new StudyRuleError('Nenhuma sessão em andamento.');
  const check = completionCheck(s);
  if (!check.ok) throw new StudyRuleError(check.reasons.join(' '));
  const done: SessionRecord = { ...s, status: 'completed', finishedAt: (now ?? new Date()).toISOString() };
  const advancesMain = s.mode === 'main' && s.day === p.nextDay;
  return {
    ...p,
    activeSession: null,
    sessions: [...p.sessions, done],
    nextDay: advancesMain ? p.nextDay + 1 : p.nextDay,
    completedDays: advancesMain ? [...p.completedDays, s.day] : p.completedDays,
  };
}

/** Encerra sem concluir: fica no histórico como "interrompida"; a sequência não avança. */
export function abandonSession(p: StudyProgress, now?: Date): StudyProgress {
  const s = p.activeSession;
  if (!s) return p;
  // Garante que o tempo do passo em andamento entre no histórico do exercício.
  let q = p;
  if (currentStep(s).status === 'active' && currentStep(s).kind !== 'evaluation') q = finishStep(q, 'manual');
  const closed: SessionRecord = { ...q.activeSession!, status: 'abandoned', awaitingRating: false, finishedAt: (now ?? new Date()).toISOString() };
  return { ...q, activeSession: null, sessions: [...q.sessions, closed] };
}

export function sessionPracticedSec(s: SessionRecord): number {
  return s.steps.reduce((a, x) => a + x.practicedSec, 0);
}

export function setPreferredDuration(p: StudyProgress, d: DurationMin): StudyProgress {
  return { ...p, preferredDuration: d };
}
