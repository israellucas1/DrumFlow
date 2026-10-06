/**
 * Modelo de dados dos Planos de Estudo.
 *
 * Regra fundamental: a progressão é por SESSÕES CONCLUÍDAS (Dia 1, Dia 2...),
 * nunca por datas. Datas são guardadas só como histórico e não são lidas por
 * nenhuma regra de progressão.
 */
import type { Exercise } from '../music/types';

export type SkillId =
  | 'warmup'
  | 'singles'
  | 'doubles'
  | 'combinations'
  | 'paradiddle'
  | 'accents'
  | 'subdivisions'
  | 'coordination'
  | 'fills'
  | 'gospel'
  | 'test';

/** Exercício do programa (um "drill"), com instruções e prescrição de BPM. */
export interface Drill {
  id: string;
  name: string;
  skill: SkillId;
  /** Por que este exercício existe (objetivo técnico). */
  goal: string;
  /** Instruções técnicas curtas. */
  instructions: string[];
  /** Critério de sucesso para considerar o exercício bem executado. */
  success: string;
  bpm: { start: number; target: number; step: number };
  /** Padrão rítmico tocado na grade/metrônomo. */
  pattern: Exercise;
  /** Exercício de referência: o usuário registra o maior BPM tocado com controle. */
  test?: boolean;
}

export type BlockKind = 'warmup' | 'rudiments' | 'speed' | 'coordination' | 'subdivisions' | 'application' | 'evaluation';

export type DurationMin = 15 | 30 | 60 | 90;
export const DURATIONS: readonly DurationMin[] = [15, 30, 60, 90];

export interface PhaseInfo {
  id: number;
  name: string;
  goal: string;
}

/** Conteúdo planejado de um dia, em listas ordenadas por prioridade. */
export interface DayPlan {
  day: number;
  phase: number;
  title: string;
  focus: string;
  warmup: string[];
  rudiments: string[];
  speed: string[];
  coordination: string[];
  subdivisions: string[];
  application: string[];
  /** Dia com avaliação de referência (mesmos exercícios no Dia 1, 15 e 30). */
  tests?: boolean;
  /** Ciclo de consolidação (dias após o 30). */
  cycle?: number;
}

export type Rating = 'good' | 'ok' | 'hard';
export type BpmChoice = 'up' | 'keep' | 'down';

export type StepStatus = 'pending' | 'active' | 'done' | 'incomplete' | 'skipped';

/** Um passo da sessão: um exercício (ou a avaliação final) com tempo previsto. */
export interface SessionStep {
  index: number;
  kind: BlockKind;
  drillId: string | null;
  plannedSec: number;
  /** Tempo efetivamente tocado (metrônomo rodando), em segundos. Valor absoluto, não incremento. */
  practicedSec: number;
  status: StepStatus;
  /** Motivo pedagógico do exercício neste dia. */
  reason: string;
  bpmStart: number | null;
  bpmEnd: number | null;
  rating: Rating | null;
  bpmChoice: BpmChoice | null;
  /** Testes de referência: maior BPM tocado com controle (informado pelo usuário). */
  testBpm: number | null;
  /** Segundos já somados ao histórico do exercício (evita contar duas vezes). */
  appliedSec: number;
  /** O passo já entrou na contagem de prescritos do exercício. */
  counted: boolean;
  /** O passo já entrou na contagem de concluídos do exercício. */
  doneCounted: boolean;
  /** Quantas vezes o passo foi repetido nesta sessão. */
  rounds: number;
}

export type SessionStatus = 'not_started' | 'in_progress' | 'paused' | 'completed' | 'abandoned';
export type SessionMode = 'main' | 'repeat' | 'single';

export interface SessionEvaluation {
  precision: number; // 1–5 (autoavaliação)
  control: number; // 1–5 (autoavaliação)
  notes: string;
  difficulties: string;
}

export interface SessionRecord {
  id: string;
  /** Identificador sequencial da sessão (ordem em que foram iniciadas). */
  seq: number;
  /** Dia do programa (etapa), não uma data. */
  day: number;
  mode: SessionMode;
  durationMin: number;
  status: SessionStatus;
  steps: SessionStep[];
  current: number;
  /** Aguardando a autoavaliação do passo atual. */
  awaitingRating: boolean;
  evaluation: SessionEvaluation | null;
  /** Somente histórico (nunca usado para progressão). */
  startedAt: string | null;
  finishedAt: string | null;
}

export interface BpmLog {
  seq: number;
  day: number;
  bpm: number;
  rating: Rating;
}

export interface DrillProgress {
  drillId: string;
  currentBpm: number;
  /** Prescrição editável pelo usuário (sobrepõe a do programa). */
  startBpm: number;
  targetBpm: number;
  stepBpm: number;
  bestControlledBpm: number | null;
  /** Sessões seguidas avaliadas como "limpo e relaxado" no BPM atual. */
  goodStreak: number;
  totalPracticedSec: number;
  prescribed: number;
  completed: number;
  log: BpmLog[];
  tests: { seq: number; day: number; bpm: number }[];
  /** Padrão editado pelo usuário no editor (id em "Meus exercícios"). */
  customExerciseId: string | null;
}

export interface StudyProgress {
  version: 1;
  programId: string;
  /** Próximo dia da sequência principal. Só avança ao concluir uma sessão principal válida. */
  nextDay: number;
  completedDays: number[];
  preferredDuration: DurationMin;
  seqCounter: number;
  activeSession: SessionRecord | null;
  sessions: SessionRecord[];
  drills: Record<string, DrillProgress>;
  /** Somente para sincronização entre aparelhos (nunca para progressão). */
  updatedAt: number;
}
