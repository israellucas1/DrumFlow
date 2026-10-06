import type { InstrumentId, Limb, Ornament, ScrollMode, SubdivisionId } from './types';

export type InstrumentKind = 'cymbal' | 'drum' | 'kick' | 'pedal';

export interface InstrumentMeta {
  id: InstrumentId;
  label: string;
  short: string;
  kind: InstrumentKind;
  defaultLimb: Limb;
}

/** Ordem das linhas da grade (de cima para baixo). */
export const INSTRUMENTS: readonly InstrumentMeta[] = [
  { id: 'crash', label: 'Crash', short: 'CR', kind: 'cymbal', defaultLimb: 'rightHand' },
  { id: 'ride', label: 'Ride', short: 'RD', kind: 'cymbal', defaultLimb: 'rightHand' },
  { id: 'hiHat', label: 'Chimbal', short: 'HH', kind: 'cymbal', defaultLimb: 'rightHand' },
  { id: 'tom1', label: 'Tom 1', short: 'T1', kind: 'drum', defaultLimb: 'rightHand' },
  { id: 'tom2', label: 'Tom 2', short: 'T2', kind: 'drum', defaultLimb: 'rightHand' },
  { id: 'floorTom', label: 'Surdo', short: 'SU', kind: 'drum', defaultLimb: 'rightHand' },
  { id: 'snare', label: 'Caixa', short: 'CX', kind: 'drum', defaultLimb: 'leftHand' },
  { id: 'kick', label: 'Bumbo', short: 'BU', kind: 'kick', defaultLimb: 'rightFoot' },
  { id: 'pedalHiHat', label: 'Pedal do chimbal', short: 'PC', kind: 'pedal', defaultLimb: 'leftFoot' },
];

export const INSTRUMENT_BY_ID = Object.fromEntries(INSTRUMENTS.map((i) => [i.id, i])) as Record<
  InstrumentId,
  InstrumentMeta
>;

export const INSTRUMENT_ROW = Object.fromEntries(INSTRUMENTS.map((i, idx) => [i.id, idx])) as Record<
  InstrumentId,
  number
>;

export interface LimbMeta {
  id: Limb;
  label: string;
  short: string;
  /** Letra exibida dentro da nota. */
  letter: string;
  isFoot: boolean;
  colorName: string;
}

export const LIMBS: readonly LimbMeta[] = [
  { id: 'rightHand', label: 'Mão direita', short: 'MD', letter: 'D', isFoot: false, colorName: 'âmbar' },
  { id: 'leftHand', label: 'Mão esquerda', short: 'ME', letter: 'E', isFoot: false, colorName: 'ciano' },
  { id: 'rightFoot', label: 'Pé direito', short: 'PD', letter: 'D', isFoot: true, colorName: 'magenta' },
  { id: 'leftFoot', label: 'Pé esquerdo', short: 'PE', letter: 'E', isFoot: true, colorName: 'violeta' },
];

export const LIMB_BY_ID = Object.fromEntries(LIMBS.map((l) => [l.id, l])) as Record<Limb, LimbMeta>;

export const SUBDIVISIONS: readonly { id: SubdivisionId; label: string }[] = [
  { id: 'quarter', label: 'Semínimas' },
  { id: 'eighth', label: 'Colcheias' },
  { id: 'triplet', label: 'Tercinas' },
  { id: 'sixteenth', label: 'Semicolcheias' },
  { id: 'sextuplet', label: 'Sextinas' },
];

export const ORNAMENTS: readonly { id: Ornament; label: string }[] = [
  { id: 'none', label: 'Nenhuma' },
  { id: 'flam', label: 'Flam (1 apojatura)' },
  { id: 'drag', label: 'Drag (2 apojaturas)' },
];

export const SCROLL_MODES: readonly { id: ScrollMode; label: string }[] = [
  { id: 'follow', label: 'Rolagem automática' },
  { id: 'ahead', label: 'Compassos seguintes' },
  { id: 'fixed', label: 'Visualização fixa' },
];

export function isFootInstrument(id: InstrumentId): boolean {
  return id === 'kick' || id === 'pedalHiHat';
}

/** Escolhe o membro de uma nova nota a partir do "pincel" atual e do instrumento. */
export function resolveLimb(brush: Limb, instrument: InstrumentId): Limb {
  if (isFootInstrument(instrument) === LIMB_BY_ID[brush].isFoot) return brush;
  return INSTRUMENT_BY_ID[instrument].defaultLimb;
}

export function oppositeLimb(limb: Limb): Limb {
  switch (limb) {
    case 'rightHand':
      return 'leftHand';
    case 'leftHand':
      return 'rightHand';
    case 'rightFoot':
      return 'leftFoot';
    case 'leftFoot':
      return 'rightFoot';
  }
}
