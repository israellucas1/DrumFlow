import { describe, expect, it } from 'vitest';
import {
  barDurationSeconds,
  clampBpm,
  formatPosition,
  gridPositionsInBar,
  isOnGrid,
  quarterDuration,
  quartersToSeconds,
  snapToGrid,
} from '../music/beatMath';

describe('beatMath', () => {
  it('semínima = 60 / BPM', () => {
    expect(quarterDuration(60)).toBe(1);
    expect(quarterDuration(80)).toBeCloseTo(0.75);
    expect(quarterDuration(120)).toBeCloseTo(0.5);
    expect(quartersToSeconds(4, 120)).toBeCloseTo(2);
  });

  it('duração do compasso respeita numerador e denominador', () => {
    expect(barDurationSeconds({ numerator: 4, denominator: 4 }, 60)).toBeCloseTo(4);
    expect(barDurationSeconds({ numerator: 3, denominator: 4 }, 60)).toBeCloseTo(3);
    expect(barDurationSeconds({ numerator: 6, denominator: 8 }, 60)).toBeCloseTo(3);
    expect(barDurationSeconds({ numerator: 7, denominator: 8 }, 120)).toBeCloseTo(1.75);
    expect(barDurationSeconds({ numerator: 2, denominator: 2 }, 60)).toBeCloseTo(4);
  });

  it('limita o BPM entre 40 e 240', () => {
    expect(clampBpm(10)).toBe(40);
    expect(clampBpm(400)).toBe(240);
    expect(clampBpm(99.6)).toBe(100);
    expect(clampBpm(Number.NaN)).toBe(80);
  });

  it('gera posições da grade por subdivisão', () => {
    const ts = { numerator: 4, denominator: 4 };
    expect(gridPositionsInBar(ts, 'quarter')).toEqual([0, 1, 2, 3]);
    expect(gridPositionsInBar(ts, 'eighth')).toHaveLength(8);
    expect(gridPositionsInBar(ts, 'triplet')).toHaveLength(12);
    expect(gridPositionsInBar(ts, 'sixteenth')).toHaveLength(16);
    expect(gridPositionsInBar({ numerator: 7, denominator: 8 }, 'triplet')).toHaveLength(11);
  });

  it('identifica notas fora da grade', () => {
    expect(isOnGrid(1 / 3, 'triplet')).toBe(true);
    expect(isOnGrid(1 / 3, 'sixteenth')).toBe(false);
    expect(isOnGrid(0.75, 'sixteenth')).toBe(true);
    expect(isOnGrid(0.75, 'eighth')).toBe(false);
  });

  it('encaixa na grade respeitando as barras de compasso', () => {
    const ts = { numerator: 4, denominator: 4 };
    expect(snapToGrid(1.1, ts, 'sixteenth', 2)).toEqual({ barIndex: 0, beatPosition: 1 });
    expect(snapToGrid(3.95, ts, 'sixteenth', 2)).toEqual({ barIndex: 1, beatPosition: 0 });
    expect(snapToGrid(7.95, ts, 'sixteenth', 2)).toEqual({ barIndex: 1, beatPosition: 3.75 });
  });

  it('formata a posição de forma legível', () => {
    const ts = { numerator: 4, denominator: 4 };
    expect(formatPosition(1, 2, ts)).toBe('Compasso 2 · tempo 3');
    expect(formatPosition(0, 2.25, ts)).toBe('Compasso 1 · tempo 3 + 1/4');
    expect(formatPosition(0, 1 / 3, ts)).toBe('Compasso 1 · tempo 1 + 1/3');
  });
});
