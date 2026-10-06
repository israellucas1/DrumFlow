import { describe, expect, it } from 'vitest';
import { ALL_PROGRAM_DAYS, dayPlan } from '../study/program';
import { DRILLS, DRILL_BY_ID, REF_DRILLS } from '../study/drills';
import { buildSessionSteps, buildSingleDrillSteps, TEMPLATES, totalPlannedSec } from '../study/sessionPlan';
import {
  abandonSession,
  advance,
  completeSession,
  completionCheck,
  createProgress,
  finishStep,
  normalizeLoaded,
  rateStep,
  recordPractice,
  reopenStep,
  sessionStage,
  startSession,
  submitEvaluation,
  StudyRuleError,
} from '../study/sessionMachine';
import { applyRating, defaultDrillProgress, needsReview, recommend } from '../study/progression';
import { computeMetrics } from '../study/metrics';
import { DURATIONS, type DurationMin, type StudyProgress } from '../study/types';
import { barLengthInQuarters } from '../music/timeSignature';
import { isOnGrid } from '../music/beatMath';

const EVAL = { precision: 4, control: 4, notes: '', difficulties: '' };

/** Joga uma sessão inteira: toca `fraction` do tempo de cada exercício e avalia. */
function playSession(p: StudyProgress, fraction = 1, rating: 'good' | 'ok' | 'hard' = 'good'): StudyProgress {
  let q = p;
  for (let guard = 0; guard < 50; guard++) {
    const s = q.activeSession!;
    const stage = sessionStage(s);
    if (stage === 'practice') {
      const st = s.steps[s.current];
      q = recordPractice(q, st.plannedSec * fraction, DRILL_BY_ID[st.drillId!].bpm.start);
      q = finishStep(q, fraction >= 1 ? 'time' : 'manual');
    } else if (stage === 'rating') {
      q = rateStep(q, { rating, choice: 'keep' });
      q = advance(q);
    } else if (stage === 'evaluation') {
      q = submitEvaluation(q, EVAL);
    } else return q;
  }
  throw new Error('sessão não terminou');
}

function startMain(p: StudyProgress, d: DurationMin = 15) {
  return startSession(p, { mode: 'main', day: p.nextDay, durationMin: d, steps: buildSessionSteps(dayPlan(p.nextDay), d) });
}

describe('programa de 30 dias', () => {
  it('tem 30 dias em 6 fases de 5', () => {
    expect(ALL_PROGRAM_DAYS).toHaveLength(30);
    for (let ph = 1; ph <= 6; ph++) expect(ALL_PROGRAM_DAYS.filter((d) => d.phase === ph)).toHaveLength(5);
  });

  it('todos os exercícios citados existem', () => {
    for (const d of ALL_PROGRAM_DAYS) {
      for (const id of [...d.warmup, ...d.rudiments, ...d.speed, ...d.coordination, ...d.subdivisions, ...d.application]) {
        expect(DRILL_BY_ID[id], `Dia ${d.day}: ${id}`).toBeDefined();
      }
    }
  });

  it('nenhuma sessão completa se repete nos 30 dias', () => {
    for (const dur of DURATIONS) {
      const keys = ALL_PROGRAM_DAYS.map((d) => buildSessionSteps(d, dur).map((s) => s.drillId).join(','));
      expect(new Set(keys).size).toBe(30);
    }
  });

  it('exercícios importantes se repetem de forma planejada', () => {
    const count = (id: string) => ALL_PROGRAM_DAYS.filter((d) => buildSessionSteps(d, 60).some((s) => s.drillId === id)).length;
    expect(count('singles-16')).toBeGreaterThanOrEqual(5);
    expect(count('gospel-rlrlkk')).toBeGreaterThanOrEqual(4);
  });

  it('Dias 1, 15 e 30 têm os mesmos testes de referência', () => {
    for (const day of [1, 15, 30]) {
      for (const dur of DURATIONS) {
        const ids = buildSessionSteps(dayPlan(day), dur).map((s) => s.drillId);
        for (const ref of REF_DRILLS) expect(ids).toContain(ref);
      }
    }
  });

  it('continua depois do Dia 30 com ciclos de consolidação', () => {
    const d31 = dayPlan(31);
    expect(d31.cycle).toBe(1);
    expect(d31.title).toMatch(/Consolidação 1/);
    expect(dayPlan(45).cycle).toBe(2);
    expect(buildSessionSteps(dayPlan(40), 30).length).toBeGreaterThan(0);
  });

  it('padrões dos exercícios são válidos (na grade e dentro do compasso)', () => {
    for (const d of DRILLS) {
      const ex = d.pattern;
      const barLen = barLengthInQuarters(ex.tempoSignature);
      expect(ex.events.length, d.id).toBeGreaterThan(0);
      for (const e of ex.events) {
        expect(e.beatPosition, d.id).toBeLessThan(barLen);
        expect(e.barIndex, d.id).toBeLessThan(ex.totalBars);
        expect(isOnGrid(e.beatPosition, ex.subdivision), `${d.id} @${e.barIndex}:${e.beatPosition}`).toBe(true);
      }
      expect(d.bpm.start).toBeLessThan(d.bpm.target);
    }
  });
});

