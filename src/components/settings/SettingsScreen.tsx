import { useState, type ReactNode } from 'react';
import { Volume2 } from 'lucide-react';
import { useExercises, useServices, useSettings } from '../../app/AppState';
import { clampBpm, MAX_BPM, MIN_BPM } from '../../music/beatMath';
import type { AudioSettings, ViewSettings } from '../../music/types';
import { Button, Panel, Select, Toggle } from '../ui/primitives';
import { ScrollModeSelect } from '../playback-controls/Selectors';
import { useFeedback } from '../ui/feedback';
import { SoundSettings } from './SoundSettings';
import { BackingSettings } from './BackingSettings';

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-t border-line py-3 first:border-t-0 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

function VolumeSlider({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        aria-label={label}
        aria-valuetext={`${Math.round(value * 100)}%`}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-40 cursor-pointer"
      />
      <span className="tabular w-10 text-right text-xs text-muted">{Math.round(value * 100)}%</span>
    </>
  );
}

export function SettingsScreen() {
  const { settings, update, reset } = useSettings();
  const { engine } = useServices();
  const { restoreDemos } = useExercises();
  const { confirm, toast } = useFeedback();
  const setAudio = (p: Partial<AudioSettings>) => update((s) => ({ ...s, audio: { ...s.audio, ...p } }));
  const setView = (p: Partial<ViewSettings>) => update((s) => ({ ...s, view: { ...s.view, ...p } }));
  const a = settings.audio;

  const [diag, setDiag] = useState(() => engine.diagnostics());
  const testSound = async () => {
    try {
      await engine.ensureRunning();
      engine.testClick('downbeat');
      setTimeout(() => engine.testClick('beat'), 350);
      setTimeout(() => engine.testClick('subdivision'), 700);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível iniciar o áudio.', 'error');
    } finally {
      setDiag(engine.diagnostics());
    }
  };
  const STATUS_PT: Record<string, string> = {
    idle: 'aguardando o primeiro toque',
    running: 'funcionando',
    suspended: 'suspenso pelo navegador',
    interrupted: 'interrompido pelo sistema',
    closed: 'fechado',
    unsupported: 'não suportado neste navegador',
  };

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <h1 className="text-xl font-semibold tracking-tight">Configurações</h1>

      <section aria-labelledby="cfg-audio">
        <h2 id="cfg-audio" className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
          Som
        </h2>
        <Panel className="px-4">
          <Row label="Volume geral">
            <VolumeSlider label="Volume geral" value={a.masterVolume} onChange={(v) => setAudio({ masterVolume: v })} />
          </Row>
          <Row label="Metrônomo" hint="Desligar o som não desliga a grade visual.">
            <Toggle checked={a.metronomeEnabled} onChange={(v) => setAudio({ metronomeEnabled: v })} label={a.metronomeEnabled ? 'Ligado' : 'Desligado'} />
          </Row>
          <Row label="Volume do metrônomo">
            <VolumeSlider label="Volume do metrônomo" value={a.metronomeVolume} onChange={(v) => setAudio({ metronomeVolume: v })} />
          </Row>
          <Row label="Clique nas subdivisões" hint="Marca também as colcheias/tercinas/semicolcheias da grade, mais baixo.">
            <Toggle checked={a.clickSubdivisions} onChange={(v) => setAudio({ clickSubdivisions: v })} label={a.clickSubdivisions ? 'Ligado' : 'Desligado'} />
          </Row>
          <Row label="Ouvir o padrão" hint="Toca as notas da grade com sons de bateria sintetizados.">
            <Toggle checked={a.drumEnabled} onChange={(v) => setAudio({ drumEnabled: v })} label={a.drumEnabled ? 'Ligado' : 'Desligado'} />
          </Row>
          <Row label="Volume do padrão">
            <VolumeSlider label="Volume do padrão" value={a.drumVolume} onChange={(v) => setAudio({ drumVolume: v })} />
          </Row>
          <Row label="Testar cliques" hint="Primeiro tempo, tempo e subdivisão.">
            <Button onClick={() => void testSound()}>
              <Volume2 size={15} /> Testar
            </Button>
          </Row>
          <div className="border-t border-line py-3 text-xs text-muted">
            <p className="text-sm font-medium text-fg">Diagnóstico de áudio</p>
            <p className="mt-1">
              Áudio: <strong className="text-fg">{STATUS_PT[diag.status] ?? diag.status}</strong>
              {diag.sampleRate ? ` · ${diag.sampleRate} Hz` : ''}
              {diag.status === 'running' ? ` · latência ${diag.latencyMs} ms` : ''}
              {diag.ios ? ' · iPhone/iPad detectado (canal de mídia ativado)' : ''}
            </p>
            <p className="mt-1">
              Sem som no celular? Aumente o volume de <em>mídia</em> (não o de toque), toque em Testar e, no iPhone, confira se o
              modo silencioso/foco não está bloqueando o navegador.
            </p>
          </div>
        </Panel>
      </section>

      <SoundSettings />

      <BackingSettings />

      <section aria-labelledby="cfg-tempo">
        <h2 id="cfg-tempo" className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
          Andamento e contagem
        </h2>
        <Panel className="px-4">
          <Row label="BPM inicial de novos exercícios" hint={`Entre ${MIN_BPM} e ${MAX_BPM}.`}>
            <input
              type="number"
              min={MIN_BPM}
              max={MAX_BPM}
              value={settings.defaultBpm}
              onChange={(e) => update((s) => ({ ...s, defaultBpm: clampBpm(Number(e.target.value)) }))}
              className="tabular h-9 w-20 rounded-lg border border-line bg-panel-2 px-2 text-sm text-fg"
              aria-label="BPM inicial de novos exercícios"
            />
          </Row>
          <Row label="Contagem inicial padrão">
            <Select
              value={settings.countInBars}
              onChange={(e) => update((s) => ({ ...s, countInBars: Number(e.target.value) }))}
              aria-label="Contagem inicial padrão"
            >
              <option value={0}>Sem contagem</option>
              <option value={1}>1 compasso</option>
              <option value={2}>2 compassos</option>
              <option value={4}>4 compassos</option>
            </Select>
          </Row>
        </Panel>
      </section>

      <section aria-labelledby="cfg-view">
        <h2 id="cfg-view" className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
          Visualização
        </h2>
        <Panel className="px-4">
          <Row label="Tema">
            <Select value={settings.theme} onChange={(e) => update((s) => ({ ...s, theme: e.target.value === 'light' ? 'light' : 'dark' }))} aria-label="Tema">
              <option value="dark">Escuro</option>
              <option value="light">Claro</option>
            </Select>
          </Row>
          <Row label="Acompanhamento da grade" hint="Fixa, rolagem automática por página, ou compasso atual sempre à esquerda.">
            <ScrollModeSelect value={settings.view.scrollMode} onChange={(m) => setView({ scrollMode: m })} />
          </Row>
          <Row label="Zoom da grade" hint="Largura mínima por semínima. A grade sempre preenche a tela.">
            <input
              type="range"
              min={60}
              max={320}
              step={10}
              value={settings.view.zoom}
              aria-label="Zoom da grade"
              onChange={(e) => setView({ zoom: Number(e.target.value) })}
              className="w-40 cursor-pointer"
            />
          </Row>
          <Row label="Destacar as próximas notas" hint="Contorno nas notas do próximo tempo, para antecipar o movimento.">
            <Toggle
              checked={settings.view.highlightUpcoming}
              onChange={(v) => setView({ highlightUpcoming: v })}
              label={settings.view.highlightUpcoming ? 'Ligado' : 'Desligado'}
            />
          </Row>
        </Panel>
      </section>

      <section aria-labelledby="cfg-data">
        <h2 id="cfg-data" className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
          Dados
        </h2>
        <Panel className="px-4">
          <Row label="Restaurar exercícios de demonstração" hint="Não apaga nem altera seus exercícios.">
            <Button
              onClick={() => {
                const n = restoreDemos();
                toast(`${n} exemplo(s) restaurado(s).`);
              }}
            >
              Restaurar
            </Button>
          </Row>
          <Row label="Restaurar preferências padrão" hint="Som, andamento e visualização. Exercícios não são afetados.">
            <Button
              variant="danger"
              onClick={async () => {
                if (await confirm({ title: 'Restaurar preferências?', confirmLabel: 'Restaurar', danger: true })) {
                  reset();
                  toast('Preferências restauradas.');
                }
              }}
            >
              Restaurar
            </Button>
          </Row>
        </Panel>
      </section>
    </div>
  );
}
