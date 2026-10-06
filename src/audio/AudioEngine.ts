import type { AudioSettings, ClickKind, MusicEvent } from '../music/types';
import type { TransportSink } from '../transport/Transport';
import { scheduleClick } from './Metronome';
import { DrumSynth } from './DrumSynth';
import { SampleBank } from './SampleBank';
import { BackingLibrary } from './BackingLibrary';
import { CLICK_SLOT_FOR } from './soundCatalog';
import { createNoiseBuffer } from './voices';

export class AudioStartError extends Error {}

export type EngineStatus = 'idle' | 'running' | 'suspended' | 'closed' | 'interrupted' | 'unsupported';

type AudioContextCtor = typeof AudioContext;

function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

const RESUME_TIMEOUT_MS = 1500;

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** WAV de silêncio (0,5 s, 8 kHz, 8 bits) gerado em memória. */
function createSilentWavUrl(): string {
  const samples = 4000;
  const buf = new ArrayBuffer(44 + samples);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + samples, true);
  str(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, 8000, true);
  v.setUint32(28, 8000, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true);
  str(36, 'data');
  v.setUint32(40, samples, true);
  for (let i = 0; i < samples; i++) v.setUint8(44 + i, 128);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

/**
 * Dono do AudioContext e do grafo de áudio:
 *
 *   [sessão: cliques] → clickBus ─┐
 *   [sessão: bateria] → drumBus  ─┼→ master → limitador → saída
 *   [prévia do editor] → preview ─┘
 *
 * Cada reprodução usa ganhos de "sessão" novos. Ao pausar/parar, os ganhos de
 * sessão são desconectados e todas as fontes agendadas são interrompidas — assim
 * nenhum clique já programado soa depois da pausa.
 */
export class AudioEngine implements TransportSink {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private clickBus: GainNode | null = null;
  private drumBus: GainNode | null = null;
  private previewBus: GainNode | null = null;
  private sessionClick: GainNode | null = null;
  private sessionDrum: GainNode | null = null;
  private backingBus: GainNode | null = null;
  private sessionBacking: GainNode | null = null;
  private readonly backingSources = new Map<string, AudioBufferSourceNode>();
  private readonly takeBuffers = new Map<string, AudioBuffer>();
  private previewTrack: { src: AudioBufferSourceNode; startedAt: number; from: number } | null = null;
  private synth: DrumSynth | null = null;
  private noise: AudioBuffer | null = null;
  private readonly sources = new Set<AudioScheduledSourceNode>();
  private readonly listeners = new Set<() => void>();
  private settings: AudioSettings;
  private mediaChannelEl: HTMLAudioElement | null = null;
  /** Sons carregados pelo usuário (arquivos). */
  readonly samples = new SampleBank();
  /** Faixas de acompanhamento (arquivos). */
  readonly backing = new BackingLibrary();

  constructor(settings: AudioSettings) {
    this.settings = settings;
  }

  static isSupported(): boolean {
    return getAudioContextCtor() !== null;
  }

  get status(): EngineStatus {
    if (!AudioEngine.isSupported()) return 'unsupported';
    if (!this.ctx) return 'idle';
    return this.ctx.state as EngineStatus;
  }

  get currentTime(): number {
    return this.ctx?.currentTime ?? 0;
  }

  /** Atraso estimado entre o relógio de áudio e o som saindo do alto-falante. */
  get outputLatency(): number {
    const ctx = this.ctx;
    if (!ctx) return 0;
    const l = (ctx.outputLatency || 0) || ctx.baseLatency || 0;
    return Number.isFinite(l) ? Math.min(Math.max(l, 0), 0.3) : 0;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }

  /**
   * Cria/retoma o contexto. Deve ser chamado a partir de um gesto do usuário — e tudo
   * até o primeiro `await` roda de forma síncrona dentro desse gesto, como os
   * navegadores móveis exigem.
   */
  async ensureRunning(): Promise<void> {
    const Ctor = getAudioContextCtor();
    if (!Ctor) throw new AudioStartError('Este navegador não suporta a Web Audio API.');
    this.useMediaChannel();
    if (!this.ctx || this.ctx.state === 'closed') this.createContext(Ctor);
    const ctx = this.ctx!;
    if (ctx.state !== 'running') {
      // Desbloqueio móvel: toca um buffer silencioso ainda dentro do gesto.
      try {
        const src = ctx.createBufferSource();
        src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
        src.connect(ctx.destination);
        src.start(0);
      } catch {
        /* ignorável */
      }
      try {
        await Promise.race([
          ctx.resume(),
          new Promise((resolve) => setTimeout(resolve, RESUME_TIMEOUT_MS)),
        ]);
      } catch {
        /* tratado abaixo */
      }
    }
    if (ctx.state !== 'running') {
      throw new AudioStartError(
        'O navegador não permitiu iniciar o áudio. Clique em Reproduzir novamente ou verifique as permissões de som da página.',
      );
    }
  }

