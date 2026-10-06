import { describe, expect, it } from 'vitest';
import {
  barLengthInQuarters,
  beatUnitInQuarters,
  isValidTimeSignature,
  parseTimeSignature,
} from '../music/timeSignature';
import { buildCountInClicks, buildTimeline } from '../music/timeline';
import { createBlankExercise } from '../music/exerciseOps';

describe('fórmula de compasso', () => {
  it('calcula a duração em semínimas', () => {
    expect(barLengthInQuarters({ numerator: 4, denominator: 4 })).toBe(4);
    expect(barLengthInQuarters({ numerator: 3, denominator: 4 })).toBe(3);
    expect(barLengthInQuarters({ numerator: 6, denominator: 8 })).toBe(3);
    expect(barLengthInQuarters({ numerator: 12, denominator: 8 })).toBe(6);
    expect(barLengthInQuarters({ numerator: 5, denominator: 16 })).toBe(1.25);
    expect(beatUnitInQuarters({ numerator: 6, denominator: 8 })).toBe(0.5);
  });

  it('valida e interpreta', () => {
    expect(isValidTimeSignature({ numerator: 4, denominator: 4 })).toBe(true);
    expect(isValidTimeSignature({ numerator: 4, denominator: 3 })).toBe(false);
    expect(isValidTimeSignature({ numerator: 0, denominator: 4 })).toBe(false);
    expect(isValidTimeSignature('4/4')).toBe(false);
    expect(parseTimeSignature('7/8')).toEqual({ numerator: 7, denominator: 8 });
    expect(parseTimeSignature('7/5')).toBeNull();
  });

  it('gera cliques com o primeiro tempo forte em cada compasso', () => {
    const ex = { ...createBlankExercise(), totalBars: 2, tempoSignature: { numerator: 3, denominator: 4 } };
    const tl = buildTimeline(ex);
    expect(tl.totalQuarters).toBe(6);
    expect(tl.clicks.map((c) => c.kind)).toEqual(['downbeat', 'beat', 'beat', 'downbeat', 'beat', 'beat']);
    expect(tl.clicks.map((c) => c.abs)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('inclui subdivisões quando solicitado, sem duplicar os tempos', () => {
    const ex = { ...createBlankExercise(), subdivision: 'eighth' as const };
    const tl = buildTimeline(ex, { clickSubdivisions: true });
    expect(tl.clicks).toHaveLength(8);
    expect(tl.clicks.filter((c) => c.kind === 'subdivision').map((c) => c.abs)).toEqual([0.5, 1.5, 2.5, 3.5]);
  });

  it('6/8 tem seis cliques por compasso (unidade = colcheia)', () => {
    const ex = { ...createBlankExercise(), tempoSignature: { numerator: 6, denominator: 8 } };
    const tl = buildTimeline(ex);
    expect(tl.clicks.map((c) => c.abs)).toEqual([0, 0.5, 1, 1.5, 2, 2.5]);
  });

  it('contagem inicial termina exatamente em 0', () => {
    const clicks = buildCountInClicks({ numerator: 4, denominator: 4 }, 2);
    expect(clicks).toHaveLength(8);
    expect(clicks[0]).toEqual({ abs: -8, kind: 'downbeat' });
    expect(clicks[4]).toEqual({ abs: -4, kind: 'downbeat' });
    expect(clicks[7].abs).toBe(-1);
  });
});
