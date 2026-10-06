/**
 * Operações puras de edição de exercícios. Todas retornam um novo objeto
 * (imutável) e preservam os ids dos eventos que não foram recriados.
 */
import type { Exercise, InstrumentId, MusicEvent, SubdivisionId, TimeSignature } from './types';
import { barLengthInQuarters, DEFAULT_TIME_SIGNATURE } from './timeSignature';
import { EPS, STEPS_PER_QUARTER, clampBpm, cleanFloat, DEFAULT_BPM } from './beatMath';
import { INSTRUMENT_ROW } from './instruments';
import { createId } from './ids';
import { quantizeEvents } from './quantization';

export const MAX_BARS = 32;
export const MIN_VELOCITY = 1;
export const MAX_VELOCITY = 127;
export const DEFAULT_VELOCITY = 90;
export const ACCENT_VELOCITY = 118;

export type EventData = Omit<MusicEvent, 'id'>;

export function clampVelocity(v: number): number {
  if (!Number.isFinite(v)) return DEFAULT_VELOCITY;
  return Math.min(MAX_VELOCITY, Math.max(MIN_VELOCITY, Math.round(v)));
}

export function sortEvents(events: MusicEvent[]): MusicEvent[] {
  return [...events].sort(
    (a, b) =>
      a.barIndex - b.barIndex ||
      a.beatPosition - b.beatPosition ||
      INSTRUMENT_ROW[a.instrument] - INSTRUMENT_ROW[b.instrument],
  );
}

function withEvents(ex: Exercise, events: MusicEvent[]): Exercise {
  return { ...ex, events: sortEvents(events) };
}

export function createEvent(data: EventData): MusicEvent {
  return { ...data, id: createId('ev'), velocity: clampVelocity(data.velocity) };
}

export function findEventAt(
  ex: Exercise,
  instrument: InstrumentId,
  barIndex: number,
  beatPosition: number,
): MusicEvent | undefined {
  return ex.events.find(
    (e) => e.instrument === instrument && e.barIndex === barIndex && Math.abs(e.beatPosition - beatPosition) < 1e-4,
  );
}

export function addEvent(ex: Exercise, data: EventData): { exercise: Exercise; event: MusicEvent } {
  const event = createEvent(data);
  return { exercise: withEvents(ex, [...ex.events, event]), event };
}

export function updateEvents(
  ex: Exercise,
  ids: Iterable<string>,
  patch: Partial<EventData>,
): Exercise {
  const set = new Set(ids);
  if (set.size === 0) return ex;
  const clean = { ...patch };
  if (clean.velocity !== undefined) clean.velocity = clampVelocity(clean.velocity);
  return withEvents(
    ex,
    ex.events.map((e) => (set.has(e.id) ? { ...e, ...clean } : e)),
  );
}

export function removeEvents(ex: Exercise, ids: Iterable<string>): Exercise {
  const set = new Set(ids);
  if (set.size === 0) return ex;
  return withEvents(ex, ex.events.filter((e) => !set.has(e.id)));
}

/** Converte posição absoluta (semínimas) em compasso + posição, ou null se fora do exercício. */
function fromAbsolute(ex: Exercise, abs: number): { barIndex: number; beatPosition: number } | null {
  const barLen = barLengthInQuarters(ex.tempoSignature);
  const total = barLen * ex.totalBars;
  if (abs < -EPS || abs > total - EPS) return null;
  let barIndex = Math.floor(abs / barLen + EPS);
  let beatPosition = cleanFloat(abs - barIndex * barLen);
  if (beatPosition < 0) beatPosition = 0;
  if (beatPosition > barLen - EPS) {
    barIndex += 1;
    beatPosition = 0;
  }
  if (barIndex >= ex.totalBars) return null;
  return { barIndex, beatPosition };
}

/**
 * Move eventos por N passos da subdivisão atual. O deslocamento é relativo,
 * então notas fora da grade continuam fora da grade (nada é quantizado em silêncio).
 * Se algum evento sair dos limites do exercício, nada é movido.
 */
export function moveEventsBySteps(ex: Exercise, ids: Iterable<string>, steps: number): Exercise {
  const set = new Set(ids);
  if (set.size === 0 || steps === 0) return ex;
  const barLen = barLengthInQuarters(ex.tempoSignature);
  const delta = steps / STEPS_PER_QUARTER[ex.subdivision];
  const moved: MusicEvent[] = [];
  for (const e of ex.events) {
    if (!set.has(e.id)) {
      moved.push(e);
      continue;
    }
    const target = fromAbsolute(ex, e.barIndex * barLen + e.beatPosition + delta);
    if (!target) return ex;
    moved.push({ ...e, ...target });
  }
  return withEvents(ex, moved);
}

export function moveEventTo(ex: Exercise, id: string, barIndex: number, beatPosition: number): Exercise {
  const barLen = barLengthInQuarters(ex.tempoSignature);
  if (barIndex < 0 || barIndex >= ex.totalBars || beatPosition < 0 || beatPosition > barLen - EPS) return ex;
  return withEvents(
    ex,
    ex.events.map((e) => (e.id === id ? { ...e, barIndex, beatPosition: cleanFloat(beatPosition) } : e)),
  );
}

