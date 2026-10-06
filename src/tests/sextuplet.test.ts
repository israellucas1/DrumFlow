import { describe, expect, it } from 'vitest';
import { formatPosition, gridPositionsInBar, isOnGrid, snapToGrid } from '../music/beatMath';
import { buildTimeline } from '../music/timeline';
import { countOffGridEvents, quantizeEvents } from '../music/quantization';
import { addEvent, copyEvents, createBlankExercise, moveEventsBySteps, pasteEvents, quantizeExercise } from '../music/exerciseOps';
import { sanitizeExercise } from '../music/validation';
import { Transport } from '../transport/Transport';
import type { Exercise, Limb } from '../music/types';
import { advance, FakeSink, ManualTimer } from './helpers';

const ts44 = { numerator: 4, denominator: 4 };

/** 1 compasso 4/4 com as 24 sextinas, mãos alternadas. */
function sextupletExercise(): Exercise {
  let ex: Exercise = { ...createBlankExercise(), id: 'sext', subdivision: 'sextuplet' };
  gridPositionsInBar(ts44, 'sextuplet').forEach((p, i) => {
    const limb: Limb = i % 2 ? 'leftHand' : 'rightHand';
    ex = addEvent(ex, { barIndex: 0, beatPosition: p, instrument: 'snare', limb, velocity: 90, accent: i % 6 === 0 }).exercise;
  });
  return ex;
}

describe('sextinas', () => {
  it('têm 6 posições por tempo e 24 por compasso 4/4', () => {
    const pos = gridPositionsInBar(ts44, 'sextuplet');
    expect(pos).toHaveLength(24);
    pos.forEach((p, i) => expect(p).toBeCloseTo(i / 6, 12));
    expect(gridPositionsInBar({ numerator: 3, denominator: 4 }, 'sextuplet')).toHaveLength(18);
    expect(gridPositionsInBar({ numerator: 6, denominator: 8 }, 'sextuplet')).toHaveLength(18);
  });

  it('não alteram as subdivisões existentes', () => {
    expect(gridPositionsInBar(ts44, 'quarter')).toHaveLength(4);
    expect(gridPositionsInBar(ts44, 'eighth')).toHaveLength(8);
    expect(gridPositionsInBar(ts44, 'triplet')).toHaveLength(12);
    expect(gridPositionsInBar(ts44, 'sixteenth')).toHaveLength(16);
  });

  it('reconhecem posições na grade (tercinas cabem nas sextinas, semicolcheias não)', () => {
    expect(isOnGrid(1 / 6, 'sextuplet')).toBe(true);
    expect(isOnGrid(5 / 6, 'sextuplet')).toBe(true);
    expect(isOnGrid(1 / 3, 'sextuplet')).toBe(true);
    expect(isOnGrid(0.5, 'sextuplet')).toBe(true);
    expect(isOnGrid(0.25, 'sextuplet')).toBe(false);
    expect(isOnGrid(1 / 6, 'triplet')).toBe(false);
    expect(formatPosition(0, 1 + 1 / 6, ts44)).toBe('Compasso 1 · tempo 2 + 1/6');
  });

  it('o clique na grade encaixa na sextina mais próxima', () => {
    expect(snapToGrid(0.18, ts44, 'sextuplet', 1).beatPosition).toBeCloseTo(1 / 6, 9);
    expect(snapToGrid(3.95, ts44, 'sextuplet', 2)).toEqual({ barIndex: 1, beatPosition: 0 });
  });

  it('quantizam semicolcheias para sextinas de forma previsível', () => {
    const ev = { id: 'a', barIndex: 0, beatPosition: 0.25, instrument: 'snare' as const, limb: 'rightHand' as const, velocity: 90, accent: false };
    const r = quantizeEvents([ev], ts44, 'sextuplet', 1);
    expect(r.events[0].beatPosition).toBeCloseTo(2 / 6, 9); // 0,25 × 6 = 1,5 → arredonda para 2
    expect(countOffGridEvents([ev], 'sextuplet')).toBe(1);
  });

  it('preservam mãos/pés, e permitem mover, copiar, colar e quantizar', () => {
    const ex = sextupletExercise();
    expect(ex.events.filter((e) => e.limb === 'rightHand')).toHaveLength(12);
    expect(ex.events.filter((e) => e.limb === 'leftHand')).toHaveLength(12);
    const first = ex.events[0];
    const moved = moveEventsBySteps({ ...ex, events: [first], totalBars: 2 }, [first.id], 7);
    expect(moved.events[0].beatPosition).toBeCloseTo(7 / 6, 9);
    const two = { ...ex, totalBars: 2 };
    const pasted = pasteEvents(two, copyEvents(two, two.events.map((e) => e.id))!, 1);
    expect(pasted.newIds).toHaveLength(24);
    expect(quantizeExercise(pasted.exercise).moved).toBe(0);
    // Salvo e recarregado continua sextina
    expect(sanitizeExercise(JSON.parse(JSON.stringify(ex)))!.subdivision).toBe('sextuplet');
  });

  it('metrônomo de subdivisão marca as 5 sextinas entre os tempos', () => {
    const tl = buildTimeline(sextupletExercise(), { clickSubdivisions: true });
    expect(tl.clicks).toHaveLength(24);
    expect(tl.clicks.filter((c) => c.kind === 'subdivision')).toHaveLength(20);
  });

  it('tocam no instante exato, sem desvio ao longo do loop', async () => {
    const sink = new FakeSink();
    const transport = new Transport(sink, { createTimer: () => new ManualTimer(), lookahead: 0.1, startDelay: 0.05 });
    transport.setBpm(90);
    transport.setCountInBars(0);
    transport.load(sextupletExercise());
    await transport.play();
    advance(sink, () => transport.tick(), 30, 0.019);
    const hits = sink.scheduled.filter((s) => s.kind === 'hit');
    const step = 60 / 90 / 6; // duração de uma sextina a 90 BPM
    expect(hits.length).toBeGreaterThan(200);
    hits.forEach((h, n) => expect(h.time).toBeCloseTo(0.05 + n * step, 9));
    expect(new Set(hits.map((h) => h.time.toFixed(9))).size).toBe(hits.length);
    // a mão de cada nota corresponde à posição dentro do ciclo
    hits.forEach((h, n) => expect(h.event!.limb).toBe(n % 2 ? 'leftHand' : 'rightHand'));
  });
});
