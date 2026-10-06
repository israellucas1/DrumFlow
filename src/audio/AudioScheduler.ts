import type { TransportTimer } from '../transport/Transport';

/**
 * Despertador do scheduler. Ele NÃO decide quando cada clique soa — apenas
 * acorda o transporte a cada ~25 ms para que ele agende, no relógio da
 * Web Audio API, os eventos que caem na janela de antecipação.
 *
 * Usa um Web Worker porque timers da thread principal são fortemente
 * limitados em abas em segundo plano; cai para setInterval se não houver Worker.
 */
const WORKER_SOURCE = `
let id = null;
onmessage = (e) => {
  const d = e.data;
  if (d.cmd === 'start') {
    if (id !== null) clearInterval(id);
    id = setInterval(() => postMessage('tick'), d.interval);
  } else if (d.cmd === 'stop') {
    if (id !== null) clearInterval(id);
    id = null;
  }
};`;

export class AudioScheduler implements TransportTimer {
  private worker: Worker | null = null;
  private fallbackId: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private workerFailed = false;

  constructor(
    private readonly onTick: () => void,
    private readonly intervalMs = 25,
  ) {}

  private ensureWorker(): Worker | null {
    if (this.worker || this.workerFailed) return this.worker;
    try {
      const url = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' }));
      this.worker = new Worker(url);
      URL.revokeObjectURL(url);
      this.worker.onmessage = () => {
        if (this.running) this.onTick();
      };
    } catch {
      this.workerFailed = true;
      this.worker = null;
    }
    return this.worker;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    const worker = typeof Worker !== 'undefined' ? this.ensureWorker() : null;
    if (worker) {
      worker.postMessage({ cmd: 'start', interval: this.intervalMs });
    } else {
      this.fallbackId = setInterval(() => this.onTick(), this.intervalMs);
    }
  }

  stop(): void {
    this.running = false;
    this.worker?.postMessage({ cmd: 'stop' });
    if (this.fallbackId !== null) clearInterval(this.fallbackId);
    this.fallbackId = null;
  }

  dispose(): void {
    this.stop();
    this.worker?.terminate();
    this.worker = null;
  }
}
