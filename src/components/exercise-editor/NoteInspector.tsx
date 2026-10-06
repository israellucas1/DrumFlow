import { useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Copy, CopyPlus, Plus, Trash2 } from 'lucide-react';
import type { Exercise, InstrumentId, Limb, MusicEvent, Ornament } from '../../music/types';
import { INSTRUMENTS, INSTRUMENT_BY_ID, LIMBS, ORNAMENTS, resolveLimb } from '../../music/instruments';
import { formatPosition, gridPositionsInBar, nearlyEqual } from '../../music/beatMath';
import type { EventData } from '../../music/exerciseOps';
import { ACCENT_VELOCITY, DEFAULT_VELOCITY } from '../../music/exerciseOps';
import { Button, Field, Select, cx } from '../ui/primitives';

const LIMB_VAR: Record<Limb, string> = {
  rightHand: 'var(--df-rh)',
  leftHand: 'var(--df-lh)',
  rightFoot: 'var(--df-rf)',
  leftFoot: 'var(--df-lf)',
};

export function LimbPicker({ value, onChange, label }: { value: Limb | null; onChange: (l: Limb) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {LIMBS.map((l) => (
        <button
          key={l.id}
          type="button"
          role="radio"
          aria-checked={value === l.id}
          onClick={() => onChange(l.id)}
          title={l.label}
          className={cx(
            'inline-flex h-9 items-center gap-1.5 rounded-lg border px-2 text-xs transition-colors',
            value === l.id ? 'border-fg bg-panel-2 text-fg' : 'border-line text-muted hover:text-fg',
          )}
        >
          <span className="limb-swatch" data-foot={l.isFoot} style={{ ['--c' as string]: LIMB_VAR[l.id] }} aria-hidden="true">
            {l.isFoot ? `P${l.letter}` : l.letter}
          </span>
          <span className="hidden sm:inline">{l.label}</span>
          <span className="sm:hidden">{l.short}</span>
        </button>
      ))}
    </div>
  );
}

function common<T>(events: MusicEvent[], get: (e: MusicEvent) => T): T | null {
  if (events.length === 0) return null;
  const first = get(events[0]);
  return events.every((e) => get(e) === first) ? first : null;
}

function positionOptions(ex: Exercise, current?: number) {
  const opts = gridPositionsInBar(ex.tempoSignature, ex.subdivision);
  if (current !== undefined && !opts.some((p) => nearlyEqual(p, current))) opts.push(current);
  return opts.sort((a, b) => a - b).map((p) => ({ value: p, label: formatPosition(0, p, ex.tempoSignature).replace(/^Compasso 1 · /, '') }));
}

export interface NoteInspectorProps {
  exercise: Exercise;
  selected: MusicEvent[];
  onPatch: (patch: Partial<EventData>, coalesceKey?: string) => void;
  onMoveSteps: (steps: number) => void;
  onShiftRow: (delta: number) => void;
  onMoveTo: (id: string, barIndex: number, beatPosition: number) => void;
  onDuplicate: () => void;
  onCopy: () => void;
  onDelete: () => void;
}

