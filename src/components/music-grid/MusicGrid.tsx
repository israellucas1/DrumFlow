import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import type { Exercise, InstrumentId, Limb, MusicEvent, ViewSettings } from '../../music/types';
import { INSTRUMENTS, INSTRUMENT_BY_ID, INSTRUMENT_ROW, LIMB_BY_ID, oppositeLimb } from '../../music/instruments';
import { barLengthInQuarters, beatUnitInQuarters } from '../../music/timeSignature';
import { EPS, STEPS_PER_QUARTER, formatPosition, gridPositionsInBar, isOnGrid, nearlyEqual, snapToGrid } from '../../music/beatMath';
import { useServices } from '../../app/AppState';
import { InstrumentIcon } from './InstrumentIcon';

const PAD = 24;
const ROW_H = 42;
const RULER_H = 30;
/** Largura mínima de um passo da grade para as notas continuarem legíveis. */
const MIN_STEP_PX = 34;
/** Quanto tempo (s) uma nota fica em destaque depois de soar. */
const HIGHLIGHT_SECONDS = 0.13;

const LIMB_VAR: Record<Limb, string> = {
  rightHand: 'var(--df-rh)',
  leftHand: 'var(--df-lh)',
  rightFoot: 'var(--df-rf)',
  leftFoot: 'var(--df-lf)',
};

export interface CellClick {
  instrument: InstrumentId;
  barIndex: number;
  beatPosition: number;
  shiftKey: boolean;
}

export interface MusicGridProps {
  exercise: Exercise;
  view: ViewSettings;
  editable?: boolean;
  selectedIds?: ReadonlySet<string>;
  activeBar?: number | null;
  onCellClick?: (c: CellClick) => void;
  onNoteClick?: (id: string, e: MouseEvent) => void;
  onNoteDoubleClick?: (id: string) => void;
}

interface Line {
  x: number;
  kind: 'bar' | 'beat' | 'step';
}

function noteLabel(ev: MusicEvent, ex: Exercise): string {
  const parts = [
    INSTRUMENT_BY_ID[ev.instrument].label,
    LIMB_BY_ID[ev.limb].label,
    formatPosition(ev.barIndex, ev.beatPosition, ex.tempoSignature),
  ];
  if (ev.accent) parts.push('acentuada');
  if (ev.ornament === 'flam') parts.push('flam');
  if (ev.ornament === 'drag') parts.push('drag');
  parts.push(`intensidade ${ev.velocity}`);
  return parts.join(', ');
}

