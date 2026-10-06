import type { ClickKind, MusicEvent } from '../music/types';
import type { TransportSink, TransportTimer } from '../transport/Transport';

export interface Scheduled {
  time: number;
  kind: 'click' | 'hit';
  click?: ClickKind;
  event?: MusicEvent;
  session: number;
}

/** Saída de áudio falsa com relógio controlado manualmente. */
export class FakeSink implements TransportSink {
  currentTime = 0;
  outputLatency = 0;
  session = 0;
  scheduled: Scheduled[] = [];
  /** Itens que realmente "soaram": agendados e não cancelados por endSession. */
  cancelled = new Set<Scheduled>();
  failStart = false;

  async ensureRunning() {
    if (this.failStart) throw new Error('bloqueado');
  }
  beginSession() {
    this.session++;
  }
  endSession() {
    for (const s of this.scheduled) {
      if (s.session === this.session && s.time > this.currentTime) this.cancelled.add(s);
    }
  }
  scheduleClick(time: number, click: ClickKind) {
    this.scheduled.push({ time, kind: 'click', click, session: this.session });
  }
  scheduleHit(time: number, event: MusicEvent) {
    this.scheduled.push({ time, kind: 'hit', event, session: this.session });
  }
  audible(): Scheduled[] {
    return this.scheduled.filter((s) => !this.cancelled.has(s));
  }
}

export class ManualTimer implements TransportTimer {
  running = false;
  start() {
    this.running = true;
  }
  stop() {
    this.running = false;
  }
}

/** Avança o relógio em passos de `step` segundos chamando o tick (simula o despertador). */
export function advance(sink: FakeSink, tick: () => void, seconds: number, step = 0.025) {
  const end = sink.currentTime + seconds;
  while (sink.currentTime < end - 1e-12) {
    sink.currentTime = Math.min(end, sink.currentTime + step);
    tick();
  }
}