export function NoteInspector({ exercise, selected, onPatch, onMoveSteps, onShiftRow, onMoveTo, onDuplicate, onCopy, onDelete }: NoteInspectorProps) {
  if (selected.length === 0) {
    return (
      <div className="text-sm text-muted">
        <p className="font-medium text-fg">Nenhuma nota selecionada</p>
        <p className="mt-1">
          Clique numa célula vazia para adicionar uma nota; clique numa nota para selecioná-la (Shift/Ctrl para várias). Duplo
          clique remove.
        </p>
      </div>
    );
  }
  const single = selected.length === 1 ? selected[0] : null;
  const instrument = common(selected, (e) => e.instrument);
  const limb = common(selected, (e) => e.limb);
  const accent = common(selected, (e) => e.accent);
  const velocity = common(selected, (e) => e.velocity);
  const ornament = common(selected, (e) => e.ornament ?? 'none');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">
          {single ? `${INSTRUMENT_BY_ID[single.instrument].label}` : `${selected.length} notas selecionadas`}
        </p>
        {single && <p className="text-xs text-muted">{formatPosition(single.barIndex, single.beatPosition, exercise.tempoSignature)}</p>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Instrumento">
          <Select
            value={instrument ?? ''}
            onChange={(e) => {
              const id = e.target.value as InstrumentId;
              // Ajusta o membro se ele não fizer sentido no novo instrumento (ex.: mão → bumbo).
              onPatch({ instrument: id, ...(limb ? { limb: resolveLimb(limb, id) } : {}) });
            }}
          >
            {instrument === null && <option value="">— vários —</option>}
            {INSTRUMENTS.map((i) => (
              <option key={i.id} value={i.id}>
                {i.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Apojatura">
          <Select value={ornament ?? ''} onChange={(e) => onPatch({ ornament: e.target.value as Ornament })}>
            {ornament === null && <option value="">— vários —</option>}
            {ORNAMENTS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="flex flex-col gap-1 text-xs text-muted">
        <span className="font-medium">Mão ou pé</span>
        <LimbPicker label="Membro executor" value={limb} onChange={(l) => onPatch({ limb: l })} />
      </div>

      <div className="grid items-end gap-3 sm:grid-cols-[auto_1fr]">
        <label className="flex h-9 items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[var(--df-primary)]"
            checked={accent === true}
            ref={(el) => {
              if (el) el.indeterminate = accent === null;
            }}
            onChange={(e) =>
              onPatch({ accent: e.target.checked, ...(e.target.checked && (velocity ?? 0) < ACCENT_VELOCITY ? { velocity: ACCENT_VELOCITY } : {}) })
            }
          />
          Acentuada
        </label>
        <Field label={`Intensidade${velocity !== null ? `: ${velocity}` : ''}`}>
          <input
            type="range"
            min={1}
            max={127}
            value={velocity ?? DEFAULT_VELOCITY}
            aria-valuetext={velocity !== null ? `${velocity} de 127` : 'vários valores'}
            onChange={(e) => onPatch({ velocity: Number(e.target.value) }, 'velocity')}
            className="cursor-pointer"
          />
        </Field>
      </div>

      {single && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Compasso">
            <Select value={single.barIndex} onChange={(e) => onMoveTo(single.id, Number(e.target.value), single.beatPosition)}>
              {Array.from({ length: exercise.totalBars }, (_, i) => (
                <option key={i} value={i}>
                  {i + 1}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Posição no compasso">
            <Select value={single.beatPosition} onChange={(e) => onMoveTo(single.id, single.barIndex, Number(e.target.value))}>
              {positionOptions(exercise, single.beatPosition).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        <Button size="icon" aria-label="Mover um passo para trás (←)" title="Mover para trás (←)" onClick={() => onMoveSteps(-1)}>
          <ArrowLeft size={16} />
        </Button>
        <Button size="icon" aria-label="Mover um passo para frente (→)" title="Mover para frente (→)" onClick={() => onMoveSteps(1)}>
          <ArrowRight size={16} />
        </Button>
        <Button size="icon" aria-label="Mover para a peça de cima (↑)" title="Peça de cima (↑)" onClick={() => onShiftRow(-1)}>
          <ArrowUp size={16} />
        </Button>
        <Button size="icon" aria-label="Mover para a peça de baixo (↓)" title="Peça de baixo (↓)" onClick={() => onShiftRow(1)}>
          <ArrowDown size={16} />
        </Button>
        <Button onClick={onDuplicate} title="Duplicar no passo seguinte (Ctrl+D)">
          <CopyPlus size={15} /> Duplicar
        </Button>
        <Button onClick={onCopy} title="Copiar (Ctrl+C)">
          <Copy size={15} /> Copiar
        </Button>
        <Button variant="danger" onClick={onDelete} title="Excluir (Delete)">
          <Trash2 size={15} /> Excluir
        </Button>
      </div>
    </div>
  );
}

/** Formulário acessível por teclado para inserir uma nota sem usar o mouse. */
export function AddNoteForm({
  exercise,
  defaultBar,
  brush,
  onAdd,
}: {
  exercise: Exercise;
  defaultBar: number;
  brush: Limb;
  onAdd: (data: EventData) => void;
}) {
  const [instrument, setInstrument] = useState<InstrumentId>('snare');
  const [bar, setBar] = useState<number | null>(null);
  const [pos, setPos] = useState(0);
  const [accent, setAccent] = useState(false);
  const barIndex = Math.min(bar ?? defaultBar, exercise.totalBars - 1);
  const options = positionOptions(exercise);
  const position = options.some((o) => nearlyEqual(o.value, pos)) ? pos : 0;

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        onAdd({
          instrument,
          limb: resolveLimb(brush, instrument),
          barIndex,
          beatPosition: position,
          accent,
          velocity: accent ? ACCENT_VELOCITY : DEFAULT_VELOCITY,
        });
      }}
    >
      <p className="text-sm font-semibold">Adicionar nota</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Instrumento">
          <Select value={instrument} onChange={(e) => setInstrument(e.target.value as InstrumentId)}>
            {INSTRUMENTS.map((i) => (
              <option key={i.id} value={i.id}>
                {i.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Compasso">
          <Select value={barIndex} onChange={(e) => setBar(Number(e.target.value))}>
            {Array.from({ length: exercise.totalBars }, (_, i) => (
              <option key={i} value={i}>
                {i + 1}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Posição">
          <Select value={position} onChange={(e) => setPos(Number(e.target.value))}>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4" checked={accent} onChange={(e) => setAccent(e.target.checked)} />
          Acentuada
        </label>
        <Button type="submit">
          <Plus size={15} /> Adicionar ({resolveLimb(brush, instrument) === brush ? 'pincel atual' : 'membro padrão'})
        </Button>
      </div>
    </form>
  );
}
