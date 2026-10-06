/**
 * Notação de bateria: transforma um exercício em figuras rítmicas (pura, testável).
 *
 * Convenções (padrão de partitura de bateria):
 *  - Duas vozes: mãos com haste para cima, pés com haste para baixo.
 *  - Posições na pauta (passos diatônicos a partir da 1ª linha, E4 = 0):
 *    crash A5 (x, linha suplementar), chimbal G5 (x), ride F5 (x), tom 1 E5, tom 2 D5,
 *    caixa C5, surdo A4, bumbo F4, pedal do chimbal D4 (x).
 *  - Agrupamento por tempo (semínima), ou por semínima pontuada em 6/8, 9/8 e 12/8.
 *  - Ticks: 48 por semínima (divisível por colcheia, tercina, semicolcheia e sextina).
 */
import type { Exercise, InstrumentId, Limb, MusicEvent, Ornament } from './types';
import { barLengthInQuarters } from './timeSignature';

export const TPQ = 48;

export type Voice = 'up' | 'down';
export type HeadKind = 'normal' | 'x';

export const STAFF_POSITION: Record<InstrumentId, { step: number; head: HeadKind }> = {
  crash: { step: 10, head: 'x' },
  hiHat: { step: 9, head: 'x' },
  ride: { step: 8, head: 'x' },
  tom1: { step: 7, head: 'normal' },
  tom2: { step: 6, head: 'normal' },
  snare: { step: 5, head: 'normal' },
  floorTom: { step: 3, head: 'normal' },
  kick: { step: 1, head: 'normal' },
  pedalHiHat: { step: -1, head: 'x' },
};

export interface NoteHead {
  step: number;
  head: HeadKind;
  instrument: InstrumentId;
  limb: Limb;
  accent: boolean;
  ghost: boolean;
  ornament: Ornament;
  /** Posição absoluta em semínimas (para destacar durante a reprodução). */
  abs: number;
}

export interface ENote {
  kind: 'note';
  voice: Voice;
  tick: number; // dentro do compasso
  heads: NoteHead[];
  beams: number; // 0 = semínima, 1 = colcheia, 2 = semicolcheia, 3 = fusa
  dots: number;
}

export interface ERest {
  kind: 'rest';
  voice: Voice;
  tick: number;
  beams: number; // 0 = pausa de semínima, 1 = de colcheia...
  dots: number;
}

export interface EGroup {
  voice: Voice;
  start: number;
  length: number;
  /** Notas ligadas por barra (≥ 2 notas com colchete). */
  beamed: ENote[];
  tuplet: 3 | 6 | null;
}

export interface EBar {
  index: number;
  ticks: number;
  notes: ENote[];
  rests: ERest[];
  groups: EGroup[];
}

export interface Engraved {
  bars: EBar[];
  voices: Voice[];
}

/** Valores escritos representáveis (em ticks "escritos"), do maior para o menor. */
const VALUES: readonly [ticks: number, beams: number, dots: number][] = [
  [72, 0, 1],
  [48, 0, 0],
  [36, 1, 1],
  [24, 1, 0],
  [18, 2, 1],
  [12, 2, 0],
  [6, 3, 0],
];

export function voiceOf(limb: Limb): Voice {
  return limb === 'rightFoot' || limb === 'leftFoot' ? 'down' : 'up';
}

/** Tamanhos dos grupos de tempo de um compasso (em ticks). */
export function beatGroups(ex: Exercise): number[] {
  const { numerator, denominator } = ex.tempoSignature;
  const barTicks = Math.round(barLengthInQuarters(ex.tempoSignature) * TPQ);
  const size = denominator === 8 && numerator % 3 === 0 ? 72 : 48;
  const out: number[] = [];
  let rest = barTicks;
  while (rest > 0) {
    const g = Math.min(size, rest);
    out.push(g);
    rest -= g;
  }
  return out;
}

/** Preenche `written` ticks escritos com pausas (maiores primeiro). */
function restsFor(written: number): [beams: number, dots: number, ticks: number][] {
  const out: [number, number, number][] = [];
  let left = written;
  while (left >= 6) {
    const v = VALUES.find(([t]) => t <= left)!;
    out.push([v[1], v[2], v[0]]);
    left -= v[0];
  }
  return out;
}

function tupletOf(rel: number[], length: number): 3 | 6 | null {
  const all = [...rel, length];
  if (all.every((t) => t % 12 === 0)) return null;
  if (all.every((t) => t % 16 === 0)) return 3;
  if (all.every((t) => t % 8 === 0)) return 6;
  return null;
}