describe('montagem da sessão', () => {
  it('a soma dos blocos é exatamente a duração escolhida (todos os dias)', () => {
    for (const dur of DURATIONS) {
      expect(TEMPLATES[dur].reduce((a, b) => a + b.min, 0)).toBe(dur);
      for (const d of ALL_PROGRAM_DAYS) expect(totalPlannedSec(buildSessionSteps(d, dur))).toBe(dur * 60);
    }
    expect(totalPlannedSec(buildSingleDrillSteps('singles-16', 10))).toBe(600);
  });

  it('durações maiores não são só multiplicação: têm blocos e exercícios a mais', () => {
    const d = dayPlan(10);
    const kinds = (dur: DurationMin) => new Set(buildSessionSteps(d, dur).map((s) => s.kind));
    expect(kinds(15).has('speed')).toBe(false);
    expect(kinds(90).has('speed')).toBe(true);
    expect(kinds(60).has('subdivisions')).toBe(true);
    expect(buildSessionSteps(d, 90).length).toBeGreaterThan(buildSessionSteps(d, 15).length);
  });

  it('inclui revisão quando o desempenho pede (só em sessões de 30 min ou mais)', () => {
    const ids = (dur: DurationMin) => buildSessionSteps(dayPlan(12), dur, ['para-inverted']).map((s) => s.drillId);
    expect(ids(15)).not.toContain('para-inverted');
    expect(ids(30)).toContain('para-inverted');
  });
});

describe('progressão por sessões, nunca por datas', () => {
  it('completa o Dia 1 e libera o Dia 2', () => {
    let p = startMain(createProgress());
    p = playSession(p);
    p = completeSession(p);
    expect(p.nextDay).toBe(2);
    expect(p.completedDays).toEqual([1]);
    expect(p.activeSession).toBeNull();
  });

  it('dias (de calendário) sem treino não mudam o próximo treino', () => {
    let p = completeSession(playSession(startMain(createProgress()), 1), new Date('2026-01-05'));
    const before = p.nextDay;
    // "Volta 3 dias depois": nada no estado depende da data; iniciar de novo pega o Dia 2.
    p = startSession(p, { mode: 'main', day: p.nextDay, durationMin: 15, steps: buildSessionSteps(dayPlan(p.nextDay), 15), now: new Date('2026-01-08') });
    expect(p.activeSession!.day).toBe(before);
    expect(before).toBe(2);
  });

  it('não permite pular dias na sequência principal', () => {
    const p = createProgress();
    expect(() => startSession(p, { mode: 'main', day: 3, durationMin: 15, steps: buildSessionSteps(dayPlan(3), 15) })).toThrow(StudyRuleError);
  });

  it('sessão incompleta não conta como concluída', () => {
    let p = startMain(createProgress());
    p = playSession(p, 0.3); // tocou só 30% de cada exercício
    const check = completionCheck(p.activeSession!);
    expect(check.ok).toBe(false);
    expect(() => completeSession(p)).toThrow(StudyRuleError);
    expect(p.nextDay).toBe(1);
  });

  it('encerrar sem concluir mantém o mesmo dia e guarda o histórico', () => {
    let p = startMain(createProgress());
    p = recordPractice(p, 60, 60);
    p = abandonSession(p);
    expect(p.nextDay).toBe(1);
    expect(p.sessions[0].status).toBe('abandoned');
    expect(p.drills['warm-singles-8'].totalPracticedSec).toBe(60); // a prática real fica registrada
  });

  it('repetir um dia antigo não mexe na sequência principal', () => {
    let p = completeSession(playSession(startMain(createProgress())));
    p = completeSession(playSession(startMain(p)));
    expect(p.nextDay).toBe(3);
    p = startSession(p, { mode: 'repeat', day: 1, durationMin: 15, steps: buildSessionSteps(dayPlan(1), 15) });
    p = completeSession(playSession(p));
    expect(p.nextDay).toBe(3);
    expect(p.completedDays).toEqual([1, 2]);
    expect(p.sessions).toHaveLength(3);
  });

  it('não repete dias ainda bloqueados', () => {
    expect(() =>
      startSession(createProgress(), { mode: 'repeat', day: 5, durationMin: 15, steps: buildSessionSteps(dayPlan(5), 15) }),
    ).toThrow(StudyRuleError);
  });

  it('recarregar a página: sessão vira pausada e nada é contado duas vezes', () => {
    let p = startMain(createProgress());
    p = recordPractice(p, 50, 60);
    // simula salvar/recarregar: JSON ida e volta + normalização
    p = normalizeLoaded(JSON.parse(JSON.stringify(p)));
    expect(p.activeSession!.status).toBe('paused');
    // o app retoma: base = 50 s já salvos; o novo trecho soma a partir daí
    p = recordPractice(p, 50 + 70, 60);
    p = finishStep(p, 'time');
    expect(p.drills['warm-singles-8'].totalPracticedSec).toBe(120);
    // recarregar de novo depois de concluir o passo não soma outra vez
    p = normalizeLoaded(JSON.parse(JSON.stringify(p)));
    p = finishStep(p, 'time'); // passo já encerrado: sem efeito
    expect(p.drills['warm-singles-8'].totalPracticedSec).toBe(120);
  });

  it('concluir antes do tempo marca o exercício como incompleto', () => {
    let p = startMain(createProgress());
    const planned = p.activeSession!.steps[0].plannedSec;
    p = recordPractice(p, planned * 0.5, 60);
    p = finishStep(p, 'manual');
    expect(p.activeSession!.steps[0].status).toBe('incomplete');
  });

  it('repetir um exercício na mesma sessão soma tempo sem duplicar a conclusão', () => {
    let p = startMain(createProgress());
    p = playSession(p);
    p = reopenStep(p, 1);
    const st = p.activeSession!.steps[1];
    p = recordPractice(p, st.practicedSec + 30, 60);
    p = finishStep(p, 'time');
    p = rateStep(p, { rating: 'good', choice: 'keep' });
    const dp = p.drills[st.drillId!];
    expect(dp.completed).toBe(1);
    expect(dp.totalPracticedSec).toBe(st.plannedSec + 30);
    expect(sessionStage(advance(p).activeSession!)).toBe('summary');
  });

  it('só uma sessão ativa por vez', () => {
    const p = startMain(createProgress());
    expect(() => startMain(p)).toThrow(StudyRuleError);
  });
});

