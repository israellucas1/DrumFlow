import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Flag, Hand, Play, Square, Trash2, Upload } from 'lucide-react';
import { useServices, useSettings } from '../../app/AppState';
import type { BackingTrack } from '../../audio/BackingLibrary';
import { Button, Panel } from '../ui/primitives';
import { useFeedback } from '../ui/feedback';

/** Toque no ritmo da música; a média dos últimos toques vira o BPM. */
function useTapTempo() {
  const taps = useRef<number[]>([]);
  const [bpm, setBpm] = useState<number | null>(null);
  const tap = () => {
    const now = performance.now();
    const list = taps.current;
    if (list.length && now - list[list.length - 1] > 2000) list.length = 0;
    list.push(now);
    if (list.length > 9) list.shift();
    if (list.length >= 4) {
      const avg = (list[list.length - 1] - list[0]) / (list.length - 1);
      setBpm(Math.round(60000 / avg));
    } else setBpm(null);
  };
  return { tap, bpm, count: () => taps.current.length };
}

function TrackRow({ track, active, onActivate }: { track: BackingTrack; active: boolean; onActivate: () => void }) {
  const { engine } = useServices();
  const { toast, confirm } = useFeedback();
  const [name, setName] = useState(track.name);
  const [bpm, setBpm] = useState(String(track.bpm));
  const [offset, setOffset] = useState(track.offsetSec.toFixed(2));
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState<number | null>(null);
  const tapper = useTapTempo();

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      const p = engine.trackPreviewPosition();
      setPos(p);
      if (p === null) setPlaying(false);
    }, 100);
    return () => clearInterval(id);
  }, [playing, engine]);
  useEffect(() => () => engine.stopTrackPreview(), [engine]);

  const save = async (patch: Partial<Pick<BackingTrack, 'name' | 'bpm' | 'offsetSec'>>) => {
    try {
      await engine.backing.update(track.id, patch);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Falha ao salvar.', 'error');
    }
  };

  const listen = async (from: number) => {
    try {
      await engine.playTrackPreview(track.id, from);
      setPlaying(true);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível tocar.', 'error');
    }
  };
  const stop = () => {
    engine.stopTrackPreview();
    setPlaying(false);
    setPos(null);
  };

  return (
    <li className="flex flex-col gap-2 px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== track.name && void save({ name })}
          aria-label="Nome da faixa"
          className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-panel-2 px-2.5 text-sm font-medium text-fg"
        />
        <span className="text-xs text-muted">
          {track.file} · {(track.size / 1024 / 1024).toFixed(1)} MB
        </span>
        <Button size="sm" variant={active ? 'primary' : 'secondary'} onClick={onActivate}>
          {active ? 'Em uso' : 'Usar no treino'}
        </Button>
        <Button
          size="sm"
          variant="danger"
          aria-label={`Remover ${track.name}`}
          onClick={async () => {
            if (!(await confirm({ title: `Remover "${track.name}"?`, message: 'O arquivo vai para dados/lixeira.', confirmLabel: 'Remover', danger: true }))) return;
            stop();
            await engine.backing.remove(track.id).catch(() => toast('Falha ao remover.', 'error'));
          }}
        >
          <Trash2 size={14} />
        </Button>
      </div>
      <div className="flex flex-wrap items-end gap-3 text-xs text-muted">
        <label className="flex flex-col gap-0.5">
          BPM da música
          <input
            inputMode="decimal"
            value={bpm}
            onChange={(e) => setBpm(e.target.value.replace(/[^\d.,]/g, ''))}
            onBlur={() => {
              const v = Number(bpm.replace(',', '.'));
              if (v >= 20 && v <= 300) void save({ bpm: v });
              else setBpm(String(track.bpm));
            }}
            className="tabular h-9 w-20 rounded-lg border border-line bg-panel-2 px-2 text-sm text-fg"
          />
        </label>
        <div className="flex flex-col gap-0.5">
          Tap tempo
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={tapper.tap} title="Toque no ritmo da música (4 ou mais toques)">
              <Hand size={14} /> Toque no ritmo
            </Button>
            {tapper.bpm && (
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  setBpm(String(tapper.bpm));
                  void save({ bpm: tapper.bpm! });
                }}
              >
                Usar {tapper.bpm}
              </Button>
            )}
          </div>
        </div>
        <label className="flex flex-col gap-0.5">
          Início do 1º tempo (s)
          <input
            inputMode="decimal"
            value={offset}
            onChange={(e) => setOffset(e.target.value.replace(/[^\d.,]/g, ''))}
            onBlur={() => {
              const v = Number(offset.replace(',', '.'));
              if (v >= 0) void save({ offsetSec: v });
              else setOffset(track.offsetSec.toFixed(2));
            }}
            className="tabular h-9 w-24 rounded-lg border border-line bg-panel-2 px-2 text-sm text-fg"
          />
        </label>
        <div className="flex flex-col gap-0.5">
          Ouvir
          <div className="flex flex-wrap items-center gap-2">
            {!playing ? (
              <>
                <Button size="sm" onClick={() => void listen(0)}>
                  <Play size={14} /> Do começo
                </Button>
                <Button size="sm" onClick={() => void listen(Math.max(0, track.offsetSec - 1))} title="Começa 1 s antes do 1º tempo marcado">
                  <Play size={14} /> Do 1º tempo
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" onClick={stop}>
                  <Square size={12} /> Parar
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    const p = engine.trackPreviewPosition();
                    if (p === null) return;
                    setOffset(p.toFixed(2));
                    void save({ offsetSec: Math.round(p * 1000) / 1000 });
                    toast(`1º tempo marcado em ${p.toFixed(2)} s.`);
                  }}
                >
                  <Flag size={14} /> Marcar 1º tempo agora
                </Button>
                <span className="tabular">{pos !== null ? `${pos.toFixed(1)} s` : ''}</span>
              </>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

