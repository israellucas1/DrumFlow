import type {
  Exercise,
  ExerciseCategory,
  ExerciseOrigin,
  InstrumentId,
  Limb,
  MusicEvent,
  Ornament,
  SubdivisionId,
  TimeSignature,
} from '../music/types';
import { barLengthInQuarters, DEFAULT_TIME_SIGNATURE } from '../music/timeSignature';
import { cleanFloat } from '../music/beatMath';
import { ACCENT_VELOCITY, DEFAULT_VELOCITY, sortEvents } from '../music/exerciseOps';

export interface NoteSpec {
  /** Posição absoluta em semínimas desde o início do exercício. */
  at: number;
  instrument: InstrumentId;
  limb: Limb;
  accent?: boolean;
  velocity?: number;
  ornament?: Ornament;
}

export interface ExerciseSpec {
  id: string;
  name: string;
  description: string;
  category: ExerciseCategory;
  origin: ExerciseOrigin;
  sticking?: string;
  tempoSignature?: TimeSignature;
  bpm: number;
  totalBars?: number;
  subdivision: SubdivisionId;
  countInBars?: number;
  notes: NoteSpec[];
}

/** Monta um exercício com ids de evento estáveis e determinísticos (`<id>-n<k>`). */
export function buildExercise(spec: ExerciseSpec): Exercise {
  const ts = spec.tempoSignature ?? DEFAULT_TIME_SIGNATURE;
  const barLen = barLengthInQuarters(ts);
  const events: MusicEvent[] = spec.notes.map((n, k) => {
    const barIndex = Math.floor(n.at / barLen + 1e-9);
    const ev: MusicEvent = {
      id: `${spec.id}-n${k}`,
      barIndex,
      beatPosition: cleanFloat(n.at - barIndex * barLen),
      instrument: n.instrument,
      limb: n.limb,
      velocity: n.velocity ?? (n.accent ? ACCENT_VELOCITY : DEFAULT_VELOCITY),
      accent: !!n.accent,
    };
    if (n.ornament && n.ornament !== 'none') ev.ornament = n.ornament;
    return ev;
  });
  return {
    id: spec.id,
    name: spec.name,
    description: spec.description,
    category: spec.category,
    origin: spec.origin,
    sticking: spec.sticking,
    tempoSignature: { ...ts },
    bpm: spec.bpm,
    totalBars: spec.totalBars ?? 1,
    subdivision: spec.subdivision,
    loopEnabled: true,
    countInBars: spec.countInBars ?? 1,
    events: sortEvents(events),
    createdAt: 0,
    updatedAt: 0,
  };
}

/**
 * Converte uma sequência de mãos ("RLRR LRLL") em notas na caixa.
 * Espaços são ignorados (servem só para leitura). `accents` = índices acentuados.
 */
export function stickingNotes(
  sticking: string,
  opts: { start?: number; step: number; accents?: number[]; ornament?: Ornament; instrument?: InstrumentId },
): NoteSpec[] {
  const hands = sticking.replace(/\s+/g, '').split('');
  const accents = new Set(opts.accents ?? []);
  return hands.map((h, i) => ({
    at: cleanFloat((opts.start ?? 0) + i * opts.step),
    instrument: opts.instrument ?? 'snare',
    limb: h === 'R' ? 'rightHand' : 'leftHand',
    accent: accents.has(i),
    ornament: opts.ornament,
  }));
}

/** Notação em português: R → D (mão direita), L → E (mão esquerda), K → P (pé/bumbo). */
export function toPtSticking(sticking: string): string {
  return sticking.replace(/R/g, 'D').replace(/L/g, 'E').replace(/K/g, 'P').replace(/r/g, 'd').replace(/l/g, 'e');
}

/**
 * Converte um padrão de "chop" com mãos e pé ("RLRLKK") em notas.
 * R/L = mãos no instrumento do grupo; K = bumbo (pé direito). Espaços separam grupos
 * apenas na leitura. `instruments` pode variar por grupo (ex.: descer pelos tons).
 */
export function chopNotes(
  pattern: string,
  opts: {
    start?: number;
    step: number;
    repeat?: number;
    instruments?: InstrumentId | InstrumentId[];
    accentFirst?: boolean;
  },
): NoteSpec[] {
  const group = pattern.replace(/\s+/g, '').split('');
  const repeat = opts.repeat ?? 1;
  const inst = opts.instruments ?? 'snare';
  const out: NoteSpec[] = [];
  for (let g = 0; g < repeat; g++) {
    const hands = Array.isArray(inst) ? inst[g % inst.length] : inst;
    group.forEach((c, i) => {
      const at = cleanFloat((opts.start ?? 0) + (g * group.length + i) * opts.step);
      const accent = !!opts.accentFirst && i === 0;
      if (c === 'K') out.push({ at, instrument: 'kick', limb: 'rightFoot', velocity: 100 });
      else out.push({ at, instrument: hands, limb: c === 'R' ? 'rightHand' : 'leftHand', accent });
    });
  }
  return out;
}