export function engrave(ex: Exercise): Engraved {
  const barLen = barLengthInQuarters(ex.tempoSignature);
  const barTicks = Math.round(barLen * TPQ);
  const groups = beatGroups(ex);
  const usedVoices = new Set<Voice>(ex.events.map((e) => voiceOf(e.limb)));
  const voices = (['up', 'down'] as Voice[]).filter((v) => usedVoices.has(v));
  if (voices.length === 0) voices.push('up');

  const bars: EBar[] = [];
  for (let b = 0; b < ex.totalBars; b++) {
    const bar: EBar = { index: b, ticks: barTicks, notes: [], rests: [], groups: [] };
    const events = ex.events.filter((e) => e.barIndex === b && e.beatPosition < barLen - 1e-6);

    for (const voice of voices) {
      const byTick = new Map<number, MusicEvent[]>();
      for (const e of events) {
        if (voiceOf(e.limb) !== voice) continue;
        const t = Math.min(barTicks - 1, Math.max(0, Math.round(e.beatPosition * TPQ)));
        byTick.set(t, [...(byTick.get(t) ?? []), e]);
      }

      let g0 = 0;
      for (const len of groups) {
        const ticks = [...byTick.keys()].filter((t) => t >= g0 && t < g0 + len).sort((a, c) => a - c);
        if (ticks.length === 0) {
          let t = g0;
          for (const [beams, dots, w] of restsFor(len)) {
            bar.rests.push({ kind: 'rest', voice, tick: t, beams, dots });
            t += w;
          }
          g0 += len;
          continue;
        }
        const rel = ticks.map((t) => t - g0);
        const tuplet = tupletOf(rel, len);
        const toWritten = (d: number) => (tuplet ? (d * 3) / 2 : d);
        const toReal = (w: number) => (tuplet ? (w * 2) / 3 : w);
        const groupNotes: ENote[] = [];

        // Pausa antes da primeira nota do grupo.
        let t = g0;
        for (const [beams, dots, w] of restsFor(toWritten(rel[0]))) {
          bar.rests.push({ kind: 'rest', voice, tick: t, beams, dots });
          t += toReal(w);
        }
        // Num grupo com várias notas, a última não é "esticada" até o fim do tempo:
        // recebe o menor intervalo do grupo e o resto vira pausa (ex.: RLRL + pausa nos KK).
        const gaps = ticks.slice(1).map((tk, i) => tk - ticks[i]);
        const minGap = gaps.length ? Math.min(...gaps) : Infinity;
        ticks.forEach((tick, i) => {
          const nextStart = i + 1 < ticks.length ? ticks[i + 1] : g0 + len;
          const end = i + 1 < ticks.length ? nextStart : Math.min(nextStart, tick + minGap);
          const written = Math.max(6, toWritten(end - tick));
          const [vt, beams, dots] = VALUES.find(([v]) => v <= written) ?? VALUES[VALUES.length - 1];
          const heads: NoteHead[] = byTick
            .get(tick)!
            .map((e) => ({
              step: STAFF_POSITION[e.instrument].step,
              head: STAFF_POSITION[e.instrument].head,
              instrument: e.instrument,
              limb: e.limb,
              accent: e.accent,
              ghost: !e.accent && e.velocity < 50,
              ornament: e.ornament ?? 'none',
              abs: b * barLen + e.beatPosition,
            }))
            .sort((a, c) => a.step - c.step);
          const note: ENote = { kind: 'note', voice, tick, heads, beams, dots };
          bar.notes.push(note);
          groupNotes.push(note);
          // Sobra entre o valor escrito e a próxima nota (ou o fim do tempo) vira pausa.
          let rt = tick + toReal(vt);
          for (const [rb, rd, w] of restsFor(toWritten(nextStart - tick) - vt)) {
            bar.rests.push({ kind: 'rest', voice, tick: rt, beams: rb, dots: rd });
            rt += toReal(w);
          }
        });
        const flagged = groupNotes.filter((n) => n.beams > 0);
        bar.groups.push({ voice, start: g0, length: len, beamed: flagged.length >= 2 ? flagged : [], tuplet });
        g0 += len;
      }
    }
    bars.push(bar);
  }
  return { bars, voices };
}

/** Letra da sequência de mãos exibida sobre a nota (D/E) ou sob ela (P = pé). */
export function stickingLetter(limb: Limb): string {
  return limb === 'rightHand' ? 'D' : limb === 'leftHand' ? 'E' : 'P';
}
