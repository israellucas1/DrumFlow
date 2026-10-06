import type { SubdivisionId, TimeSignature } from './types';
import { barLengthInQuarters, beatUnitInQuarters } from './timeSignature';

export const EPS = 1e-6;
export const MIN_BPM = 40;
export const MAX_BPM = 240;
export const DEFAULT_BPM = 80;

export function clampBpm(bpm: number): number {
  if (!Number.isFinite(bpm)) return DEFAULT_BPM;
  return Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(bpm)));
}

/** Duração de uma semínima em segundos: 60 / BPM. */
export function quarterDuration(bpm: number): number {
  return 60 / bpm;
}

export function quartersToSeconds(quarters: number, bpm: number): number {
  return (quarters * 60) / bpm;
}

export function secondsToQuarters(seconds: number, bpm: number): number {
  return (seconds * bpm) / 60;
}

export function barDurationSeconds(ts: TimeSignature, bpm: number): number {
  return quartersToSeconds(barLengthInQuarters(ts), bpm);
}

export const STEPS_PER_QUARTER: Record<SubdivisionId, number> = {
  quarter: 1,
  eighth: 2,
  triplet: 3,
  sixteenth: 4,
  sextuplet: 6,
};

export function stepLength(sub: SubdivisionId): number {
  return 1 / STEPS_PER_QUARTER[sub];
}

/** Módulo matemático (sempre não negativo). */
export function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

export function nearlyEqual(a: number, b: number, eps = EPS): boolean {
  return Math.abs(a - b) < eps;
}

/** Arredonda ruído de ponto flutuante (ex.: 0.30000000000000004 → 0.3). */
export function cleanFloat(x: number): number {
  return Math.round(x * 1e9) / 1e9;
}

export function isOnGrid(beatPosition: number, sub: SubdivisionId): boolean {
  const steps = beatPosition * STEPS_PER_QUARTER[sub];
  return Math.abs(steps - Math.round(steps)) < 1e-4;
}

/** Posições da grade dentro de um compasso (em semínimas). */
export function gridPositionsInBar(ts: TimeSignature, sub: SubdivisionId): number[] {
  const barLen = barLengthInQuarters(ts);
  const spq = STEPS_PER_QUARTER[sub];
  const out: number[] = [];
  for (let k = 0; ; k++) {
    const p = k / spq;
    if (p > barLen - EPS) break;
    out.push(p);
  }
  return out;
}

export function absoluteQuarter(barIndex: number, beatPosition: number, ts: TimeSignature): number {
  return barIndex * barLengthInQuarters(ts) + beatPosition;
}

/**
 * Converte uma posição absoluta (semínimas desde o início) na posição de grade
 * mais próxima, respeitando as barras de compasso.
 */
export function snapToGrid(
  abs: number,
  ts: TimeSignature,
  sub: SubdivisionId,
  totalBars: number,
): { barIndex: number; beatPosition: number } {
  const barLen = barLengthInQuarters(ts);
  const spq = STEPS_PER_QUARTER[sub];
  let barIndex = Math.min(Math.max(Math.floor(abs / barLen + EPS), 0), totalBars - 1);
  const within = abs - barIndex * barLen;
  let pos = Math.round(within * spq) / spq;
  if (pos < 0) pos = 0;
  if (pos > barLen - EPS) {
    if (barIndex + 1 < totalBars) {
      barIndex += 1;
      pos = 0;
    } else {
      pos = Math.floor((barLen - EPS) * spq) / spq;
    }
  }
  return { barIndex, beatPosition: cleanFloat(pos) };
}

function fraction(x: number): string {
  for (const d of [2, 3, 4, 6, 8, 12, 16]) {
    const n = x * d;
    if (Math.abs(n - Math.round(n)) < 1e-4) return `${Math.round(n)}/${d}`;
  }
  return x.toFixed(3);
}

/** Texto legível: "Compasso 2 · tempo 3 + 1/4". */
export function formatPosition(barIndex: number, beatPosition: number, ts: TimeSignature): string {
  const unit = beatUnitInQuarters(ts);
  const beat = Math.floor(beatPosition / unit + EPS);
  const rest = beatPosition - beat * unit;
  const base = `Compasso ${barIndex + 1} · tempo ${beat + 1}`;
  if (rest < EPS) return base;
  return `${base} + ${fraction(rest / unit)}`;
}
