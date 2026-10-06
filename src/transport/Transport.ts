import type { ClickKind, Exercise, MusicEvent, PlaybackPosition, PlaybackState } from '../music/types';
import { buildCountInClicks, buildTimeline, type ClickEntry, type Timeline } from '../music/timeline';
import { barLengthInQuarters, beatUnitInQuarters } from '../music/timeSignature';
import { clampBpm, DEFAULT_BPM, EPS, mod } from '../music/beatMath';
import { TempoMap } from './tempoMap';

/** Destino do áudio agendado (implementado por AudioEngine; falso nos testes). */
export interface TransportSink {
  readonly currentTime: number;
  readonly outputLatency: number;
  ensureRunning(): Promise<void>;
  beginSession(): void;
  endSession(): void;
  scheduleClick(time: number, kind: ClickKind): void;
  scheduleHit(time: number, event: MusicEvent): void;
  /** Inicia a faixa de acompanhamento em `time`, a partir de `offsetSec` do arquivo, na velocidade `rate`. */
  startBacking?(trackId: string, time: number, offsetSec: number, rate: number, layer?: string): void;
  /** Muda a velocidade da faixa a partir de `time` (mudança de BPM). */
  setBackingRate?(time: number, rate: number, layer?: string): void;
  /** Para uma camada (ou todas, sem argumento). */
  stopBacking?(layer?: string): void;
}

/**
 * Faixa de acompanhamento: `offsetSec` é o instante do arquivo onde cai o tempo 1 do
 * exercício, e `bpm` o andamento original da música. A posição na faixa é derivada
 * da posição musical: offset + semínimas × 60 / bpm da música.
 */
export interface BackingConfig {
  trackId: string;
  bpm: number;
  offsetSec: number;
}

/** Despertador periódico; só acorda o scheduler, não marca o tempo. */
export interface TransportTimer {
  start(): void;
  stop(): void;
  dispose?(): void;
}

export interface TransportOptions {
  /** Janela de antecipação do agendamento (s). */
  lookahead?: number;
  /** Atraso entre o Play e o primeiro clique (s). */
  startDelay?: number;
  createTimer: (tick: () => void) => TransportTimer;
}

export interface TransportSnapshot {
  state: PlaybackState;
  bpm: number;
  loop: boolean;
  countInBars: number;
  exerciseId: string | null;
  exerciseName: string | null;
  error: string | null;
  /** Duração do treino em segundos (cronômetro), ou null se desligado. */
  practiceLimit: number | null;
  /** O tempo do cronômetro acabou e a reprodução está terminando o compasso atual. */
  timerExpired: boolean;
  /** A última reprodução terminou porque o tempo do cronômetro acabou. */
  timerFinished: boolean;
}

/** Depois do fim (sem loop), espera o último som soar antes de encerrar a sessão. */
const END_TAIL = 0.45;
/** Evita reagendar uma nota exatamente no ponto da pausa. */
const RESUME_EPS = 1e-7;

/**
 * Transporte musical central.
 *
 * Posição "linear" em semínimas: negativa durante a contagem inicial, 0 no início
 * do exercício e crescente indefinidamente durante o loop. A posição dentro do
 * exercício é `mod(linear - origin, total)`.
 *
 * Agendamento: a cada despertar, agenda todo evento com posição linear em
 * [frontier, horizon), onde horizon = posição no instante (agora + lookahead).
 * Intervalos semiabertos e contíguos garantem que cada evento seja agendado
 * exatamente uma vez — sem duplicados e sem perdas.
 *
 * Mudança de BPM: aplicada na fronteira de agendamento (no máximo `lookahead`
 * segundos à frente). Tudo antes dela já foi agendado com o andamento antigo; tudo
 * depois usa o novo. O mapa de tempo é contínuo nesse ponto, então não há salto
 * visual nem clique duplicado; o único intervalo afetado fica entre a duração antiga
 * e a nova.
 *
 * Visualização: `getPosition()` converte o relógio de áudio (descontada a latência
 * de saída) em posição musical a cada frame. Nada é incrementado por frame.
 */
export class Transport {
  private readonly sink: TransportSink;
  private readonly timer: TransportTimer;
  private readonly lookahead: number;
  private readonly startDelay: number;

  private exercise: Exercise | null = null;
  private timeline: Timeline | null = null;
  private clickSubdivisions = false;

