import type { AudioEngine } from './AudioEngine';
import type { Transport } from '../transport/Transport';
import { createId } from '../music/ids';

/**
 * Gravação pelo microfone, alinhada ao relógio de áudio.
 *
 * O microfone entra num AudioWorklet que entrega blocos de amostras com o número do
 * quadro (`currentFrame`) do AudioContext — então sabemos exatamente em que instante
 * do relógio cada amostra foi captada. Com isso, a gravação pode ser reproduzida
 * depois sincronizada com o clique (como uma camada de acompanhamento).
 *
 * Compensação: o golpe que você toca junto com o clique do instante T chega ao
 * arquivo em ≈ T + latência de saída (o clique sai atrasado do alto-falante) +
 * latência de entrada (microfone). O app desconta isso; o ajuste fino corrige o resto.
 */

export interface Take {
  id: string;
  name: string;
  exerciseId: string;
  exerciseName: string;
  bpm: number;
  buffer: AudioBuffer;
  /** Segundo da gravação em que cai o tempo 1 (já com a compensação automática). */
  q0Sec: number;
  durationSec: number;
  number: number;
}

export type RecorderState = 'idle' | 'requesting' | 'recording' | 'processing';

const WORKLET = `
class DrumflowRecorder extends AudioWorkletProcessor {
  constructor() {
    super();
    this.on = true;
    this.buf = new Float32Array(4096);
    this.n = 0;
    this.start = -1;
    this.port.onmessage = (e) => { if (e.data === 'stop') { this.flush(); this.on = false; this.port.postMessage({ done: true }); } };
  }
  flush() {
    if (this.n > 0) { this.port.postMessage({ frame: this.start, data: this.buf.slice(0, this.n) }); }
    this.n = 0; this.start = -1;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (this.on && ch) {
      if (this.start < 0) this.start = currentFrame;
      if (this.n + ch.length > this.buf.length) this.flush();
      if (this.start < 0) this.start = currentFrame;
      this.buf.set(ch, this.n);
      this.n += ch.length;
    }
    return this.on;
  }
}
registerProcessor('drumflow-recorder', DrumflowRecorder);
`;

const MAX_SECONDS = 15 * 60;
const MAX_TAKES = 12;

interface ActiveRecording {
  stream: MediaStream;
  source: MediaStreamAudioSourceNode;
  node: AudioWorkletNode;
  sink: GainNode;
  chunks: { frame: number; data: Float32Array }[];
  inputLatency: number;
  exerciseId: string;
  exerciseName: string;
  bpm: number;
  q0Time: number;
  unsubscribe: () => void;
}

/** Codifica um AudioBuffer mono/estéreo em WAV PCM 16 bits. */
export function encodeWav(buffer: AudioBuffer): Blob {
  const ch = buffer.numberOfChannels;
  const len = buffer.length;
  const out = new ArrayBuffer(44 + len * ch * 2);
  const v = new DataView(out);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + len * ch * 2, true);
  str(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, ch, true);
  v.setUint32(24, buffer.sampleRate, true);
  v.setUint32(28, buffer.sampleRate * ch * 2, true);
  v.setUint16(32, ch * 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, len * ch * 2, true);
  const data = Array.from({ length: ch }, (_, c) => buffer.getChannelData(c));
  let o = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, data[c][i]));
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return new Blob([out], { type: 'audio/wav' });
}

/**
 * Segundo da gravação em que cai o tempo 1: instante do tempo 1 no relógio, menos o
 * instante da primeira amostra, mais a latência total (saída + entrada).
 */
export function takeOffsetSec(q0Time: number, startFrame: number, sampleRate: number, outputLatency: number, inputLatency: number): number {
  return q0Time - startFrame / sampleRate + outputLatency + inputLatency;
}

/** Junta os blocos captados num AudioBuffer contínuo (buracos viram silêncio). */
export function assemble(ctx: BaseAudioContext, chunks: { frame: number; data: Float32Array }[]): { buffer: AudioBuffer; startFrame: number } | null {
  if (!chunks.length) return null;
  const startFrame = chunks[0].frame;
  const last = chunks[chunks.length - 1];
  const length = last.frame - startFrame + last.data.length;
  if (length <= 0) return null;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const out = buffer.getChannelData(0);
  for (const c of chunks) out.set(c.data, c.frame - startFrame);
  return { buffer, startFrame };
}

