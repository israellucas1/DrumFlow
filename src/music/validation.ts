/**
 * Saneamento de dados vindos do armazenamento (podem estar ausentes, corrompidos
 * ou ser de uma versão antiga). Nunca lança exceção: devolve null ou valores padrão.
 */
import type { Exercise, ExerciseCategory, ExerciseOrigin, MusicEvent } from './types';
import { INSTRUMENT_IDS, LIMB_IDS, ORNAMENT_IDS, SUBDIVISION_IDS } from './types';
import { barLengthInQuarters, DEFAULT_TIME_SIGNATURE, isValidTimeSignature } from './timeSignature';
import { EPS, clampBpm } from './beatMath';
import { clampVelocity, MAX_BARS } from './exerciseOps';
import { createId } from './ids';

const CATEGORIES: ExerciseCategory[] = ['rudiment', 'gospel', 'study', 'groove', 'fill', 'tool', 'custom'];
const ORIGINS: ExerciseOrigin[] = ['library', 'demo', 'user'];

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const oneOf = <T extends string>(list: readonly T[], v: unknown, fallback: T): T =>
  typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : fallback;
const finite = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

export function sanitizeEvent(raw: unknown, totalBars: number, barLength: number): MusicEvent | null {
  if (!isObj(raw)) return null;
  const instrument = oneOf(INSTRUMENT_IDS, raw.instrument, null as never);
  const limb = oneOf(LIMB_IDS, raw.limb, null as never);
  if (!instrument || !limb) return null;
  const barIndex = finite(raw.barIndex, -1);
  const beatPosition = finite(raw.beatPosition, -1);
  if (!Number.isInteger(barIndex) || barIndex < 0 || barIndex >= totalBars) return null;
  if (beatPosition < 0 || beatPosition > barLength - EPS) return null;
  const ev: MusicEvent = {
    id: typeof raw.id === 'string' && raw.id ? raw.id : createId('ev'),
    barIndex,
    beatPosition,
    instrument,
    limb,
    velocity: clampVelocity(finite(raw.velocity, 90)),
    accent: raw.accent === true,
  };
  if (typeof raw.duration === 'number' && Number.isFinite(raw.duration) && raw.duration > 0) ev.duration = raw.duration;
  const ornament = oneOf(ORNAMENT_IDS, raw.ornament, 'none');
  if (ornament !== 'none') ev.ornament = ornament;
  return ev;
}

export function sanitizeExercise(raw: unknown): Exercise | null {
  if (!isObj(raw)) return null;
  if (typeof raw.id !== 'string' || !raw.id) return null;
  const tempoSignature = isValidTimeSignature(raw.tempoSignature)
    ? { numerator: raw.tempoSignature.numerator, denominator: raw.tempoSignature.denominator }
    : { ...DEFAULT_TIME_SIGNATURE };
  const totalBarsRaw = Math.round(finite(raw.totalBars, 1));
  const totalBars = Math.min(MAX_BARS, Math.max(1, totalBarsRaw));
  const barLength = barLengthInQuarters(tempoSignature);
  const rawEvents = Array.isArray(raw.events) ? raw.events : [];
  const seen = new Set<string>();
  const events: MusicEvent[] = [];
  for (const r of rawEvents) {
    const ev = sanitizeEvent(r, totalBars, barLength);
    if (!ev) continue;
    if (seen.has(ev.id)) ev.id = createId('ev');
    seen.add(ev.id);
    events.push(ev);
  }
  const now = Date.now();
  return {
    id: raw.id,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.slice(0, 120) : 'Sem nome',
    description: typeof raw.description === 'string' ? raw.description.slice(0, 500) : '',
    category: oneOf(CATEGORIES, raw.category, 'custom'),
    origin: oneOf(ORIGINS, raw.origin, 'user'),
    sticking: typeof raw.sticking === 'string' ? raw.sticking : undefined,
    tempoSignature,
    bpm: clampBpm(finite(raw.bpm, 80)),
    totalBars,
    subdivision: oneOf(SUBDIVISION_IDS, raw.subdivision, 'sixteenth'),
    loopEnabled: raw.loopEnabled !== false,
    countInBars: Math.min(4, Math.max(0, Math.round(finite(raw.countInBars, 1)))),
    events,
    createdAt: finite(raw.createdAt, now),
    updatedAt: finite(raw.updatedAt, now),
  };
}
