/**
 * Métricas derivadas SOMENTE do que foi registrado: tempo com o metrônomo rodando,
 * BPM usado e autoavaliações. Nada aqui é "medido" a partir do som tocado.
 */
import type { BpmLog, SkillId, StudyProgress } from './types';
import { DRILL_BY_ID, REF_DRILLS, SKILL_LABELS } from './drills';
import { dayPlan, PHASES, PROGRAM_DAYS } from './program';
import { needsReview } from './progression';

export interface DrillMetric {
  drillId: string;
  name: string;
  skill: SkillId;
  currentBpm: number;
  bestControlledBpm: number | null;
  targetBpm: number;
  practicedSec: number;
  prescribed: number;
  completed: number;
  completionRate: number | null;
  needsReview: boolean;
  log: BpmLog[];
}

export interface StudyMetrics {
  sessionsCompleted: number;
  sessionsAbandoned: number;
  mainDaysCompleted: number;
  totalPracticedSec: number;
  bySkill: { skill: SkillId; label: string; sec: number }[];
  drills: DrillMetric[];
  review: DrillMetric[];
  evaluations: { seq: number; day: number; precision: number; control: number }[];
  phasesCompleted: number[];
  nextDay: number;
  nextFocus: string;
  tests: { drillId: string; name: string; first: { day: number; bpm: number } | null; latest: { day: number; bpm: number } | null }[];
}

export function computeMetrics(p: StudyProgress): StudyMetrics {
  const drills: DrillMetric[] = Object.values(p.drills)
    .filter((d) => DRILL_BY_ID[d.drillId])
    .map((d) => ({
      drillId: d.drillId,
      name: DRILL_BY_ID[d.drillId].name,
      skill: DRILL_BY_ID[d.drillId].skill,
      currentBpm: d.currentBpm,
      bestControlledBpm: d.bestControlledBpm,
      targetBpm: d.targetBpm,
      practicedSec: d.totalPracticedSec,
      prescribed: d.prescribed,
      completed: d.completed,
      completionRate: d.prescribed ? d.completed / d.prescribed : null,
      needsReview: needsReview(d),
      log: d.log,
    }))
    .sort((a, b) => b.practicedSec - a.practicedSec);

  const skillSec = new Map<SkillId, number>();
  for (const d of drills) skillSec.set(d.skill, (skillSec.get(d.skill) ?? 0) + d.practicedSec);

  const completedSet = new Set(p.completedDays);
  const phasesCompleted = PHASES.filter((ph) => {
    for (let d = (ph.id - 1) * 5 + 1; d <= ph.id * 5; d++) if (!completedSet.has(d)) return false;
    return true;
  }).map((ph) => ph.id);

  const tests = REF_DRILLS.map((id) => {
    const t = p.drills[id]?.tests ?? [];
    return {
      drillId: id,
      name: DRILL_BY_ID[id].name,
      first: t.length ? { day: t[0].day, bpm: t[0].bpm } : null,
      latest: t.length > 1 ? { day: t[t.length - 1].day, bpm: t[t.length - 1].bpm } : null,
    };
  });

  return {
    sessionsCompleted: p.sessions.filter((s) => s.status === 'completed').length,
    sessionsAbandoned: p.sessions.filter((s) => s.status === 'abandoned').length,
    mainDaysCompleted: p.completedDays.length,
    totalPracticedSec: drills.reduce((a, d) => a + d.practicedSec, 0),
    bySkill: [...skillSec.entries()]
      .filter(([, sec]) => sec > 0)
      .map(([skill, sec]) => ({ skill, label: SKILL_LABELS[skill], sec }))
      .sort((a, b) => b.sec - a.sec),
    drills,
    review: drills.filter((d) => d.needsReview && !DRILL_BY_ID[d.drillId].test),
    evaluations: p.sessions
      .filter((s) => s.status === 'completed' && s.evaluation)
      .map((s) => ({ seq: s.seq, day: s.day, precision: s.evaluation!.precision, control: s.evaluation!.control })),
    phasesCompleted,
    nextDay: p.nextDay,
    nextFocus: dayPlan(p.nextDay).focus,
    tests,
  };
}

export function formatDuration(sec: number): string {
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h) return `${h} h ${String(m).padStart(2, '0')} min`;
  if (m) return `${m} min${r ? ` ${String(r).padStart(2, '0')} s` : ''}`;
  return `${r} s`;
}

export const programProgress = (p: StudyProgress) => Math.min(1, p.completedDays.filter((d) => d <= PROGRAM_DAYS).length / PROGRAM_DAYS);
