import type { Exercise, InstrumentId } from '../music/types';
import { buildExercise, chopNotes, toPtSticking, type NoteSpec } from './builders';

/*
 * Gospel chops: combinações lineares de mãos e bumbo, quase sempre em sextinas
 * (6 notas por tempo), praticadas devagar e em loop até ficarem "coladas".
 * Notação: D = mão direita, E = mão esquerda, P = pé (bumbo).
 * A sequência exibida vem da mesma string que gera as notas.
 */

const SEXT = 1 / 6;
const SIXTEENTH = 0.25;

interface ChopSpec {
  id: string;
  name: string;
  description: string;
  sticking: string;
  bpm: number;
  subdivision: Exercise['subdivision'];
  totalBars?: number;
  notes: NoteSpec[];
}

const gospel = (s: ChopSpec): Exercise =>
  buildExercise({
    id: `lib-gospel-${s.id}`,
    name: s.name,
    description: s.description,
    category: 'gospel',
    origin: 'library',
    // Só maiúsculas: R/L/K → D/E/P (preserva palavras como "groove").
    sticking: s.sticking.replace(/[RLK]+/g, (m) => toPtSticking(m)),
    bpm: s.bpm,
    subdivision: s.subdivision,
    totalBars: s.totalBars,
    notes: s.notes,
  });

/** Groove de referência em colcheias (chimbal, caixa no 2 e 4, bumbo), a partir de `start`. */
function groove(start: number, beats: number, crash = false): NoteSpec[] {
  const out: NoteSpec[] = [];
  for (let i = 0; i < beats * 2; i++) {
    const at = start + i * 0.5;
    if (i === 0 && crash) out.push({ at, instrument: 'crash', limb: 'rightHand', accent: true });
    else out.push({ at, instrument: 'hiHat', limb: 'rightHand', accent: i % 2 === 0 });
  }
  for (let b = 0; b < beats; b++) {
    if (b % 2 === 1) out.push({ at: start + b, instrument: 'snare', limb: 'leftHand', accent: true });
    if (b % 2 === 0) out.push({ at: start + b, instrument: 'kick', limb: 'rightFoot' });
  }
  return out;
}

const TOMS_DOWN: InstrumentId[] = ['snare', 'tom1', 'tom2', 'floorTom'];