export class Recorder {
  private state: RecorderState = 'idle';
  private takes: Take[] = [];
  private error: string | null = null;
  /** Ajuste fino da sincronia (ms): positivo = a gravação soa mais cedo. */
  private nudgeMs = 0;
  private active: ActiveRecording | null = null;
  private workletCtx: BaseAudioContext | null = null;
  private counter = 0;
  private replayId: string | null = null;
  private readonly listeners = new Set<() => void>();
  private snapshot = this.build();

  constructor(
    private readonly engine: AudioEngine,
    private readonly transport: Transport,
  ) {}

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };
  getSnapshot = () => this.snapshot;

  private build() {
    return { state: this.state, takes: this.takes, error: this.error, nudgeMs: this.nudgeMs, replayId: this.replayId };
  }
  private emit() {
    this.snapshot = this.build();
    this.listeners.forEach((l) => l());
  }

  static micSupportMessage(): string | null {
    if (typeof window === 'undefined') return 'Indisponível.';
    if (!window.isSecureContext)
      return 'O navegador só libera o microfone em endereço seguro. No computador, abra http://127.0.0.1:5173 (ou localhost). Pelo Wi-Fi (http://192.168…) o microfone fica bloqueado.';
    if (!navigator.mediaDevices?.getUserMedia) return 'Este navegador não permite gravar pelo microfone.';
    if (typeof AudioWorkletNode === 'undefined') return 'Este navegador não suporta a gravação sincronizada (AudioWorklet).';
    return null;
  }

  clearError() {
    this.error = null;
    this.emit();
  }

  setNudge(ms: number) {
    this.nudgeMs = Math.max(-300, Math.min(300, Math.round(ms)));
    if (this.replayId) {
      const take = this.takes.find((t) => t.id === this.replayId);
      if (take) this.transport.setLayer('take', this.layerFor(take));
    }
    this.emit();
  }

  private layerFor(take: Take) {
    return { trackId: take.id, bpm: take.bpm, offsetSec: Math.max(0, take.q0Sec + this.nudgeMs / 1000) };
  }

  /** Começa a gravar e toca o exercício desde a contagem. */
  async start(exerciseId: string, exerciseName: string): Promise<void> {
    if (this.state !== 'idle') return;
    const unsupported = Recorder.micSupportMessage();
    if (unsupported) {
      this.error = unsupported;
      this.emit();
      return;
    }
    this.stopReplay();
    this.state = 'requesting';
    this.error = null;
    this.emit();
    try {
      await this.engine.ensureRunning();
      const ctx = this.engine.context!;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      if (this.workletCtx !== ctx) {
        const url = URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' }));
        await ctx.audioWorklet.addModule(url);
        URL.revokeObjectURL(url);
        this.workletCtx = ctx;
      }
      const source = ctx.createMediaStreamSource(stream);
      const node = new AudioWorkletNode(ctx, 'drumflow-recorder', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 });
      const sink = ctx.createGain();
      sink.gain.value = 0; // mantém o worklet processando sem mandar o microfone para o alto-falante
      const chunks: ActiveRecording['chunks'] = [];
      node.port.onmessage = (e: MessageEvent) => {
        const d = e.data as { frame?: number; data?: Float32Array };
        if (d.data && typeof d.frame === 'number') chunks.push({ frame: d.frame, data: d.data });
      };
      source.connect(node).connect(sink).connect(ctx.destination);
      const settings = stream.getAudioTracks()[0]?.getSettings() as MediaTrackSettings & { latency?: number };
      const inputLatency = typeof settings?.latency === 'number' ? Math.min(0.2, Math.max(0, settings.latency)) : 0.01;

      await this.transport.restart();
      const snap = this.transport.getSnapshot();
      const q0Time = this.transport.timeOfQuarter(0);
      const unsubscribe = this.transport.subscribe(() => {
        const st = this.transport.getSnapshot().state;
        if (this.active && st !== 'playing' && st !== 'countIn') void this.stop();
      });
      this.active = { stream, source, node, sink, chunks, inputLatency, exerciseId, exerciseName, bpm: snap.bpm, q0Time, unsubscribe };
      this.state = 'recording';
      this.emit();
      // limite de segurança
      setTimeout(() => {
        if (this.active?.chunks === chunks) void this.stop();
      }, MAX_SECONDS * 1000);
    } catch (e) {
      this.state = 'idle';
      this.error =
        e instanceof DOMException && e.name === 'NotAllowedError'
          ? 'Permissão do microfone negada. Libere o microfone para esta página nas configurações do navegador.'
          : e instanceof Error
            ? `Não foi possível gravar: ${e.message}`
            : 'Não foi possível gravar.';
      this.emit();
    }
  }

  /** Para a gravação (e a reprodução) e guarda a gravação. */
  async stop(): Promise<Take | null> {
    const rec = this.active;
    if (!rec) return null;
    this.active = null;
    rec.unsubscribe();
    this.state = 'processing';
    this.emit();
    // pede ao worklet para entregar o último bloco
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, 300);
      rec.node.port.addEventListener('message', (e: MessageEvent) => {
        if ((e.data as { done?: boolean }).done) {
          clearTimeout(t);
          resolve();
        }
      });
      rec.node.port.postMessage('stop');
    });
    rec.source.disconnect();
    rec.node.disconnect();
    rec.sink.disconnect();
    rec.stream.getTracks().forEach((tr) => tr.stop());
    if (this.transport.isActive) this.transport.stop();

    const ctx = this.engine.context!;
    const assembled = assemble(ctx, rec.chunks);
    this.state = 'idle';
    if (!assembled) {
      this.error = 'Nada foi captado pelo microfone.';
      this.emit();
      return null;
    }
    this.counter += 1;
    const take: Take = {
      id: createId('take').replace(/[^A-Za-z0-9_-]/g, ''),
      name: `Gravação ${this.counter}`,
      exerciseId: rec.exerciseId,
      exerciseName: rec.exerciseName,
      bpm: rec.bpm,
      buffer: assembled.buffer,
      q0Sec: takeOffsetSec(rec.q0Time, assembled.startFrame, ctx.sampleRate, this.engine.outputLatency, rec.inputLatency),
      durationSec: assembled.buffer.duration,
      number: this.counter,
    };
    this.engine.registerTake(take.id, take.buffer);
    this.takes = [take, ...this.takes].slice(0, MAX_TAKES);
    this.emit();
    return take;
  }

  /** Toca a gravação sincronizada com o exercício (clique/grade), desde a contagem. */
  async replay(takeId: string): Promise<void> {
    const take = this.takes.find((t) => t.id === takeId);
    if (!take || this.state !== 'idle') return;
    this.replayId = take.id;
    this.transport.setLayer('take', this.layerFor(take));
    this.emit();
    await this.transport.restart();
    const off = this.transport.subscribe(() => {
      const st = this.transport.getSnapshot().state;
      if (st === 'stopped') {
        off();
        this.stopReplay();
      }
    });
  }

  stopReplay() {
    if (!this.replayId) return;
    this.replayId = null;
    this.transport.setLayer('take', null);
    this.emit();
  }

  /** Só a gravação, sem clique. */
  async listen(takeId: string): Promise<void> {
    const take = this.takes.find((t) => t.id === takeId);
    if (!take) return;
    await this.engine.ensureRunning();
    this.engine.playBufferPreview(take.buffer, 0);
  }

  stopListening() {
    this.engine.stopTrackPreview();
  }

  download(takeId: string) {
    const take = this.takes.find((t) => t.id === takeId);
    if (!take) return;
    const url = URL.createObjectURL(encodeWav(take.buffer));
    const a = document.createElement('a');
    a.href = url;
    a.download = `drumflow-${take.exerciseName.replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase()}-${take.bpm}bpm-${take.number}.wav`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  remove(takeId: string) {
    if (this.replayId === takeId) this.stopReplay();
    this.engine.removeTake(takeId);
    this.takes = this.takes.filter((t) => t.id !== takeId);
    this.emit();
  }
}