describe('BPM por exercício', () => {
  const drill = DRILL_BY_ID['singles-16'];

  it('sobe só depois de execuções limpas seguidas', () => {
    let dp = defaultDrillProgress(drill);
    const r1 = recommend(dp, 60, 'good');
    expect(r1.choice).toBe('keep');
    dp = applyRating(dp, { seq: 1, day: 1, bpmUsed: 60, rating: 'good', choice: r1.choice });
    const r2 = recommend(dp, 60, 'good');
    expect(r2.choice).toBe('up');
    dp = applyRating(dp, { seq: 2, day: 2, bpmUsed: 60, rating: 'good', choice: r2.choice });
    expect(dp.currentBpm).toBe(64);
    expect(dp.bestControlledBpm).toBe(60);
  });

  it('reduz quando difícil e mantém quando "ok"', () => {
    const dp = { ...defaultDrillProgress(drill), currentBpm: 80 };
    expect(recommend(dp, 80, 'hard')).toMatchObject({ choice: 'down', bpm: 76 });
    expect(recommend(dp, 80, 'ok')).toMatchObject({ choice: 'keep', bpm: 80 });
  });

  it('concluir um dia NÃO aumenta o BPM sozinho', () => {
    let p = completeSession(playSession(startMain(createProgress()), 1, 'ok'));
    p = completeSession(playSession(startMain(p), 1, 'ok'));
    expect(p.drills['warm-singles-8'].currentBpm).toBe(DRILL_BY_ID['warm-singles-8'].bpm.start);
  });

  it('registra o BPM dos testes de referência e compara Dia 1 com o mais recente', () => {
    let p = startMain(createProgress());
    // aquecimento
    p = finishStep(recordPractice(p, 120, 60), 'time');
    p = advance(rateStep(p, { rating: 'good', choice: 'keep' }));
    // primeiro teste (singles): usuário informa 92 BPM
    p = finishStep(recordPractice(p, 75, 80), 'time');
    p = rateStep(p, { rating: 'good', choice: 'keep', testBpm: 92 });
    expect(p.drills['ref-singles'].tests).toEqual([{ seq: 1, day: 1, bpm: 92 }]);
    const m = computeMetrics(p);
    expect(m.tests.find((t) => t.drillId === 'ref-singles')!.first).toEqual({ day: 1, bpm: 92 });
  });

  it('marca para revisão quando difícil', () => {
    const dp = applyRating(defaultDrillProgress(drill), { seq: 1, day: 1, bpmUsed: 60, rating: 'hard', choice: 'down' });
    expect(needsReview(dp)).toBe(true);
  });
});

describe('métricas', () => {
  it('somam o tempo realmente praticado, sem inventar dados', () => {
    let p = completeSession(playSession(startMain(createProgress())));
    const m = computeMetrics(p);
    expect(m.sessionsCompleted).toBe(1);
    expect(m.totalPracticedSec).toBe(14 * 60); // 15 min - 1 min de avaliação
    expect(m.evaluations).toHaveLength(1);
    p = createProgress();
    expect(computeMetrics(p).totalPracticedSec).toBe(0);
    expect(computeMetrics(p).tests.every((t) => t.first === null)).toBe(true);
  });
});
