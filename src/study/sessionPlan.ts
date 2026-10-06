import type { BlockKind, DayPlan, DurationMin, SessionStep } from './types';
import { REF_DRILLS } from './drills';

/**
 * Estrutura de cada duração. Não é a mesma sessão multiplicada: durações maiores
 * ganham blocos próprios (velocidade, subdivisões) e mais exercícios por bloco.
 * A soma dos minutos é exatamente a duração escolhida.
 */
export const TEMPLATES: Record<DurationMin, readonly { kind: BlockKind; min: number }[]> = {
  15: [
    { kind: 'warmup', min: 2 },
    { kind: 'rudiments', min: 5 },
    { kind: 'coordination', min: 4 },
    { kind: 'application', min: 3 },
    { kind: 'evaluation', min: 1 },
  ],
  30: [
    { kind: 'warmup', min: 4 },
    { kind: 'rudiments', min: 10 },
    { kind: 'coordination', min: 6 },
    { kind: 'application', min: 7 },
    { kind: 'evaluation', min: 3 },
  ],
  60: [
    { kind: 'warmup', min: 5 },
    { kind: 'rudiments', min: 15 },
    { kind: 'coordination', min: 10 },
    { kind: 'subdivisions', min: 10 },
    { kind: 'application', min: 15 },
    { kind: 'evaluation', min: 5 },
  ],
  90: [
    { kind: 'warmup', min: 8 },
    { kind: 'rudiments', min: 20 },
    { kind: 'speed', min: 15 },
    { kind: 'coordination', min: 12 },
    { kind: 'subdivisions', min: 10 },
    { kind: 'application', min: 20 },
    { kind: 'evaluation', min: 5 },
  ],
};

export const BLOCK_LABELS: Record<BlockKind, string> = {
  warmup: 'Aquecimento',
  rudiments: 'Rudimentos',
  speed: 'Velocidade e controle',
  coordination: 'Coordenação e controle',
  subdivisions: 'Subdivisões e acentos',
  application: 'Aplicação musical',
  evaluation: 'Avaliação e registro',
};

const PURPOSE: Record<BlockKind, string> = {
  warmup: 'Aquecer antes de exigir precisão.',
  rudiments: 'Técnica principal do dia.',
  speed: 'Velocidade em rajadas curtas, com recuperação lenta entre elas.',
  coordination: 'Coordenação, controle e independência.',
  subdivisions: 'Trocar subdivisões e posicionar acentos.',
  application: 'Levar a técnica para a bateria, em contexto musical.',
  evaluation: 'Registrar como foi a sessão.',
};

/** Tempo mínimo razoável por exercício dentro de um bloco. */
const MIN_PER_DRILL = 4;

function contentFor(kind: BlockKind, plan: DayPlan): string[] {
  switch (kind) {
    case 'warmup':
      return plan.warmup;
    case 'rudiments':
      return plan.rudiments;
    case 'speed':
      return plan.speed.length ? plan.speed : plan.rudiments.slice(0, 1);
    case 'coordination':
      return plan.coordination;
    case 'subdivisions':
      return plan.subdivisions.length ? plan.subdivisions : plan.coordination.slice(1);
    case 'application':
      return plan.application;
    case 'evaluation':
      return [];
  }
}

/** Divide `total` segundos em `n` partes inteiras (múltiplos de 5 s) que somam exatamente `total`. */
export function splitSeconds(total: number, n: number): number[] {
  const base = Math.floor(total / n / 5) * 5;
  const parts = Array.from({ length: n }, () => base);
  parts[0] += total - base * n;
  return parts;
}

function newStep(index: number, kind: BlockKind, drillId: string | null, plannedSec: number, reason: string): SessionStep {
  return {
    index,
    kind,
    drillId,
    plannedSec,
    practicedSec: 0,
    status: 'pending',
    reason,
    bpmStart: null,
    bpmEnd: null,
    rating: null,
    bpmChoice: null,
    testBpm: null,
    appliedSec: 0,
    counted: false,
    doneCounted: false,
    rounds: 1,
  };
}

/**
 * Monta os passos da sessão de um dia para a duração escolhida.
 * `reviewDrills`: exercícios que o desempenho indicou para revisão (entram no bloco de
 * rudimentos em sessões de 30 min ou mais, depois do rudimento principal do dia).
 */
export function buildSessionSteps(plan: DayPlan, duration: DurationMin, reviewDrills: readonly string[] = []): SessionStep[] {
  const steps: SessionStep[] = [];
  for (const block of TEMPLATES[duration]) {
    const total = block.min * 60;
    if (block.kind === 'evaluation') {
      steps.push(newStep(steps.length, 'evaluation', null, total, PURPOSE.evaluation));
      continue;
    }
    let list = contentFor(block.kind, plan);
    const reviewSet = new Set<string>();
    if (block.kind === 'rudiments' && plan.tests) {
      list = [...REF_DRILLS]; // dia de teste: sempre os mesmos 4 exercícios de referência
    } else if (block.kind === 'rudiments' && duration >= 30 && reviewDrills.length) {
      const extra = reviewDrills.filter((d) => !list.includes(d)).slice(0, duration >= 60 ? 2 : 1);
      extra.forEach((d) => reviewSet.add(d));
      list = [...list.slice(0, 1), ...extra, ...list.slice(1)];
    }
    const count = plan.tests && block.kind === 'rudiments' ? list.length : Math.min(list.length, Math.max(1, Math.floor(block.min / MIN_PER_DRILL)));
    const chosen = list.slice(0, Math.max(1, count));
    const secs = splitSeconds(total, chosen.length);
    chosen.forEach((drillId, i) => {
      const reason = reviewSet.has(drillId)
        ? `Revisão: na última vez este exercício precisou de mais consolidação. ${PURPOSE[block.kind]}`
        : plan.tests && block.kind === 'rudiments'
          ? 'Teste de referência (mesmos exercícios nos Dias 1, 15 e 30) para medir a evolução real.'
          : PURPOSE[block.kind];
      steps.push(newStep(steps.length, block.kind, drillId, secs[i], reason));
    });
  }
  return steps;
}

/** Treino livre de um único exercício (não conta para a sequência principal). */
export function buildSingleDrillSteps(drillId: string, minutes: number): SessionStep[] {
  const total = Math.max(2, Math.round(minutes)) * 60;
  return [
    newStep(0, 'rudiments', drillId, total - 60, 'Treino livre escolhido por você.'),
    newStep(1, 'evaluation', null, 60, PURPOSE.evaluation),
  ];
}

export function totalPlannedSec(steps: readonly SessionStep[]): number {
  return steps.reduce((a, s) => a + s.plannedSec, 0);
}