export function MusicGrid({
  exercise,
  view,
  editable = false,
  selectedIds,
  activeBar = null,
  onCellClick,
  onNoteClick,
  onNoteDoubleClick,
}: MusicGridProps) {
  const { transport } = useServices();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const countRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(0);

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setAvailable(el.clientWidth);
    const ro = new ResizeObserver(() => setAvailable(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const ts = exercise.tempoSignature;
  const sub = exercise.subdivision;
  const barLen = barLengthInQuarters(ts);
  const beatUnit = beatUnitInQuarters(ts);
  const total = barLen * exercise.totalBars;
  const spq = STEPS_PER_QUARTER[sub];

  // Geometria: posição musical → pixels (a posição é sempre derivada do modelo).
  const minPxPerQuarter = Math.max(view.zoom, spq * MIN_STEP_PX, (1 / beatUnit) * MIN_STEP_PX);
  const width = Math.max(available, total * minPxPerQuarter + 2 * PAD);
  const pxPerQuarter = (width - 2 * PAD) / total;
  const xOf = (abs: number) => PAD + abs * pxPerQuarter;

  const lines = useMemo<Line[]>(() => {
    const out: Line[] = [];
    const steps = gridPositionsInBar(ts, sub);
    const beats: number[] = [];
    for (let k = 0; k < ts.numerator; k++) beats.push(k * beatUnit);
    const positions = [...steps, ...beats.filter((b) => !steps.some((s) => nearlyEqual(s, b)))].sort((a, b) => a - b);
    for (let bar = 0; bar < exercise.totalBars; bar++) {
      for (const p of positions) {
        const kind: Line['kind'] = p < EPS ? 'bar' : beats.some((b) => nearlyEqual(b, p)) ? 'beat' : 'step';
        out.push({ x: PAD + (bar * barLen + p) * pxPerQuarter, kind });
      }
    }
    out.push({ x: PAD + total * pxPerQuarter, kind: 'bar' });
    return out;
  }, [ts, sub, beatUnit, barLen, total, exercise.totalBars, pxPerQuarter]);

  const rulerLabels = useMemo(() => {
    const out: { x: number; text: string; strong: boolean }[] = [];
    for (let bar = 0; bar < exercise.totalBars; bar++) {
      for (let k = 0; k < ts.numerator; k++) {
        out.push({ x: PAD + (bar * barLen + k * beatUnit) * pxPerQuarter, text: String(k + 1), strong: k === 0 });
      }
    }
    return out;
  }, [exercise.totalBars, ts.numerator, barLen, beatUnit, pxPerQuarter]);

  // ───────────── Animação: relógio de áudio → posição visual ─────────────
  useEffect(() => {
    const inner = innerRef.current;
    const scroller = scrollerRef.current;
    const playhead = playheadRef.current;
    const countEl = countRef.current;
    if (!inner || !scroller || !playhead || !countEl) return;

    const notes = Array.from(inner.querySelectorAll<HTMLElement>('[data-abs]')).map((el) => {
      delete el.dataset.play;
      return { el, abs: Number(el.dataset.abs) };
    });
    const states = new Map<HTMLElement, string>();
    const setPlay = (el: HTMLElement, v: string) => {
      if ((states.get(el) ?? '') === v) return;
      if (v) el.dataset.play = v;
      else delete el.dataset.play;
      states.set(el, v);
    };
    const x = (abs: number) => PAD + abs * pxPerQuarter;
    let lastTarget = Number.NaN;
    let lastCount = '';
    let raf = 0;

    const frame = () => {
      raf = requestAnimationFrame(frame);
      const snap = transport.getSnapshot();
      const pos = snap.exerciseId === exercise.id ? transport.getPosition() : null;

      if (!pos || pos.state === 'stopped') {
        playhead.dataset.idle = 'true';
        playhead.style.transform = `translate3d(${x(0)}px,0,0)`;
        for (const n of notes) setPlay(n.el, '');
        if (lastCount) {
          countEl.textContent = '';
          countEl.hidden = true;
          lastCount = '';
        }
        lastTarget = Number.NaN;
        return;
      }

      const local = pos.isCountIn ? 0 : Math.min(pos.localQuarter, total);
      playhead.dataset.idle = pos.state === 'paused' ? 'true' : 'false';
      playhead.style.transform = `translate3d(${x(local)}px,0,0)`;

      const win = (HIGHLIGHT_SECONDS * snap.bpm) / 60;
      for (const n of notes) {
        let v = '';
        if (pos.state === 'playing') {
          const d = local - n.abs;
          if (d >= -1e-4 && d < win) v = 'active';
          else if (view.highlightUpcoming && d < 0 && -d <= beatUnit + EPS) v = 'next';
        } else if (pos.isCountIn && view.highlightUpcoming && n.abs < beatUnit - EPS) {
          v = 'next';
        }
        setPlay(n.el, v);
      }

      const text = pos.isCountIn ? String(pos.countInBeatsRemaining) : '';
      if (text !== lastCount) {
        countEl.textContent = text;
        countEl.hidden = !text;
        lastCount = text;
      }

      if (pos.state === 'paused' || view.scrollMode === 'fixed') return;
      const vw = scroller.clientWidth;
      if (scroller.scrollWidth <= vw + 1) return;
      const px = x(local);
      let target: number | null = null;
      if (view.scrollMode === 'follow') {
        // "Virada de página": só rola quando a linha chega perto da borda.
        if (px > scroller.scrollLeft + vw * 0.85 || px < scroller.scrollLeft + PAD / 2) target = Math.max(0, px - vw * 0.12);
        else lastTarget = Number.NaN;
      } else {
        target = Math.max(0, x(pos.barIndex * barLen) - PAD);
      }
      if (target !== null && !(Math.abs(target - lastTarget) < 1)) {
        lastTarget = target;
        scroller.scrollTo({ left: target, behavior: 'smooth' });
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [exercise, pxPerQuarter, total, barLen, beatUnit, view.scrollMode, view.highlightUpcoming, transport]);

  // ───────────── Edição ─────────────
  const locate = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const row = Math.floor((e.clientY - rect.top) / ROW_H);
    if (row < 0 || row >= INSTRUMENTS.length) return null;
    const abs = Math.min(Math.max((e.clientX - rect.left - PAD) / pxPerQuarter, 0), total - EPS);
    const snapped = snapToGrid(abs, ts, sub, exercise.totalBars);
    return { row, ...snapped };
  };

  const onRowsClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!editable || !onCellClick) return;
    const hit = locate(e);
    if (!hit) return;
    onCellClick({
      instrument: INSTRUMENTS[hit.row].id,
      barIndex: hit.barIndex,
      beatPosition: hit.beatPosition,
      shiftKey: e.shiftKey,
    });
  };

  const onRowsMove = (e: MouseEvent<HTMLDivElement>) => {
    const ghost = ghostRef.current;
    if (!editable || !ghost) return;
    const hit = locate(e);
    if (!hit) {
      ghost.hidden = true;
      return;
    }
    ghost.hidden = false;
    ghost.style.left = `${xOf(hit.barIndex * barLen + hit.beatPosition)}px`;
    ghost.style.top = `${hit.row * ROW_H + ROW_H / 2}px`;
  };

  const rowsHeight = INSTRUMENTS.length * ROW_H;

  return (
    <div className="relative flex overflow-hidden rounded-xl border border-line bg-panel">
      {/* Coluna fixa com os instrumentos */}
      <div className="z-10 w-[56px] shrink-0 border-r border-line bg-panel sm:w-[136px]">
        <div style={{ height: RULER_H }} className="flex items-center px-2 text-[10px] uppercase tracking-wider text-muted">
          <span className="hidden sm:inline">Peça</span>
        </div>
        <ul aria-label="Peças da bateria">
          {INSTRUMENTS.map((inst) => (
            <li
              key={inst.id}
              style={{ height: ROW_H }}
              className="grid-row flex items-center gap-2 border-t border-line/60 px-2 text-sm"
              title={inst.label}
            >
              <InstrumentIcon kind={inst.kind} className="shrink-0 text-muted" />
              <span className="hidden truncate sm:inline">{inst.label}</span>
              <span className="text-[11px] font-semibold text-muted sm:hidden" aria-label={inst.label}>
                {inst.short}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Área rolável */}
      <div ref={scrollerRef} className="grid-scroller relative min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
        <div ref={innerRef} className="relative" style={{ width, height: RULER_H + rowsHeight }}>
          {/* Régua */}
          <div className="absolute inset-x-0 top-0 select-none text-[11px] text-muted" style={{ height: RULER_H }} aria-hidden="true">
            {Array.from({ length: exercise.totalBars }, (_, bar) => (
              <span
                key={`b${bar}`}
                className="absolute top-1 rounded bg-panel-2 px-1.5 text-[10px] font-semibold text-fg"
                style={{ left: PAD + bar * barLen * pxPerQuarter + 4 }}
              >
                C{bar + 1}
              </span>
            ))}
            {rulerLabels.map((l, i) => (
              <span
                key={i}
                className={`tabular absolute bottom-1 -translate-x-1/2 ${l.strong ? 'opacity-0' : ''}`}
                style={{ left: l.x }}
              >
                {l.text}
              </span>
            ))}
          </div>

          {/* Linhas + notas */}
          <div
            className={`absolute inset-x-0 ${editable ? 'cursor-crosshair' : ''}`}
            style={{ top: RULER_H, height: rowsHeight }}
            onClick={onRowsClick}
            onMouseMove={onRowsMove}
            onMouseLeave={() => ghostRef.current && (ghostRef.current.hidden = true)}
          >
            {INSTRUMENTS.map((inst) => (
              <div key={inst.id} className="grid-row border-t border-line/60" style={{ height: ROW_H }} />
            ))}
            {activeBar !== null && activeBar < exercise.totalBars && (
              <div
                className="pointer-events-none absolute inset-y-0"
                style={{ left: xOf(activeBar * barLen), width: barLen * pxPerQuarter, background: 'var(--df-bar-active)' }}
              />
            )}
            {lines.map((l, i) => (
              <div key={i} className="grid-line" data-kind={l.kind} style={{ left: l.x }} />
            ))}
            <Notes
              exercise={exercise}
              xOf={xOf}
              barLen={barLen}
              total={total}
              editable={editable}
              selectedIds={selectedIds}
              onNoteClick={onNoteClick}
              onNoteDoubleClick={onNoteDoubleClick}
            />
            {editable && (
              <div
                ref={ghostRef}
                hidden
                aria-hidden="true"
                className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-muted/70"
              />
            )}
          </div>
          <div ref={playheadRef} className="playhead" data-idle="true" style={{ transform: `translate3d(${PAD}px,0,0)` }} />
        </div>
      </div>

      <div
        ref={countRef}
        hidden
        aria-hidden="true"
        className="tabular pointer-events-none absolute right-3 top-9 z-20 grid h-14 w-14 place-items-center rounded-full bg-primary text-2xl font-bold text-primary-fg shadow-lg"
      />
    </div>
  );
}

interface NotesProps {
  exercise: Exercise;
  xOf: (abs: number) => number;
  barLen: number;
  total: number;
  editable: boolean;
  selectedIds?: ReadonlySet<string>;
  onNoteClick?: (id: string, e: MouseEvent) => void;
  onNoteDoubleClick?: (id: string) => void;
}

const Notes = memo(function Notes({
  exercise,
  xOf,
  barLen,
  total,
  editable,
  selectedIds,
  onNoteClick,
  onNoteDoubleClick,
}: NotesProps) {
  return (
    <>
      {exercise.events.map((ev) => {
        const abs = ev.barIndex * barLen + ev.beatPosition;
        if (abs < -EPS || abs > total - EPS || ev.beatPosition > barLen - EPS) return null;
        const row = INSTRUMENT_ROW[ev.instrument];
        const limb = LIMB_BY_ID[ev.limb];
        const graces = ev.ornament === 'flam' ? 1 : ev.ornament === 'drag' ? 2 : 0;
        const selected = selectedIds?.has(ev.id) ?? false;
        const common = {
          className: 'note',
          'data-abs': abs,
          'data-limb': ev.limb,
          'data-accent': ev.accent,
          'data-ghost': !ev.accent && ev.velocity < 60,
          'data-offgrid': !isOnGrid(ev.beatPosition, exercise.subdivision),
          'data-selected': selected,
          style: { left: xOf(abs), top: row * ROW_H + ROW_H / 2 },
          title: noteLabel(ev, exercise),
        };
        const content = (
          <>
            {ev.accent && <span className="accent-mark" aria-hidden="true">&gt;</span>}
            {Array.from({ length: graces }, (_, i) => (
              <span
                key={i}
                className="grace"
                aria-hidden="true"
                style={{ left: -13 - i * 10, ['--g' as string]: LIMB_VAR[oppositeLimb(ev.limb)] }}
              />
            ))}
            <span aria-hidden="true">{limb.isFoot ? `P${limb.letter}` : limb.letter}</span>
          </>
        );
        return editable ? (
          <button
            key={ev.id}
            type="button"
            {...common}
            aria-label={noteLabel(ev, exercise)}
            aria-pressed={selected}
            onClick={(e) => {
              e.stopPropagation();
              onNoteClick?.(ev.id, e);
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onNoteDoubleClick?.(ev.id);
            }}
          >
            {content}
          </button>
        ) : (
          <div key={ev.id} role="img" {...common} aria-label={noteLabel(ev, exercise)} style={{ ...common.style, cursor: 'default' }}>
            {content}
          </div>
        );
      })}
    </>
  );
});
