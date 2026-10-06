import type { BpmChoice, Drill, DrillProgress, Rating, StudyProgress } from './types';
import { DRILL_BY_ID } from './drills';
import { MAX_BPM, MIN_BPM, clampBpm } from '../music/beatMath';

/**
 * Progressão de BPM por exercício, independente do número do dia.
 * O app não mede a precisão (não há detecção de golpes): tudo parte da
 * autoavaliação do usuário, e é apresentado como tal.
 *
 * Regra sugerida (ajustável pelo usuário a cada avaliação):
 *  - "limpo e relaxado" em 2 sessões seguidas no mesmo BPM → subir um passo;
 *  - "ok, com pequenos erros" → manter e consolidar;
 *  - "difícil / tenso" → reduzir um passo.
 */
export const GOOD_SESSIONS_TO_ADVANCE = 2;

export const RATING_LABELS: Record<Rating, { title: string; hint: string }> = {
  good: { title: 'Limpo e relaxado', hint: 'Regular, sem tensão, no tempo do começo ao fim.' },
  ok: { title: 'Ok, com pequenos erros', hint: 'Funcionou, mas ainda escapou às vezes.' },
  hard: { title: 'Difícil ou tenso', hint: 'Perdi o tempo, errei a sequência ou senti tensão.' },
};

export function defaultDrillProgress(drill: Drill): DrillProgress {
  return {
    drillId: drill.id,
    currentBpm: drill.bpm.start,
    startBpm: drill.bpm.start,
    targetBpm: drill.bpm.target,
    stepBpm: drill.bpm.step,
    bestControlledBpm: null,
    goodStreak: 0,
    totalPracticedSec: 0,
    prescribed: 0,
    completed: 0,
    log: [],
    tests: [],
    customExerciseId: null,
  };
}

export function getDrillProgress(p: StudyProgress, drillId: string): DrillProgress {
  return p.drills[drillId] ?? defaultDrillProgress(DRILL_BY_ID[drillId]);
}

export interface Recommendation {
  choice: BpmChoice;
  bpm: number;
  reason: string;
}

export function bpmForChoice(dp: DrillProgress, bpmUsed: number, choice: BpmChoice): number {
  if (choice === 'up') return clampBpm(Math.min(MAX_BPM, bpmUsed + dp.stepBpm));
  if (choice === 'down') return clampBpm(Math.max(MIN_BPM, bpmUsed - dp.stepBpm));
  return clampBpm(bpmUsed);
}

export function recommend(dp: DrillProgress, bpmUsed: number, rating: Rating): Recommendation {
  if (rating === 'hard') {
    return { choice: 'down', bpm: bpmForChoice(dp, bpmUsed, 'down'), reason: 'Reduza o andamento e consolide a técnica antes de subir.' };
  }
  if (rating === 'ok') {
    return { choice: 'keep', bpm: bpmUsed, reason: 'Mantenha este andamento até soar limpo e relaxado.' };
  }
  if (bpmUsed >= dp.targetBpm) {
    return { choice: 'keep', bpm: bpmUsed, reason: 'Alvo atingido. Mantenha para consolidar ou aumente o alvo nas configurações do exercício.' };
  }
  const streak = dp.goodStreak + 1;
  if (streak >= GOOD_SESSIONS_TO_ADVANCE) {
    return {
      choice: 'up',
      bpm: bpmForChoice(dp, bpmUsed, 'up'),
      reason: `${streak} execuções limpas seguidas: pode subir ${dp.stepBpm} BPM.`,
    };
  }
  return { choice: 'keep', bpm: bpmUsed, reason: 'Boa execução. Mais uma vez limpa neste andamento e o BPM sobe.' };
}

/** Aplica a autoavaliação de um passo ao histórico do exercício. */
export function applyRating(
  dp: DrillProgress,
  r: { seq: number; day: number; bpmUsed: number; rating: Rating; choice: BpmChoice; testBpm?: number | null },
): DrillProgress {
  const best = r.rating === 'good' ? Math.max(dp.bestControlledBpm ?? 0, r.bpmUsed) : dp.bestControlledBpm ?? 0;
  const tested = r.testBpm ? Math.max(best, r.testBpm) : best;
  return {
    ...dp,
    currentBpm: bpmForChoice(dp, r.bpmUsed, r.choice),
    bestControlledBpm: tested > 0 ? tested : null,
    goodStreak: r.rating === 'good' && r.choice !== 'up' ? dp.goodStreak + 1 : 0,
    log: [...dp.log, { seq: r.seq, day: r.day, bpm: r.bpmUsed, rating: r.rating }].slice(-200),
    tests: r.testBpm ? [...dp.tests, { seq: r.seq, day: r.day, bpm: r.testBpm }] : dp.tests,
  };
}

/** Exercício que o desempenho recente indica para revisão. */
export function needsReview(dp: DrillProgress): boolean {
  const last = dp.log.slice(-2);
  if (last.length && last[last.length - 1].rating === 'hard') return true;
  if (last.length === 2 && last.every((l) => l.rating === 'ok')) return true;
  return dp.prescribed >= 2 && dp.completed / dp.prescribed < 0.5;
}

export function reviewDrillIds(p: StudyProgress): string[] {
  return Object.values(p.drills)
    .filter((d) => DRILL_BY_ID[d.drillId] && !DRILL_BY_ID[d.drillId].test && needsReview(d))
    .sort((a, b) => (b.log.at(-1)?.seq ?? 0) - (a.log.at(-1)?.seq ?? 0))
    .map((d) => d.drillId);
}
