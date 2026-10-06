import type { MusicEvent, SubdivisionId, TimeSignature } from './types';
import { barLengthInQuarters } from './timeSignature';
import { EPS, STEPS_PER_QUARTER, cleanFloat, isOnGrid, nearlyEqual } from './beatMath';

export interface QuantizeResult {
  events: MusicEvent[];
  /** Notas cuja posição mudou. */
  moved: number;
  /** Notas removidas por colidirem (mesmo instrumento e mesma posição) após a quantização. */
  merged: number;
}

/**
 * Quantiza cada evento para a posição mais próxima da subdivisão.
 * Operação explícita e previsível:
 *  - arredonda para o passo mais próximo (empate → para cima, como Math.round);
 *  - se o arredondamento cair na barra seguinte, passa para o compasso seguinte
 *    (ou, no último compasso, arredonda para baixo);
 *  - notas do mesmo instrumento que passarem a ocupar a mesma posição são mescladas,
 *    mantendo a de maior intensidade (e seu id).
 */
export function quantizeEvents(
  events: readonly MusicEvent[],
  ts: TimeSignature,
  sub: SubdivisionId,
  totalBars: number,
): QuantizeResult {
  const barLen = barLengthInQuarters(ts);
  const spq = STEPS_PER_QUARTER[sub];
  let moved = 0;

  const snapped = events.map((ev) => {
    let bar = ev.barIndex;
    let pos = Math.round(ev.beatPosition * spq) / spq;
    if (pos > barLen - EPS) {
      if (bar + 1 < totalBars) {
        bar += 1;
        pos = 0;
      } else {
        pos = Math.floor(ev.beatPosition * spq) / spq;
      }
    }
    pos = cleanFloat(Math.max(0, pos));
    if (bar !== ev.barIndex || !nearlyEqual(pos, ev.beatPosition)) moved++;
    return { ...ev, barIndex: bar, beatPosition: pos };
  });

  const byKey = new Map<string, MusicEvent>();
  let merged = 0;
  for (const ev of snapped) {
    const key = `${ev.instrument}|${ev.barIndex}|${Math.round(ev.beatPosition * 1e4)}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, ev);
    } else {
      merged++;
      if (ev.velocity > existing.velocity) byKey.set(key, ev);
    }
  }
  const keep = new Set(Array.from(byKey.values()).map((e) => e.id));
  return { events: snapped.filter((e) => keep.has(e.id)), moved, merged };
}

export function countOffGridEvents(events: readonly MusicEvent[], sub: SubdivisionId): number {
  return events.filter((e) => !isOnGrid(e.beatPosition, sub)).length;
}
