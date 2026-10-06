import { useRef, useState, useSyncExternalStore } from 'react';
import { Play, Trash2, Upload } from 'lucide-react';
import { useServices, useSettings } from '../../app/AppState';
import {
  CLICK_SLOTS,
  CLICK_SLOT_LABELS,
  CLICK_SOUNDS,
  DRUM_KITS,
  type ClickSlot,
  type ClickSoundId,
  type DrumKitId,
  type SoundSlot,
} from '../../audio/soundCatalog';
import { INSTRUMENTS, INSTRUMENT_BY_ID } from '../../music/instruments';
import type { AudioSettings, ClickKind, InstrumentId, MusicEvent } from '../../music/types';
import { Button, Panel, Select } from '../ui/primitives';
import { useFeedback } from '../ui/feedback';

const CLICK_KIND_OF: Record<ClickSlot, ClickKind> = {
  'click-downbeat': 'downbeat',
  'click-beat': 'beat',
  'click-subdivision': 'subdivision',
};

const hit = (instrument: InstrumentId, accent = false): MusicEvent => ({
  id: 'demo',
  barIndex: 0,
  beatPosition: 0,
  instrument,
  limb: INSTRUMENT_BY_ID[instrument].defaultLimb,
  velocity: accent ? 118 : 90,
  accent,
});

/** Um compasso de groove + virada curta, para ouvir o kit. */
function kitDemo(): { at: number; event: MusicEvent }[] {
  const e = 60 / 100 / 2; // colcheia a 100 BPM
  const out: { at: number; event: MusicEvent }[] = [{ at: 0, event: hit('crash', true) }];
  for (let i = 0; i < 8; i++) out.push({ at: i * e, event: hit(i === 0 ? 'kick' : 'hiHat') });
  for (let i = 1; i < 8; i++) out.push({ at: i * e, event: hit('hiHat') });
  out.push({ at: 4 * e, event: hit('kick') }, { at: 5 * e, event: hit('kick') });
  out.push({ at: 2 * e, event: hit('snare', true) }, { at: 6 * e, event: hit('snare', true) });
  const s = e / 2;
  (['snare', 'tom1', 'tom2', 'floorTom'] as InstrumentId[]).forEach((inst, k) => {
    for (let j = 0; j < 2; j++) out.push({ at: 8 * e + (k * 2 + j) * s, event: hit(inst, j === 0) });
  });
  out.push({ at: 8 * e + 8 * s, event: hit('crash', true) }, { at: 8 * e + 8 * s, event: hit('kick') });
  out.push({ at: 8 * e + 9 * s, event: hit('ride') }, { at: 8 * e + 10 * s, event: hit('pedalHiHat') });
  return out;
}

