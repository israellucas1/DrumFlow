import type { TimeSignature } from './types';

export const ALLOWED_DENOMINATORS = [2, 4, 8, 16] as const;

export const COMMON_TIME_SIGNATURES: readonly TimeSignature[] = [
  { numerator: 2, denominator: 4 },
  { numerator: 3, denominator: 4 },
  { numerator: 4, denominator: 4 },
  { numerator: 5, denominator: 4 },
  { numerator: 6, denominator: 8 },
  { numerator: 7, denominator: 8 },
  { numerator: 9, denominator: 8 },
  { numerator: 12, denominator: 8 },
];

export const DEFAULT_TIME_SIGNATURE: TimeSignature = { numerator: 4, denominator: 4 };

export function isValidTimeSignature(ts: unknown): ts is TimeSignature {
  if (!ts || typeof ts !== 'object') return false;
  const { numerator, denominator } = ts as Record<string, unknown>;
  return (
    typeof numerator === 'number' &&
    Number.isInteger(numerator) &&
    numerator >= 1 &&
    numerator <= 32 &&
    typeof denominator === 'number' &&
    (ALLOWED_DENOMINATORS as readonly number[]).includes(denominator)
  );
}

/** Duração do compasso em semínimas: numerador × (4 / denominador). */
export function barLengthInQuarters(ts: TimeSignature): number {
  return (ts.numerator * 4) / ts.denominator;
}

/** Unidade de tempo (a figura do denominador) em semínimas. */
export function beatUnitInQuarters(ts: TimeSignature): number {
  return 4 / ts.denominator;
}

export function formatTimeSignature(ts: TimeSignature): string {
  return `${ts.numerator}/${ts.denominator}`;
}

export function parseTimeSignature(value: string): TimeSignature | null {
  const m = /^(\d{1,2})\/(\d{1,2})$/.exec(value.trim());
  if (!m) return null;
  const ts = { numerator: Number(m[1]), denominator: Number(m[2]) };
  return isValidTimeSignature(ts) ? ts : null;
}

export function sameTimeSignature(a: TimeSignature, b: TimeSignature): boolean {
  return a.numerator === b.numerator && a.denominator === b.denominator;
}
