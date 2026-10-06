import type { ClickKind, InstrumentId } from '../music/types';
import type { Layer } from './voices';

// ───────────── Metrônomo ─────────────

export const CLICK_SOUND_IDS = ['classic', 'woodblock', 'cowbell', 'clave', 'tick', 'custom'] as const;
export type ClickSoundId = (typeof CLICK_SOUND_IDS)[number];

export const CLICK_SOUNDS: readonly { id: ClickSoundId; label: string }[] = [
  { id: 'classic', label: 'Clássico (bip)' },
  { id: 'woodblock', label: 'Woodblock (madeira)' },
  { id: 'cowbell', label: 'Cowbell' },
  { id: 'clave', label: 'Clave' },
  { id: 'tick', label: 'Tique seco' },
  { id: 'custom', label: 'Meus sons (arquivos)' },
];

/**
 * Timbres do clique. Em todos, o primeiro tempo é mais agudo/forte e a subdivisão
 * mais grave/discreta. Ganhos < 1 + limitador no master evitam clipping.
 */
export const CLICK_LAYERS: Record<Exclude<ClickSoundId, 'custom'>, Record<ClickKind, Layer[]>> = {
  classic: {
    downbeat: [{ type: 'tone', wave: 'sine', from: 1760, peak: 0.8, decay: 0.07 }],
    beat: [{ type: 'tone', wave: 'sine', from: 1175, peak: 0.5, decay: 0.05 }],
    subdivision: [{ type: 'tone', wave: 'sine', from: 830, peak: 0.22, decay: 0.035 }],
  },
  woodblock: {
    downbeat: [
      { type: 'tone', wave: 'sine', from: 1700, to: 1520, glide: 0.02, peak: 0.85, decay: 0.06 },
      { type: 'noise', filter: 'bandpass', freq: 1800, q: 4, peak: 0.4, decay: 0.02 },
    ],
    beat: [
      { type: 'tone', wave: 'sine', from: 1250, to: 1140, glide: 0.02, peak: 0.6, decay: 0.05 },
      { type: 'noise', filter: 'bandpass', freq: 1300, q: 4, peak: 0.28, decay: 0.015 },
    ],
    subdivision: [{ type: 'tone', wave: 'sine', from: 1000, to: 950, glide: 0.015, peak: 0.28, decay: 0.035 }],
  },
  cowbell: {
    downbeat: [
      { type: 'tone', wave: 'triangle', from: 640, peak: 0.45, decay: 0.16 },
      { type: 'tone', wave: 'triangle', from: 955, peak: 0.35, decay: 0.14 },
    ],
    beat: [
      { type: 'tone', wave: 'triangle', from: 540, peak: 0.32, decay: 0.11 },
      { type: 'tone', wave: 'triangle', from: 800, peak: 0.24, decay: 0.1 },
    ],
    subdivision: [
      { type: 'tone', wave: 'triangle', from: 540, peak: 0.13, decay: 0.05 },
      { type: 'tone', wave: 'triangle', from: 800, peak: 0.1, decay: 0.05 },
    ],
  },
  clave: {
    downbeat: [{ type: 'tone', wave: 'sine', from: 2500, peak: 0.8, decay: 0.035 }],
    beat: [{ type: 'tone', wave: 'sine', from: 2000, peak: 0.55, decay: 0.03 }],
    subdivision: [{ type: 'tone', wave: 'sine', from: 1700, peak: 0.25, decay: 0.02 }],
  },
  tick: {
    downbeat: [
      { type: 'noise', filter: 'highpass', freq: 3500, peak: 0.7, decay: 0.03 },
      { type: 'tone', wave: 'sine', from: 3000, peak: 0.25, decay: 0.02 },
    ],
    beat: [{ type: 'noise', filter: 'highpass', freq: 5000, peak: 0.45, decay: 0.02 }],
    subdivision: [{ type: 'noise', filter: 'highpass', freq: 7000, peak: 0.2, decay: 0.012 }],
  },
};

// ───────────── Kits de bateria ─────────────

export const DRUM_KIT_IDS = ['acoustic', 'electronic', 'vintage', 'custom'] as const;
export type DrumKitId = (typeof DRUM_KIT_IDS)[number];

export const DRUM_KITS: readonly { id: DrumKitId; label: string }[] = [
  { id: 'acoustic', label: 'Acústico (padrão)' },
  { id: 'electronic', label: 'Eletrônico (estilo 808)' },
  { id: 'vintage', label: 'Vintage / jazz (suave)' },
  { id: 'custom', label: 'Meus sons (arquivos)' },
];

const tom = (from: number, to: number, decay: number, noise = true): Layer[] => [
  { type: 'tone', wave: 'sine', from, to, glide: decay * 0.6, peak: 0.8, decay },
  ...(noise ? [{ type: 'noise' as const, filter: 'lowpass' as const, freq: 3000, peak: 0.12, decay: 0.03 }] : []),
];

