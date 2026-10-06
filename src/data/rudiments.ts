import type { Exercise } from '../music/types';
import { buildExercise, stickingNotes, toPtSticking } from './builders';
import { GOSPEL_CHOPS } from './gospelChops';

/*
 * Biblioteca de rudimentos (somente leitura). Todos na caixa, 4/4, 1 compasso em loop.
 * A sequência de mãos exibida é derivada da mesma string usada para gerar as notas,
 * garantindo que texto e grade correspondam.
 * Notação: D = mão direita, E = mão esquerda; minúsculas = apojaturas (notas de apoio).
 */

const rudiment = (
  id: string,
  name: string,
  description: string,
  sticking: string,
  bpm: number,
  subdivision: Exercise['subdivision'],
  notes: ReturnType<typeof stickingNotes>,
  displaySticking?: string,
): Exercise =>
  buildExercise({
    id: `lib-${id}`,
    name,
    description,
    category: 'rudiment',
    origin: 'library',
    sticking: toPtSticking(displaySticking ?? sticking),
    bpm,
    subdivision,
    notes,
  });

const SINGLE = 'RLRL RLRL RLRL RLRL';
const DOUBLE = 'RRLL RRLL RRLL RRLL';
const PARADIDDLE = 'RLRR LRLL RLRR LRLL';
const DOUBLE_PARADIDDLE = 'RLRLRR LRLRLL';
const PARADIDDLE_DIDDLE = 'RLRRLL RLRRLL';

export const RUDIMENTS: readonly Exercise[] = [
  rudiment(
    'single-stroke-roll',
    'Single Stroke Roll',
    'Toques simples alternados em semicolcheias. Base de velocidade e igualdade entre as mãos.',
    SINGLE,
    80,
    'sixteenth',
    stickingNotes(SINGLE, { step: 0.25 }),
  ),
  rudiment(
    'double-stroke-roll',
    'Double Stroke Roll',
    'Dois toques por mão em semicolcheias. Trabalhe o rebote mantendo o segundo toque com o mesmo volume.',
    DOUBLE,
    70,
    'sixteenth',
    stickingNotes(DOUBLE, { step: 0.25 }),
  ),
  rudiment(
    'paradiddle',
    'Paradiddle',
    'Dois toques simples e um duplo (D E D D / E D E E), com acento na primeira nota de cada grupo.',
    PARADIDDLE,
    70,
    'sixteenth',
    stickingNotes(PARADIDDLE, { step: 0.25, accents: [0, 4, 8, 12] }),
  ),
  rudiment(
    'double-paradiddle',
    'Double Paradiddle',
    'Quatro toques simples e um duplo, em tercinas de colcheia. Acento no início de cada grupo de seis.',
    DOUBLE_PARADIDDLE,
    70,
    'triplet',
    stickingNotes(DOUBLE_PARADIDDLE, { step: 1 / 3, accents: [0, 6] }),
  ),
  rudiment(
    'paradiddle-diddle',
    'Paradiddle-diddle',
    'Dois toques simples seguidos de dois duplos (D E D D E E), em tercinas. Não alterna a mão inicial.',
    PARADIDDLE_DIDDLE,
    70,
    'triplet',
    stickingNotes(PARADIDDLE_DIDDLE, { step: 1 / 3, accents: [0, 6] }),
  ),
  rudiment(
    'flam',
    'Flam',
    'Flams alternados em colcheias: a apojatura (mão oposta, mais baixa) soa logo antes da nota principal.',
    'RLRL RLRL',
    70,
    'eighth',
    stickingNotes('RLRL RLRL', { step: 0.5, ornament: 'flam' }),
    'lR rL lR rL lR rL lR rL',
  ),
  rudiment(
    'drag',
    'Drag',
    'Duas apojaturas rápidas da mão oposta antes de cada nota principal, alternando nas semínimas.',
    'RLRL',
    70,
    'quarter',
    stickingNotes('RLRL', { step: 1, ornament: 'drag', accents: [0, 1, 2, 3] }),
    'llR rrL llR rrL',
  ),
  rudiment(
    'five-stroke-roll',
    'Five Stroke Roll',
    'Dois toques duplos e um simples acentuado (D D E E D>). Alterna a mão inicial a cada tempo 2.',
    'RRLLR LLRRL',
    70,
    'sixteenth',
    [
      ...stickingNotes('RRLLR', { start: 0, step: 0.25, accents: [4] }),
      ...stickingNotes('LLRRL', { start: 2, step: 0.25, accents: [4] }),
    ],
    'RRLLR- LLRRL-',
  ),
  rudiment(
    'six-stroke-roll',
    'Six Stroke Roll',
    'Simples acentuado, dois duplos e simples acentuado (D> E E D D E>), começando nos tempos 1 e 3.',
    'RLLRRL RLLRRL',
    70,
    'sixteenth',
    [
      ...stickingNotes('RLLRRL', { start: 0, step: 0.25, accents: [0, 5] }),
      ...stickingNotes('RLLRRL', { start: 2, step: 0.25, accents: [0, 5] }),
    ],
    'R LL RR L- R LL RR L-',
  ),
  rudiment(
    'seven-stroke-roll',
    'Seven Stroke Roll',
    'Três toques duplos e um simples acentuado (E E D D E E D>), alternando a mão inicial.',
    'LLRRLLR RRLLRRL',
    65,
    'sixteenth',
    [
      ...stickingNotes('LLRRLLR', { start: 0, step: 0.25, accents: [6] }),
      ...stickingNotes('RRLLRRL', { start: 2, step: 0.25, accents: [6] }),
    ],
    'LLRRLLR- RRLLRRL-',
  ),
];

/** Ferramentas embutidas (ex.: metrônomo sem notas). */
export const TOOLS: readonly Exercise[] = [
  buildExercise({
    id: 'lib-free-metronome',
    name: 'Metrônomo livre',
    description: 'Somente o metrônomo — escolha a fórmula de compasso e a subdivisão.',
    category: 'tool',
    origin: 'library',
    bpm: 80,
    subdivision: 'quarter',
    notes: [],
  }),
];

export const LIBRARY: readonly Exercise[] = [...TOOLS, ...RUDIMENTS, ...GOSPEL_CHOPS];