/** Duplica eventos deslocados por `offsetQuarters`; cópias fora do exercício são descartadas. */
export function duplicateEvents(
  ex: Exercise,
  ids: Iterable<string>,
  offsetQuarters: number,
): { exercise: Exercise; newIds: string[] } {
  const set = new Set(ids);
  const barLen = barLengthInQuarters(ex.tempoSignature);
  const copies: MusicEvent[] = [];
  for (const e of ex.events) {
    if (!set.has(e.id)) continue;
    const target = fromAbsolute(ex, e.barIndex * barLen + e.beatPosition + offsetQuarters);
    if (!target) continue;
    copies.push({ ...e, ...target, id: createId('ev') });
  }
  return { exercise: withEvents(ex, [...ex.events, ...copies]), newIds: copies.map((c) => c.id) };
}

export interface ClipboardEvent {
  barOffset: number;
  data: Omit<EventData, 'barIndex'>;
}
export interface ClipboardData {
  events: ClipboardEvent[];
}

export function copyEvents(ex: Exercise, ids: Iterable<string>): ClipboardData | null {
  const set = new Set(ids);
  const picked = ex.events.filter((e) => set.has(e.id));
  if (picked.length === 0) return null;
  const minBar = Math.min(...picked.map((e) => e.barIndex));
  return {
    events: picked.map(({ id: _id, barIndex, ...rest }) => ({ barOffset: barIndex - minBar, data: rest })),
  };
}

/** Cola mantendo as posições dentro do compasso, a partir do compasso alvo. */
export function pasteEvents(
  ex: Exercise,
  clip: ClipboardData,
  targetBar: number,
): { exercise: Exercise; newIds: string[] } {
  const barLen = barLengthInQuarters(ex.tempoSignature);
  const created: MusicEvent[] = [];
  for (const c of clip.events) {
    const barIndex = targetBar + c.barOffset;
    if (barIndex < 0 || barIndex >= ex.totalBars || c.data.beatPosition > barLen - EPS) continue;
    created.push(createEvent({ ...c.data, barIndex }));
  }
  return { exercise: withEvents(ex, [...ex.events, ...created]), newIds: created.map((e) => e.id) };
}

/** Insere uma cópia do compasso logo depois dele, empurrando os seguintes. */
export function duplicateBar(ex: Exercise, barIndex: number): Exercise {
  if (barIndex < 0 || barIndex >= ex.totalBars || ex.totalBars >= MAX_BARS) return ex;
  const shifted = ex.events.map((e) => (e.barIndex > barIndex ? { ...e, barIndex: e.barIndex + 1 } : e));
  const copies = ex.events
    .filter((e) => e.barIndex === barIndex)
    .map((e) => ({ ...e, barIndex: barIndex + 1, id: createId('ev') }));
  return withEvents({ ...ex, totalBars: ex.totalBars + 1 }, [...shifted, ...copies]);
}

export function clearBar(ex: Exercise, barIndex: number): Exercise {
  return withEvents(ex, ex.events.filter((e) => e.barIndex !== barIndex));
}

export function countEventsBeyondBars(ex: Exercise, totalBars: number): number {
  return ex.events.filter((e) => e.barIndex >= totalBars).length;
}

export function setTotalBars(ex: Exercise, totalBars: number): Exercise {
  const n = Math.min(MAX_BARS, Math.max(1, Math.round(totalBars)));
  if (n === ex.totalBars) return ex;
  return withEvents({ ...ex, totalBars: n }, ex.events.filter((e) => e.barIndex < n));
}

export function countEventsOutsideBar(ex: Exercise, ts: TimeSignature): number {
  const barLen = barLengthInQuarters(ts);
  return ex.events.filter((e) => e.beatPosition > barLen - EPS).length;
}

/** Troca a fórmula de compasso; notas que não cabem no novo compasso são removidas. */
export function changeTimeSignature(ex: Exercise, ts: TimeSignature): Exercise {
  const barLen = barLengthInQuarters(ts);
  return withEvents({ ...ex, tempoSignature: { ...ts } }, ex.events.filter((e) => e.beatPosition <= barLen - EPS));
}

/** Troca a subdivisão sem mover nenhuma nota (notas fora da grade são preservadas). */
export function setSubdivision(ex: Exercise, subdivision: SubdivisionId): Exercise {
  return ex.subdivision === subdivision ? ex : { ...ex, subdivision };
}

export function quantizeExercise(ex: Exercise): { exercise: Exercise; moved: number; merged: number } {
  const r = quantizeEvents(ex.events, ex.tempoSignature, ex.subdivision, ex.totalBars);
  return { exercise: withEvents(ex, r.events), moved: r.moved, merged: r.merged };
}

/** Cópia independente (novo id e novos ids de eventos), sempre de origem "user". */
export function duplicateExercise(ex: Exercise, name?: string): Exercise {
  const now = Date.now();
  return {
    ...ex,
    id: createId('ex'),
    name: name ?? `${ex.name} (cópia)`,
    origin: 'user',
    tempoSignature: { ...ex.tempoSignature },
    events: ex.events.map((e) => ({ ...e, id: createId('ev') })),
    createdAt: now,
    updatedAt: now,
  };
}

export function createBlankExercise(opts: { name?: string; bpm?: number; countInBars?: number } = {}): Exercise {
  const now = Date.now();
  return {
    id: createId('ex'),
    name: opts.name ?? 'Novo exercício',
    description: '',
    category: 'custom',
    origin: 'user',
    tempoSignature: { ...DEFAULT_TIME_SIGNATURE },
    bpm: clampBpm(opts.bpm ?? DEFAULT_BPM),
    totalBars: 1,
    subdivision: 'sixteenth',
    loopEnabled: true,
    countInBars: opts.countInBars ?? 1,
    events: [],
    createdAt: now,
    updatedAt: now,
  };
}
