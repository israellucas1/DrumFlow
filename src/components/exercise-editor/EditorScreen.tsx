import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ClipboardPaste,
  Copy,
  CopyPlus,
  Eraser,
  Magnet,
  Play,
  Redo2,
  Save,
  SaveAll,
  Undo2,
} from 'lucide-react';
import type { Exercise, Limb, SubdivisionId, TimeSignature } from '../../music/types';
import { useExercises, usePractice, useServices, useSettings } from '../../app/AppState';
import { navigate, replaceRoute, setNavigationGuard, type Route } from '../../app/router';
import { isTyping, usePlaybackShortcuts } from '../../hooks/useTransport';
import {
  ACCENT_VELOCITY,
  DEFAULT_VELOCITY,
  MAX_BARS,
  addEvent,
  changeTimeSignature,
  clearBar,
  copyEvents,
  countEventsBeyondBars,
  countEventsOutsideBar,
  createBlankExercise,
  duplicateBar,
  duplicateEvents,
  duplicateExercise,
  findEventAt,
  moveEventTo,
  moveEventsBySteps,
  pasteEvents,
  quantizeExercise,
  removeEvents,
  setSubdivision,
  setTotalBars,
  updateEvents,
  type ClipboardData,
  type EventData,
} from '../../music/exerciseOps';
import { canRedo, canUndo, createHistory, pushHistory, redo, replacePresent, undo } from '../../music/history';
import { INSTRUMENTS, INSTRUMENT_ROW, SUBDIVISIONS, resolveLimb } from '../../music/instruments';
import { STEPS_PER_QUARTER, clampBpm } from '../../music/beatMath';
import { beatUnitInQuarters, formatTimeSignature } from '../../music/timeSignature';
import { countOffGridEvents } from '../../music/quantization';
import type { CellClick } from '../music-grid/MusicGrid';
import { ExerciseView } from '../notation/ExerciseView';
import { PlaybackControls } from '../playback-controls/PlaybackControls';
import { SubdivisionSelect, TimeSignatureSelect } from '../playback-controls/Selectors';
import { Button, Field, Panel, Select, TextInput, Toggle } from '../ui/primitives';
import { useFeedback } from '../ui/feedback';
import { AddNoteForm, LimbPicker, NoteInspector } from './NoteInspector';

/** Área de transferência do editor (sobrevive à troca de exercício). */
let clipboard: ClipboardData | null = null;

type EditorRoute = Extract<Route, { name: 'editor' }>;

