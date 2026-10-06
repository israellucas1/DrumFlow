import type { ReactNode } from 'react';
import { Drum, Pause, Play, Repeat, RotateCcw, Square, Volume2, VolumeX, X } from 'lucide-react';
import type { Exercise, PlaybackState } from '../../music/types';
import { useServices, useSettings } from '../../app/AppState';
import { useTransportSnapshot } from '../../hooks/useTransport';
import { Button, Select, Toggle, cx } from '../ui/primitives';
import { BpmControl } from './BpmControl';
import { BeatIndicator } from './BeatIndicator';
import { PracticeTimer } from './PracticeTimer';
import { BackingControl } from './BackingControl';
import { RecordButton, RecordingsPanel } from './RecordPanel';

const STATE_TEXT: Record<PlaybackState, string> = {
  stopped: 'Parado',
  countIn: 'Contagem inicial',
  playing: 'Tocando',
  paused: 'Pausado',
};

export interface PlaybackControlsProps {
  exercise: Exercise;
  bpm: number;
  onBpm: (bpm: number) => void;
  loop: boolean;
  onLoop: (on: boolean) => void;
  countInBars: number;
  onCountIn: (bars: number) => void;
  /** Mostra o cronômetro de treino genérico (a sessão de estudo usa o próprio). */
  showTimer?: boolean;
  /** Controles adicionais (fórmula de compasso, subdivisão...). */
  children?: ReactNode;
}

export function PlaybackControls({ exercise, bpm, onBpm, loop, onLoop, countInBars, onCountIn, showTimer = true, children }: PlaybackControlsProps) {
  const { transport } = useServices();
  const { settings, update } = useSettings();
  const snap = useTransportSnapshot();
  const mine = snap.exerciseId === exercise.id;
  const state: PlaybackState = mine ? snap.state : 'stopped';
  const active = state === 'playing' || state === 'countIn';
  const audio = settings.audio;
  const setAudio = (patch: Partial<typeof audio>) => update((s) => ({ ...s, audio: { ...s.audio, ...patch } }));

  const playLabel = active ? 'Pausar' : state === 'paused' ? 'Retomar' : 'Reproduzir';

  return (
    <div className="flex flex-col gap-3">
      {/* Linha principal — fixa no topo em telas pequenas */}
      <div className="sticky top-0 z-30 -mx-4 flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-line bg-bg/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:rounded-xl md:border md:bg-panel md:px-4">
        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="icon-lg"
            className="rounded-full"
            aria-label={`${playLabel} (Espaço)`}
            title={`${playLabel} (Espaço)`}
            onClick={() => void transport.togglePlay()}
          >
            {active ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" className="ml-0.5" />}
          </Button>
          <Button size="icon" aria-label="Parar (Esc)" title="Parar (Esc)" onClick={() => transport.stop()} disabled={state === 'stopped'}>
            <Square size={15} fill="currentColor" />
          </Button>
          <Button size="icon" aria-label="Reiniciar desde a contagem (Home)" title="Reiniciar (Home)" onClick={() => void transport.restart()}>
            <RotateCcw size={16} />
          </Button>
        </div>

        <div className="min-w-[96px]">
          <div
            className={cx(
              'text-sm font-semibold',
              state === 'playing' && 'text-fg',
              state === 'countIn' && 'text-lh',
              (state === 'stopped' || state === 'paused') && 'text-muted',
            )}
            role="status"
            aria-live="polite"
          >
            {STATE_TEXT[state]}
          </div>
          <BeatIndicator exercise={exercise} />
        </div>

        <BpmControl bpm={bpm} onChange={onBpm} className="w-full sm:w-auto md:ml-auto" />
      </div>

      {snap.error && (
        <div role="alert" className="flex items-start gap-3 rounded-lg border border-danger/50 bg-danger/10 px-3 py-2 text-sm text-danger">
          <span className="flex-1">{snap.error}</span>
          <button aria-label="Fechar aviso" onClick={() => transport.clearError()} className="opacity-80 hover:opacity-100">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Linha secundária */}
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted">
          <span className="font-medium">Contagem</span>
          <Select value={countInBars} onChange={(e) => onCountIn(Number(e.target.value))} aria-label="Compassos de contagem inicial">
            <option value={0}>Sem contagem</option>
            <option value={1}>1 compasso</option>
            <option value={2}>2 compassos</option>
            <option value={4}>4 compassos</option>
          </Select>
        </label>
        {children}
        {showTimer && <PracticeTimer exerciseId={exercise.id} onEnableLoop={() => !loop && onLoop(true)} />}
        <BackingControl bpm={bpm} onBpm={onBpm} />
        <div className="flex flex-col gap-1 text-xs text-muted">
          <span className="font-medium">Gravação</span>
          <RecordButton exercise={exercise} />
        </div>
        <Toggle checked={loop} onChange={onLoop} label="Loop" icon={<Repeat size={15} />} title="Repetir continuamente" />
        <Toggle
          checked={audio.metronomeEnabled}
          onChange={(v) => setAudio({ metronomeEnabled: v })}
          label="Metrônomo"
          icon={audio.metronomeEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
          title="Som do metrônomo (a grade continua funcionando)"
        />
        <label className="flex h-9 items-center gap-2 rounded-lg border border-line bg-panel-2 px-2.5 text-xs text-muted">
          <span className="font-medium">Volume</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={audio.metronomeVolume}
            aria-label="Volume do metrônomo"
            aria-valuetext={`${Math.round(audio.metronomeVolume * 100)}%`}
            onChange={(e) => setAudio({ metronomeVolume: Number(e.target.value) })}
            className="w-24 cursor-pointer"
          />
        </label>
        <Toggle
          checked={audio.drumEnabled}
          onChange={(v) => setAudio({ drumEnabled: v })}
          label="Ouvir padrão"
          icon={<Drum size={15} />}
          title="Tocar as notas da grade com sons de bateria sintetizados"
        />
        <Toggle
          checked={audio.clickSubdivisions}
          onChange={(v) => setAudio({ clickSubdivisions: v })}
          label="Clique nas subdivisões"
          title="O metrônomo também marca as subdivisões da grade"
        />
      </div>
      <RecordingsPanel exercise={exercise} bpm={bpm} onBpm={onBpm} />
    </div>
  );
}
