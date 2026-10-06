import { useCallback, useEffect } from 'react';
import { Magnet, PencilLine, Save, Undo2 } from 'lucide-react';
import { useExercises, usePractice, useServices, useSettings } from '../../app/AppState';
import { navigate } from '../../app/router';
import { usePlaybackShortcuts } from '../../hooks/useTransport';
import {
  changeTimeSignature,
  countEventsOutsideBar,
  duplicateExercise,
  quantizeExercise,
  setSubdivision,
} from '../../music/exerciseOps';
import { countOffGridEvents } from '../../music/quantization';
import { formatTimeSignature } from '../../music/timeSignature';
import { SUBDIVISIONS } from '../../music/instruments';
import type { TimeSignature } from '../../music/types';
import { ExerciseView } from '../notation/ExerciseView';
import { PlaybackControls } from '../playback-controls/PlaybackControls';
import { ScrollModeSelect, SubdivisionSelect, TimeSignatureSelect } from '../playback-controls/Selectors';
import { Button, Select } from '../ui/primitives';
import { useFeedback } from '../ui/feedback';

export function PracticeScreen() {
  const { transport } = useServices();
  const { settings, update } = useSettings();
  const { session, exercise, select, setOverride, setBpm, setLoop, setCountInBars } = usePractice();
  const { library, userExercises, save } = useExercises();
  const { confirm, prompt, toast } = useFeedback();

  // Mantém o transporte em sincronia com a sessão de prática.
  useEffect(() => transport.load(exercise), [transport, exercise]);
  useEffect(() => transport.setBpm(session.bpm), [transport, session.bpm, exercise]);
  useEffect(() => transport.setLoop(session.loop), [transport, session.loop, exercise]);
  useEffect(() => transport.setCountInBars(session.countInBars), [transport, session.countInBars, exercise]);

  const onBpmDelta = useCallback((d: number) => setBpm(session.bpm + d), [setBpm, session.bpm]);
  usePlaybackShortcuts({ onBpm: onBpmDelta, enableArrows: true });

  const offGrid = countOffGridEvents(exercise.events, exercise.subdivision);
  const isLibrary = exercise.origin === 'library';
  const modified = session.override !== null;

  const onTimeSignature = async (ts: TimeSignature) => {
    const lost = countEventsOutsideBar(exercise, ts);
    if (lost > 0) {
      const ok = await confirm({
        title: `Mudar para ${formatTimeSignature(ts)}?`,
        message: `${lost} nota(s) não cabem no novo compasso e serão removidas desta sessão de prática.`,
        confirmLabel: 'Mudar',
        danger: true,
      });
      if (!ok) return;
    }
    setOverride(changeTimeSignature(exercise, ts));
  };

  const saveCopy = async () => {
    const name = await prompt({
      title: 'Salvar como meu exercício',
      label: 'Nome',
      initial: `${exercise.name}${isLibrary || modified ? ' (cópia)' : ''}`,
      confirmLabel: 'Salvar',
    });
    if (name === null) return null;
    const saved = save(
      duplicateExercise(
        { ...exercise, bpm: session.bpm, loopEnabled: session.loop, countInBars: session.countInBars },
        name,
      ),
    );
    select(saved.id);
    toast('Exercício salvo em "Meus exercícios".');
    return saved;
  };

  const edit = async () => {
    if (modified) {
      const saved = await saveCopy();
      if (saved) navigate({ name: 'editor', id: saved.id });
      return;
    }
    navigate(isLibrary ? { name: 'editor', copyOf: exercise.id } : { name: 'editor', id: exercise.id });
  };

  const tools = library.filter((e) => e.category === 'tool');
  const rudiments = library.filter((e) => e.category === 'rudiment');
  const gospelChops = library.filter((e) => e.category === 'gospel');

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 flex-1">
          <label className="flex max-w-md flex-col gap-1 text-xs text-muted">
            <span className="font-medium">Exercício</span>
            <Select value={session.exerciseId} onChange={(e) => select(e.target.value)} aria-label="Escolher exercício">
              <optgroup label="Ferramentas">
                {tools.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Rudimentos">
                {rudiments.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Gospel chops">
                {gospelChops.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </optgroup>
              {userExercises.length > 0 && (
                <optgroup label="Meus exercícios">
                  {userExercises.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </Select>
          </label>
          <h1 className="mt-3 text-xl font-semibold tracking-tight">{exercise.name}</h1>
          {exercise.description && <p className="mt-1 max-w-3xl text-sm text-muted">{exercise.description}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
            <span className="rounded-md bg-panel-2 px-2 py-0.5">{formatTimeSignature(exercise.tempoSignature)}</span>
            <span className="rounded-md bg-panel-2 px-2 py-0.5">
              {exercise.totalBars} compasso{exercise.totalBars > 1 ? 's' : ''}
            </span>
            <span className="rounded-md bg-panel-2 px-2 py-0.5">{SUBDIVISIONS.find((s) => s.id === exercise.subdivision)?.label}</span>
            <span className="rounded-md bg-panel-2 px-2 py-0.5">{exercise.events.length} notas</span>
            {exercise.sticking && (
              <span className="rounded-md border border-line px-2 py-0.5 font-mono text-[12px] tracking-wide text-fg" aria-label={`Sequência de mãos: ${exercise.sticking}`}>
                {exercise.sticking}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {modified && (
            <>
              <span className="self-center rounded-md bg-rh/15 px-2 py-1 text-xs font-medium text-rh">Alterado nesta sessão</span>
              <Button size="md" onClick={() => setOverride(null)}>
                <Undo2 size={15} /> Descartar
              </Button>
            </>
          )}
          {(modified || isLibrary) && (
            <Button size="md" onClick={() => void saveCopy()}>
              <Save size={15} /> Salvar cópia
            </Button>
          )}
          <Button size="md" variant="primary" onClick={() => void edit()}>
            <PencilLine size={15} /> {isLibrary && !modified ? 'Duplicar e editar' : 'Editar'}
          </Button>
        </div>
      </header>

      <PlaybackControls
        exercise={exercise}
        bpm={session.bpm}
        onBpm={setBpm}
        loop={session.loop}
        onLoop={setLoop}
        countInBars={session.countInBars}
        onCountIn={setCountInBars}
      >
        <TimeSignatureSelect value={exercise.tempoSignature} onChange={(ts) => void onTimeSignature(ts)} />
        <SubdivisionSelect value={exercise.subdivision} onChange={(s) => setOverride(setSubdivision(exercise, s))} />
        <ScrollModeSelect
          value={settings.view.scrollMode}
          onChange={(m) => update((s) => ({ ...s, view: { ...s.view, scrollMode: m } }))}
        />
      </PlaybackControls>

      {offGrid > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-muted">
          <span>
            {offGrid} nota(s) não estão alinhadas à subdivisão atual (contorno tracejado). Elas continuam tocando na posição original.
          </span>
          <Button
            size="sm"
            onClick={() => {
              const r = quantizeExercise(exercise);
              setOverride(r.exercise);
              toast(`${r.moved} nota(s) ajustada(s)${r.merged ? `, ${r.merged} mesclada(s)` : ''}.`);
            }}
          >
            <Magnet size={14} /> Quantizar
          </Button>
        </div>
      )}

      <ExerciseView exercise={exercise} view={settings.view} />
      <p className="text-xs text-muted">
        Atalhos: <kbd className="font-mono">Espaço</kbd> reproduzir/pausar · <kbd className="font-mono">Home</kbd> reiniciar ·{' '}
        <kbd className="font-mono">Esc</kbd> parar · <kbd className="font-mono">↑ ↓</kbd> BPM ±1 (Shift ±5)
      </p>
    </div>
  );
}