export const KIT_LAYERS: Record<Exclude<DrumKitId, 'custom'>, Record<InstrumentId, Layer[]>> = {
  acoustic: {
    kick: [{ type: 'tone', wave: 'sine', from: 150, to: 45, glide: 0.11, peak: 1.0, decay: 0.38 }],
    snare: [
      { type: 'noise', filter: 'highpass', freq: 1400, peak: 0.6, decay: 0.18 },
      { type: 'tone', wave: 'triangle', from: 210, to: 160, glide: 0.05, peak: 0.4, decay: 0.1 },
    ],
    hiHat: [{ type: 'noise', filter: 'highpass', freq: 7500, peak: 0.32, decay: 0.055 }],
    pedalHiHat: [{ type: 'noise', filter: 'bandpass', freq: 5200, q: 1.2, peak: 0.28, decay: 0.035 }],
    ride: [
      { type: 'noise', filter: 'highpass', freq: 6000, peak: 0.16, decay: 0.55 },
      { type: 'tone', wave: 'sine', from: 2950, to: 2900, glide: 0.3, peak: 0.07, decay: 0.45 },
    ],
    crash: [{ type: 'noise', filter: 'highpass', freq: 3800, peak: 0.42, decay: 1.2 }],
    tom1: tom(230, 165, 0.32),
    tom2: tom(175, 125, 0.38),
    floorTom: tom(120, 82, 0.48),
  },
  electronic: {
    kick: [
      { type: 'tone', wave: 'sine', from: 120, to: 48, glide: 0.05, peak: 1.1, decay: 0.85 },
      { type: 'noise', filter: 'lowpass', freq: 2000, peak: 0.12, decay: 0.01 },
    ],
    snare: [
      { type: 'noise', filter: 'highpass', freq: 1800, peak: 0.55, decay: 0.22 },
      { type: 'tone', wave: 'sine', from: 330, peak: 0.25, decay: 0.12 },
      { type: 'tone', wave: 'sine', from: 180, peak: 0.25, decay: 0.12 },
    ],
    hiHat: [{ type: 'noise', filter: 'highpass', freq: 9000, peak: 0.3, decay: 0.04 }],
    pedalHiHat: [{ type: 'noise', filter: 'highpass', freq: 8000, peak: 0.22, decay: 0.025 }],
    ride: [{ type: 'noise', filter: 'bandpass', freq: 7000, q: 0.8, peak: 0.16, decay: 0.7 }],
    crash: [{ type: 'noise', filter: 'highpass', freq: 5000, peak: 0.38, decay: 1.6 }],
    tom1: tom(200, 140, 0.45, false),
    tom2: tom(150, 100, 0.5, false),
    floorTom: tom(100, 65, 0.6, false),
  },
  vintage: {
    kick: [
      { type: 'tone', wave: 'sine', from: 95, to: 60, glide: 0.06, peak: 0.85, decay: 0.25 },
      { type: 'noise', filter: 'lowpass', freq: 600, peak: 0.15, decay: 0.04 },
    ],
    snare: [
      { type: 'noise', filter: 'bandpass', freq: 2500, q: 0.7, peak: 0.55, decay: 0.26 },
      { type: 'tone', wave: 'triangle', from: 230, to: 200, glide: 0.04, peak: 0.25, decay: 0.08 },
    ],
    hiHat: [{ type: 'noise', filter: 'bandpass', freq: 8000, q: 0.6, peak: 0.26, decay: 0.09 }],
    pedalHiHat: [{ type: 'noise', filter: 'bandpass', freq: 4500, q: 1, peak: 0.25, decay: 0.05 }],
    ride: [
      { type: 'noise', filter: 'highpass', freq: 4500, peak: 0.2, decay: 0.9 },
      { type: 'tone', wave: 'sine', from: 3400, peak: 0.09, decay: 0.8 },
      { type: 'tone', wave: 'sine', from: 5100, peak: 0.04, decay: 0.6 },
    ],
    crash: [{ type: 'noise', filter: 'highpass', freq: 3000, peak: 0.35, decay: 1.6 }],
    tom1: tom(260, 220, 0.35),
    tom2: tom(200, 170, 0.4),
    floorTom: tom(150, 125, 0.55),
  },
};

// ───────────── Sons do usuário (arquivos) ─────────────

export const CLICK_SLOTS = ['click-downbeat', 'click-beat', 'click-subdivision'] as const;
export type ClickSlot = (typeof CLICK_SLOTS)[number];
export type SoundSlot = InstrumentId | ClickSlot;

export const CLICK_SLOT_FOR: Record<ClickKind, ClickSlot> = {
  downbeat: 'click-downbeat',
  beat: 'click-beat',
  subdivision: 'click-subdivision',
};

export const CLICK_SLOT_LABELS: Record<ClickSlot, string> = {
  'click-downbeat': 'Metrônomo — 1º tempo',
  'click-beat': 'Metrônomo — tempos',
  'click-subdivision': 'Metrônomo — subdivisões',
};