  private state: PlaybackState = 'stopped';
  private bpm = DEFAULT_BPM;
  private loop = true;
  private countInBars = 1;

  private readonly tempo = new TempoMap();
  private countInClicks: ClickEntry[] = [];
  private countInQuarters = 0;
  private countInBarLength = 4;
  private countInBeatUnit = 1;

  private frontier = 0;
  private origin = 0;
  private endQuarter = Infinity;
  private pausedAt = 0;
  private error: string | null = null;
  private startToken = 0;

  // Cronômetro de treino: conta só o tempo tocando (sem contagem inicial e sem pausas),
  // medido pelo relógio de áudio.
  private practiceLimit: number | null = null;
  private playedBefore = 0;
  private segmentStart: number | null = null;
  private timerExpired = false;
  private timerFinished = false;

  private readonly layers = new Map<string, BackingConfig>();

  private readonly listeners = new Set<() => void>();
  private snapshot: TransportSnapshot;

  constructor(sink: TransportSink, options: TransportOptions) {
    this.sink = sink;
    this.lookahead = options.lookahead ?? 0.12;
    this.startDelay = options.startDelay ?? 0.06;
    this.timer = options.createTimer(() => this.tick());
    this.snapshot = this.buildSnapshot();
  }

  // ───────────────────────── estado observável ─────────────────────────

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): TransportSnapshot => this.snapshot;

  private buildSnapshot(): TransportSnapshot {
    return {
      state: this.state,
      bpm: this.bpm,
      loop: this.loop,
      countInBars: this.countInBars,
      exerciseId: this.exercise?.id ?? null,
      exerciseName: this.exercise?.name ?? null,
      error: this.error,
      practiceLimit: this.practiceLimit,
      timerExpired: this.timerExpired,
      timerFinished: this.timerFinished,
    };
  }

  // ───────────────────────── cronômetro ─────────────────────────

  /** Define a duração do treino (segundos) ou desliga o cronômetro (null). */
  setPracticeLimit(seconds: number | null) {
    const limit = seconds && seconds > 0 ? Math.round(seconds) : null;
    if (limit === this.practiceLimit) return;
    this.practiceLimit = limit;
    // Aumentar o tempo depois de expirar "desfaz" o fim agendado.
    if (this.timerExpired && (limit === null || this.getPracticeElapsed() < limit)) {
      this.timerExpired = false;
      this.endQuarter = this.loop ? Infinity : this.cycleEnd(this.isActive ? this.frontier : this.pausedAt);
    }
    this.emit();
  }

  // ───────────────────────── acompanhamento ─────────────────────────

  /** Define (ou remove) a faixa de acompanhamento (camada "music"). Durante a reprodução, troca na hora. */
  setBacking(cfg: BackingConfig | null) {
    this.setLayer('music', cfg);
  }

  /**
   * Camadas de áudio sincronizadas à posição musical: "music" (faixa de acompanhamento)
   * e "take" (gravação sendo reproduzida com o clique).
   */
  setLayer(layer: string, cfg: BackingConfig | null) {
    const cur = this.layers.get(layer);
    const same = cfg && cur && cfg.trackId === cur.trackId && cfg.bpm === cur.bpm && cfg.offsetSec === cur.offsetSec;
    if (same || (!cfg && !cur)) return;
    if (cfg) this.layers.set(layer, { ...cfg });
    else this.layers.delete(layer);
    if (this.isActive) {
      this.sink.stopBacking?.(layer);
      if (cfg) this.startLayerAt(layer, cfg, this.frontier);
    }
  }

  get backingTrackId(): string | null {
    return this.layers.get('music')?.trackId ?? null;
  }

  layerTrackId(layer: string): string | null {
    return this.layers.get(layer)?.trackId ?? null;
  }

  /** Instante do relógio de áudio correspondente à posição musical `q` (reprodução atual). */
  timeOfQuarter(q: number): number {
    return this.tempo.timeAt(q);
  }

  private startBackingAt(q: number) {
    for (const [layer, cfg] of this.layers) this.startLayerAt(layer, cfg, q);
  }

  /** Agenda a camada para tocar a partir da posição musical `q` (respeitando o início do arquivo). */
  private startLayerAt(layer: string, b: BackingConfig, q: number) {
    if (!this.sink.startBacking || b.bpm <= 0) return;
    // A posição no arquivo só existe a partir do seu início (o offset pode ser menor que a contagem).
    const firstQ = (-b.offsetSec * b.bpm) / 60;
    const startQ = Math.max(q, firstQ);
    const trackPos = b.offsetSec + (startQ * 60) / b.bpm;
    this.sink.startBacking(b.trackId, this.tempo.timeAt(startQ), Math.max(0, trackPos), this.bpm / b.bpm, layer);
  }

  /** Segundos tocados nesta sessão de treino (para a exibição do tempo restante). */
  getPracticeElapsed(now = this.sink.currentTime): number {
    const running = this.isActive && this.segmentStart !== null ? Math.max(0, now - this.segmentStart) : 0;
    return this.playedBefore + running;
  }

  private resetPracticeClock() {
    this.playedBefore = 0;
    this.segmentStart = null;
    this.timerExpired = false;
  }

  /** O tempo acabou: termina no fim do compasso em que a fronteira de agendamento está. */
  private expireTimer() {
    if (!this.timeline) return;
    const barLen = this.timeline.barLength;
    const rel = Math.max(0, this.frontier - this.origin);
    const barEnd = this.origin + Math.ceil(rel / barLen - EPS) * barLen;
    this.endQuarter = Math.min(this.endQuarter, Math.max(barEnd, this.frontier));
    this.timerExpired = true;
    this.emit();
  }

  private emit() {
    this.snapshot = this.buildSnapshot();
    this.listeners.forEach((l) => l());
  }

  get isActive(): boolean {
    return this.state === 'playing' || this.state === 'countIn';
  }

  get loadedExerciseId(): string | null {
    return this.exercise?.id ?? null;
  }

  // ───────────────────────── configuração ─────────────────────────

  /**
   * Carrega um exercício. Um exercício diferente (outro id) para a reprodução.
   * O mesmo exercício editado durante a reprodução é aplicado sem parar: a posição
   * dentro do exercício é preservada a partir da fronteira de agendamento.
   */
  load(exercise: Exercise | null) {
    if (exercise === this.exercise) return;
    const sameId = !!exercise && !!this.exercise && exercise.id === this.exercise.id;
    if (!sameId && this.state !== 'stopped') this.stop();
    const prevTotal = this.timeline?.totalQuarters ?? 0;
    this.exercise = exercise;
    this.timeline = exercise ? buildTimeline(exercise, { clickSubdivisions: this.clickSubdivisions }) : null;
    if (sameId && this.isActive) this.rebaseAt(this.frontier, prevTotal);
    else if (sameId && this.state === 'paused') this.rebaseAt(this.pausedAt, prevTotal);
    this.emit();
  }

  private rebaseAt(q: number, prevTotal: number) {
    if (!this.timeline) return;
    const total = this.timeline.totalQuarters;
    if (q >= 0 && prevTotal > 0) {
      const oldLocal = mod(q - this.origin, prevTotal);
      const newLocal = oldLocal < total - EPS ? oldLocal : 0;
      this.origin = q - newLocal;
    }
    if (this.timerExpired) {
      const barLen = this.timeline.barLength;
      this.endQuarter = this.origin + Math.ceil(Math.max(0, q - this.origin) / barLen - EPS) * barLen;
    } else if (!this.loop) {
      this.endQuarter = this.cycleEnd(q);
    }
  }

  private cycleEnd(q: number): number {
    const total = this.timeline?.totalQuarters ?? 0;
    if (q < this.origin) return this.origin + total;
    return this.origin + (Math.floor((q - this.origin) / total) + 1) * total;
  }

  setBpm(value: number) {
    const bpm = clampBpm(value);
    if (bpm === this.bpm) return;
    this.bpm = bpm;
    if (this.isActive) {
      this.tempo.changeTempo(this.frontier, bpm);
      for (const [layer, cfg] of this.layers) this.sink.setBackingRate?.(this.tempo.timeAt(this.frontier), bpm / cfg.bpm, layer);
      // Ainda na contagem: o cronômetro começa no novo instante do tempo 1.
      if (this.frontier < 0 && this.segmentStart !== null) this.segmentStart = this.tempo.timeAt(0);
    }
    this.emit();
  }

  setLoop(on: boolean) {
    if (on === this.loop) return;
    this.loop = on;
    if ((this.isActive || this.state === 'paused') && !this.timerExpired) {
      const q = this.isActive ? this.frontier : this.pausedAt;
      this.endQuarter = on ? Infinity : this.cycleEnd(q);
    }
    this.emit();
  }

  /** Vale a partir do próximo início (Play a partir do zero ou Reiniciar). */
  setCountInBars(bars: number) {
    const n = Math.min(4, Math.max(0, Math.round(bars)));
    if (n === this.countInBars) return;
    this.countInBars = n;
    this.emit();
  }

  setClickSubdivisions(on: boolean) {
    if (on === this.clickSubdivisions) return;
    this.clickSubdivisions = on;
    if (this.exercise) this.timeline = buildTimeline(this.exercise, { clickSubdivisions: on });
  }

  clearError() {
    if (!this.error) return;
    this.error = null;
    this.emit();
  }

  // ───────────────────────── controle ─────────────────────────

  /** Play a partir do zero, ou Resume se estiver pausado. */
  async play(): Promise<void> {
    if (this.isActive || !this.exercise || !this.timeline) return;
    const token = ++this.startToken;
    try {
      await this.sink.ensureRunning();
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Não foi possível iniciar o áudio.';
      this.emit();
      return;
    }
    if (token !== this.startToken || this.isActive || !this.exercise) return;
    this.error = null;
    this.timerFinished = false;
    // Retomar depois do tempo esgotado começa um novo treino.
    if (this.state === 'paused' && !this.timerExpired) this.beginFrom(this.pausedAt, this.pausedAt + RESUME_EPS);
    else this.startFromTop();
  }

  async togglePlay(): Promise<void> {
    if (this.isActive) this.pause();
    else await this.play();
  }

  private startFromTop() {
    const ts = this.exercise!.tempoSignature;
    this.countInBarLength = barLengthInQuarters(ts);
    this.countInBeatUnit = beatUnitInQuarters(ts);
    this.countInQuarters = this.countInBars * this.countInBarLength;
    this.countInClicks = buildCountInClicks(ts, this.countInBars);
    this.origin = 0;
    this.endQuarter = this.loop ? Infinity : this.timeline!.totalQuarters;
    this.resetPracticeClock();
    this.beginFrom(-this.countInQuarters, -this.countInQuarters);
  }

  private beginFrom(anchorQuarter: number, frontier: number) {
    this.sink.beginSession();
    const t0 = this.sink.currentTime + this.startDelay;
    this.tempo.reset(t0, anchorQuarter, this.bpm);
    // O cronômetro só conta a partir do tempo 1 (a contagem inicial não entra).
    this.segmentStart = anchorQuarter < 0 ? this.tempo.timeAt(0) : t0;
    this.frontier = frontier;
    this.startBackingAt(anchorQuarter);
    this.state = anchorQuarter < 0 ? 'countIn' : 'playing';
    this.timer.start();
    this.tick();
    this.emit();
  }

  pause() {
    this.startToken++;
    if (!this.isActive) return;
    const now = this.sink.currentTime;
    let q = Math.max(this.tempo.quarterAt(now), this.tempo.startQuarter);
    q = Math.min(q, this.frontier, this.endQuarter);
    this.pausedAt = q;
    this.playedBefore = this.getPracticeElapsed(now);
    this.segmentStart = null;
    this.halt();
    this.state = 'paused';
    this.emit();
  }

  stop() {
    this.startToken++;
    this.halt();
    this.state = 'stopped';
    this.pausedAt = 0;
    this.origin = 0;
    this.frontier = 0;
    this.timerFinished = false;
    this.resetPracticeClock();
    this.emit();
  }

  /** Fim natural da reprodução (sem loop ou cronômetro esgotado). */
  private finish() {
    const byTimer = this.timerExpired;
    this.stop();
    if (byTimer) {
      this.timerFinished = true;
      this.emit();
    }
  }

  /** Volta ao início da contagem inicial e toca. */
  async restart(): Promise<void> {
    this.stop();
    await this.play();
  }

  /** Pausa por motivo externo (ex.: o navegador suspendeu o áudio). */
  interrupt(message: string) {
    if (!this.isActive) return;
    this.pause();
    this.error = message;
    this.emit();
  }

  private halt() {
    this.timer.stop();
    this.sink.endSession();
  }

  dispose() {
    this.halt();
    this.timer.dispose?.();
    this.listeners.clear();
  }

  // ───────────────────────── scheduler ─────────────────────────

  /** Chamado pelo despertador (~25 ms). Público para testes. */
  tick() {
    if (!this.isActive || !this.timeline) return;
    const now = this.sink.currentTime;
    if (Number.isFinite(this.endQuarter) && now >= this.tempo.timeAt(this.endQuarter) + END_TAIL) {
      this.finish();
      return;
    }
    if (this.practiceLimit !== null && !this.timerExpired && this.getPracticeElapsed(now) >= this.practiceLimit) {
      this.expireTimer();
    }
    const horizon = Math.min(this.tempo.quarterAt(now + this.lookahead), this.endQuarter);
    if (horizon > this.frontier) {
      this.scheduleRange(this.frontier, horizon);
      this.frontier = horizon;
    }
    const visual = Math.max(this.tempo.quarterAt(now - this.sink.outputLatency), this.tempo.startQuarter);
    const next: PlaybackState = visual < 0 ? 'countIn' : 'playing';
    if (next !== this.state) {
      this.state = next;
      this.emit();
    }
    this.tempo.prune(now - 1);
  }

  private scheduleRange(a: number, b: number) {
    const tl = this.timeline!;
    if (a < 0) {
      const hi = Math.min(b, 0);
      for (const c of this.countInClicks) {
        if (c.abs >= a && c.abs < hi) this.sink.scheduleClick(this.tempo.timeAt(c.abs), c.kind);
      }
    }
    const lo = Math.max(a, 0);
    if (b <= lo) return;
    const total = tl.totalQuarters;
    const firstCycle = Math.max(0, Math.floor((lo - this.origin) / total));
    const lastCycle = Math.floor((b - this.origin) / total);
    for (let c = firstCycle; c <= lastCycle; c++) {
      const base = this.origin + c * total;
      for (const click of tl.clicks) {
        const p = base + click.abs;
        if (p >= lo && p < b) this.sink.scheduleClick(this.tempo.timeAt(p), click.kind);
      }
      for (const entry of tl.entries) {
        const p = base + entry.abs;
        if (p >= lo && p < b) this.sink.scheduleHit(this.tempo.timeAt(p), entry.event);
      }
    }
  }

  // ───────────────────────── posição ─────────────────────────

  /**
   * Posição musical para a visualização. Por padrão usa o relógio de áudio menos a
   * latência de saída, para que a linha coincida com o som que está sendo ouvido.
   */
  getPosition(atTime?: number): PlaybackPosition {
    const tl = this.timeline;
    const ex = this.exercise;
    const idle: PlaybackPosition = {
      state: this.state,
      linearQuarter: 0,
      localQuarter: 0,
      cycle: 0,
      barIndex: 0,
      beatInBar: 0,
      isCountIn: false,
      countInBeatsRemaining: 0,
    };
    if (!tl || !ex || this.state === 'stopped') return idle;

    let q: number;
    if (this.state === 'paused') {
      q = this.pausedAt;
    } else {
      const t = atTime ?? this.sink.currentTime - this.sink.outputLatency;
      q = Math.max(this.tempo.quarterAt(t), this.tempo.startQuarter);
      q = Math.min(q, this.endQuarter);
    }

    if (q < 0) {
      const since = Math.max(0, q + this.countInQuarters);
      const beatIdx = Math.floor(since / this.countInBeatUnit + EPS);
      const totalBeats = Math.round(this.countInQuarters / this.countInBeatUnit);
      return {
        ...idle,
        linearQuarter: q,
        isCountIn: true,
        beatInBar: Math.floor(mod(since, this.countInBarLength) / this.countInBeatUnit + EPS),
        countInBeatsRemaining: Math.max(1, totalBeats - beatIdx),
      };
    }

    const total = tl.totalQuarters;
    let local: number;
    let cycle: number;
    if (q >= this.endQuarter) {
      local = total;
      cycle = Math.max(0, Math.round((this.endQuarter - this.origin) / total) - 1);
    } else {
      const rel = q - this.origin;
      cycle = Math.floor(rel / total);
      local = Math.max(0, rel - cycle * total);
    }
    const barIndex = Math.min(Math.floor(local / tl.barLength + EPS), ex.totalBars - 1);
    const beatInBar = Math.floor((local - barIndex * tl.barLength) / tl.beatUnit + EPS);
    return { ...idle, linearQuarter: q, localQuarter: local, cycle, barIndex, beatInBar };
  }
}