export function EditorScreen({ route }: { route: EditorRoute }) {
  const { transport, engine } = useServices();
  const { settings } = useSettings();
  const exercises = useExercises();
  const practice = usePractice();
  const { confirm, prompt, toast } = useFeedback();

  // Exercício inicial (calculado uma vez; o componente é recriado a cada rota).
  const [initial] = useState(() => {
    const blank = () => createBlankExercise({ bpm: settings.defaultBpm, countInBars: settings.countInBars });
    const sourceId = route.id ?? route.copyOf;
    const src = sourceId ? exercises.getById(sourceId) : null;
    if (sourceId && !src) return { exercise: blank(), persisted: false, notFound: true };
    if (src && (route.copyOf || src.origin === 'library')) {
      return { exercise: duplicateExercise(src, `${src.name} (cópia)`), persisted: false, notFound: false };
    }
    if (src) return { exercise: src, persisted: true, notFound: false };
    return { exercise: blank(), persisted: false, notFound: false };
  });

  const [history, setHistory] = useState(() => createHistory<Exercise>(initial.exercise));
  const [savedVersion, setSavedVersion] = useState<Exercise | null>(initial.persisted ? initial.exercise : null);
  const draft = history.present;
  // Um exercício novo e intocado não conta como "alterado".
  const dirty = savedVersion ? draft !== savedVersion : draft !== initial.exercise;
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set());
  const [activeBar, setActiveBar] = useState(0);
  const [brush, setBrush] = useState<Limb>('rightHand');
  const [brushAccent, setBrushAccent] = useState(false);
  const [hasClip, setHasClip] = useState(clipboard !== null);

  useEffect(() => {
    if (initial.notFound) toast('Exercício não encontrado — abrindo um novo.', 'error');
  }, [initial.notFound, toast]);

  const commit = useCallback(
    (next: Exercise, coalesceKey?: string) => setHistory((h) => pushHistory(h, next, { coalesceKey })),
    [],
  );

  // Seleção válida = ids que ainda existem (desfazer pode remover notas).
  const selected = useMemo(() => draft.events.filter((e) => selection.has(e.id)), [draft.events, selection]);
  const selectedIds = useMemo(() => new Set(selected.map((e) => e.id)), [selected]);
  const bar = Math.min(activeBar, draft.totalBars - 1);
  const offGrid = countOffGridEvents(draft.events, draft.subdivision);

  // ───────────── Transporte ─────────────
  useEffect(() => transport.load(draft), [transport, draft]);
  useEffect(() => transport.setBpm(draft.bpm), [transport, draft.bpm]);
  useEffect(() => transport.setLoop(draft.loopEnabled), [transport, draft.loopEnabled]);
  useEffect(() => transport.setCountInBars(draft.countInBars), [transport, draft.countInBars]);
  const draftId = useRef(draft.id);
  draftId.current = draft.id;
  useEffect(
    () => () => {
      // Ao sair do editor, para a reprodução do rascunho. O adiamento + a checagem do DOM
      // ignoram a desmontagem simulada do StrictMode (que remonta imediatamente).
      const id = draftId.current;
      setTimeout(() => {
        if (!document.querySelector('[data-editor-root]') && transport.loadedExerciseId === id) transport.stop();
      }, 0);
    },
    [transport],
  );

  // ───────────── Proteção contra perda de alterações ─────────────
  useEffect(() => {
    setNavigationGuard(dirty ? () => window.confirm('Há alterações não salvas neste exercício. Sair mesmo assim?') : null);
    if (!dirty) return () => setNavigationGuard(null);
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      setNavigationGuard(null);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [dirty]);

  // ───────────── Ações ─────────────
  const preview = (data: EventData) => {
    void engine
      .ensureRunning()
      .then(() => engine.preview({ ...data, id: 'preview' }))
      .catch(() => {});
  };

  const onCellClick = (c: CellClick) => {
    setActiveBar(c.barIndex);
    const existing = findEventAt(draft, c.instrument, c.barIndex, c.beatPosition);
    if (existing) {
      selectNote(existing.id, c.shiftKey);
      return;
    }
    const data: EventData = {
      instrument: c.instrument,
      limb: resolveLimb(brush, c.instrument),
      barIndex: c.barIndex,
      beatPosition: c.beatPosition,
      accent: brushAccent,
      velocity: brushAccent ? ACCENT_VELOCITY : DEFAULT_VELOCITY,
    };
    const { exercise, event } = addEvent(draft, data);
    commit(exercise);
    setSelection(c.shiftKey ? new Set([...selectedIds, event.id]) : new Set([event.id]));
    preview(data);
  };

  const selectNote = (id: string, additive: boolean) => {
    const ev = draft.events.find((e) => e.id === id);
    if (ev) setActiveBar(ev.barIndex);
    if (additive) {
      const next = new Set(selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setSelection(next);
    } else {
      setSelection(new Set([id]));
    }
  };

  const deleteSelection = () => {
    if (selectedIds.size === 0) return;
    commit(removeEvents(draft, selectedIds));
    setSelection(new Set());
  };

  const stepsPerBeat = Math.max(1, Math.round(beatUnitInQuarters(draft.tempoSignature) * STEPS_PER_QUARTER[draft.subdivision]));

  const moveSteps = (steps: number) => {
    const next = moveEventsBySteps(draft, selectedIds, steps);
    if (next === draft) toast('A nota sairia dos limites do exercício.', 'error');
    else commit(next, `move${steps > 0 ? '+' : '-'}`);
  };

  const shiftRow = (delta: number) => {
    if (selected.length === 0) return;
    const rows = selected.map((e) => INSTRUMENT_ROW[e.instrument] + delta);
    if (rows.some((r) => r < 0 || r >= INSTRUMENTS.length)) return;
    let next = draft;
    for (const ev of selected) {
      const instrument = INSTRUMENTS[INSTRUMENT_ROW[ev.instrument] + delta].id;
      next = updateEvents(next, [ev.id], { instrument, limb: resolveLimb(ev.limb, instrument) });
    }
    commit(next);
  };

  const duplicateSelection = () => {
    if (selectedIds.size === 0) return;
    const { exercise, newIds } = duplicateEvents(draft, selectedIds, 1 / STEPS_PER_QUARTER[draft.subdivision]);
    if (newIds.length === 0) return toast('Não há espaço depois das notas selecionadas.', 'error');
    commit(exercise);
    setSelection(new Set(newIds));
  };

  const copySelection = () => {
    const clip = copyEvents(draft, selectedIds);
    if (!clip) return;
    clipboard = clip;
    setHasClip(true);
    toast(`${clip.events.length} nota(s) copiada(s).`);
  };

  const paste = () => {
    if (!clipboard) return;
    const { exercise, newIds } = pasteEvents(draft, clipboard, bar);
    if (newIds.length === 0) return toast('Nada coube no compasso atual.', 'error');
    commit(exercise);
    setSelection(new Set(newIds));
    toast(`Colado a partir do compasso ${bar + 1}.`);
  };

  const toggleAccent = () => {
    if (selected.length === 0) return;
    const on = !selected.every((e) => e.accent);
    commit(updateEvents(draft, selectedIds, { accent: on }));
  };

  const doUndo = () => setHistory((h) => undo(h));
  const doRedo = () => setHistory((h) => redo(h));

  const onTimeSignature = async (ts: TimeSignature) => {
    const lost = countEventsOutsideBar(draft, ts);
    if (lost > 0) {
      const ok = await confirm({
        title: `Mudar para ${formatTimeSignature(ts)}?`,
        message: `${lost} nota(s) ficam fora do novo compasso e serão removidas (é possível desfazer).`,
        confirmLabel: 'Mudar',
        danger: true,
      });
      if (!ok) return;
    }
    commit(changeTimeSignature(draft, ts));
  };

  const onTotalBars = async (n: number) => {
    const target = Math.min(MAX_BARS, Math.max(1, Math.round(n)));
    const lost = countEventsBeyondBars(draft, target);
    if (lost > 0) {
      const ok = await confirm({
        title: `Reduzir para ${target} compasso(s)?`,
        message: `${lost} nota(s) dos compassos removidos serão apagadas (é possível desfazer).`,
        confirmLabel: 'Reduzir',
        danger: true,
      });
      if (!ok) return;
    }
    commit(setTotalBars(draft, target));
  };

  const quantize = () => {
    const r = quantizeExercise(draft);
    if (r.moved === 0 && r.merged === 0) return toast('Todas as notas já estão na grade.');
    commit(r.exercise);
    const label = SUBDIVISIONS.find((s) => s.id === draft.subdivision)?.label.toLowerCase() ?? 'a subdivisão';
    toast(`${r.moved} nota(s) ajustada(s) para ${label}${r.merged ? `, ${r.merged} mesclada(s)` : ''}.`);
  };

  const save = () => {
    const saved = exercises.save(draft);
    setHistory((h) => replacePresent(h, saved));
    setSavedVersion(saved);
    if (route.id !== saved.id) replaceRoute({ name: 'editor', id: saved.id });
    toast('Exercício salvo.');
    return saved;
  };

  const saveAs = async () => {
    const name = await prompt({ title: 'Salvar como novo exercício', label: 'Nome', initial: `${draft.name} (cópia)`, confirmLabel: 'Salvar' });
    if (name === null) return;
    const saved = exercises.save(duplicateExercise(draft, name));
    setNavigationGuard(null);
    navigate({ name: 'editor', id: saved.id });
    toast(`"${saved.name}" criado.`);
  };

  const practiceIt = async () => {
    let id = draft.id;
    if (dirty) {
      const ok = await confirm({ title: 'Salvar antes de praticar?', message: 'O exercício precisa ser salvo para abrir na tela Prática.', confirmLabel: 'Salvar e praticar' });
      if (!ok) return;
      id = save().id;
    }
    setNavigationGuard(null);
    practice.select(id);
    navigate({ name: 'practice' });
  };

  // ───────────── Teclado ─────────────
  const actions = { deleteSelection, moveSteps, shiftRow, duplicateSelection, copySelection, paste, toggleAccent, doUndo, doRedo, save };
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const hasSelection = selectedIds.size > 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const a = actionsRef.current;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'z' && !e.shiftKey) return e.preventDefault(), a.doUndo();
      if (mod && (key === 'y' || (key === 'z' && e.shiftKey))) return e.preventDefault(), a.doRedo();
      if (mod && key === 'c') return a.copySelection();
      if (mod && key === 'v') return e.preventDefault(), a.paste();
      if (mod && key === 'd') return e.preventDefault(), a.duplicateSelection();
      if (mod && key === 's') return e.preventDefault(), void a.save();
      if (mod || e.altKey) return;
      if (e.key === 'Delete' || e.key === 'Backspace') return e.preventDefault(), a.deleteSelection();
      if (!hasSelection) return;
      if (e.key === 'ArrowLeft') return e.preventDefault(), a.moveSteps(e.shiftKey ? -stepsPerBeat : -1);
      if (e.key === 'ArrowRight') return e.preventDefault(), a.moveSteps(e.shiftKey ? stepsPerBeat : 1);
      if (e.key === 'ArrowUp') return e.preventDefault(), a.shiftRow(-1);
      if (e.key === 'ArrowDown') return e.preventDefault(), a.shiftRow(1);
      if (key === 'a') return a.toggleAccent();
      if (e.key === 'Escape') setSelection(new Set());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hasSelection, stepsPerBeat]);

  const onBpmDelta = useCallback((d: number) => commit({ ...draft, bpm: clampBpm(draft.bpm + d) }, 'bpm'), [commit, draft]);
  usePlaybackShortcuts({ onBpm: onBpmDelta, enableArrows: !hasSelection });

  // ───────────── Render ─────────────
  return (
    <div className="flex flex-col gap-4" data-editor-root>
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="grid flex-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <Field label="Nome do exercício">
            <TextInput value={draft.name} maxLength={120} onChange={(e) => commit({ ...draft, name: e.target.value }, 'name')} />
          </Field>
          <Field label="Descrição">
            <TextInput
              value={draft.description}
              maxLength={500}
              placeholder="Opcional"
              onChange={(e) => commit({ ...draft, description: e.target.value }, 'description')}
            />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-xs font-medium ${dirty ? 'text-rh' : 'text-muted'}`} role="status">
            {dirty ? 'Alterações não salvas' : 'Salvo'}
          </span>
          <Button variant="primary" onClick={() => save()} title="Salvar (Ctrl+S)">
            <Save size={15} /> Salvar
          </Button>
          <Button onClick={() => void saveAs()}>
            <SaveAll size={15} /> Salvar como…
          </Button>
          <Button onClick={() => void practiceIt()}>
            <Play size={15} /> Praticar
          </Button>
        </div>
      </header>

      <PlaybackControls
        exercise={draft}
        bpm={draft.bpm}
        onBpm={(b) => commit({ ...draft, bpm: clampBpm(b) }, 'bpm')}
        loop={draft.loopEnabled}
        onLoop={(on) => commit({ ...draft, loopEnabled: on })}
        countInBars={draft.countInBars}
        onCountIn={(n) => commit({ ...draft, countInBars: n })}
      >
        <TimeSignatureSelect value={draft.tempoSignature} onChange={(ts) => void onTimeSignature(ts)} />
        <SubdivisionSelect value={draft.subdivision} onChange={(s: SubdivisionId) => commit(setSubdivision(draft, s))} />
        <Field label="Compassos">
          <Select value={draft.totalBars} onChange={(e) => void onTotalBars(Number(e.target.value))} aria-label="Quantidade de compassos">
            {Array.from({ length: MAX_BARS }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </Select>
        </Field>
      </PlaybackControls>

      {/* Barra de ferramentas do editor */}
      <Panel className="flex flex-wrap items-center gap-x-4 gap-y-3 px-3 py-3">
        <div className="flex flex-col gap-1 text-xs text-muted">
          <span className="font-medium">Pincel (novas notas)</span>
          <div className="flex flex-wrap items-center gap-1.5">
            <LimbPicker label="Membro das novas notas" value={brush} onChange={setBrush} />
            <Toggle checked={brushAccent} onChange={setBrushAccent} label="Acento" title="Novas notas já acentuadas" />
          </div>
        </div>
        <div className="flex items-center gap-1.5 self-end">
          <Button size="icon" aria-label="Desfazer (Ctrl+Z)" title="Desfazer (Ctrl+Z)" onClick={doUndo} disabled={!canUndo(history)}>
            <Undo2 size={16} />
          </Button>
          <Button size="icon" aria-label="Refazer (Ctrl+Y)" title="Refazer (Ctrl+Y)" onClick={doRedo} disabled={!canRedo(history)}>
            <Redo2 size={16} />
          </Button>
          <Button size="icon" aria-label="Copiar seleção (Ctrl+C)" title="Copiar (Ctrl+C)" onClick={copySelection} disabled={!hasSelection}>
            <Copy size={16} />
          </Button>
          <Button size="icon" aria-label={`Colar no compasso ${bar + 1} (Ctrl+V)`} title="Colar no compasso atual (Ctrl+V)" onClick={paste} disabled={!hasClip}>
            <ClipboardPaste size={16} />
          </Button>
        </div>
        <div className="flex flex-wrap items-end gap-1.5">
          <Field label="Compasso atual">
            <Select value={bar} onChange={(e) => setActiveBar(Number(e.target.value))} aria-label="Compasso atual">
              {Array.from({ length: draft.totalBars }, (_, i) => (
                <option key={i} value={i}>
                  {i + 1}
                </option>
              ))}
            </Select>
          </Field>
          <Button onClick={() => commit(duplicateBar(draft, bar))} disabled={draft.totalBars >= MAX_BARS} title="Insere uma cópia logo depois">
            <CopyPlus size={15} /> Duplicar compasso
          </Button>
          <Button
            onClick={() => {
              commit(clearBar(draft, bar));
              setSelection(new Set());
            }}
            disabled={!draft.events.some((e) => e.barIndex === bar)}
          >
            <Eraser size={15} /> Limpar compasso
          </Button>
        </div>
        <div className="flex items-end gap-2 self-end">
          <Button onClick={quantize} title="Move as notas para a posição mais próxima da subdivisão atual">
            <Magnet size={15} /> Quantizar{offGrid > 0 ? ` (${offGrid} fora)` : ''}
          </Button>
        </div>
      </Panel>

      <ExerciseView
        gridRequired
        exercise={draft}
        view={settings.view}
        editable
        selectedIds={selectedIds}
        activeBar={bar}
        onCellClick={onCellClick}
        onNoteClick={(id, e) => selectNote(id, e.shiftKey || e.ctrlKey || e.metaKey)}
        onNoteDoubleClick={(id) => {
          commit(removeEvents(draft, [id]));
          setSelection(new Set());
        }}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Panel className="p-4">
          <NoteInspector
            exercise={draft}
            selected={selected}
            onPatch={(patch, key) => commit(updateEvents(draft, selectedIds, patch), key)}
            onMoveSteps={moveSteps}
            onShiftRow={shiftRow}
            onMoveTo={(id, b, p) => commit(moveEventTo(draft, id, b, p))}
            onDuplicate={duplicateSelection}
            onCopy={copySelection}
            onDelete={deleteSelection}
          />
        </Panel>
        <Panel className="p-4">
          <AddNoteForm
            exercise={draft}
            defaultBar={bar}
            brush={brush}
            onAdd={(data) => {
              const existing = findEventAt(draft, data.instrument, data.barIndex, data.beatPosition);
              if (existing) {
                setSelection(new Set([existing.id]));
                return toast('Já existe uma nota desse instrumento nessa posição — ela foi selecionada.');
              }
              const { exercise, event } = addEvent(draft, data);
              commit(exercise);
              setSelection(new Set([event.id]));
              preview(data);
            }}
          />
        </Panel>
      </div>
      <p className="text-xs text-muted">
        Atalhos: <kbd className="font-mono">Delete</kbd> excluir · <kbd className="font-mono">← →</kbd> mover (Shift: um tempo) ·{' '}
        <kbd className="font-mono">↑ ↓</kbd> trocar peça · <kbd className="font-mono">A</kbd> acento · <kbd className="font-mono">Ctrl+Z/Y</kbd>{' '}
        desfazer/refazer · <kbd className="font-mono">Ctrl+C/V</kbd> copiar/colar · <kbd className="font-mono">Ctrl+D</kbd> duplicar ·{' '}
        <kbd className="font-mono">Ctrl+S</kbd> salvar · <kbd className="font-mono">Espaço</kbd> tocar/pausar
      </p>
    </div>
  );
}