  /**
   * iPhone/iPad: por padrão o Web Audio usa o canal de "toques", que a chave de
   * silencioso emudece. Pedir o canal de mídia ("playback") faz o som sair como música.
   * iOS 17+: navigator.audioSession. Versões anteriores: um <audio> silencioso em loop
   * tocando junto força a mesma categoria.
   */
  private useMediaChannel() {
    if (!isIOS()) return;
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    try {
      if (nav.audioSession) nav.audioSession.type = 'playback';
    } catch {
      /* não suportado */
    }
    if (!this.mediaChannelEl) {
      const el = document.createElement('audio');
      el.src = createSilentWavUrl();
      el.loop = true;
      el.preload = 'auto';
      el.setAttribute('playsinline', '');
      el.setAttribute('aria-hidden', 'true');
      this.mediaChannelEl = el;
    }
    void this.mediaChannelEl.play().catch(() => {});
  }

  private createContext(Ctor: AudioContextCtor) {
    const ctx = new Ctor({ latencyHint: 'interactive' });
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 4;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.12;
    limiter.connect(ctx.destination);

    this.master = ctx.createGain();
    this.master.connect(limiter);
    this.clickBus = ctx.createGain();
    this.clickBus.connect(this.master);
    this.drumBus = ctx.createGain();
    this.drumBus.connect(this.master);
    this.previewBus = ctx.createGain();
    this.previewBus.connect(this.master);
    this.backingBus = ctx.createGain();
    this.backingBus.connect(this.master);
    this.noise = createNoiseBuffer(ctx, 2);
    this.synth = new DrumSynth(ctx, this.noise);
    ctx.addEventListener('statechange', () => this.emit());
    this.ctx = ctx;
    this.applySettings(this.settings);
    this.emit();
  }

