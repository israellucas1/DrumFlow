import type { Exercise } from '../music/types';
import { buildExercise, stickingNotes, type NoteSpec } from './builders';

/** Exercícios de demonstração copiados para "Meus exercícios" (editáveis). */

const rockGroove: NoteSpec[] = [
  ...[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((at) => ({
    at,
    instrument: 'hiHat' as const,
    limb: 'rightHand' as const,
    accent: at % 1 === 0,
  })),
  { at: 1, instrument: 'snare', limb: 'leftHand' },
  { at: 3, instrument: 'snare', limb: 'leftHand' },
  { at: 0, instrument: 'kick', limb: 'rightFoot' },
  { at: 2, instrument: 'kick', limb: 'rightFoot' },
  { at: 2.5, instrument: 'kick', limb: 'rightFoot' },
];

const fillBar0: NoteSpec[] = [
  { at: 0, instrument: 'crash', limb: 'rightHand', accent: true },
  ...[0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((at) => ({ at, instrument: 'hiHat' as const, limb: 'rightHand' as const })),
  { at: 1, instrument: 'snare', limb: 'leftHand' },
  { at: 3, instrument: 'snare', limb: 'leftHand' },
  { at: 0, instrument: 'kick', limb: 'rightFoot' },
  { at: 2, instrument: 'kick', limb: 'rightFoot' },
  { at: 2.5, instrument: 'kick', limb: 'rightFoot' },
];

const fillBar1: NoteSpec[] = [
  ...stickingNotes('RLRL', { start: 4, step: 0.25, accents: [0], instrument: 'snare' }),
  ...stickingNotes('RLRL', { start: 5, step: 0.25, accents: [0], instrument: 'tom1' }),
  ...stickingNotes('RLRL', { start: 6, step: 0.25, accents: [0], instrument: 'tom2' }),
  ...stickingNotes('RLRL', { start: 7, step: 0.25, accents: [0], instrument: 'floorTom' }),
  { at: 4, instrument: 'kick', limb: 'rightFoot' },
  { at: 6, instrument: 'kick', limb: 'rightFoot' },
];

const sixEight: NoteSpec[] = [
  ...[0, 0.5, 1, 1.5, 2, 2.5].map((at) => ({
    at,
    instrument: 'ride' as const,
    limb: 'rightHand' as const,
    accent: at === 0 || at === 1.5,
  })),
  { at: 1.5, instrument: 'snare', limb: 'leftHand' },
  { at: 0, instrument: 'kick', limb: 'rightFoot' },
  { at: 2.5, instrument: 'kick', limb: 'rightFoot', velocity: 70 },
  { at: 0.5, instrument: 'pedalHiHat', limb: 'leftFoot', velocity: 70 },
  { at: 1, instrument: 'pedalHiHat', limb: 'leftFoot', velocity: 70 },
  { at: 2, instrument: 'pedalHiHat', limb: 'leftFoot', velocity: 70 },
];

export const DEMO_EXERCISES: readonly Exercise[] = [
  buildExercise({
    id: 'demo-rock-groove',
    name: 'Groove rock básico',
    description: 'Chimbal em colcheias, caixa nos tempos 2 e 4, bumbo no 1, 3 e "e" do 3.',
    category: 'groove',
    origin: 'demo',
    bpm: 80,
    subdivision: 'eighth',
    notes: rockGroove,
  }),
  buildExercise({
    id: 'demo-fill-16ths',
    name: 'Groove + virada nos tons',
    description: 'Um compasso de groove e uma virada em semicolcheias descendo caixa → tom 1 → tom 2 → surdo.',
    category: 'fill',
    origin: 'demo',
    sticking: 'D E D E  D E D E  D E D E  D E D E',
    bpm: 75,
    totalBars: 2,
    subdivision: 'sixteenth',
    notes: [...fillBar0, ...fillBar1],
  }),
  buildExercise({
    id: 'demo-six-eight',
    name: 'Groove em 6/8',
    description: 'Ride em colcheias, caixa no tempo 4, bumbo no 1 e pedal do chimbal com o pé esquerdo.',
    category: 'groove',
    origin: 'demo',
    tempoSignature: { numerator: 6, denominator: 8 },
    bpm: 70,
    subdivision: 'eighth',
    notes: sixEight,
  }),
];