export function SoundSettings() {
  const { engine } = useServices();
  const { settings, update } = useSettings();
  const { toast, confirm } = useFeedback();
  const bank = useSyncExternalStore(engine.samples.subscribe, engine.samples.getSnapshot, engine.samples.getSnapshot);
  const [busy, setBusy] = useState<SoundSlot | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const pendingSlot = useRef<SoundSlot | null>(null);
  const audio = settings.audio;
  const setAudio = (p: Partial<AudioSettings>) => update((s) => ({ ...s, audio: { ...s.audio, ...p } }));

  const withAudio = async (fn: () => void) => {
    try {
      await engine.ensureRunning();
      fn();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível iniciar o áudio.', 'error');
    }
  };

  const listenClicks = () =>
    withAudio(() => {
      const b = 0.45;
      ['downbeat', 'beat', 'beat', 'beat'].forEach((k, i) => engine.testClick(k as ClickKind, 0.05 + i * b));
      [0, 1, 2, 3].forEach((i) => engine.testClick('subdivision', 0.05 + i * b + b / 2));
    });

  const listenSlot = (slot: SoundSlot) =>
    withAudio(() => {
      if (slot.startsWith('click-')) engine.testClick(CLICK_KIND_OF[slot as ClickSlot]);
      else engine.preview(hit(slot as InstrumentId));
    });

  const chooseFile = (slot: SoundSlot) => {
    pendingSlot.current = slot;
    fileInput.current?.click();
  };

  const onFile = async (file: File | undefined) => {
    const slot = pendingSlot.current;
    if (!file || !slot) return;
    setBusy(slot);
    try {
      await engine.samples.upload(slot, file);
      const isClick = slot.startsWith('click-');
      if (isClick && audio.clickSound !== 'custom') setAudio({ clickSound: 'custom' });
      if (!isClick && audio.drumKit !== 'custom') setAudio({ drumKit: 'custom' });
      toast(`"${file.name}" carregado. ${isClick ? 'Metrônomo' : 'Kit'} definido como "Meus sons".`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Falha ao carregar o som.', 'error');
    } finally {
      setBusy(null);
    }
  };

  const removeSlot = async (slot: SoundSlot) => {
    const ok = await confirm({
      title: 'Remover este som?',
      message: 'Volta ao som sintetizado. O arquivo vai para a pasta dados/lixeira.',
      confirmLabel: 'Remover',
      danger: true,
    });
    if (!ok) return;
    try {
      await engine.samples.remove(slot);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Falha ao remover.', 'error');
    }
  };

  const fileOf = (slot: SoundSlot) => bank.infos.find((i) => i.slot === slot);
  const slots: { slot: SoundSlot; label: string }[] = [
    ...INSTRUMENTS.map((i) => ({ slot: i.id as SoundSlot, label: i.label })),
    ...CLICK_SLOTS.map((c) => ({ slot: c as SoundSlot, label: CLICK_SLOT_LABELS[c] })),
  ];

  return (
    <section aria-labelledby="cfg-sons">
      <h2 id="cfg-sons" className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
        Sons
      </h2>
      <Panel className="px-4">
        <div className="flex flex-col gap-2 border-b border-line py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">Som do metrônomo</p>
            <p className="text-xs text-muted">Vale na hora, inclusive durante a reprodução.</p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={audio.clickSound} onChange={(e) => setAudio({ clickSound: e.target.value as ClickSoundId })} aria-label="Som do metrônomo">
              {CLICK_SOUNDS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
            <Button onClick={() => void listenClicks()}>
              <Play size={14} /> Ouvir
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-2 border-b border-line py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">Kit de bateria</p>
            <p className="text-xs text-muted">Usado em "Ouvir padrão" e no retorno sonoro do editor.</p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={audio.drumKit} onChange={(e) => setAudio({ drumKit: e.target.value as DrumKitId })} aria-label="Kit de bateria">
              {DRUM_KITS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </Select>
            <Button onClick={() => void withAudio(() => engine.previewSequence(kitDemo()))}>
              <Play size={14} /> Ouvir kit
            </Button>
          </div>
        </div>

        <div className="py-3">
          <p className="text-sm font-medium">Meus sons (arquivos de áudio)</p>
          <p className="mt-0.5 text-xs text-muted">
            Carregue um som curto (WAV, MP3, OGG; até 5 MB) para cada peça ou clique — por exemplo, samples de um kit real. Eles
            ficam salvos na pasta <span className="font-mono">dados/sons</span> e são usados quando o kit ou o metrônomo está em
            "Meus sons". Peças sem arquivo usam o som acústico/clássico.
          </p>
          {bank.status === 'unavailable' && (
            <p className="mt-2 rounded-lg border border-rh/40 bg-rh/10 px-3 py-2 text-xs text-rh">
              Para usar sons próprios, abra o app pelo servidor (Iniciar-DrumFlow.bat).
            </p>
          )}
          <input
            ref={fileInput}
            type="file"
            accept="audio/*,.wav,.mp3,.ogg,.m4a,.flac"
            className="hidden"
            onChange={(e) => {
              void onFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <ul className="mt-3 divide-y divide-line rounded-lg border border-line">
            {slots.map(({ slot, label }) => {
              const info = fileOf(slot);
              return (
                <li key={slot} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{label}</p>
                    <p className="truncate text-xs text-muted">{info ? `${info.file} · ${Math.round(info.size / 1024)} KB` : 'Som padrão (sintetizado)'}</p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => void listenSlot(slot)} aria-label={`Ouvir ${label}`}>
                    <Play size={14} />
                  </Button>
                  <Button size="sm" onClick={() => chooseFile(slot)} disabled={bank.status !== 'ready' || busy !== null}>
                    <Upload size={14} /> {busy === slot ? 'Enviando…' : info ? 'Trocar' : 'Carregar'}
                  </Button>
                  {info && (
                    <Button size="sm" variant="danger" onClick={() => void removeSlot(slot)} aria-label={`Remover som de ${label}`}>
                      <Trash2 size={14} />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </Panel>
    </section>
  );
}