export const GOSPEL_CHOPS: readonly Exercise[] = [
  gospel({
    id: 'rlk',
    name: 'RLK em sextinas',
    description:
      'O chop mais básico: duas mãos e um bumbo, repetidos em sextinas (dois grupos por tempo). Mantenha o bumbo no mesmo volume das mãos.',
    sticking: 'RLK RLK RLK RLK RLK RLK RLK RLK',
    bpm: 60,
    subdivision: 'sextuplet',
    notes: chopNotes('RLK', { step: SEXT, repeat: 8, accentFirst: true }),
  }),
  gospel({
    id: 'rlrlkk',
    name: 'RLRLKK (seis notas)',
    description: 'Quatro toques simples e dois bumbos, um grupo por tempo. É a base da maioria das viradas gospel.',
    sticking: 'RLRLKK RLRLKK RLRLKK RLRLKK',
    bpm: 60,
    subdivision: 'sextuplet',
    notes: chopNotes('RLRLKK', { step: SEXT, repeat: 4, accentFirst: true }),
  }),
  gospel({
    id: 'rlrlkk-toms',
    name: 'RLRLKK descendo os tons',
    description:
      'Um compasso de groove e um de chop: RLRLKK na caixa, tom 1, tom 2 e surdo. O crash do loop marca a volta ao groove.',
    sticking: 'groove | RLRLKK RLRLKK RLRLKK RLRLKK',
    bpm: 60,
    subdivision: 'sextuplet',
    totalBars: 2,
    notes: [
      ...groove(0, 4, true),
      ...chopNotes('RLRLKK', { start: 4, step: SEXT, repeat: 4, instruments: TOMS_DOWN, accentFirst: true }),
    ],
  }),
  gospel({
    id: 'rlrrkk',
    name: 'RLRRKK (paradiddle-diddle com bumbo)',
    description: 'O paradiddle-diddle (D E D D E E) com o último duplo trocado por dois bumbos. Não alterna a mão inicial.',
    sticking: 'RLRRKK RLRRKK RLRRKK RLRRKK',
    bpm: 60,
    subdivision: 'sextuplet',
    notes: chopNotes('RLRRKK', { step: SEXT, repeat: 4, accentFirst: true }),
  }),
  gospel({
    id: 'lrlrkk',
    name: 'LRLRKK (começando com a esquerda)',
    description: 'O mesmo chop de seis notas puxado pela mão esquerda, para equilibrar as mãos e preparar viradas no sentido inverso.',
    sticking: 'LRLRKK LRLRKK LRLRKK LRLRKK',
    bpm: 60,
    subdivision: 'sextuplet',
    notes: chopNotes('LRLRKK', { step: SEXT, repeat: 4, accentFirst: true }),
  }),
  gospel({
    id: 'rlk-toms',
    name: 'RLK entre surdo e caixa',
    description: 'Mão direita no surdo, esquerda na caixa e bumbo, em sextinas. Som cheio e muito usado em finais de frase.',
    sticking: 'RLK RLK RLK RLK RLK RLK RLK RLK',
    bpm: 65,
    subdivision: 'sextuplet',
    notes: chopNotes('RLK', { step: SEXT, repeat: 8 }).map((n) =>
      n.limb === 'rightHand' ? { ...n, instrument: 'floorTom' as const, accent: true } : n,
    ),
  }),
  gospel({
    id: 'rlkk',
    name: 'RLKK linear em semicolcheias',
    description: 'Chop de quatro notas em semicolcheias: mão direita, mão esquerda e dois bumbos. Nenhuma nota soa junto com outra.',
    sticking: 'RLKK RLKK RLKK RLKK',
    bpm: 70,
    subdivision: 'sixteenth',
    notes: chopNotes('RLKK', { step: SIXTEENTH, repeat: 4, accentFirst: true }),
  }),
  gospel({
    id: 'rllk',
    name: 'RLLK linear (tom + caixa)',
    description: 'Direita acentuada no tom 1, duas esquerdas na caixa e bumbo, em semicolcheias. Trabalha o rebote da mão esquerda.',
    sticking: 'RLLK RLLK RLLK RLLK',
    bpm: 70,
    subdivision: 'sixteenth',
    notes: chopNotes('RLLK', { step: SIXTEENTH, repeat: 4, accentFirst: true }).map((n) =>
      n.limb === 'rightHand' ? { ...n, instrument: 'tom1' as const } : n,
    ),
  }),
  gospel({
    id: 'groove-chop',
    name: 'Groove + chop no 4º tempo',
    description: 'Três tempos de groove e um RLRLKK no quarto tempo, em loop. Treina entrar e sair do chop sem perder o pulso.',
    sticking: 'groove groove groove RLRLKK',
    bpm: 60,
    subdivision: 'sextuplet',
    notes: [...groove(0, 3, true), ...chopNotes('RLRLKK', { start: 3, step: SEXT, instruments: 'snare', accentFirst: true })],
  }),
  gospel({
    id: 'ghost-groove',
    name: 'Groove gospel com ghost notes',
    description:
      'Chimbal em colcheias, caixa forte no 2 e 4 e notas fantasma (bem baixas) da mão esquerda nas semicolcheias. Base para os chops.',
    sticking: 'D no chimbal · E: acentos no 2 e 4 + ghost notes',
    bpm: 75,
    subdivision: 'sixteenth',
    notes: [
      ...[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((at) => ({ at, instrument: 'hiHat' as const, limb: 'rightHand' as const, accent: at % 1 === 0 })),
      { at: 1, instrument: 'snare', limb: 'leftHand', accent: true },
      { at: 3, instrument: 'snare', limb: 'leftHand', accent: true },
      ...[0.25, 1.75, 2.25, 3.75].map((at) => ({ at, instrument: 'snare' as const, limb: 'leftHand' as const, velocity: 35 })),
      { at: 0, instrument: 'kick', limb: 'rightFoot' },
      { at: 0.75, instrument: 'kick', limb: 'rightFoot' },
      { at: 2.5, instrument: 'kick', limb: 'rightFoot' },
    ],
  }),
];