  applySettings(settings: AudioSettings) {
    this.settings = settings;
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.clickBus || !this.drumBus || !this.previewBus) return;
    const t = ctx.currentTime;
    const set = (p: AudioParam, v: number) => {
      p.cancelScheduledValues(t);
      p.setTargetAtTime(v, t, 0.01);
    };
    set(this.master.gain, settings.masterVolume);
    set(this.clickBus.gain, settings.metronomeEnabled ? settings.metronomeVolume : 0);
    set(this.drumBus.gain, settings.drumEnabled ? settings.drumVolume : 0);
    set(this.previewBus.gain, settings.drumVolume);
    if (this.backingBus) set(this.backingBus.gain, settings.backingVolume);
  }

  beginSession(): void {
    this.endSession();
    const ctx = this.ctx;
    if (!ctx || !this.clickBus || !this.drumBus) return;
    this.sessionClick = ctx.createGain();
    this.sessionClick.connect(this.clickBus);
    this.sessionDrum = ctx.createGain();
    this.sessionDrum.connect(this.drumBus);
    if (this.backingBus) {
      this.sessionBacking = ctx.createGain();
      this.sessionBacking.connect(this.backingBus);
    }
  }

  endSession(): void {
    this.sessionClick?.disconnect();
    this.sessionDrum?.disconnect();
    this.sessionBacking?.disconnect();
    this.sessionClick = null;
    this.sessionDrum = null;
    this.sessionBacking = null;
    this.backingSources.clear();
    for (const src of this.sources) {
      try {
        src.stop(0);
      } catch {
        /* já parada */
      }
      src.disconnect();
    }
    this.sources.clear();
  }

  private click(dest: AudioNode, time: number, kind: ClickKind): AudioScheduledSourceNode[] {
    const sound = this.settings.clickSound;
    return scheduleClick(this.ctx!, dest, time, kind, sound, this.noise!, sound === 'custom' ? this.samples.get(CLICK_SLOT_FOR[kind]) : null);
  }

  private hit(event: MusicEvent, time: number, dest: AudioNode): AudioScheduledSourceNode[] {
    const kit = this.settings.drumKit;
    return this.synth!.play(event, time, dest, kit, kit === 'custom' ? this.samples.get(event.instrument) : null);
  }

  scheduleClick(time: number, kind: ClickKind): void {
    if (!this.ctx || !this.sessionClick || !this.noise) return;
    this.track(this.click(this.sessionClick, time, kind));
  }

  scheduleHit(time: number, event: MusicEvent): void {
    if (!this.ctx || !this.sessionDrum || !this.synth) return;
    this.track(this.hit(event, time, this.sessionDrum));
  }

  // ───────────── Faixa de acompanhamento ─────────────

  startBacking(trackId: string, time: number, offsetSec: number, rate: number, layer = 'music'): void {
    const ctx = this.ctx;
    const buffer = this.backing.buffer(trackId) ?? this.takeBuffers.get(trackId) ?? null;
    if (!ctx || !this.sessionBacking || !buffer) return;
    const now = ctx.currentTime;
    const t = Math.max(time, now);
    const offset = offsetSec + (t - time) * rate; // se o instante já passou, entra adiantado
    if (offset >= buffer.duration) return;
    this.stopBacking(layer);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.setValueAtTime(rate, now);
    src.connect(this.sessionBacking);
    src.start(t, Math.max(0, offset));
    this.backingSources.set(layer, src);
    this.track([src]);
  }

  setBackingRate(time: number, rate: number, layer = 'music'): void {
    const src = this.backingSources.get(layer);
    if (!this.ctx || !src) return;
    src.playbackRate.setValueAtTime(rate, Math.max(time, this.ctx.currentTime));
  }

  stopBacking(layer?: string): void {
    for (const [key, src] of [...this.backingSources]) {
      if (layer && key !== layer) continue;
      try {
        src.stop(0);
      } catch {
        /* já parada */
      }
      src.disconnect();
      this.sources.delete(src);
      this.backingSources.delete(key);
    }
  }

  /** Gravações do usuário (em memória), tocáveis como camada sincronizada. */
  registerTake(id: string, buffer: AudioBuffer) {
    this.takeBuffers.set(id, buffer);
  }

  removeTake(id: string) {
    this.takeBuffers.delete(id);
  }

  /** AudioContext atual (depois de ensureRunning). */
  get context(): AudioContext | null {
    return this.ctx;
  }

  /** Prévia da faixa nas configurações (fora do transporte), a partir de `fromSec`. */
  async playTrackPreview(trackId: string, fromSec: number): Promise<void> {
    await this.ensureRunning();
    const buffer = await this.backing.ensureLoaded(trackId);
    if (!buffer) throw new Error('Não foi possível tocar a faixa.');
    this.playBufferPreview(buffer, fromSec);
  }

  /** Toca um AudioBuffer fora do transporte (prévia de faixa ou de gravação). */
  playBufferPreview(buffer: AudioBuffer, fromSec: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.backingBus) throw new Error('Áudio não iniciado.');
    this.stopTrackPreview();
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.backingBus);
    const from = Math.min(Math.max(0, fromSec), Math.max(0, buffer.duration - 0.1));
    src.start(ctx.currentTime + 0.02, from);
    this.previewTrack = { src, startedAt: ctx.currentTime + 0.02, from };
    src.addEventListener('ended', () => {
      if (this.previewTrack?.src === src) this.previewTrack = null;
    });
  }

  stopTrackPreview(): void {
    const p = this.previewTrack;
    if (!p) return;
    try {
      p.src.stop(0);
    } catch {
      /* já parada */
    }
    p.src.disconnect();
    this.previewTrack = null;
  }

  /** Segundo da faixa que está soando na prévia (para "marcar o 1º tempo"), ou null. */
  trackPreviewPosition(): number | null {
    const p = this.previewTrack;
    if (!p || !this.ctx) return null;
    return p.from + Math.max(0, this.ctx.currentTime - this.outputLatency - p.startedAt);
  }

  /** Toca uma nota imediatamente (retorno sonoro no editor). */
  preview(event: MusicEvent): void {
    if (!this.ctx || this.ctx.state !== 'running' || !this.synth || !this.previewBus) return;
    this.hit({ ...event, ornament: 'none' }, this.ctx.currentTime + 0.005, this.previewBus);
  }

  /** Toca uma sequência curta de notas (demonstração do kit nas configurações). */
  previewSequence(notes: { at: number; event: MusicEvent }[]): void {
    if (!this.ctx || this.ctx.state !== 'running' || !this.synth || !this.previewBus) return;
    const t0 = this.ctx.currentTime + 0.05;
    for (const n of notes) this.hit(n.event, t0 + n.at, this.previewBus);
  }

  /** Toca um clique de teste fora do transporte (tela de configurações). */
  testClick(kind: ClickKind, delay = 0.01): void {
    if (!this.ctx || this.ctx.state !== 'running' || !this.clickBus || !this.noise) return;
    this.click(this.clickBus, this.ctx.currentTime + delay, kind);
  }

  private track(nodes: AudioScheduledSourceNode[]) {
    for (const node of nodes) {
      this.sources.add(node);
      node.addEventListener('ended', () => this.sources.delete(node));
    }
  }

  /** Informações para diagnóstico na tela de configurações. */
  diagnostics() {
    return {
      status: this.status,
      sampleRate: this.ctx?.sampleRate ?? null,
      latencyMs: Math.round(this.outputLatency * 1000),
      secureContext: typeof window !== 'undefined' ? window.isSecureContext : false,
      ios: isIOS(),
    };
  }

  async dispose(): Promise<void> {
    this.mediaChannelEl?.pause();
    this.endSession();
    if (this.ctx && this.ctx.state !== 'closed') await this.ctx.close();
    this.ctx = null;
  }
}