export function BackingSettings() {
  const { engine } = useServices();
  const { settings, update } = useSettings();
  const { toast } = useFeedback();
  const lib = useSyncExternalStore(engine.backing.subscribe, engine.backing.getSnapshot, engine.backing.getSnapshot);
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      const t = await engine.backing.upload(file);
      update((s) => ({ ...s, backingTrackId: t.id }));
      toast(`"${t.name}" adicionada. Agora informe o BPM e marque o 1º tempo.`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Falha ao enviar.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="cfg-faixas">
      <h2 id="cfg-faixas" className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
        Faixas de acompanhamento
      </h2>
      <Panel className="px-4 py-3">
        <p className="text-sm text-muted">
          Toque os exercícios em cima de uma música. Informe o <strong className="text-fg">BPM da música</strong> (use o tap tempo) e o{' '}
          <strong className="text-fg">início do 1º tempo</strong> (ouça e clique em "Marcar 1º tempo agora" no primeiro tempo forte). O tempo 1 do
          exercício cai nesse ponto; a introdução antes dele toca durante a contagem. Se você tocar num BPM diferente do da música, ela acelera
          ou desacelera junto — e o tom muda.
        </p>
        {lib.status === 'unavailable' ? (
          <p className="mt-2 rounded-lg border border-rh/40 bg-rh/10 px-3 py-2 text-xs text-rh">Para usar faixas, abra o app pelo servidor (Iniciar-DrumFlow.bat).</p>
        ) : (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button onClick={() => fileInput.current?.click()} disabled={busy}>
                <Upload size={15} /> {busy ? 'Enviando…' : 'Adicionar música (MP3, WAV, OGG)'}
              </Button>
              <label className="flex items-center gap-2 text-xs text-muted">
                Volume da faixa
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={settings.audio.backingVolume}
                  onChange={(e) => update((s) => ({ ...s, audio: { ...s.audio, backingVolume: Number(e.target.value) } }))}
                  aria-label="Volume da faixa de acompanhamento"
                  className="w-32 cursor-pointer"
                />
              </label>
              <input
                ref={fileInput}
                type="file"
                accept="audio/*,.mp3,.wav,.ogg,.m4a,.flac"
                className="hidden"
                onChange={(e) => {
                  void onFile(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </div>
            {lib.tracks.length > 0 && (
              <ul className="mt-3 divide-y divide-line rounded-lg border border-line">
                {lib.tracks.map((t) => (
                  <TrackRow
                    key={t.id}
                    track={t}
                    active={settings.backingTrackId === t.id}
                    onActivate={() => update((s) => ({ ...s, backingTrackId: s.backingTrackId === t.id ? null : t.id }))}
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </Panel>
    </section>
  );
}
