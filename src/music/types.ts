/**
 * Modelo de dados musical do DrumFlow.
 * Identificadores internos são estáveis e em inglês; os textos da interface
 * (português) ficam em `instruments.ts`.
 */
import type { ClickSoundId, DrumKitId } from '../audio/soundCatalog';

export const INSTRUMENT_IDS = [
  'crash',
  'ride',
  'hiHat',
  'tom1',
  'tom2',
  'floorTom',
  'snare',
  'kick',
  'pedalHiHat',
] as const;
export type InstrumentId = (typeof INSTRUMENT_IDS)[number];

export const LIMB_IDS = ['rightHand', 'leftHand', 'rightFoot', 'leftFoot'] as const;
export type Limb = (typeof LIMB_IDS)[number];

/** Subdivisão da grade, relativa à semínima (sextuplet = 6 por semínima). */
export const SUBDIVISION_IDS = ['quarter', 'eighth', 'triplet', 'sixteenth', 'sextuplet'] as const;
export type SubdivisionId = (typeof SUBDIVISION_IDS)[number];

/** Notas de apoio (apojaturas) tocadas pela mão oposta logo antes da nota principal. */
export const ORNAMENT_IDS = ['none', 'flam', 'drag'] as const;
export type Ornament = (typeof ORNAMENT_IDS)[number];

export interface TimeSignature {
  numerator: number;
  denominator: number;
}

export interface MusicEvent {
  id: string;
  /** Índice do compasso, começando em zero. */
  barIndex: number;
  /** Posição dentro do compasso, em unidades de semínima (0 = início do compasso). */
  beatPosition: number;
  instrument: InstrumentId;
  limb: Limb;
  /** Intensidade MIDI, 1–127. */
  velocity: number;
  accent: boolean;
  /** Duração em semínimas (opcional — a bateria é percussiva). */
  duration?: number;
  ornament?: Ornament;
}

export type ExerciseCategory = 'rudiment' | 'gospel' | 'study' | 'groove' | 'fill' | 'tool' | 'custom';
/** library = embutido (somente leitura); demo = exemplo copiado para "Meus exercícios"; user = criado pelo usuário. */
export type ExerciseOrigin = 'library' | 'demo' | 'user';

export interface Exercise {
  id: string;
  name: string;
  description: string;
  category: ExerciseCategory;
  origin: ExerciseOrigin;
  /** Sequência de mãos para exibição (ex.: "D E D D  E D E E"). */
  sticking?: string;
  tempoSignature: TimeSignature;
  bpm: number;
  totalBars: number;
  subdivision: SubdivisionId;
  loopEnabled: boolean;
  countInBars: number;
  events: MusicEvent[];
  createdAt: number;
  updatedAt: number;
}

/** Compasso derivado (não é armazenado). */
export interface Bar {
  index: number;
  startQuarter: number;
  lengthQuarters: number;
}

export type PlaybackState = 'stopped' | 'countIn' | 'playing' | 'paused';
export type ClickKind = 'downbeat' | 'beat' | 'subdivision';

export interface AudioSettings {
  masterVolume: number;
  metronomeVolume: number;
  metronomeEnabled: boolean;
  drumVolume: number;
  drumEnabled: boolean;
  /** Emite cliques também nas subdivisões da grade. */
  clickSubdivisions: boolean;
  /** Timbre do metrônomo. */
  clickSound: ClickSoundId;
  /** Kit de bateria usado para tocar o padrão. */
  drumKit: DrumKitId;
  /** Volume da faixa de acompanhamento. */
  backingVolume: number;
}

export type ScrollMode = 'fixed' | 'follow' | 'ahead';
export type DisplayMode = 'grid' | 'staff' | 'both';
export type ThemeId = 'dark' | 'light';

export interface ViewSettings {
  scrollMode: ScrollMode;
  /** Pixels por semínima (mínimo; a grade estica para preencher a tela). */
  zoom: number;
  highlightUpcoming: boolean;
  /** Grade, partitura ou ambas. */
  display: DisplayMode;
}

export interface AppSettings {
  version: 1;
  audio: AudioSettings;
  view: ViewSettings;
  defaultBpm: number;
  lastBpm: number;
  countInBars: number;
  theme: ThemeId;
  lastExerciseId: string | null;
  /** Cronômetro de treino em segundos, ou null (desligado). */
  practiceTimerSeconds: number | null;
  /** Faixa de acompanhamento ativa, ou null. */
  backingTrackId: string | null;
}

export interface PlaybackPosition {
  state: PlaybackState;
  /** Posição linear desde o fim da contagem (negativa durante a contagem). */
  linearQuarter: number;
  /** Posição dentro do exercício (0..total). */
  localQuarter: number;
  cycle: number;
  barIndex: number;
  beatInBar: number;
  isCountIn: boolean;
  countInBeatsRemaining: number;
}
