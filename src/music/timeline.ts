import type { ClickKind, Exercise, MusicEvent, TimeSignature } from './types';
import { barLengthInQuarters, beatUnitInQuarters } from './timeSignature';
import { EPS, gridPositionsInBar, nearlyEqual } from './beatMath';

export interface TimelineEntry {
  /** Posição absoluta em semínimas desde o início do exercício. */
  abs: number;
  event: MusicEvent;
}

export interface ClickEntry {
  abs: number;
  kind: ClickKind;
}

/** Representação "achatada" de um ciclo do exercício, pronta para o scheduler. */
export interface Timeline {
  totalQuarters: number;
  barLength: number;
  beatUnit: number;
  entries: TimelineEntry[];
  clicks: ClickEntry[];
}

export interface TimelineOptions {
  clickSubdivisions: boolean;
}

export function buildTimeline(ex: Exercise, opts: TimelineOptions = { clickSubdivisions: false }): Timeline {
  const ts = ex.tempoSignature;
  const barLength = barLengthInQuarters(ts);
  const beatUnit = beatUnitInQuarters(ts);
  const totalQuarters = barLength * ex.totalBars;

  const entries = ex.events
    .filter(
      (e) =>
        e.barIndex >= 0 &&
        e.barIndex < ex.totalBars &&
        e.beatPosition > -EPS &&
        e.beatPosition < barLength - EPS,
    )
    .map((e) => ({ abs: e.barIndex * barLength + Math.max(0, e.beatPosition), event: e }))
    .sort((a, b) => a.abs - b.abs);

  const beatPositions: number[] = [];
  for (let k = 0; k < ts.numerator; k++) beatPositions.push(k * beatUnit);
  const subPositions = opts.clickSubdivisions
    ? gridPositionsInBar(ts, ex.subdivision).filter((p) => !beatPositions.some((b) => nearlyEqual(b, p)))
    : [];

  const clicks: ClickEntry[] = [];
  for (let bar = 0; bar < ex.totalBars; bar++) {
    const start = bar * barLength;
    const barClicks: ClickEntry[] = beatPositions.map((p, k) => ({
      abs: start + p,
      kind: k === 0 ? 'downbeat' : 'beat',
    }));
    for (const p of subPositions) barClicks.push({ abs: start + p, kind: 'subdivision' });
    barClicks.sort((a, b) => a.abs - b.abs);
    clicks.push(...barClicks);
  }

  return { totalQuarters, barLength, beatUnit, entries, clicks };
}

/** Cliques da contagem inicial, em posições negativas que terminam em 0. */
export function buildCountInClicks(ts: TimeSignature, bars: number): ClickEntry[] {
  const barLength = barLengthInQuarters(ts);
  const beatUnit = beatUnitInQuarters(ts);
  const total = bars * barLength;
  const out: ClickEntry[] = [];
  for (let b = 0; b < bars; b++) {
    for (let k = 0; k < ts.numerator; k++) {
      out.push({ abs: -total + b * barLength + k * beatUnit, kind: k === 0 ? 'downbeat' : 'beat' });
    }
  }
  return out;
}
